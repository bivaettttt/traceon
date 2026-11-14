import hashlib
import secrets
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from traceon.store import db, one, sql

hasher = PasswordHasher()
dummy = hasher.hash(secrets.token_urlsafe(32))
bearer = HTTPBearer(auto_error=False)


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def login(payload):
    with db.begin() as conn:
        user = one(conn, "SELECT * FROM users WHERE username=:u", u=payload.username)
        try:
            valid = hasher.verify(user["password"] if user else dummy, payload.password)
        except VerifyMismatchError:
            valid = False
        if not user or not valid:
            raise HTTPException(401, "INVALID_CREDENTIALS")
        token = secrets.token_urlsafe(32)
        sql(
            conn,
            "INSERT INTO sessions VALUES (:d,:u,clock_timestamp()+interval '8 hours')",
            d=digest(token),
            u=user["id"],
        )
        return {"token": token}


def identity(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
):
    if credentials:
        hashed = digest(credentials.credentials)
        with db.connect() as conn:
            user = one(
                conn,
                """SELECT u.id,u.username,u.name,u.admin FROM users u JOIN sessions s ON s.actor=u.id
                              WHERE s.digest=:d AND expires>clock_timestamp()""",
                d=hashed,
            )
        if user:
            return {**user, "session": hashed}
    raise HTTPException(401, "AUTH_REQUIRED")


Actor = Annotated[dict, Depends(identity)]


def scope(conn, project, actor, roles=(), *, write=False, allow_archived=False):
    lock = " FOR UPDATE OF p" if write else ""
    record = one(
        conn,
        """SELECT p.*,m.role FROM projects p JOIN members m ON m.project_id=p.id
                       WHERE p.id=:p AND m.actor=:u"""
        + lock,
        p=project,
        u=actor["id"],
    )
    if not record:
        raise HTTPException(404, "PROJECT_NOT_FOUND")
    if roles and record["role"] not in roles:
        raise HTTPException(403, "ROLE_FORBIDDEN")
    if write and record["archived"] and not allow_archived:
        raise HTTPException(409, "PROJECT_ARCHIVED")
    return record
