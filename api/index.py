import sys
from pathlib import Path

# Vercel's Python runtime only adds /api to sys.path; the FastAPI app lives in
# the sibling `app/` package at the repo root, so make that importable too.
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402
