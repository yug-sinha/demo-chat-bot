import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ---- Auth ----

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: Optional[str] = Field(default=None, max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: Optional[str] = None
    created_at: datetime.datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---- Projects ----

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    model: str = "gemini-2.5-flash"


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    model: Optional[str] = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    model: str
    created_at: datetime.datetime


# ---- Prompts ----

class PromptCreate(BaseModel):
    content: str = Field(min_length=1)


class PromptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content: str
    is_active: bool
    created_at: datetime.datetime


# ---- Chat ----

class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    file_ids: List[int] = Field(default_factory=list)


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    attachments: List[str] = Field(default_factory=list)
    created_at: datetime.datetime

    @field_validator("attachments", mode="before")
    @classmethod
    def _split_attachments(cls, value):
        if value is None:
            return []
        if isinstance(value, str):
            return [name for name in value.split(",") if name]
        return value


class ChatResponse(BaseModel):
    user_message: MessageOut
    assistant_message: MessageOut


# ---- Files ----

class ProjectFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    mime_type: Optional[str] = None
    created_at: datetime.datetime
