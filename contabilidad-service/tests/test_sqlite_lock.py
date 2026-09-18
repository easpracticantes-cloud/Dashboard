"""SQLite WAL / busy_timeout para no tumbar el Excel Autobits."""

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.exc import OperationalError  # noqa: E402

from infrastructure.persistence.database import (  # noqa: E402
    engine,
    is_sqlite_lock_error,
    retry_on_sqlite_lock,
    settings,
)


def test_sqlite_wal_and_busy_timeout():
    if not (settings.database_url or "").startswith("sqlite"):
        return
    with engine.connect() as conn:
        mode = str(conn.execute(text("PRAGMA journal_mode")).scalar() or "").lower()
        timeout = int(conn.execute(text("PRAGMA busy_timeout")).scalar() or 0)
    assert mode in {"wal", "memory"}
    assert timeout >= 30000


def test_retry_on_sqlite_lock_retries_then_succeeds():
    hits = {"n": 0}

    def op():
        hits["n"] += 1
        if hits["n"] < 3:
            raise OperationalError("INSERT", {}, Exception("database is locked"))
        return 7

    assert retry_on_sqlite_lock(op, attempts=5) == 7
    assert hits["n"] == 3


def test_is_sqlite_lock_error():
    assert is_sqlite_lock_error(OperationalError("INSERT", {}, Exception("database is locked")))
    assert not is_sqlite_lock_error(OperationalError("INSERT", {}, Exception("unique constraint")))
