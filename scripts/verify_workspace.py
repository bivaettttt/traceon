import os
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import httpx
from sqlalchemy.exc import IntegrityError
from traceon.store import db, sql

base = os.getenv("TRACEON_API", "http://127.0.0.1:8000")
password = os.getenv("DEMO_PASSWORD", "Traceon-demo-local")


def sign(name):
    response = httpx.post(
        base + "/api/login", json={"username": name, "password": password}
    )
    response.raise_for_status()
    return {"Authorization": "Bearer " + response.json()["token"]}


def api(actor, method, path, expected=200, **kwargs):
    response = httpx.request(method, base + "/api" + path, headers=actor, **kwargs)
    assert response.status_code == expected, (path, response.status_code, response.text)
    return None if expected == 204 else response.json()


analyst, reviewer, manager, admin = (
    sign(name) for name in ("analyst", "reviewer", "manager", "admin")
)
project = next(p for p in api(analyst, "GET", "/projects") if p["code"] == "SERVICEHUB")
p = "/projects/" + project["id"]
api({}, "GET", p, 401)
api(admin, "GET", p, 404)
api(
    analyst,
    "POST",
    p + "/requirements",
    422,
    json={"code": "BAD", "kind": "FUNCTIONAL", "title": "Bad", "status": "APPROVED"},
)
seed = api(analyst, "GET", p + "/requirements?q=FR-014")[0]
original = api(manager, "GET", p + "/baselines")[-1]


def run_change():
    change = api(
        analyst,
        "POST",
        p + "/changes",
        201,
        json={
            "node_id": seed["id"],
            "title": "Подтверждение руководителя",
            "reason": "Контроль чувствительных заявок",
            "proposal": "Добавить этап проверки",
        },
    )
    path = p + "/changes/" + change["id"]

    def move(actor, status, expected=200):
        return api(
            actor,
            "POST",
            path + "/transition",
            expected,
            json={"status": status, "comment": "Проверено"},
        )

    move(analyst, "APPROVED", 409)
    move(analyst, "UNDER_ANALYSIS")
    report_input = {"version_id": seed["version_id"], "change_id": change["id"]}
    first = api(analyst, "POST", p + "/analyses", 201, json=report_input)
    report = api(analyst, "POST", p + "/analyses", 201, json=report_input)
    assert first["snapshot"] == report["snapshot"]
    findings = report["snapshot"]["findings"]
    assert {1, 2, 3, 4} <= {row["depth"] for row in findings}
    for index, finding in enumerate(findings):
        api(
            reviewer,
            "PUT",
            p + "/analyses/" + report["id"] + "/decisions/" + finding["node_id"],
            json={
                "decision": "DISMISSED" if index == 0 else "CONFIRMED",
                "comment": "Изучено",
            },
        )
        if index == 0:
            move(analyst, "IMPACT_REVIEW", 409)
    move(analyst, "IMPACT_REVIEW")
    move(analyst, "APPROVED", 403)
    move(reviewer, "APPROVED")
    move(analyst, "IMPLEMENTED", 409)
    version = api(
        analyst,
        "POST",
        p + "/nodes/" + seed["id"] + "/versions",
        201,
        json={"reason": "Уточнение подтверждения", "change_id": change["id"]},
    )
    v = p + "/versions/" + version["id"]
    draft = {
        key: version[key]
        for key in (
            "title",
            "description",
            "rationale",
            "priority",
            "source",
            "criteria",
            "rules",
            "reason",
            "revision",
        )
    }
    draft["description"] = (
        "Для чувствительной заявки требуется подтверждение руководителя."
    )
    with ThreadPoolExecutor(2) as pool:
        statuses = list(
            pool.map(
                lambda _: (
                    httpx.patch(
                        base + "/api" + v, headers=analyst, json=draft
                    ).status_code
                ),
                range(2),
            )
        )
    assert sorted(statuses) == [200, 409]
    assert api(analyst, "GET", p + "/analyses/" + report["id"])["stale"]
    candidate = api(analyst, "GET", p + "/nodes/" + seed["id"])["versions"][0]
    reviewer_id = api(reviewer, "GET", "/me")["id"]
    api(
        analyst,
        "POST",
        v + "/submit",
        json={"reviewer": reviewer_id, "revision": candidate["revision"]},
    )
    api(
        analyst,
        "POST",
        v + "/review",
        403,
        json={"decision": "APPROVED", "comment": "Отказ"},
    )
    api(
        reviewer,
        "POST",
        v + "/review",
        json={"decision": "APPROVED", "comment": "Этап согласован"},
    )
    api(analyst, "PATCH", v, 409, json={**draft, "revision": candidate["revision"]})
    move(analyst, "IMPLEMENTED")
    move(analyst, "VERIFIED")
    move(analyst, "CLOSED")
    snap = api(
        manager,
        "POST",
        p + "/baselines",
        201,
        json={"name": "Проверка " + uuid4().hex[:8]},
    )
    delta = api(
        manager,
        "GET",
        p + "/baseline-comparison",
        params={"left": original["id"], "right": snap["id"]},
    )
    assert any(
        item["after"]["code"] == "FR-014"
        and item["after"]["version"]["id"] == version["id"]
        for item in delta["requirements"]["changed"]
    )
    for query, id in [
        ("UPDATE baselines SET name='tampered' WHERE id=:id", snap["id"]),
        ("UPDATE versions SET title='tampered' WHERE id=:id", version["id"]),
    ]:
        try:
            with db.begin() as conn:
                sql(conn, query, id=id)
        except IntegrityError:
            pass
        else:
            raise AssertionError("Expected immutability constraint")


