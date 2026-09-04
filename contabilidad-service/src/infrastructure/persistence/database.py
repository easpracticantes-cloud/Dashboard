"""Configuracion SQLAlchemy."""

from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from config.settings import get_settings


class Base(DeclarativeBase):
    """Base declarativa de modelos."""


settings = get_settings()
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    """Crea tablas si no existen."""
    from infrastructure.persistence import models  # noqa: F401

    db_path = settings.database_url.replace("sqlite:///", "")
    if db_path and not db_path.startswith(":"):
        from pathlib import Path

        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    _apply_sqlite_migrations()
    _apply_fase4_migrations()


def _apply_sqlite_migrations() -> None:
    """Migraciones ligeras SQLite."""
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        rem_cols = conn.execute(text("PRAGMA table_info(remediations)")).fetchall()
        rem_names = {row[1] for row in rem_cols}
        if rem_cols and "fecha_limite" not in rem_names:
            conn.execute(text("ALTER TABLE remediations ADD COLUMN fecha_limite VARCHAR(32)"))

        ab_cols = conn.execute(text("PRAGMA table_info(autobits_records)")).fetchall()
        ab_names = {row[1] for row in ab_cols}
        if ab_cols:
            if "observaciones" not in ab_names:
                conn.execute(text("ALTER TABLE autobits_records ADD COLUMN observaciones TEXT"))
            if "estado_compra" not in ab_names:
                conn.execute(
                    text("ALTER TABLE autobits_records ADD COLUMN estado_compra VARCHAR(64)")
                )

        batch_cols = conn.execute(text("PRAGMA table_info(autobits_import_batches)")).fetchall()
        batch_names = {row[1] for row in batch_cols}
        if batch_cols and "file_hash" not in batch_names:
            conn.execute(text("ALTER TABLE autobits_import_batches ADD COLUMN file_hash VARCHAR(64)"))

        xcols = conn.execute(text("PRAGMA table_info(account_crossings)")).fetchall()
        if not xcols:
            return

        xmap = {row[1]: row for row in xcols}
        for col, ddl in {
            "nit": "VARCHAR(64)",
            "fecha_ejecucion": "VARCHAR(32)",
            "concepto": "TEXT",
            "factura_cdc": "VARCHAR(255)",
            "fecha_pago": "VARCHAR(32)",
        }.items():
            if col not in xmap:
                conn.execute(text(f"ALTER TABLE account_crossings ADD COLUMN {col} {ddl}"))

        xcols = conn.execute(text("PRAGMA table_info(account_crossings)")).fetchall()
        xmap = {row[1]: row for row in xcols}
        if "import_batch_id" not in xmap:
            conn.execute(
                text("ALTER TABLE account_crossings ADD COLUMN import_batch_id INTEGER")
            )

        # Releer tras ALTER
        xcols = conn.execute(text("PRAGMA table_info(account_crossings)")).fetchall()
        xmap = {row[1]: row for row in xcols}
        doc_col = xmap.get("document_id")
        if doc_col is None or doc_col[3] != 1:
            return

        # document_id era NOT NULL → recrear tabla permitiendo NULL
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS account_crossings_new (
                    id INTEGER PRIMARY KEY,
                    document_id INTEGER,
                    autobits_record_id INTEGER,
                    match_type VARCHAR(32),
                    match_score FLOAT,
                    estado VARCHAR(32),
                    proveedor_nombre VARCHAR(255),
                    nit VARCHAR(64),
                    numero_compra VARCHAR(128),
                    numero_reserva VARCHAR(128),
                    fecha_ejecucion VARCHAR(32),
                    concepto TEXT,
                    valor_documento FLOAT,
                    valor_autobits FLOAT,
                    diferencia FLOAT,
                    factura_cdc VARCHAR(255),
                    fecha_pago VARCHAR(32),
                    observaciones TEXT,
                    match_reasons TEXT,
                    approved_by VARCHAR(128),
                    approved_at DATETIME,
                    created_at DATETIME,
                    updated_at DATETIME
                )
                """
            )
        )
        xnames = set(xmap.keys())
        wanted = [
            "id",
            "document_id",
            "autobits_record_id",
            "match_type",
            "match_score",
            "estado",
            "proveedor_nombre",
            "nit",
            "numero_compra",
            "numero_reserva",
            "fecha_ejecucion",
            "concepto",
            "valor_documento",
            "valor_autobits",
            "diferencia",
            "factura_cdc",
            "fecha_pago",
            "observaciones",
            "match_reasons",
            "approved_by",
            "approved_at",
            "created_at",
            "updated_at",
        ]
        copy_cols = [c for c in wanted if c in xnames]
        cols_sql = ", ".join(copy_cols)
        conn.execute(
            text(
                f"INSERT INTO account_crossings_new ({cols_sql}) "
                f"SELECT {cols_sql} FROM account_crossings"
            )
        )
        conn.execute(text("DROP TABLE account_crossings"))
        conn.execute(text("ALTER TABLE account_crossings_new RENAME TO account_crossings"))
        conn.execute(text("PRAGMA foreign_keys=ON"))

        pay_cols = conn.execute(text("PRAGMA table_info(payments)")).fetchall()
        if pay_cols:
            pay_map = {row[1]: row for row in pay_cols}
            doc_col = pay_map.get("document_id")
            if doc_col is not None and doc_col[3] == 1:
                conn.execute(text("PRAGMA foreign_keys=OFF"))
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS payments_new (
                            id INTEGER PRIMARY KEY,
                            document_id INTEGER,
                            crossing_id INTEGER,
                            autobits_record_id INTEGER,
                            proveedor VARCHAR(255),
                            numero_compra VARCHAR(128),
                            numero_reserva VARCHAR(128),
                            numero_documento VARCHAR(128),
                            valor FLOAT,
                            estado VARCHAR(32),
                            observaciones TEXT,
                            approved_by VARCHAR(128),
                            approved_at DATETIME,
                            paid_by VARCHAR(128),
                            paid_at DATETIME,
                            created_at DATETIME,
                            updated_at DATETIME
                        )
                        """
                    )
                )
                pay_names = set(pay_map.keys())
                wanted_pay = [
                    "id", "document_id", "crossing_id", "autobits_record_id",
                    "proveedor", "numero_compra", "numero_reserva", "numero_documento",
                    "valor", "estado", "observaciones", "approved_by", "approved_at",
                    "paid_by", "paid_at", "created_at", "updated_at",
                ]
                copy_pay = [c for c in wanted_pay if c in pay_names]
                cols_pay = ", ".join(copy_pay)
                conn.execute(
                    text(
                        f"INSERT INTO payments_new ({cols_pay}) "
                        f"SELECT {cols_pay} FROM payments"
                    )
                )
                conn.execute(text("DROP TABLE payments"))
                conn.execute(text("ALTER TABLE payments_new RENAME TO payments"))
                conn.execute(text("PRAGMA foreign_keys=ON"))


