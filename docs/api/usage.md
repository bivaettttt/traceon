# REST API

[OpenAPI snapshot](openapi.json). Live Swagger UI is on [localhost](http://127.0.0.1:8100/api/docs).

Use POST /api/login with username and password. Send the returned token as Authorization: Bearer. POST /api/logout revokes the current token. All project paths require explicit membership. HTTP 401 identifies an invalid session, 403 a role or author check, 404 a missing or inaccessible resource, 409 a state or revision conflict, and 422 invalid input. Errors use the detail field and the X-Request-ID header.

GET /api/projects/{project}/requirements accepts q, kind, status, priority, sort and offset. The registry and audit return at most 100 records per page. Use version IDs from the requirement detail when submitting, reviewing and comparing revisions. PATCH includes the observed revision and all content fields.

POST /api/projects/{project}/analyses requires version_id and optionally change_id. Fetch the saved report for snapshot, stale and decisions. Decisions use the finding node ID. GET /api/projects/{project}/export/{kind} returns JSON or CSV. Single-object exports require identifier. Baseline comparison optionally takes right to compare against another immutable snapshot.
