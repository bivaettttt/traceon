import csv
import io
import logging
from contextlib import contextmanager
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from traceon import contracts as c
from traceon import requirements as req
from traceon import traceability as trace
from traceon.access import Actor, hasher, login, scope
from traceon.changes import change_detail, create_change, transition
from traceon.domain import compare
from traceon.store import advance, audit, db, many, one, sql

app = FastAPI(
    title="Traceon",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)
P = "/api/projects/{project}"
EDIT = ("ANALYST", "PROJECT_MANAGER")
MANAGE = ("PROJECT_MANAGER",)
REVIEW = ("REVIEWER",)
log = logging.getLogger("traceon")


@app.middleware("http")
async def request_id(request: Request, call_next):
    correlation = str(uuid4())
    try:
        response = await call_next(request)
    except Exception as error:
        log.error("request_id=%s error_class=%s", correlation, type(error).__name__)
        response = JSONResponse({"detail": "INTERNAL_ERROR"}, 500)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Request-ID"] = correlation
    return response


@app.exception_handler(IntegrityError)
async def conflict(request: Request, error: IntegrityError):
    return JSONResponse({"detail": "CONSTRAINT_CONFLICT"}, 409)


@app.exception_handler(RequestValidationError)
async def malformed(request: Request, error: RequestValidationError):
    return JSONResponse({"detail": "INVALID_INPUT"}, 422)


@contextmanager
def workspace(project, actor, roles=(), *, write=False, allow_archived=False):
    with (
        db.connect().execution_options(
            isolation_level="READ COMMITTED" if write else "REPEATABLE READ"
        ) as conn,
        conn.begin(),
    ):
        record = scope(
            conn, project, actor, roles, write=write, allow_archived=allow_archived
        )
        yield conn, record


@app.get("/health")
def health():
    with db.connect() as conn:
        sql(conn, "SELECT id FROM projects LIMIT 1")
    return {"status": "ok"}


@app.post("/api/login")
def sign_in(payload: c.Login):
    return login(payload)


@app.post("/api/logout", status_code=204)
def sign_out(actor: Actor):
    with db.begin() as conn:
        sql(conn, "DELETE FROM sessions WHERE digest=:d", d=actor["session"])


@app.get("/api/me")
def me(actor: Actor):
    return {key: actor[key] for key in ("id", "username", "name", "admin")}


@app.get("/api/users")
def users(actor: Actor):
    if not actor["admin"]:
        raise HTTPException(403, "ADMIN_REQUIRED")
    with db.connect() as conn:
        return many(conn, "SELECT id,username,name,admin FROM users ORDER BY username")


@app.post("/api/users", status_code=201)
def add_user(payload: c.Account, actor: Actor):
    if not actor["admin"]:
        raise HTTPException(403, "ADMIN_REQUIRED")
    digest = hasher.hash(payload.password)
    with db.begin() as conn:
        record = one(
            conn,
            """INSERT INTO users(username,name,password) VALUES (:u,:n,:h)
                          ON CONFLICT DO NOTHING RETURNING id,username,name,admin""",
            u=payload.username,
            n=payload.name,
            h=digest,
        )
        if not record:
            raise HTTPException(409, "USERNAME_EXISTS")
        audit(conn, actor["id"], None, "USER_CREATE", record["id"])
        return record


@app.get("/api/projects")
def projects(actor: Actor):
    with db.connect() as conn:
        return many(
            conn,
            """SELECT p.*,m.role FROM projects p JOIN members m ON m.project_id=p.id
                            WHERE m.actor=:u ORDER BY archived,code""",
            u=actor["id"],
        )