# Tablas nuevas de la Fase 4. Se crean con IF NOT EXISTS y las columnas se
# agregan con ALTER TABLE: nunca se borra ni se recrea nada existente.
_FASE4_TABLAS: dict[str, str] = {
    "accounting_adjustments": """
        CREATE TABLE IF NOT EXISTS accounting_adjustments (
            id INTEGER PRIMARY KEY,
            entity_type VARCHAR(64) NOT NULL,
            entity_id VARCHAR(64) NOT NULL,
            action VARCHAR(32),
            motivo TEXT NOT NULL,
            valor_anterior TEXT,
            valor_nuevo TEXT,
            related_entity_id VARCHAR(64),
            usuario VARCHAR(128),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """,
    "period_closures": """
        CREATE TABLE IF NOT EXISTS period_closures (
            id INTEGER PRIMARY KEY,
            period_start VARCHAR(32) NOT NULL,
            period_end VARCHAR(32) NOT NULL,
            status VARCHAR(16),
            summary_json TEXT,
            observaciones TEXT,
            closed_by VARCHAR(128),
            closed_at DATETIME,
            reopened_by VARCHAR(128),
            reopened_at DATETIME,
            motivo_reapertura TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """,
}

_FASE4_COLUMNAS: dict[str, dict[str, str]] = {
    "accounting_adjustments": {
        "related_entity_id": "VARCHAR(64)",
        "usuario": "VARCHAR(128)",
    },
    "period_closures": {
        "summary_json": "TEXT",
        "observaciones": "TEXT",
        "reopened_by": "VARCHAR(128)",
        "reopened_at": "DATETIME",
        "motivo_reapertura": "TEXT",
    },
}

_FASE4_INDICES = (
    "CREATE INDEX IF NOT EXISTS ix_adjustments_entity "
    "ON accounting_adjustments (entity_type, entity_id)",
    "CREATE INDEX IF NOT EXISTS ix_period_closures_rango "
    "ON period_closures (period_start, period_end)",
)


def _apply_fase4_migrations() -> None:
    """Fase 4: ajustes contables y cierre operativo semanal (aditivo)."""
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        for ddl in _FASE4_TABLAS.values():
            conn.execute(text(ddl))

        for tabla, columnas in _FASE4_COLUMNAS.items():
            existentes = {
                row[1] for row in conn.execute(text(f"PRAGMA table_info({tabla})")).fetchall()
            }
            for columna, tipo in columnas.items():
                if columna not in existentes:
                    conn.execute(text(f"ALTER TABLE {tabla} ADD COLUMN {columna} {tipo}"))

        for ddl in _FASE4_INDICES:
            conn.execute(text(ddl))


def get_db() -> Generator[Session, None, None]:
    """Dependencia FastAPI para sesion de BD."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
