from fastapi import HTTPException

from traceon.domain import CHANGE_TRANSITIONS, REQUIREMENTS
from traceon.requirements import get_node
from traceon.store import audit, many, one


def get_change(conn, project, identifier):
    item = one(
        conn,
        "SELECT * FROM changes WHERE project_id=:p AND id=:id",
        p=project,
        id=identifier,
    )
    if not item:
        raise HTTPException(404, "CHANGE_NOT_FOUND")
    return item


def create_change(conn, project, actor, payload):
    node = get_node(conn, project, payload.node_id)
    if node["kind"] not in REQUIREMENTS or node["archived"]:
        raise HTTPException(409, "REQUIREMENT_REQUIRED")
    item = one(
        conn,
        """INSERT INTO changes(project_id,author,node_id,title,reason,proposal,risk)
                     VALUES (:p,:u,:node_id,:title,:reason,:proposal,:risk) RETURNING *""",
        p=project,
        u=actor,
        **payload.model_dump(),
    )
    audit(conn, actor, project, "CHANGE_CREATE", item["id"])
    return item


def change_detail(conn, project, identifier):
    item = get_change(conn, project, identifier)
    reports = many(
        conn,
        """SELECT id,version_id,epoch,created_at FROM analyses WHERE change_id=:id
                         ORDER BY created_at DESC,id""",
        id=identifier,
    )
    history = many(
        conn,
        "SELECT * FROM audit WHERE project_id=:p AND object_id=:id ORDER BY id",
        p=project,
        id=identifier,
    )
    return {**item, "analyses": reports, "history": history}


def transition(conn, project, actor, project_state, identifier, payload):
    item = get_change(conn, project, identifier)
    desired = payload.status
    if desired not in CHANGE_TRANSITIONS.get(item["status"], set()):
        raise HTTPException(409, "INVALID_TRANSITION")
    reviewer = item["status"] == "IMPACT_REVIEW"
    role = project_state["role"]
    if (reviewer and (role != "REVIEWER" or actor == item["author"])) or (
        not reviewer and role not in {"ANALYST", "PROJECT_MANAGER"}
    ):
        raise HTTPException(403, "ROLE_FORBIDDEN")
    if desired in {"IMPACT_REVIEW", "APPROVED"}:
        latest = one(
            conn,
            """SELECT a.*,(SELECT count(*) FROM impact_decisions d WHERE d.analysis_id=a.id) AS decisions
                           FROM analyses a WHERE a.change_id=:id ORDER BY a.created_at DESC,a.id LIMIT 1""",
            id=identifier,
        )
        if not latest or latest["epoch"] != project_state["epoch"]:
            raise HTTPException(409, "CURRENT_ANALYSIS_REQUIRED")
        if latest["decisions"] != len(latest["snapshot"]["findings"]):
            raise HTTPException(409, "IMPACT_REVIEW_INCOMPLETE")
    if desired == "IMPLEMENTED" and not one(
        conn,
        """SELECT id FROM versions WHERE change_id=:id AND status='APPROVED'
                                                  ORDER BY number DESC LIMIT 1""",
        id=identifier,
    ):
        raise HTTPException(409, "APPROVED_REVISION_REQUIRED")
    evidence = payload.comment if desired == "VERIFIED" else item["evidence"]
    result = one(
        conn,
        "UPDATE changes SET status=:status,evidence=:evidence WHERE id=:id RETURNING *",
        id=identifier,
        status=desired,
        evidence=evidence,
    )
    audit(conn, actor, project, "CHANGE_" + desired, identifier, payload.comment)
    return result