@app.post("/api/projects", status_code=201)
def add_project(payload: c.ProjectInput, actor: Actor):
    with db.begin() as conn:
        result = one(
            conn,
            """INSERT INTO projects(code,name,description,owner) VALUES (:code,:name,:description,:u)
                           ON CONFLICT DO NOTHING RETURNING *""",
            u=actor["id"],
            **payload.model_dump(),
        )
        if not result:
            raise HTTPException(409, "PROJECT_CODE_EXISTS")
        sql(
            conn,
            "INSERT INTO members VALUES (:p,:u,'PROJECT_MANAGER')",
            p=result["id"],
            u=actor["id"],
        )
        audit(conn, actor["id"], result["id"], "PROJECT_CREATE", result["id"])
        return {**result, "role": "PROJECT_MANAGER"}


@app.get(P)
def project_detail(project: UUID, actor: Actor):
    with workspace(project, actor) as (_, record):
        return record


@app.patch(P)
def edit_project(project: UUID, payload: c.ProjectEdit, actor: Actor):
    with workspace(project, actor, MANAGE, write=True, allow_archived=True) as (
        conn,
        _,
    ):
        result = one(
            conn,
            """UPDATE projects SET name=:name,description=:description,archived=:archived,
                           updated_at=clock_timestamp() WHERE id=:p RETURNING *""",
            p=project,
            **payload.model_dump(),
        )
        audit(conn, actor["id"], project, "PROJECT_UPDATE", project)
        return result


@app.get(P + "/members")
def members(project: UUID, actor: Actor):
    with workspace(project, actor) as (conn, _):
        return many(
            conn,
            """SELECT u.id,u.username,u.name,m.role FROM members m JOIN users u ON u.id=m.actor
                            WHERE m.project_id=:p ORDER BY u.name""",
            p=project,
        )


@app.put(P + "/members")
def assign(project: UUID, payload: c.Member, actor: Actor):
    with workspace(project, actor, MANAGE, write=True) as (conn, record):
        if record["owner"] == payload.actor and payload.role != "PROJECT_MANAGER":
            raise HTTPException(409, "OWNER_ROLE_REQUIRED")
        if not one(conn, "SELECT id FROM users WHERE id=:u", u=payload.actor):
            raise HTTPException(404, "USER_NOT_FOUND")
        if payload.role != "REVIEWER" and one(
            conn,
            """SELECT id FROM versions WHERE project_id=:p
                 AND reviewer=:u AND status='IN_REVIEW' LIMIT 1""",
            p=project,
            u=payload.actor,
        ):
            raise HTTPException(409, "REVIEW_ASSIGNMENT_EXISTS")
        item = one(
            conn,
            """INSERT INTO members VALUES (:p,:actor,:role) ON CONFLICT(project_id,actor)
                         DO UPDATE SET role=EXCLUDED.role RETURNING *""",
            p=project,
            **payload.model_dump(),
        )
        audit(conn, actor["id"], project, "MEMBER_ASSIGN", payload.actor, payload.role)
        return item


@app.get(P + "/requirements")
def registry(
    project: UUID,
    actor: Actor,
    q: Annotated[str, Query(max_length=100)] = "",
    kind: c.RequirementKind | None = None,
    status: str | None = None,
    priority: str | None = None,
    sort: Literal["code", "title", "newest"] = "code",
    offset: Annotated[int, Query(ge=0)] = 0,
):
    order = {
        "code": "n.code",
        "title": "v.title,n.code",
        "newest": "v.created_at DESC,n.code",
    }[sort]
    with workspace(project, actor) as (conn, _):
        return many(
            conn,
            f"""SELECT n.id,n.code,n.kind,v.id AS version_id,v.title,v.status,v.priority,v.number
            FROM nodes n JOIN LATERAL(SELECT * FROM versions WHERE node_id=n.id ORDER BY number DESC LIMIT 1) v ON true
            WHERE n.project_id=:p AND NOT n.archived AND (n.code ILIKE :pattern OR v.title ILIKE :pattern)
            AND (CAST(:kind AS text) IS NULL OR n.kind=:kind)
            AND (CAST(:status AS text) IS NULL OR v.status=:status)
            AND (CAST(:priority AS text) IS NULL OR v.priority=:priority)
            ORDER BY {order} LIMIT 100 OFFSET :offset""",
            p=project,
            pattern=f"%{q}%",
            kind=kind,
            status=status,
            priority=priority,
            offset=offset,
        )


