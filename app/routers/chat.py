from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db, get_owned_project
from ..gemini_client import GeminiError, generate_reply

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


@router.post("/chat", response_model=schemas.ChatResponse)
def chat(
    project_id: int,
    payload: schemas.ChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    project = get_owned_project(project_id, db, current_user)

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

    try:
        reply_text = generate_reply(
            model=project.model,
            system_prompt=active_prompt.content if active_prompt else None,
            history=history,
            file_uris=file_uris,
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