run_change()
coverage = api(analyst, "GET", p + "/coverage")
changed = next(row for row in coverage["requirements"] if row["code"] == "FR-014")
assert changed["business"] == ["BR-001"]
assert "TC-11" in changed["tests"] and "TC-08" not in changed["tests"]
assert changed["stale_links"] == 1
assert coverage["eligible"] == 2 and coverage["covered"] == 1
export = httpx.get(base + "/api" + p + "/export/matrix?format=csv", headers=analyst)
assert export.status_code == 200 and "FR-014" in export.text
rework = api(
    analyst,
    "POST",
    p + "/requirements",
    201,
    json={
        "code": "FR-" + uuid4().hex[:10].upper(),
        "kind": "FUNCTIONAL",
        "title": "Review fixture",
        "description": "A requirement awaiting review",
        "source": "ServiceHub",
        "criteria": "Verify the transition.",
    },
)
initial = rework["version"]
reviewer_id = api(reviewer, "GET", "/me")["id"]
api(
    analyst,
    "POST",
    p + "/versions/" + initial["id"] + "/submit",
    json={"reviewer": reviewer_id, "revision": initial["revision"]},
)
api(
    reviewer,
    "POST",
    p + "/versions/" + initial["id"] + "/review",
    json={"decision": "CHANGES_REQUESTED", "comment": "Include alternate path"},
)
successor = api(
    analyst,
    "POST",
    p + "/nodes/" + rework["node"]["id"] + "/versions",
    201,
    json={"reason": "Describe alternate path"},
)
assert successor["status"] == "DRAFT" and successor["number"] == 2
foreign = api(
    admin,
    "POST",
    "/projects",
    201,
    json={"code": "X-" + uuid4().hex[:10].upper(), "name": "Private"},
)
foreign_node = api(
    admin,
    "POST",
    "/projects/" + foreign["id"] + "/requirements",
    201,
    json={"code": "FR-01", "kind": "FUNCTIONAL", "title": "Hidden"},
)
api(
    analyst,
    "POST",
    p + "/links",
    404,
    json={
        "source_id": seed["id"],
        "target_id": foreign_node["node"]["id"],
        "kind": "DEPENDS_ON",
    },
)
graph = api(analyst, "GET", p + "/graph")
business = next(n for n in graph["nodes"] if n["code"] == "BR-001")
api(
    analyst,
    "POST",
    p + "/links",
    409,
    json={"source_id": seed["id"], "target_id": business["id"], "kind": "REFINES"},
)
api(analyst, "POST", "/logout", 204)
api(analyst, "GET", p, 401)
print(
    "Verified workspace isolation, concurrent revisions, typed graph, change approval, impact paths, immutable baselines and logout"
)
