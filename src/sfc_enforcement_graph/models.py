from __future__ import annotations

from datetime import date
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

MentionId = Annotated[str, StringConstraints(pattern=r"^mention_[1-9][0-9]*$")]
MatterId = Annotated[str, StringConstraints(pattern=r"^matter_[1-9][0-9]*$")]
RelationshipId = Annotated[str, StringConstraints(pattern=r"^relationship_[1-9][0-9]*$")]
RiskId = Annotated[str, StringConstraints(pattern=r"^risk_[1-9][0-9]*$")]
ActionId = Annotated[str, StringConstraints(pattern=r"^action_[1-9][0-9]*$")]
Term = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]*$")]
Currency = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]
# Bump whenever the extraction schema or instructions change.
EXTRACTION_VERSION = 10


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ClaimStatus(StrEnum):
    REPORTED = "reported"
    SUSPECTED = "suspected"
    ALLEGED = "alleged"
    CONSIDERED = "considered"
    ADMITTED = "admitted"
    FOUND = "found"
    CONVICTED = "convicted"
    ACQUITTED = "acquitted"
    DISMISSED = "dismissed"
    ORDERED = "ordered"


class ActionStatus(StrEnum):
    REPORTED = "reported"
    SOUGHT = "sought"
    COMMENCED = "commenced"
    ISSUED = "issued"
    GRANTED = "granted"
    DENIED = "denied"
    DISMISSED = "dismissed"
    IMPOSED = "imposed"
    ORDERED = "ordered"
    AGREED = "agreed"
    UPHELD = "upheld"
    VARIED = "varied"
    PENDING = "pending"
    ADJOURNED = "adjourned"
    WITHDRAWN = "withdrawn"
    REVOKED = "revoked"
    LIFTED = "lifted"
    COMPLETED = "completed"


class RiskFamily(StrEnum):
    MARKET_MISCONDUCT = "market_misconduct"
    FRAUD_DISHONESTY = "fraud_dishonesty"
    FINANCIAL_CRIME = "financial_crime"
    LICENSING_FITNESS = "licensing_fitness"
    CLIENT_PROTECTION = "client_protection"
    SYSTEMS_CONTROLS = "systems_controls"
    GOVERNANCE_OVERSIGHT = "governance_oversight"
    DISCLOSURE_REPORTING = "disclosure_reporting"
    CYBERSECURITY = "cybersecurity"
    LEGAL_PROCESS = "legal_process"
    OTHER = "other"


class ActionFamily(StrEnum):
    INVESTIGATIVE = "investigative"
    PROCEEDING = "proceeding"
    PROCEDURAL = "procedural"
    DECISION = "decision"
    PROTECTIVE = "protective"
    REMEDIAL = "remedial"
    SANCTION = "sanction"
    ADMINISTRATIVE = "administrative"
    OTHER = "other"


class _ClassifiedType(StrEnum):
    """Canonical extraction type whose graph family is a deterministic projection."""

    family: RiskFamily | ActionFamily

    def __new__(cls, value: str, family: RiskFamily | ActionFamily) -> Self:
        member = str.__new__(cls, value)
        member._value_ = value
        member.family = family
        return member


class RiskType(_ClassifiedType):
    INSIDER_DEALING = "insider_dealing", RiskFamily.MARKET_MISCONDUCT
    MARKET_MANIPULATION = "market_manipulation", RiskFamily.MARKET_MISCONDUCT
    FALSE_TRADING = "false_trading", RiskFamily.MARKET_MISCONDUCT
    IMPROPER_TRADING = "improper_trading", RiskFamily.MARKET_MISCONDUCT
    DISCLOSURE_MISCONDUCT = "disclosure_misconduct", RiskFamily.DISCLOSURE_REPORTING
    FRAUD = "fraud", RiskFamily.FRAUD_DISHONESTY
    DECEPTION = "deception", RiskFamily.FRAUD_DISHONESTY
    MISAPPROPRIATION = "misappropriation", RiskFamily.FRAUD_DISHONESTY
    BRIBERY_CORRUPTION = "bribery_corruption", RiskFamily.FINANCIAL_CRIME
    MONEY_LAUNDERING = "money_laundering", RiskFamily.FINANCIAL_CRIME
    AML_FAILURE = "aml_failure", RiskFamily.FINANCIAL_CRIME
    UNLICENSED_ACTIVITY = "unlicensed_activity", RiskFamily.LICENSING_FITNESS
    FITNESS_PROPRIETY = "fitness_propriety", RiskFamily.LICENSING_FITNESS
    PROFESSIONAL_MISCONDUCT = "professional_misconduct", RiskFamily.LICENSING_FITNESS
    CLIENT_SUITABILITY = "client_suitability", RiskFamily.CLIENT_PROTECTION
    CLIENT_ASSET_FAILURE = "client_asset_failure", RiskFamily.CLIENT_PROTECTION
    CLIENT_INVESTOR_HARM = "client_investor_harm", RiskFamily.CLIENT_PROTECTION
    CONFLICT_OF_INTEREST = "conflict_of_interest", RiskFamily.GOVERNANCE_OVERSIGHT
    SYSTEMS_CONTROLS_FAILURE = "systems_controls_failure", RiskFamily.SYSTEMS_CONTROLS
    RISK_MANAGEMENT_FAILURE = "risk_management_failure", RiskFamily.SYSTEMS_CONTROLS
    SUPERVISION_FAILURE = "supervision_failure", RiskFamily.GOVERNANCE_OVERSIGHT
    DIRECTOR_DUTY_BREACH = "director_duty_breach", RiskFamily.GOVERNANCE_OVERSIGHT
    REPORTING_FAILURE = "reporting_failure", RiskFamily.DISCLOSURE_REPORTING
    FALSE_MISLEADING_INFORMATION = "false_misleading_information", RiskFamily.DISCLOSURE_REPORTING
    REGULATOR_NONCOOPERATION = "regulator_noncooperation", RiskFamily.LEGAL_PROCESS
    CYBERSECURITY_FAILURE = "cybersecurity_failure", RiskFamily.CYBERSECURITY
    LEGAL_NONCOMPLIANCE = "legal_noncompliance", RiskFamily.LEGAL_PROCESS
    OTHER = "other", RiskFamily.OTHER


