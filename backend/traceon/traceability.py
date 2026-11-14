from fastapi import HTTPException

from traceon.domain import REQUIREMENTS, TERMINAL, impact, orient, valid_link
from traceon.requirements import get_node, get_version
from traceon.store import advance, audit, json, many, one


def graph(conn, project, source_version=None):
    nodes = many(
        conn,
        """SELECT n.*,latest.id AS latest_id,latest.status,latest.priority,latest.number,
                        approved.id AS approved_id,COALESCE(latest.title,n.title) AS display_title
                     FROM nodes n
                     LEFT JOIN LATERAL(SELECT * FROM versions WHERE node_id=n.id ORDER BY number DESC LIMIT 1) latest ON true
                     LEFT JOIN LATERAL(SELECT id FROM versions WHERE node_id=n.id AND status='APPROVED' ORDER BY number DESC LIMIT 1) approved ON true
                     WHERE n.project_id=:p AND NOT n.archived ORDER BY n.code""",
        p=project,
    )
    current = {n["id"]: n["approved_id"] or n["latest_id"] for n in nodes}
    links = [
        link
        for link in many(
            conn,
            "SELECT * FROM links WHERE project_id=:p AND active ORDER BY kind,id",
            p=project,
        )
        if link["source_id"] in current and link["target_id"] in current
    ]

    def stale(link, versions):
        return any(
            link[f"{side}_version"]
            and link[f"{side}_version"] != versions[link[f"{side}_id"]]
            for side in ("source", "target")
        )

    override = (
        {**current, source_version["node_id"]: source_version["id"]}
        if source_version
        else current
    )
    for link in links:
        link["stale"] = stale(link, current)
        link["stale_from_root"] = stale(link, override)
    return {"nodes": nodes, "links": links}


def add_link(conn, project, actor, payload):
    source = get_node(conn, project, payload.source_id)
    target = get_node(conn, project, payload.target_id)
    if source["archived"] or target["archived"] or source["id"] == target["id"]:
        raise HTTPException(409, "INVALID_ENDPOINTS")
    if not valid_link(payload.kind, source["kind"], target["kind"]):
        raise HTTPException(409, "INVALID_LINK_TYPE")
    for pin, node in (
        (payload.source_version, source),
        (payload.target_version, target),
    ):
        if pin and get_version(conn, project, pin)["node_id"] != node["id"]:
            raise HTTPException(409, "INVALID_VERSION_PIN")
    data = payload.model_dump()
    if payload.kind not in TERMINAL:
        origin, destination = orient(data)[0]
        if any(
            row["node_id"] == origin
            for row in impact(
                destination, graph(conn, project)["links"], structural=True
            )
        ):
            raise HTTPException(409, "STRUCTURAL_CYCLE")
    if payload.kind == "RELATES_TO" and str(data["source_id"]) > str(data["target_id"]):
        data["source_id"], data["target_id"] = data["target_id"], data["source_id"]
        data["source_version"], data["target_version"] = (
            data["target_version"],
            data["source_version"],
        )
    result = one(
        conn,
        """INSERT INTO links(project_id,source_id,target_id,kind,source_version,target_version)
                        VALUES (:p,:source_id,:target_id,:kind,:source_version,:target_version)
                        ON CONFLICT DO NOTHING RETURNING *""",
        p=project,
        **data,
    )
    if not result:
        raise HTTPException(409, "LINK_EXISTS")
    advance(conn, project)
    audit(conn, actor, project, "LINK_CREATE", result["id"])
    return result


def coverage(conn, project, data=None):
    data = data or graph(conn, project)
    records = []
    for node in data["nodes"]:
        if node["kind"] not in REQUIREMENTS:
            continue
        outgoing = [
            link
            for link in data["links"]
            if node["id"] in (link["source_id"], link["target_id"])
        ]
        version = get_version(conn, project, node["latest_id"])
        findings = impact(node["id"], data["links"])
        by_id = {n["id"]: n for n in data["nodes"]}
        tests = [
            by_id[f["node_id"]]["code"]
            for f in findings
            if f["path"][-1]["kind"] == "VERIFIED_BY" and not f["stale"]
        ]
        designs = [
            by_id[f["node_id"]]["code"]
            for f in findings
            if f["path"][-1]["kind"] == "IMPLEMENTED_BY" and not f["stale"]
        ]
        missing = [
            field
            for field in ("description", "source", "criteria")
            if not version[field].strip()
        ]
        records.append(
            {
                "id": node["id"],
                "code": node["code"],
                "title": node["display_title"],
                "type": node["kind"],
                "approved": bool(node["approved_id"]),
                "tests": tests,
                "designs": designs,
                "stale_links": sum(link["stale"] for link in outgoing),
                "unapproved_revision": node["latest_id"] != node["approved_id"],
                "missing_fields": missing,
                "missing_test": node["kind"] == "FUNCTIONAL"
                and bool(node["approved_id"])
                and not tests,
            }
        )
    eligible = [
        row for row in records if row["type"] == "FUNCTIONAL" and row["approved"]
    ]
    return {
        "requirements": records,
        "eligible": len(eligible),
        "covered": sum(bool(row["tests"]) for row in eligible),
    }