@app.post(P + "/requirements", status_code=201)
def add_requirement(project: UUID, payload: c.RequirementInput, actor: Actor):
    with workspace(project, actor, EDIT, write=True) as (conn, _):
        return req.create_requirement(conn, project, actor["id"], payload)


@app.get(P + "/nodes/{identifier}")
def detail(project: UUID, identifier: UUID, actor: Actor):
    with workspace(project, actor) as (conn, _):
        return req.node_detail(conn, project, identifier)


@app.get(P + "/nodes/{identifier}/compare")
def version_diff(
    project: UUID, identifier: UUID, left: UUID, right: UUID, actor: Actor
):
    with workspace(project, actor) as (conn, _):
        versions = [req.get_version(conn, project, v) for v in (left, right)]
        if any(v["node_id"] != identifier for v in versions):
            raise HTTPException(404, "VERSION_NOT_FOUND")
        before, after = versions
        return {
            "before": before,
            "after": after,
            "changes": [
                {"field": field, "before": before[field], "after": after[field]}
                for field in req.FIELDS
                if before[field] != after[field]
            ],
        }


@app.post(P + "/nodes/{identifier}/versions", status_code=201)
def revision(project: UUID, identifier: UUID, payload: c.NewVersion, actor: Actor):
    with workspace(project, actor, EDIT, write=True) as (conn, _):
        return req.new_version(conn, project, actor["id"], identifier, payload)


@app.patch(P + "/versions/{identifier}")
def edit(project: UUID, identifier: UUID, payload: c.DraftEdit, actor: Actor):
    with workspace(project, actor, EDIT, write=True) as (conn, _):
        return req.edit_version(conn, project, actor["id"], identifier, payload)


@app.post(P + "/versions/{identifier}/submit")
def submit(project: UUID, identifier: UUID, payload: c.ReviewAssignment, actor: Actor):
    with workspace(project, actor, EDIT, write=True) as (conn, _):
        return req.submit(conn, project, actor["id"], identifier, payload)


@app.post(P + "/versions/{identifier}/review")
def review(project: UUID, identifier: UUID, payload: c.ReviewInput, actor: Actor):
    with workspace(project, actor, REVIEW, write=True) as (conn, _):
        return req.review(conn, project, actor["id"], identifier, payload)


@app.get(P + "/reviews")
def review_queue(project: UUID, actor: Actor):
    with workspace(project, actor) as (conn, _):
        return many(
            conn,
            """SELECT v.*,n.code,u.name AS reviewer_name FROM versions v
                            JOIN nodes n ON n.id=v.node_id JOIN users u ON u.id=v.reviewer
                            WHERE v.project_id=:p AND v.status='IN_REVIEW' ORDER BY v.created_at""",
            p=project,
        )


@app.get(P + "/artifacts")
def artifacts(project: UUID, actor: Actor):
    with workspace(project, actor) as (conn, _):
        return many(
            conn,
            """SELECT n.* FROM nodes n WHERE project_id=:p AND NOT archived
                            AND NOT EXISTS(SELECT 1 FROM versions v WHERE v.node_id=n.id) ORDER BY code""",
            p=project,
        )


@app.post(P + "/artifacts", status_code=201)
def add_artifact(project: UUID, payload: c.ArtifactInput, actor: Actor):
    with workspace(project, actor, EDIT, write=True) as (conn, _):
        result = one(
            conn,
            """INSERT INTO nodes(project_id,code,kind,title,description,source,release)
                           VALUES (:p,:code,:kind,:title,:description,:source,:release)
                           ON CONFLICT DO NOTHING RETURNING *""",
            p=project,
            **payload.model_dump(),
        )
        if not result:
            raise HTTPException(409, "CODE_EXISTS")
        advance(conn, project)
        audit(conn, actor["id"], project, "ARTIFACT_CREATE", result["id"])
        return result