class ActionType(_ClassifiedType):
    INVESTIGATION = "investigation", ActionFamily.INVESTIGATIVE
    INFORMATION_NOTICE = "information_notice", ActionFamily.INVESTIGATIVE
    INSPECTION_SEARCH = "inspection_search", ActionFamily.INVESTIGATIVE
    ARREST = "arrest", ActionFamily.INVESTIGATIVE
    ARREST_WARRANT = "arrest_warrant", ActionFamily.INVESTIGATIVE
    CHARGE = "charge", ActionFamily.PROCEEDING
    PROSECUTION = "prosecution", ActionFamily.PROCEEDING
    PROCEEDING_COMMENCED = "proceeding_commenced", ActionFamily.PROCEEDING
    HEARING = "hearing", ActionFamily.PROCEDURAL
    TRIAL = "trial", ActionFamily.PROCEDURAL
    ADJOURNMENT = "adjournment", ActionFamily.PROCEDURAL
    BAIL = "bail", ActionFamily.PROCEDURAL
    REMAND = "remand", ActionFamily.PROCEDURAL
    APPEAL_REVIEW = "appeal_review", ActionFamily.PROCEDURAL
    PROCEDURAL_ORDER = "procedural_order", ActionFamily.PROCEDURAL
    FINDING = "finding", ActionFamily.DECISION
    CONVICTION = "conviction", ActionFamily.DECISION
    PLEA = "plea", ActionFamily.DECISION
    SETTLEMENT = "settlement", ActionFamily.DECISION
    FINE = "fine", ActionFamily.SANCTION
    REPRIMAND = "reprimand", ActionFamily.SANCTION
    SUSPENSION = "suspension", ActionFamily.SANCTION
    REVOCATION = "revocation", ActionFamily.SANCTION
    PROHIBITION = "prohibition", ActionFamily.SANCTION
    DISQUALIFICATION = "disqualification", ActionFamily.SANCTION
    IMPRISONMENT = "imprisonment", ActionFamily.SANCTION
    COMMUNITY_SERVICE = "community_service", ActionFamily.SANCTION
    COSTS = "costs", ActionFamily.ADMINISTRATIVE
    COMPENSATION = "compensation", ActionFamily.REMEDIAL
    DISGORGEMENT_RESTORATION = "disgorgement_restoration", ActionFamily.REMEDIAL
    INJUNCTION_ASSET_FREEZE = "injunction_asset_freeze", ActionFamily.PROTECTIVE
    RESTRICTION_NOTICE = "restriction_notice", ActionFamily.PROTECTIVE
    TRADING_SUSPENSION = "trading_suspension", ActionFamily.PROTECTIVE
    LISTING_CANCELLATION = "listing_cancellation", ActionFamily.ADMINISTRATIVE
    REMEDIATION_GOVERNANCE = "remediation_governance", ActionFamily.ADMINISTRATIVE
    WINDING_UP_DISSOLUTION = "winding_up_dissolution", ActionFamily.ADMINISTRATIVE
    OTHER = "other", ActionFamily.OTHER


class GeographyRole(StrEnum):
    INCORPORATED_IN = "incorporated_in"
    RESIDENT_IN = "resident_in"
    OPERATES_IN = "operates_in"
    LISTED_IN = "listed_in"
    REGULATED_IN = "regulated_in"
    PROCEEDING_IN = "proceeding_in"
    CONDUCT_IN = "conduct_in"
    ASSETS_IN = "assets_in"
    RESTRICTED_IN = "restricted_in"
    OTHER = "other"


