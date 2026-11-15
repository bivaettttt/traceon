# Traceon · Requirements Engineering and Change Impact

[Русский](README.ru.md)

Traceon lets analysts, reviewers and managers trace a change from its business origin to an API, data model and tests. ServiceHub, the demo project, models a synthetic service request process.

## Run

```sh
docker compose up --build
```

Open the [workspace](http://127.0.0.1:8100). Compose starts PostgreSQL, runs migrations and seeds ServiceHub with an initial baseline. The local accounts `analyst`, `reviewer`, `manager` and `admin` use `Traceon-demo-local`. Configure ports and the initial password with a local copy of [.env.example](.env.example). These defaults are for loopback use.

```sh
scripts/lab up
```

The [lab](http://127.0.0.1:8101) runs in a separate Compose project and volume. `scripts/lab reset` recreates the lab alone. `scripts/lab stop` stops it and retains its data.

## Features and architecture

Project membership is enforced by the API. Analysts work with requirements, draft versions, links and change requests. Reviewers decide on assigned revisions. Managers assign roles and capture baselines. Administrators create demo accounts.

Draft updates compare an expected revision. Submission seals content, and any new content goes into a new revision. A baseline retains exact approved version IDs and values, artifacts and active relationships. Compare snapshots with one another or with the current approved project state.

PostgreSQL stores the graph. Each relationship defines traversal direction, cycle rules and whether it can extend a path. Breadth-first traversal returns one deterministic shortest explanatory path per finding. Each report retains its source version, graph, paths and graph epoch. Later graph changes mark it stale. Finding decisions and change transitions are recorded separately. The matrix shows business origins, designs, tests and quality issues. Its coverage denominator is approved functional requirements.

The modular monolith uses Python, FastAPI, Pydantic, SQLAlchemy, Alembic and PostgreSQL. The UI uses React, TypeScript, Vite, TanStack Query and React Flow. Nginx serves the SPA and proxies the API. Sources live in `backend/` and `frontend/`. Tests live in `tests/`, `scripts/` and `frontend/e2e/`.

[Requirements and permissions](docs/analysis/mvp.md) · [Model, diagrams and ADRs](docs/architecture/model.md) · [REST and OpenAPI](docs/api/usage.md) · [Checks and results](docs/testing/results.md) · [GitHub Actions](https://github.com/bivaettttt/traceon/actions)

## Traceability Workbench

Select a requirement from the project list. Open its dependencies, analyze a specific version, or create a linked change request. The registry restores filters and sorting when you return from a record. The CSV button exports the complete project registry. Impact findings explain both the stored relationship direction and the traversal direction. Baseline comparison presents before and after values by field.

[Interface design decisions](docs/architecture/workbench.md) · [Workbench screenshot](assets/screenshots/dashboard.png) · [Baseline diff](assets/screenshots/baseline.png)

## Demonstrate

Open FR-014 in ServiceHub. Create a request to require supervisor approval. Compare the direct path to the API and the transitive path to the data model and test. Assess the findings, request an independent decision, and approve the exact new revision. As manager, capture a new baseline and compare it with ServiceHub 1.0. [Interview walkthrough](docs/demo/interview.md) · [Live screenshots](assets/screenshots)

## Scope and status

The workspace contains synthetic data. Access requires project membership, including for account administrators. The project epoch conservatively expires reports after graph edits outside their paths. Comparisons use complete small-graph snapshots. Quality review checks structured fields and traceability. Production operation, SSO and external integrations are outside scope. Possible extensions include subset baselines, alternate paths, retention and group reviews. A public license has not been declared. [Status](docs/PROJECT_STATUS.md)
