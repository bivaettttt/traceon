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

## Traceability Workbench verification

| Check | Observed result |
| --- | --- |
| Python | 3 pytest tests passed. Ruff check and format passed. |
| Frontend | Prettier, TypeScript and production build passed. |
| Repository | OpenAPI matches the backend. Local Markdown links and BPMN references passed the repository check. |
| PostgreSQL integration | The existing API check verified project isolation and roles, 200/409 on concurrent draft updates, typed graph paths, approval rules, stale analyses, baseline immutability and logout. |
| Browser | 5 Chromium tests passed on a freshly seeded PostgreSQL 16 database. The suite covers creation of a project and graph, FR-014, literal rendering at 390 px, registry and CSV, graph keyboard interaction and reflow. |
| FR-014 | The analyst created a CR from the requirement and recorded 8 decisions (5 direct findings and 3 indirect). The reviewer approved the CR and the linked version v2. The analyst closed the CR. The manager captured ServiceHub 1.1 and compared it with 1.0. The diff showed the description, version and stale TC-08 pin. |
| Accessibility and visual checks | Playwright MCP verified workbench, registry, requirement, graph, Impact and comparison at 1440, 768 and 390 px. Browser tests covered Enter/Space on graph nodes, reduced motion and 320 px registry reflow. In a separate keyboard pass, Escape restored focus to the mobile menu button. |
| Contrast | Representative token pairs measured 9.73:1 for accent text on white, 4.22:1 for the control border on white and 10.64:1 for focus in the dark navigation. |

The local Compose baseline and early redesign runs encountered intermittent upstream 502s. The final local browser and integration runs used the same API, migrations, demo seed and built frontend with isolated native PostgreSQL. GitHub Actions also runs the tests through the repository's Compose recipe. Regression verification is scoped to Chromium and ServiceHub. VoiceOver, Safari, physical touch devices and high-volume graph rendering remain unverified. See the [screenshots](../../assets/screenshots) and [Quality workflow](https://github.com/bivaettttt/traceon/actions/workflows/quality.yml).

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

The coverage integration check verifies BR-001 as a business origin and distinguishes TC-08's stale version pin from TC-11's current transitive path. The browser verifies text renders literally at 390 px. The API check verifies the return-for-changes workflow and CSV export.
