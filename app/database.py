import ssl
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import certifi
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


def _build_engine():
    url = settings.database_url

    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False}, pool_pre_ping=True)

    if url.startswith("postgresql://") or url.startswith("postgres://"):
        # Use the pure-Python pg8000 driver instead of psycopg2: psycopg2 needs a
        # native build step (pg_config) that Vercel's serverless build image doesn't
        # have, so it fails to install there even though it works fine locally.
        parsed = urlparse(url)
        query = dict(parse_qsl(parsed.query))
        query.pop("sslmode", None)
        url = urlunparse(parsed._replace(scheme="postgresql+pg8000", query=urlencode(query)))
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        return create_engine(url, connect_args={"ssl_context": ssl_context}, pool_pre_ping=True)

    return create_engine(url, pool_pre_ping=True)


engine = _build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass
