from collections import deque

REQUIREMENTS = frozenset(
    {"BUSINESS", "STAKEHOLDER", "FUNCTIONAL", "NONFUNCTIONAL", "TRANSITION"}
)
ARTIFACTS = frozenset(
    {
        "PROCESS",
        "RULE",
        "ENDPOINT",
        "CONTRACT",
        "COMPONENT",
        "ENTITY",
        "DATA_CONTRACT",
        "TEST_CASE",
        "TEST_SUITE",
        "DECISION",
        "DOCUMENT",
        "UI",
    }
)
TESTS = frozenset({"TEST_CASE", "TEST_SUITE"})
LINKS = frozenset(
    {
        "REFINES",
        "DERIVES_FROM",
        "DEPENDS_ON",
        "IMPLEMENTED_BY",
        "VERIFIED_BY",
        "CONSTRAINS",
        "RELATES_TO",
    }
)
TERMINAL = frozenset({"VERIFIED_BY", "RELATES_TO"})
REVERSE = frozenset({"DERIVES_FROM", "DEPENDS_ON"})
CHANGE_TRANSITIONS = {
    "NEW": {"UNDER_ANALYSIS"},
    "UNDER_ANALYSIS": {"IMPACT_REVIEW"},
    "IMPACT_REVIEW": {"APPROVED", "REJECTED", "UNDER_ANALYSIS"},
    "APPROVED": {"IMPLEMENTED"},
    "IMPLEMENTED": {"VERIFIED"},
    "VERIFIED": {"CLOSED"},
}


def valid_link(kind, source, target):
    if kind in {"REFINES", "DERIVES_FROM"}:
        return source in REQUIREMENTS and target in REQUIREMENTS
    if kind == "IMPLEMENTED_BY":
        return source not in TESTS and target in ARTIFACTS - TESTS - {"RULE"}
    if kind == "VERIFIED_BY":
        return source not in TESTS and target in TESTS
    if kind == "CONSTRAINS":
        return source == "RULE" and target not in TESTS | {"RULE"}
    return kind in {"DEPENDS_ON", "RELATES_TO"}


def orient(link):
    source, target = link["source_id"], link["target_id"]
    if link["kind"] in REVERSE:
        return [(target, source)]
    if link["kind"] == "RELATES_TO":
        return [(source, target), (target, source)]
    return [(source, target)]


def impact(root, graph, *, structural=False, first_links=None):
    adjacency = {}
    for link in graph:
        if structural and link["kind"] in TERMINAL:
            continue
        for origin, target in orient(link):
            adjacency.setdefault(origin, []).append((target, link))
    for edges in adjacency.values():
        edges.sort(key=lambda pair: (str(pair[0]), pair[1]["kind"], str(pair[1]["id"])))
    queue = deque([(root, [])])
    expanded = {root}
    result = {}
    while queue:
        origin, path = queue.popleft()
        for target, link in adjacency.get(origin, []):
            if target == root:
                continue
            if origin == root and first_links is not None:
                stale = first_links[link["id"]]
            else:
                stale = link.get("stale", False)
            step = {
                "from": origin,
                "to": target,
                "link_id": link["id"],
                "kind": link["kind"],
                "stale": stale,
            }
            next_path = [*path, step]
            result.setdefault(
                target,
                {
                    "node_id": target,
                    "depth": len(next_path),
                    "path": next_path,
                    "stale": stale,
                    "review_required": True,
                },
            )
            if (
                structural or (not stale and link["kind"] not in TERMINAL)
            ) and target not in expanded:
                expanded.add(target)
                queue.append((target, next_path))
    return list(result.values())


def compare(left, right):
    groups = {}
    for key in ("requirements", "artifacts", "links"):
        old = {item["id"]: item for item in left[key]}
        new = {item["id"]: item for item in right[key]}
        groups[key] = {
            "added": [new[id] for id in sorted(new.keys() - old.keys())],
            "removed": [old[id] for id in sorted(old.keys() - new.keys())],
            "changed": [
                {"before": old[id], "after": new[id]}
                for id in sorted(old.keys() & new.keys())
                if old[id] != new[id]
            ],
        }
    return groups