class Evidence(Model):
    quote: str = Field(
        min_length=1,
        description="Exact contiguous quote from the title or release body. Never paraphrase.",
    )


class SourcedText(Model):
    value: str = Field(min_length=1, description="Text exactly as stated in the release.")
    evidence: Evidence


class Attribute(Model):
    name: Term = Field(
        description=(
            "Source-specific snake_case key for a useful fact not represented by a dedicated field, such as age, "
            "industry, job_title, stock_code, listing_board, ownership_percent, license_status, transaction_count, "
            "profit, loss, bail_condition, or legal_basis."
        )
    )
    value: str = Field(min_length=1, description="Source-stated value with important qualifiers preserved.")
    evidence: Evidence


class Geography(Model):
    name: str = Field(min_length=1, description="Geographic name exactly as written.")
    role: GeographyRole = Field(
        description=(
            "Actual relationship to the containing item. Do not extract a geography merely because a place appears "
            "inside an entity name."
        )
    )
    evidence: Evidence


class Money(Model):
    text: str = Field(
        min_length=1,
        description="Complete source text for the amount, including symbol and qualifier, such as 'up to $125 million'.",
    )
    currency: Currency | None = Field(
        default=None,
        description="Explicit three-letter currency code; use null when a bare '$' is not disambiguated.",
    )
    amount: Decimal | None = Field(
        default=None,
        ge=0,
        description="Normalized numeric amount when unambiguous; otherwise null.",
    )
    qualifier: Literal["exact", "approximately", "up_to", "over", "at_least"] | None = Field(
        default=None,
        description="Explicit source qualifier; use exact only when the release gives an unqualified amount.",
    )
    evidence: Evidence


class Period(Model):
    text: str = Field(min_length=1, description="Date, date range, or period exactly as stated.")
    start: date | None = Field(
        default=None,
        description="ISO start date only when the release states a complete calendar date.",
    )
    end: date | None = Field(
        default=None,
        description="ISO end date only when the release states a complete calendar date.",
    )
    evidence: Evidence

    @model_validator(mode="after")
    def dates_are_ordered(self) -> Self:
        if self.start and self.end and self.start > self.end:
            raise ValueError("period start must not follow end")
        return self


class EntityMention(Model):
    id: MentionId = Field(description="Release-local identifier assigned sequentially: mention_1, mention_2, ...")
    type: Literal["person", "person_group", "organization", "fund", "financial_instrument", "unknown"]
    name: str = Field(
        min_length=1,
        description=(
            "Name exactly as written. For an unnamed party, retain the source's descriptive label. Each named "
            "person or organization gets a separate mention. An issuer is an organization; its shares, bonds, "
            "accounts, or other securities are financial instruments."
        ),
    )
    aliases: list[str] = Field(
        default_factory=list,
        description="Alternative names or abbreviations explicitly introduced in this release.",
    )
    relevance: Literal["primary", "secondary"] = Field(
        description=(
            "Release-relative prominence. Primary is limited to direct subjects of the new central event and a "
            "named company central to it; historical and contextual parties are secondary."
        )
    )
    involvement: list[Literal["subject", "affected", "authority", "intermediary", "related"]] = Field(
        min_length=1,
        description=(
            "Small controlled classification of how this mention participates in the release. Put precise titles, "
            "functions, and affiliations in attributes or relationships."
        ),
    )
    description: str = Field(
        min_length=1,
        description="One source-grounded sentence explaining who or what this mention is in this release.",
    )
    geographies: list[Geography] = Field(default_factory=list)
    attributes: list[Attribute] = Field(default_factory=list)
    evidence: Evidence


class MatterMention(Model):
    id: MatterId = Field(description="Release-local identifier assigned sequentially: matter_1, matter_2, ...")
    kind: Literal[
        "investigation",
        "disciplinary_proceeding",
        "civil_proceeding",
        "criminal_proceeding",
        "tribunal_proceeding",
        "appeal_or_review",
    ]
    authority_ids: list[MentionId] = Field(default_factory=list)
    subject_ids: list[MentionId] = Field(default_factory=list)
    case_numbers: list[SourcedText] = Field(default_factory=list)
    legal_provisions: list[SourcedText] = Field(default_factory=list)
    description: str = Field(min_length=1, description="Source-grounded description of the case or proceeding.")
    evidence: Evidence


