from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db, get_owned_project

router = APIRouter(prefix="/api/projects/{project_id}/prompts", tags=["prompts"])


@router.get("", response_model=List[schemas.PromptOut])
def list_prompts(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    project = get_owned_project(project_id, db, current_user)
    return project.prompts


@router.post("", response_model=schemas.PromptOut, status_code=status.HTTP_201_CREATED)
def create_prompt(
    project_id: int,
    payload: schemas.PromptCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    project = get_owned_project(project_id, db, current_user)

    # Only one active prompt per project at a time -- the latest one wins
    # and becomes the system instruction used for future chat turns.
    db.query(models.Prompt).filter(models.Prompt.project_id == project.id).update({"is_active": False})

    prompt = models.Prompt(project_id=project.id, content=payload.content, is_active=True)
    db.add(prompt)
    db.commit()
    db.refresh(prompt)
    return prompt