@app.get(P + "/graph")
def get_graph(project: UUID, actor: Actor):
    with workspace(project, actor) as (conn, _):
        return trace.graph(conn, project)


@app.post(P + "/links", status_code=201)
def link(project: UUID, payload: c.LinkInput, actor: Actor):
    with workspace(project, actor, EDIT, write=True) as (conn, _):
        return trace.add_link(conn, project, actor["id"], payload)


@app.delete(P + "/links/{identifier}")
def unlink(project: UUID, identifier: UUID, actor: Actor):
    with workspace(project, actor, EDIT, write=True) as (conn, _):
        return trace.deactivate_link(conn, project, actor["id"], identifier)


@app.get(P + "/changes")
def changes(project: UUID, actor: Actor):
    with workspace(project, actor) as (conn, _):
        return many(
            conn,
            "SELECT * FROM changes WHERE project_id=:p ORDER BY created_at DESC,id",
            p=project,
        )


@app.post(P + "/changes", status_code=201)
def add_change(project: UUID, payload: c.ChangeInput, actor: Actor):
    with workspace(project, actor, EDIT, write=True) as (conn, _):
        return create_change(conn, project, actor["id"], payload)


@app.get(P + "/changes/{identifier}")
def change(project: UUID, identifier: UUID, actor: Actor):
    with workspace(project, actor) as (conn, _):
        return change_detail(conn, project, identifier)


@app.post(P + "/changes/{identifier}/transition")
def change_state(project: UUID, identifier: UUID, payload: c.Transition, actor: Actor):
    with workspace(project, actor, write=True) as (conn, record):
        return transition(conn, project, actor["id"], record, identifier, payload)


@app.get(P + "/analyses")
def analyses(project: UUID, actor: Actor):
    with workspace(project, actor) as (conn, record):
        return many(
            conn,
            """SELECT a.id,a.change_id,a.version_id,a.node_id,a.epoch<>:epoch AS stale,a.created_at,
                            n.code,jsonb_array_length(a.snapshot->'findings') AS findings
                            FROM analyses a JOIN nodes n ON n.id=a.node_id WHERE a.project_id=:p
                            ORDER BY a.created_at DESC LIMIT 100""",
            p=project,
            epoch=record["epoch"],
        )


@app.post(P + "/analyses", status_code=201)
def analyze(project: UUID, payload: c.AnalysisInput, actor: Actor):
    with workspace(project, actor, EDIT, write=True) as (conn, record):
        return trace.create_analysis(
            conn, project, actor["id"], record["epoch"], payload
        )


@app.get(P + "/analyses/{identifier}")
def analysis(project: UUID, identifier: UUID, actor: Actor):
    with workspace(project, actor) as (conn, record):
        return trace.read_analysis(conn, project, identifier, record["epoch"])


@app.put(P + "/analyses/{identifier}/decisions/{node}")
def decision(
    project: UUID, identifier: UUID, node: UUID, payload: c.ImpactDecision, actor: Actor
):
    with workspace(project, actor, EDIT + REVIEW, write=True) as (conn, record):
        return trace.decide(
            conn, project, actor["id"], identifier, node, record["epoch"], payload
        )


@app.get(P + "/baselines")
def baselines(project: UUID, actor: Actor):
    with workspace(project, actor) as (conn, _):
        return many(
            conn,
            """SELECT id,name,author,created_at,jsonb_array_length(snapshot->'requirements') AS count
                            FROM baselines WHERE project_id=:p ORDER BY created_at DESC,id""",
            p=project,
        )


@app.post(P + "/baselines", status_code=201)
def add_baseline(project: UUID, payload: c.BaselineInput, actor: Actor):
    with workspace(project, actor, MANAGE, write=True) as (conn, _):
        return trace.create_baseline(conn, project, actor["id"], payload.name)


@app.get(P + "/baselines/{identifier}")
def baseline(project: UUID, identifier: UUID, actor: Actor):
    with workspace(project, actor) as (conn, _):
        return trace.baseline(conn, project, identifier)


