import os

from traceon.access import hasher
from traceon.contracts import LinkInput, RequirementInput
from traceon.requirements import create_requirement
from traceon.store import db, one, sql
from traceon.traceability import add_link, create_baseline

PEOPLE = (
    ("analyst", "Дарья Лебедева", "ANALYST"),
    ("reviewer", "Илья Морозов", "REVIEWER"),
    ("manager", "Анна Орлова", "PROJECT_MANAGER"),
    ("admin", "Администратор", None),
)
REQUIREMENTS = (
    (
        "BR-001",
        "BUSINESS",
        "Управляемый процесс обслуживания",
        "Заявка проходит единый процесс обработки с контролем сроков.",
    ),
    (
        "FR-014",
        "FUNCTIONAL",
        "Подтверждение сервисной заявки",
        "Система разрешает диспетчеру подтвердить заявку после проверки обязательных полей.",
    ),
    (
        "FR-021",
        "FUNCTIONAL",
        "Уведомление о смене статуса",
        "Отправить уведомление заявителю при подтверждении.",
    ),
    (
        "NFR-003",
        "NONFUNCTIONAL",
        "Аудит изменения статуса",
        "Время, субъект и новое состояние фиксируются в журнале.",
    ),
)
ARTIFACTS = (
    (
        "RULE-04",
        "RULE",
        "Политика подтверждения",
        "Для обычных заявок достаточно решения диспетчера.",
    ),
    (
        "API-07",
        "ENDPOINT",
        "POST /requests/{id}/confirm",
        "Подтвердить заявку и вернуть обновлённый статус.",
    ),
    (
        "DB-02",
        "ENTITY",
        "ServiceRequest",
        "Текущее состояние заявки и идентификатор диспетчера.",
    ),
    (
        "CMP-03",
        "COMPONENT",
        "Оркестратор заявок",
        "Проверяет допустимость перехода и отправляет уведомление.",
    ),
    ("UI-02", "UI", "Карточка заявки", "Действия диспетчера и статус обработки."),
    (
        "TC-08",
        "TEST_CASE",
        "Подтверждение диспетчером",
        "Положительный сценарий и отказ при неполных полях.",
    ),
    (
        "TC-11",
        "TEST_CASE",
        "Проверка истории",
        "Журнал сохраняет факт перехода и автора.",
    ),
)
LINKS = [
    ("BR-001", "FR-014", "REFINES"),
    ("FR-021", "FR-014", "DEPENDS_ON"),
    ("FR-014", "API-07", "IMPLEMENTED_BY"),
    ("FR-014", "UI-02", "IMPLEMENTED_BY"),
    ("FR-014", "RULE-04", "RELATES_TO"),
    ("API-07", "CMP-03", "IMPLEMENTED_BY"),
    ("CMP-03", "DB-02", "IMPLEMENTED_BY"),
    ("FR-014", "TC-08", "VERIFIED_BY"),
    ("DB-02", "TC-11", "VERIFIED_BY"),
    ("NFR-003", "DB-02", "IMPLEMENTED_BY"),
]


def seed():
    password = os.environ["DEMO_PASSWORD"]
    if len(password) < 12:
        raise SystemExit("DEMO_PASSWORD requires at least 12 characters")
    with db.begin() as conn:
        if one(conn, "SELECT id FROM projects WHERE code='SERVICEHUB'"):
            return
        identities = {}
        for username, name, role in PEOPLE:
            user = one(
                conn,
                """INSERT INTO users(username,name,password,admin) VALUES (:u,:n,:h,:a)
                           ON CONFLICT(username) DO UPDATE SET username=EXCLUDED.username RETURNING id""",
                u=username,
                n=name,
                h=hasher.hash(password),
                a=role is None,
            )
            identities[username] = user["id"]
        project = one(
            conn,
            """INSERT INTO projects(code,name,description,owner)
                              VALUES ('SERVICEHUB','ServiceHub','Обработка корпоративных сервисных заявок',:u) RETURNING id""",
            u=identities["manager"],
        )["id"]
        for username, _, role in PEOPLE:
            if role:
                sql(
                    conn,
                    "INSERT INTO members VALUES (:p,:u,:r)",
                    p=project,
                    u=identities[username],
                    r=role,
                )
        analyst, reviewer = identities["analyst"], identities["reviewer"]
        nodes = {}
        versions = {}
        for code, kind, title, description in REQUIREMENTS:
            item = create_requirement(
                conn,
                project,
                analyst,
                RequirementInput(
                    code=code,
                    kind=kind,
                    title=title,
                    description=description,
                    source="Учебный регламент ServiceHub",
                    criteria="Пройти согласованный сценарий приёмки.",
                    priority="HIGH",
                ),
            )
            nodes[code] = item["node"]["id"]
            versions[code] = item["version"]["id"]
            sql(
                conn,
                "UPDATE versions SET status='IN_REVIEW',reviewer=:r WHERE id=:id",
                r=reviewer,
                id=versions[code],
            )
            from traceon.contracts import ReviewInput
            from traceon.requirements import review

            review(
                conn,
                project,
                reviewer,
                versions[code],
                ReviewInput(decision="APPROVED", comment="Учебная исходная редакция."),
            )
        for code, kind, title, description in ARTIFACTS:
            nodes[code] = one(
                conn,
                """INSERT INTO nodes(project_id,code,kind,title,description,source,release)
                       VALUES (:p,:code,:kind,:title,:d,'ServiceHub','1.0') RETURNING id""",
                p=project,
                code=code,
                kind=kind,
                title=title,
                d=description,
            )["id"]
        for source, target, kind in LINKS:
            add_link(
                conn,
                project,
                analyst,
                LinkInput(
                    source_id=nodes[source],
                    target_id=nodes[target],
                    kind=kind,
                    source_version=versions[source]
                    if kind == "VERIFIED_BY" and source in versions
                    else None,
                ),
            )
        create_baseline(conn, project, identities["manager"], "ServiceHub 1.0")


if __name__ == "__main__":
    seed()
