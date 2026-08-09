import os
import tempfile
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db, get_owned_project
from ..gemini_client import GeminiError, upload_file

router = APIRouter(prefix="/api/projects/{project_id}/files", tags=["files"])

MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


@router.get("", response_model=List[schemas.ProjectFileOut])
def list_files(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    project = get_owned_project(project_id, db, current_user)
    return project.files


@router.post("", response_model=schemas.ProjectFileOut, status_code=status.HTTP_201_CREATED)
async def upload_project_file(
    project_id: int,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    project = get_owned_project(project_id, db, current_user)

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File exceeds 20MB limit")

    suffix = os.path.splitext(file.filename or "")[1]
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        uploaded = upload_file(tmp_path, mime_type=file.content_type)
    except GeminiError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"File upload to LLM provider failed: {exc}")
    finally:
        os.unlink(tmp_path)

    record = models.ProjectFile(
        project_id=project.id,
        filename=file.filename or "unnamed",
        mime_type=file.content_type,
        gemini_file_name=uploaded.name,
        gemini_file_uri=uploaded.uri,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
