from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)
]
Text = Annotated[str, Field(max_length=20000)]
Code = Annotated[str, StringConstraints(pattern=r"^[A-Z][A-Z0-9-]{1,29}$")]
RequirementKind = Literal[
    "BUSINESS", "STAKEHOLDER", "FUNCTIONAL", "NONFUNCTIONAL", "TRANSITION"
]
ArtifactKind = Literal[
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
]
Role = Literal["ANALYST", "REVIEWER", "PROJECT_MANAGER"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Login(Input):
    username: Annotated[str, Field(min_length=1, max_length=40)]
    password: Annotated[str, Field(min_length=1, max_length=128)]


class Account(Login):
    name: Title
    password: Annotated[str, Field(min_length=12, max_length=128)]


class ProjectInput(Input):
    code: Code
    name: Title
    description: Text = ""


class ProjectEdit(Input):
    name: Title
    description: Text = ""
    archived: bool = False


class Member(Input):
    actor: UUID
    role: Role


class Content(Input):
    title: Title
    description: Text = ""
    rationale: Text = ""
    priority: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    source: Text = ""
    criteria: Text = ""
    rules: Text = ""
    reason: Text = ""


class RequirementInput(Content):
    code: Code
    kind: RequirementKind


class DraftEdit(Content):
    revision: Annotated[int, Field(ge=1)]


class NewVersion(Input):
    reason: Title
    change_id: UUID | None = None


class ReviewAssignment(Input):
    reviewer: UUID
    revision: Annotated[int, Field(ge=1)]


class ReviewInput(Input):
    decision: Literal["APPROVED", "CHANGES_REQUESTED"]
    comment: Title


class ArtifactInput(Input):
    code: Code
    kind: ArtifactKind
    title: Title
    description: Text = ""
    source: Text = ""
    release: Annotated[str, Field(max_length=100)] = ""


class LinkInput(Input):
    source_id: UUID
    target_id: UUID
    kind: Literal[
        "REFINES",
        "DERIVES_FROM",
        "DEPENDS_ON",
        "IMPLEMENTED_BY",
        "VERIFIED_BY",
        "CONSTRAINS",
        "RELATES_TO",
    ]
    source_version: UUID | None = None
    target_version: UUID | None = None


class ChangeInput(Input):
    node_id: UUID
    title: Title
    reason: Title
    proposal: Text
    risk: Literal["LOW", "MEDIUM", "HIGH"] = "MEDIUM"


class Transition(Input):
    status: Literal[
        "UNDER_ANALYSIS",
        "IMPACT_REVIEW",
        "APPROVED",
        "REJECTED",
        "IMPLEMENTED",
        "VERIFIED",
        "CLOSED",
    ]
    comment: Title


class AnalysisInput(Input):
    version_id: UUID
    change_id: UUID | None = None


class ImpactDecision(Input):
    decision: Literal["CONFIRMED", "DISMISSED"]
    comment: Title


class BaselineInput(Input):
    name: Title
