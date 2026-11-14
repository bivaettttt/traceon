from fastapi import HTTPException

from traceon.domain import REQUIREMENTS
from traceon.store import advance, audit, many, one, sql

FIELDS = (
    "title",
    "description",
    "rationale",
    "priority",
    "source",
    "criteria",
    "rules",
    "reason",
)


def get_node(conn, project, identifier):
    found = one(
        conn,
        "SELECT * FROM nodes WHERE project_id=:p AND id=:id",
        p=project,
        id=identifier,
    )
    if not found:
        raise HTTPException(404, "NODE_NOT_FOUND")
    return found


def get_version(conn, project, identifier):
    found = one(
        conn,
        "SELECT * FROM versions WHERE project_id=:p AND id=:id",
        p=project,
        id=identifier,
    )
    if not found:
        raise HTTPException(404, "VERSION_NOT_FOUND")
    return found


def insert_version(conn, project, node, actor, number, data, change=None):
    columns = ",".join(FIELDS)
    values = ",".join(":" + field for field in FIELDS)
    return one(
        conn,
        f"""INSERT INTO versions(project_id,node_id,author,number,change_id,{columns})
                       VALUES (:p,:n,:u,:number,:change,{values}) RETURNING *""",
        p=project,
        n=node,
        u=actor,
        number=number,
        change=change,
        **data,
    )


def create_requirement(conn, project, actor, payload):
    node = one(
        conn,
        """INSERT INTO nodes(project_id,code,kind,title) VALUES (:p,:code,:kind,:title)
                       ON CONFLICT(project_id,code) DO NOTHING RETURNING *""",
        p=project,
        code=payload.code,
        kind=payload.kind,
        title=payload.title,
    )
    if not node:
        raise HTTPException(409, "CODE_EXISTS")
    version = insert_version(
        conn,
        project,
        node["id"],
        actor,
        1,
        payload.model_dump(exclude={"code", "kind"}),
    )
    advance(conn, project)
    audit(conn, actor, project, "REQUIREMENT_CREATE", node["id"])
    return {"node": node, "version": version}


def node_detail(conn, project, identifier):
    node = get_node(conn, project, identifier)
    versions = many(
        conn,
        "SELECT * FROM versions WHERE node_id=:n ORDER BY number DESC",
        n=identifier,
    )
    reviews = many(
        conn,
        """SELECT r.*,u.name AS reviewer_name FROM reviews r JOIN versions v ON v.id=r.version_id
                          JOIN users u ON u.id=r.reviewer WHERE v.node_id=:n ORDER BY r.id DESC""",
        n=identifier,
    )
    links = many(
        conn,
        """SELECT l.*,s.code AS source_code,t.code AS target_code FROM links l JOIN nodes s ON s.id=l.source_id
                         JOIN nodes t ON t.id=l.target_id WHERE l.active AND (l.source_id=:n OR l.target_id=:n)
                         ORDER BY s.code,t.code,l.kind""",
        n=identifier,
    )
    return {"node": node, "versions": versions, "reviews": reviews, "links": links}


def new_version(conn, project, actor, node_id, payload):
    node = get_node(conn, project, node_id)
    latest = one(
        conn,
        "SELECT * FROM versions WHERE node_id=:n ORDER BY number DESC LIMIT 1",
        n=node_id,
    )
    if (
        node["kind"] not in REQUIREMENTS
        or not latest
        or latest["status"] not in ("APPROVED", "CHANGES_REQUESTED")
    ):
        raise HTTPException(409, "OPEN_REVISION")
    change = payload.change_id or (
        latest["change_id"] if latest["status"] == "CHANGES_REQUESTED" else None
    )
    if change:
        allowed = one(
            conn,
            "SELECT id FROM changes WHERE project_id=:p AND id=:c AND node_id=:n AND status='APPROVED'",
            p=project,
            c=change,
            n=node_id,
        )
        if not allowed:
            raise HTTPException(409, "CHANGE_NOT_APPROVED")
    data = {field: latest[field] for field in FIELDS}
    data["reason"] = payload.reason
    result = insert_version(
        conn, project, node_id, actor, latest["number"] + 1, data, change
    )
    advance(conn, project)
    audit(conn, actor, project, "VERSION_CREATE", result["id"])
    return result


def edit_version(conn, project, actor, identifier, payload):
    edits = ",".join(f"{field}=:{field}" for field in FIELDS)
    updated = one(
        conn,
        f"""UPDATE versions SET {edits},revision=revision+1
                        WHERE project_id=:p AND id=:id AND status='DRAFT' AND revision=:revision
                        AND author=:actor RETURNING *""",
        p=project,
        id=identifier,
        actor=actor,
        **payload.model_dump(),
    )
    if not updated:
        get_version(conn, project, identifier)
        raise HTTPException(409, "DRAFT_CONFLICT")
    advance(conn, project)
    audit(conn, actor, project, "VERSION_EDIT", identifier)
    return updated


def submit(conn, project, actor, identifier, payload):
    version = get_version(conn, project, identifier)
    if version["author"] != actor:
        raise HTTPException(403, "AUTHOR_REQUIRED")
    reviewer = one(
        conn,
        "SELECT actor FROM members WHERE project_id=:p AND actor=:r AND role='REVIEWER'",
        p=project,
        r=payload.reviewer,
    )
    if not reviewer or actor == payload.reviewer:
        raise HTTPException(409, "INDEPENDENT_REVIEWER_REQUIRED")
    if not all(
        version[field].strip() for field in ("description", "source", "criteria")
    ):
        raise HTTPException(409, "INCOMPLETE_REQUIREMENT")
    result = one(
        conn,
        """UPDATE versions SET status='IN_REVIEW',reviewer=:r WHERE id=:id
                       AND status='DRAFT' AND revision=:revision RETURNING *""",
        id=identifier,
        r=payload.reviewer,
        revision=payload.revision,
    )
    if not result:
        raise HTTPException(409, "DRAFT_CONFLICT")
    audit(conn, actor, project, "VERSION_SUBMIT", identifier)
    return result


def review(conn, project, actor, identifier, payload):
    version = get_version(conn, project, identifier)
    if version["status"] != "IN_REVIEW":
        raise HTTPException(409, "REVIEW_CLOSED")
    if version["reviewer"] != actor or version["author"] == actor:
        raise HTTPException(403, "ASSIGNED_REVIEWER_REQUIRED")
    result = one(
        conn,
        "UPDATE versions SET status=:decision WHERE id=:id RETURNING *",
        id=identifier,
        decision=payload.decision,
    )
    sql(
        conn,
        "INSERT INTO reviews(version_id,reviewer,decision,comment) VALUES (:id,:u,:decision,:comment)",
        id=identifier,
        u=actor,
        **payload.model_dump(),
    )
    advance(conn, project)
    audit(conn, actor, project, "VERSION_REVIEW", identifier, payload.decision)
    return result
