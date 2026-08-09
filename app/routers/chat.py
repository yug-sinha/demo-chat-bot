import json
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import SessionLocal
from ..deps import get_current_user, get_db, get_owned_project
from ..gemini_client import GeminiError, generate_reply, stream_reply

router = APIRouter(prefix="/api/projects/{project_id}", tags=["chat"])

# How many prior turns to send back to the model as context.
HISTORY_LIMIT = 20


@router.get("/messages", response_model=List[schemas.MessageOut])
def list_messages(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    project = get_owned_project(project_id, db, current_user)
    return project.messages


def _prepare_turn(
    project: models.Project, payload: schemas.ChatRequest, db: Session
) -> Tuple[models.Message, Optional[str], List[dict], Optional[List[str]]]:
    """Resolve attachments, persist the user message, and assemble the model
    context. Shared by the blocking and streaming endpoints."""
    file_uris = None
    attachment_names = None
    if payload.file_ids:
        files = (
            db.query(models.ProjectFile)
            .filter(models.ProjectFile.project_id == project.id, models.ProjectFile.id.in_(payload.file_ids))
            .all()
        )
        file_uris = [f.gemini_file_uri for f in files]
        attachment_names = ",".join(f.filename for f in files) or None

    user_message = models.Message(
        project_id=project.id, role="user", content=payload.message, attachments=attachment_names
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    active_prompt = (
        db.query(models.Prompt)
        .filter(models.Prompt.project_id == project.id, models.Prompt.is_active.is_(True))
        .first()
    )

    recent = (
        db.query(models.Message)
        .filter(models.Message.project_id == project.id)
        .order_by(models.Message.created_at.desc())
        .limit(HISTORY_LIMIT)
        .all()
    )
    history = [{"role": m.role, "content": m.content} for m in reversed(recent)]
    system_prompt = active_prompt.content if active_prompt else None

    return user_message, system_prompt, history, file_uris


@router.post("/chat", response_model=schemas.ChatResponse)
def chat(
    project_id: int,
    payload: schemas.ChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    project = get_owned_project(project_id, db, current_user)
    user_message, system_prompt, history, file_uris = _prepare_turn(project, payload, db)

    try:
        reply_text = generate_reply(
            model=project.model, system_prompt=system_prompt, history=history, file_uris=file_uris
        )
    except GeminiError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"LLM provider error: {exc}")

    assistant_message = models.Message(project_id=project.id, role="assistant", content=reply_text)
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    return schemas.ChatResponse(
        user_message=schemas.MessageOut.model_validate(user_message),
        assistant_message=schemas.MessageOut.model_validate(assistant_message),
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.post("/chat/stream")
def chat_stream(
    project_id: int,
    payload: schemas.ChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    project = get_owned_project(project_id, db, current_user)
    user_message, system_prompt, history, file_uris = _prepare_turn(project, payload, db)

    # Capture everything the generator needs as plain values / pydantic models now,
    # while the request-scoped session is still open. The generator runs after this
    # function returns, so it must not rely on `db` or lazy-loaded ORM attributes.
    model = project.model
    project_id_val = project.id
    user_message_out = schemas.MessageOut.model_validate(user_message).model_dump(mode="json")

    def event_generator():
        yield _sse({"type": "user_message", "message": user_message_out})

        chunks: List[str] = []
        try:
            for text in stream_reply(model, system_prompt, history, file_uris):
                chunks.append(text)
                yield _sse({"type": "delta", "text": text})
        except GeminiError as exc:
            yield _sse({"type": "error", "detail": f"LLM provider error: {exc}"})
            return

        # Persist the fully assembled assistant message using a fresh session,
        # since the request-scoped one may already be closed by now.
        full_text = "".join(chunks)
        session = SessionLocal()
        try:
            assistant_message = models.Message(project_id=project_id_val, role="assistant", content=full_text)
            session.add(assistant_message)
            session.commit()
            session.refresh(assistant_message)
            assistant_out = schemas.MessageOut.model_validate(assistant_message).model_dump(mode="json")
        finally:
            session.close()

        yield _sse({"type": "done", "message": assistant_out})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # ask any proxy in front not to buffer the stream
        },
    )