@app.get(P + "/baseline-comparison")
def compare_baselines(
    project: UUID, left: UUID, actor: Actor, right: UUID | None = None
):
    with workspace(project, actor) as (conn, _):
        first = trace.baseline(conn, project, left)["snapshot"]
        second = (
            trace.baseline(conn, project, right)["snapshot"]
            if right
            else jsonable_encoder(trace.capture(conn, project))
        )
        return compare(first, second)


@app.get(P + "/coverage")
def coverage(project: UUID, actor: Actor):
    with workspace(project, actor) as (conn, _):
        return trace.coverage(conn, project)


@app.get(P + "/audit")
def history(project: UUID, actor: Actor, offset: Annotated[int, Query(ge=0)] = 0):
    with workspace(project, actor) as (conn, _):
        return many(
            conn,
            """SELECT a.*,u.name AS actor_name FROM audit a JOIN users u ON u.id=a.actor
                            WHERE project_id=:p ORDER BY id DESC LIMIT 100 OFFSET :o""",
            p=project,
            o=offset,
        )


@app.get(P + "/stats")
def stats(project: UUID, actor: Actor):
    with workspace(project, actor) as (conn, _):
        data = trace.coverage(conn, project)
        states = one(
            conn,
            """SELECT count(*) FILTER(WHERE status='IN_REVIEW') AS pending_review
                   FROM versions WHERE project_id=:p""",
            p=project,
        )
        active = sql(
            conn,
            """SELECT count(*) FROM changes WHERE project_id=:p AND status NOT IN ('CLOSED','REJECTED')""",
            p=project,
        ).scalar_one()
        return {
            **states,
            "requirements": len(data["requirements"]),
            "changes": active,
            "missing_tests": data["eligible"] - data["covered"],
            "stale_requirements": sum(
                bool(r["stale_links"]) for r in data["requirements"]
            ),
        }


@app.get(P + "/export/{kind}")
def export(
    project: UUID,
    kind: str,
    actor: Actor,
    format: str = "json",
    identifier: UUID | None = None,
    right: UUID | None = None,
):
    if kind in {"registry", "coverage", "matrix"}:
        if kind == "registry":
            with workspace(project, actor) as (conn, _):
                data = many(
                    conn,
                    """SELECT n.code,n.kind,v.* FROM nodes n JOIN LATERAL(SELECT *
                                    FROM versions WHERE node_id=n.id ORDER BY number DESC LIMIT 1) v ON TRUE
                                    WHERE n.project_id=:p AND NOT n.archived ORDER BY n.code""",
                    p=project,
                )
        else:
            data = coverage(project, actor)
    elif kind == "change" and identifier:
        data = change(project, identifier, actor)
    elif kind == "impact" and identifier:
        data = analysis(project, identifier, actor)
    elif kind == "baseline" and identifier:
        data = baseline(project, identifier, actor)
    elif kind == "baseline-comparison" and identifier:
        data = compare_baselines(project, identifier, actor, right)
    else:
        raise HTTPException(422, "INVALID_REPORT")
    if format == "json":
        return JSONResponse(
            jsonable_encoder(data),
            headers={"Content-Disposition": f'attachment; filename="{kind}.json"'},
        )
    if format != "csv":
        raise HTTPException(422, "INVALID_FORMAT")
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["path", "value"])

    def flatten(value, path=""):
        if isinstance(value, dict) and value:
            for key, child in value.items():
                flatten(child, f"{path}/{key}")
        elif isinstance(value, list) and value:
            for index, child in enumerate(value):
                flatten(child, f"{path}/{index}")
        else:
            cell = "" if value is None else str(value)
            if cell.lstrip().startswith(("=", "+", "-", "@")) or cell.startswith(
                ("\t", "\r", "\n")
            ):
                cell = "'" + cell
            writer.writerow([path, cell])

    flatten(jsonable_encoder(data))
    return Response(
        "\ufeff" + output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{kind}.csv"'},
    )
