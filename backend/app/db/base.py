from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base SQLAlchemy 2.0 declarative model."""

    pass


# Portable JSONB type: native JSONB on PostgreSQL (supports GIN indexes),
# standard JSON on SQLite for fast isolated unit testing.
JSONBType = JSONB().with_variant(JSON(), "sqlite")
