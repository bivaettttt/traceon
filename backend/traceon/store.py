import os
from json import dumps

from fastapi.encoders import jsonable_encoder
from sqlalchemy import create_engine, text

db = create_engine(
    os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://traceon:traceon-local@127.0.0.1:56433/traceon",
    ),
    pool_pre_ping=True,
    hide_parameters=True,
)


def sql(conn, statement, **args):
    return conn.execute(text(statement), args)


def one(conn, statement, **args):
    row = sql(conn, statement, **args).mappings().one_or_none()
    return dict(row) if row is not None else None


def many(conn, statement, **args):
    return [dict(row) for row in sql(conn, statement, **args).mappings()]


def json(value):
    return dumps(jsonable_encoder(value), ensure_ascii=False)


def audit(conn, actor, project, action, object_id, detail=""):
    sql(
        conn,
        """INSERT INTO audit(actor,project_id,action,object_id,detail)
                VALUES (:actor,:project,:action,:object_id,:detail)""",
        actor=actor,
        project=project,
        action=action,
        object_id=object_id,
        detail=detail,
    )


def advance(conn, project):
    sql(
        conn,
        "UPDATE projects SET epoch=epoch+1,updated_at=clock_timestamp() WHERE id=:p",
        p=project,
    )
