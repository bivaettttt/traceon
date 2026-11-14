import json
import sys
from pathlib import Path

from traceon.api import app

path = Path("docs/api/openapi.json")
schema = json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
if "--check" in sys.argv:
    if path.read_text() != schema:
        raise SystemExit("OpenAPI snapshot differs from FastAPI")
else:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(schema)