class Relationship(Model):
    id: RelationshipId = Field(
        description="Release-local identifier assigned sequentially: relationship_1, relationship_2, ..."
    )
    subject_id: MentionId
    object_id: MentionId
    kind: Literal["affiliation", "ownership", "control", "family", "service", "instrument", "membership", "other"]
    predicate: Term = Field(
        description=(
            "Concise source-specific predicate, such as director_of, wife_of, accredited_to, or issuer_of. "
            "The controlled kind, not this predicate, is the stable query dimension."
        )
    )
    period: Period | None = None
    status: ClaimStatus = ClaimStatus.REPORTED
    negated: bool = False
    attributes: list[Attribute] = Field(default_factory=list)
    evidence: Evidence


class Risk(Model):
    id: RiskId = Field(description="Release-local identifier assigned sequentially: risk_1, risk_2, ...")
    matter_id: MatterId | None = Field(default=None, description="Matter this conduct belongs to, when identified.")
    authority_ids: list[MentionId] = Field(default_factory=list)
    subject_ids: list[MentionId] = Field(min_length=1)
    affected_ids: list[MentionId] = Field(default_factory=list)
    type: RiskType = Field(description="Controlled risk type. Its stable graph family is derived deterministically.")
    label: str = Field(
        min_length=1,
        max_length=120,
        description="Concise source-grounded label preserving detail beyond the controlled type.",
    )
    description: str = Field(min_length=1)
    status: ClaimStatus
    period: Period | None = None
    geographies: list[Geography] = Field(default_factory=list)
    negated: bool = False
    attributes: list[Attribute] = Field(default_factory=list)
    evidence: Evidence


class Action(Model):
    id: ActionId = Field(description="Release-local identifier assigned sequentially: action_1, action_2, ...")
    matter_id: MatterId | None = Field(default=None, description="Matter this action belongs to, when identified.")
    actor_ids: list[MentionId] = Field(default_factory=list)
    target_ids: list[MentionId] = Field(min_length=1)
    affected_ids: list[MentionId] = Field(default_factory=list)
    type: ActionType = Field(
        description="Controlled enforcement, judicial, or administrative action type. Its family is derived."
    )
    label: str = Field(
        min_length=1,
        max_length=120,
        description="Concise source-grounded label preserving detail beyond the controlled type.",
    )
    description: str = Field(min_length=1)
    status: ActionStatus
    amount: Money | None = None
    duration: str | None = Field(default=None, description="Duration exactly as stated, such as 'nine months'.")
    period: Period | None = None
    geographies: list[Geography] = Field(default_factory=list)
    attributes: list[Attribute] = Field(default_factory=list)
    evidence: Evidence


class ReleaseExtraction(Model):
    mentions: list[EntityMention] = Field(
        description="Source-relative entity mentions. Canonical entity resolution happens after extraction."
    )
    matters: list[MatterMention] = Field(
        default_factory=list,
        description=(
            "Source-relative investigations, proceedings, appeals, or reviews that group risks and actions. "
            "Canonical matter resolution happens after extraction."
        ),
    )
    relationships: list[Relationship] = Field(default_factory=list)
    risks: list[Risk] = Field(default_factory=list)
    actions: list[Action] = Field(default_factory=list)

    @model_validator(mode="after")
    def references_are_valid(self) -> Self:
        self._unique_ids("mention", [item.id for item in self.mentions])
        self._unique_ids("matter", [item.id for item in self.matters])
        self._unique_ids("relationship", [item.id for item in self.relationships])
        self._unique_ids("risk", [item.id for item in self.risks])
        self._unique_ids("action", [item.id for item in self.actions])
        if not any(mention.relevance == "primary" for mention in self.mentions):
            raise ValueError("at least one primary mention is required")

        mentions = {mention.id for mention in self.mentions}
        referenced_mentions = {
            mention_id
            for relationship in self.relationships
            for mention_id in (relationship.subject_id, relationship.object_id)
        }
        for matter in self.matters:
            referenced_mentions.update(matter.authority_ids)
            referenced_mentions.update(matter.subject_ids)
        for risk in self.risks:
            referenced_mentions.update(risk.authority_ids)
            referenced_mentions.update(risk.subject_ids)
            referenced_mentions.update(risk.affected_ids)
        for action in self.actions:
            referenced_mentions.update(action.actor_ids)
            referenced_mentions.update(action.target_ids)
            referenced_mentions.update(action.affected_ids)
        if missing := referenced_mentions - mentions:
            raise ValueError(f"unknown mention ids: {sorted(missing)}")

        matters = {matter.id for matter in self.matters}
        referenced_matters = {
            matter_id
            for matter_id in [*(risk.matter_id for risk in self.risks), *(action.matter_id for action in self.actions)]
            if matter_id is not None
        }
        if missing := referenced_matters - matters:
            raise ValueError(f"unknown matter ids: {sorted(missing)}")
        return self

    @staticmethod
    def _unique_ids(kind: str, ids: list[str]) -> None:
        if len(ids) != len(set(ids)):
            raise ValueError(f"{kind} ids must be unique")
