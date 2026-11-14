from pathlib import Path
from xml.etree import ElementTree as ET

MODEL = "http://www.omg.org/spec/BPMN/20100524/MODEL"
DI = "http://www.omg.org/spec/BPMN/20100524/DI"
DC = "http://www.omg.org/spec/DD/20100524/DC"
POINT = "http://www.omg.org/spec/DD/20100524/DI"
for name, uri in (("bpmn", MODEL), ("bpmndi", DI), ("dc", DC), ("di", POINT)):
    ET.register_namespace(name, uri)


def element(parent, uri, kind, **attrs):
    return ET.SubElement(parent, f"{{{uri}}}{kind}", attrs)


def render(name, tasks, decision, outcomes):
    root = ET.Element(
        f"{{{MODEL}}}definitions",
        {"id": "Definitions", "targetNamespace": "urn:traceon"},
    )
    process = element(root, MODEL, "process", id="Workflow", isExecutable="false")
    view = element(root, DI, "BPMNDiagram", id="View")
    plane = element(view, DI, "BPMNPlane", id="Plane", bpmnElement="Workflow")
    coordinates = {}
    blocks = [("startEvent", "Start", "", 35, 100, 36, 36)]
    blocks += [
        ("task", f"Task{i}", label, 105 + i * 155, 78, 125, 80)
        for i, label in enumerate(tasks)
    ]
    x = 105 + len(tasks) * 155
    blocks += [("exclusiveGateway", "Decision", decision, x, 94, 48, 48)]
    for i, (label, _) in enumerate(outcomes):
        y = 20 + i * 125
        blocks += [
            ("task", f"Outcome{i}", label, x + 125, y, 145, 80),
            ("endEvent", f"End{i}", "", x + 310, y + 22, 36, 36),
        ]
    for tag, key, label, x, y, w, h in blocks:
        element(process, MODEL, tag, id=key, name=label)
        item = element(plane, DI, "BPMNShape", id=f"Shape{key}", bpmnElement=key)
        element(item, DC, "Bounds", x=str(x), y=str(y), width=str(w), height=str(h))
        coordinates[key] = (x, y, w, h)
    chain = ["Start", *(f"Task{i}" for i in range(len(tasks))), "Decision"]
    edges = [(a, b, "") for a, b in zip(chain[:-1], chain[1:], strict=True)]
    for i, (_, condition) in enumerate(outcomes):
        edges.extend(
            [("Decision", f"Outcome{i}", condition), (f"Outcome{i}", f"End{i}", "")]
        )
    for i, (source, target, label) in enumerate(edges):
        key = f"Flow{i}"
        element(
            process,
            MODEL,
            "sequenceFlow",
            id=key,
            sourceRef=source,
            targetRef=target,
            name=label,
        )
        edge = element(plane, DI, "BPMNEdge", id=f"Edge{i}", bpmnElement=key)
        x, y, w, h = coordinates[source]
        tx, ty, _, th = coordinates[target]
        points = [(x + w, y + h / 2), (tx, ty + th / 2)]
        if source == "Decision":
            points[1:1] = [(x + w + 27, y + h / 2), (x + w + 27, ty + th / 2)]
        for px, py in points:
            element(edge, POINT, "waypoint", x=str(px), y=str(py))
    ET.indent(root)
    Path(f"docs/diagrams/{name}.bpmn").write_text(
        ET.tostring(root, encoding="unicode") + "\n"
    )


render(
    "review",
    ["Save draft", "Submit exact revision", "Assign independent reviewer"],
    "Review decision",
    [
        ("Approve sealed version", "Approve"),
        ("Seal returned version", "Changes requested"),
    ],
)
render(
    "change",
    ["Register change", "Run and assess impact", "Submit current report"],
    "Review decision",
    [
        ("Record approved linked revision", "Approve"),
        ("Record rejection", "Reject"),
        ("Return to analysis", "Return"),
    ],
)
