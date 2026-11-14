# Проверки / Verification

| ID | Requirement | Evidence |
|---|---|---|
| TC-001 | FR-001/009, NFR-003 | Real API check for project scope, cross-project link, extra fields, assigned roles and session revocation |
| TC-002 | FR-002/003 | Two concurrent draft edits yield HTTP 200 and 409. Approval seals content. PostgreSQL rejects direct edits |
| TC-003 | FR-004/005, NFR-001 | Tests for typed direction, cycles, terminal and stale edges, multiple paths, isolated roots, stable output and graph invalidation |
| TC-004 | FR-005/006 | Partial finding decisions block CR submission. Approval uses a current analysis. Linked approved revision allows implementation |
| TC-005 | FR-007 | Immutable baseline records and version comparison verified over API and PostgreSQL |
| TC-006 | FR-008 | Matrix reads live links and derived quality checks. Coverage denominator is approved FRs |
| TC-007 | FR-010, NFR-002 | Browser creates a project and graph, then runs ServiceHub through analysis, review and baseline comparison |

Observed: 3 pytest tests and 2 Chromium flows passed. The Compose integration script verified isolation, concurrent edits, workflow, graph and immutable baselines. Both BPMN files passed OMG XSD validation. Frontend type check and production build passed. CI validates OpenAPI drift, diagrams' XML references, repository links and common secret signatures.

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt pytest ruff
ruff check backend scripts tests
pytest -q
PYTHONPATH=backend python scripts/openapi.py --check
python scripts/check_repo.py
scripts/lab reset
docker compose -p traceon-lab exec -T api python - < scripts/verify_workspace.py
scripts/lab reset
cd frontend
npm ci
npx playwright install chromium
npm run e2e
```
