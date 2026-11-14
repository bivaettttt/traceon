import re
import subprocess
from pathlib import Path
from xml.etree import ElementTree

tracked = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
signature = re.compile(
    rb"(gh[pous]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)"
)
for name in filter(None, tracked):
    path = Path(name)
    if path.name.startswith(".env") and path.name != ".env.example":
        raise SystemExit(f"Unexpected environment file: {path}")
    content = path.read_bytes()
    if signature.search(content):
        raise SystemExit(f"Credential pattern: {path}")
    if path.suffix == ".md":
        for link in re.findall(r"\]\(([^)]+)\)", content.decode()):
            dest = link.split("#")[0]
            if dest and "://" not in dest and not (path.parent / dest).exists():
                raise SystemExit(f"Broken link in {path}: {link}")
    if path.suffix == ".bpmn":
        root = ElementTree.fromstring(content)
        ids = [item.get("id") for item in root.iter() if "id" in item.attrib]
        if len(ids) != len(set(ids)):
            raise SystemExit(f"Duplicate BPMN identifiers in {path}")
        for item in root.iter():
            for ref in ("sourceRef", "targetRef", "bpmnElement"):
                if ref in item.attrib and item.get(ref) not in ids:
                    raise SystemExit(f"Invalid BPMN reference in {path}")
