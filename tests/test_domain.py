from traceon.domain import compare, impact, valid_link


def edge(id, source, target, kind, stale=False):
    return {
        "id": id,
        "source_id": source,
        "target_id": target,
        "kind": kind,
        "stale": stale,
    }


def test_impact_paths_direction_cycles_and_terminal_edges():
    network = [
        edge("a", "root", "api", "IMPLEMENTED_BY"),
        edge("b", "api", "db", "IMPLEMENTED_BY"),
        edge("c", "db", "test", "VERIFIED_BY"),
        edge("d", "other", "root", "DEPENDS_ON"),
        edge("e", "root", "other", "RELATES_TO"),
        edge("f", "other", "note", "RELATES_TO"),
        edge("g", "test", "extra", "IMPLEMENTED_BY"),
        edge("h", "other", "db", "IMPLEMENTED_BY"),
        edge("i", "db", "root", "RELATES_TO"),
    ]
    result = {item["node_id"]: item for item in impact("root", network)}
    assert {id: item["depth"] for id, item in result.items()} == {
        "api": 1,
        "other": 1,
        "db": 1,
        "test": 3,
        "note": 2,
    }
    assert [step["link_id"] for step in result["test"]["path"]] == ["a", "b", "c"]
    assert result == {
        item["node_id"]: item for item in impact("root", list(reversed(network)))
    }


def test_stale_and_isolated():
    graph = [
        edge("a", "root", "api", "IMPLEMENTED_BY", True),
        edge("b", "api", "test", "VERIFIED_BY"),
    ]
    assert [row["node_id"] for row in impact("root", graph)] == ["api"]
    assert not impact("isolated", graph)
    assert not valid_link("VERIFIED_BY", "FUNCTIONAL", "ENDPOINT")


def test_baseline_comparison():
    left = {"requirements": [{"id": "a", "version": 1}], "artifacts": [], "links": []}
    right = {
        "requirements": [{"id": "a", "version": 2}, {"id": "b", "version": 1}],
        "artifacts": [],
        "links": [],
    }
    diff = compare(left, right)["requirements"]
    assert len(diff["changed"]) == len(diff["added"]) == 1
    assert diff["changed"][0]["before"]["version"] == 1