def create_analysis(conn, project, actor, epoch, payload):
    version = get_version(conn, project, payload.version_id)
    if payload.change_id:
        change = one(
            conn,
            "SELECT * FROM changes WHERE project_id=:p AND id=:c",
            p=project,
            c=payload.change_id,
        )
        if not change:
            raise HTTPException(404, "CHANGE_NOT_FOUND")
        if (
            change["node_id"] != version["node_id"]
            or change["status"] != "UNDER_ANALYSIS"
        ):
            raise HTTPException(409, "CHANGE_CONTEXT_INVALID")
    data = graph(conn, project, version)
    findings = impact(
        version["node_id"],
        data["links"],
        first_links={edge["id"]: edge["stale_from_root"] for edge in data["links"]},
    )
    snapshot = {
        "version": version,
        "graph": data,
        "findings": findings,
        "missing_traceability": not any(not item["stale"] for item in findings),
    }
    result = one(
        conn,
        """INSERT INTO analyses(project_id,change_id,node_id,version_id,epoch,snapshot)
                        VALUES (:p,:change,:node,:version,:epoch,CAST(:snapshot AS jsonb)) RETURNING *""",
        p=project,
        change=payload.change_id,
        node=version["node_id"],
        version=version["id"],
        epoch=epoch,
        snapshot=json(snapshot),
    )
    audit(conn, actor, project, "IMPACT_RUN", result["id"])
    return result


def read_analysis(conn, project, identifier, epoch):
    record = one(
        conn,
        "SELECT * FROM analyses WHERE project_id=:p AND id=:id",
        p=project,
        id=identifier,
    )
    if not record:
        raise HTTPException(404, "ANALYSIS_NOT_FOUND")
    return {
        **record,
        "stale": record["epoch"] != epoch,
        "decisions": many(
            conn,
            "SELECT * FROM impact_decisions WHERE analysis_id=:id ORDER BY node_id",
            id=identifier,
        ),
    }


def decide(conn, project, actor, identifier, node, epoch, payload):
    analysis = read_analysis(conn, project, identifier, epoch)
    if analysis["stale"]:
        raise HTTPException(409, "STALE_ANALYSIS")
    if analysis["change_id"] and not one(
        conn,
        "SELECT id FROM changes WHERE id=:id AND status='UNDER_ANALYSIS'",
        id=analysis["change_id"],
    ):
        raise HTTPException(409, "ANALYSIS_REVIEW_CLOSED")
    if not any(
        item["node_id"] == str(node) for item in analysis["snapshot"]["findings"]
    ):
        raise HTTPException(404, "FINDING_NOT_FOUND")
    result = one(
        conn,
        """INSERT INTO impact_decisions VALUES (:id,:n,:u,:decision,:comment)
                        ON CONFLICT(analysis_id,node_id) DO UPDATE SET reviewer=EXCLUDED.reviewer,
                        decision=EXCLUDED.decision,comment=EXCLUDED.comment RETURNING *""",
        id=identifier,
        n=node,
        u=actor,
        **payload.model_dump(),
    )
    audit(
        conn,
        actor,
        project,
        "IMPACT_DECISION",
        identifier,
        f"{node} {payload.decision}",
    )
    return result


def capture(conn, project):
    current = graph(conn, project)
    requirements = []
    artifacts = []
    for node in current["nodes"]:
        if node["approved_id"]:
            requirements.append(
                {
                    "id": node["id"],
                    "code": node["code"],
                    "version": get_version(conn, project, node["approved_id"]),
                }
            )
        elif node["kind"] not in REQUIREMENTS:
            artifacts.append(
                {
                    key: node[key]
                    for key in (
                        "id",
                        "code",
                        "kind",
                        "title",
                        "description",
                        "source",
                        "release",
                    )
                }
            )
    covered = {row["id"] for row in (*requirements, *artifacts)}
    links = [
        link
        for link in current["links"]
        if {link["source_id"], link["target_id"]} <= covered
    ]
    return {"requirements": requirements, "artifacts": artifacts, "links": links}


def baseline(conn, project, identifier):
    result = one(
        conn,
        "SELECT * FROM baselines WHERE project_id=:p AND id=:id",
        p=project,
        id=identifier,
    )
    if not result:
        raise HTTPException(404, "BASELINE_NOT_FOUND")
    return result


def create_baseline(conn, project, actor, name):
    snapshot = capture(conn, project)
    if not snapshot["requirements"]:
        raise HTTPException(409, "NO_APPROVED_REQUIREMENTS")
    result = one(
        conn,
        """INSERT INTO baselines(project_id,name,author,snapshot)
                       VALUES (:p,:name,:u,CAST(:s AS jsonb)) ON CONFLICT DO NOTHING RETURNING *""",
        p=project,
        name=name,
        u=actor,
        s=json(snapshot),
    )
    if not result:
        raise HTTPException(409, "BASELINE_EXISTS")
    audit(conn, actor, project, "BASELINE_CREATE", result["id"])
    return result


def deactivate_link(conn, project, actor, identifier):
    result = one(
        conn,
        """UPDATE links SET active=false WHERE project_id=:p AND id=:id AND active RETURNING *""",
        p=project,
        id=identifier,
    )
    if not result:
        raise HTTPException(404, "LINK_NOT_FOUND")
    advance(conn, project)
    audit(conn, actor, project, "LINK_DEACTIVATE", identifier)
    return result
