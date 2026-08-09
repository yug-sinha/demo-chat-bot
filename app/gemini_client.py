"""Thin wrapper around the Gemini API.

Isolated behind this module so the rest of the app doesn't know which LLM
provider is in use -- swapping providers later means changing this file only.
"""
from typing import List, Optional

from google import genai
from google.genai import types

from .config import settings

_client: Optional[genai.Client] = None


class GeminiError(Exception):
    pass


def _get_client() -> genai.Client:
    global _client
    if not settings.gemini_api_key:
        raise GeminiError("GEMINI_API_KEY is not configured")
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def generate_reply(
    model: str,
    system_prompt: Optional[str],
    history: List[dict],
    file_uris: Optional[List[str]] = None,
) -> str:
    """history: list of {"role": "user"|"assistant", "content": str}, oldest first.
    The last item is the new user message."""
    client = _get_client()

    contents: List[types.Content] = []
    for turn in history:
        role = "model" if turn["role"] == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part(text=turn["content"])]))

    if file_uris:
        last = contents[-1]
        for uri in file_uris:
            last.parts.append(types.Part(file_data=types.FileData(file_uri=uri)))

    config = types.GenerateContentConfig(system_instruction=system_prompt) if system_prompt else None

    try:
        response = client.models.generate_content(model=model, contents=contents, config=config)
    except Exception as exc:  # noqa: BLE001 - surface as a domain error, caller maps to HTTP
        raise GeminiError(str(exc)) from exc

    return response.text or ""


def upload_file(path: str, mime_type: Optional[str] = None):
    client = _get_client()
    try:
        upload_config = {"mime_type": mime_type} if mime_type else None
        return client.files.upload(path=path, config=upload_config)
    except Exception as exc:  # noqa: BLE001
        raise GeminiError(str(exc)) from exc
