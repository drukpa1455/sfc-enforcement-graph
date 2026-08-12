from copy import deepcopy

import pytest
from pydantic import ValidationError

from sfc_enforcement_graph.models import ActionFamily, ActionType, ReleaseExtraction, RiskFamily, RiskType


def extraction() -> dict:
    return {
        "mentions": [
            {
                "id": "mention_1",
                "type": "person",
                "name": "Wong Tim Hi",
                "aliases": ["Timmy Wong"],
                "relevance": "primary",
                "involvement": ["subject"],
                "description": "Former licensed representative whose licence was suspended.",
                "attributes": [],
                "geographies": [],
                "evidence": {"quote": "Mr Wong Tim Hi"},
            },
            {
                "id": "mention_2",
                "type": "organization",
                "name": "Securities and Futures Commission",
                "aliases": ["SFC"],
                "relevance": "secondary",
                "involvement": ["authority"],
                "description": "Regulator that imposed the suspension.",
                "attributes": [],
                "geographies": [],
                "evidence": {"quote": "Securities and Futures Commission"},
            },
        ],
        "matters": [
            {
                "id": "matter_1",
                "kind": "disciplinary_proceeding",
                "authority_ids": ["mention_2"],
                "subject_ids": ["mention_1"],
                "case_numbers": [],
                "legal_provisions": [],
                "description": "SFC disciplinary proceeding against Wong.",
                "evidence": {"quote": "disciplinary action"},
            }
        ],
        "relationships": [],
        "risks": [
            {
                "id": "risk_1",
                "matter_id": "matter_1",
                "authority_ids": ["mention_2"],
                "subject_ids": ["mention_1"],
                "affected_ids": [],
                "type": "systems_controls_failure",
                "label": "Written authorization failure",
                "description": "Failed to obtain written authorization.",
                "status": "found",
                "period": {
                    "text": "between June 2016 and May 2017",
                    "start": None,
                    "end": None,
                    "evidence": {"quote": "between June 2016 and May 2017"},
                },
                "geographies": [],
                "negated": False,
                "attributes": [],
                "evidence": {"quote": "failed to obtain written authorisation"},
            }
        ],
        "actions": [
            {
                "id": "action_1",
                "matter_id": "matter_1",
                "actor_ids": ["mention_2"],
                "target_ids": ["mention_1"],
                "affected_ids": [],
                "type": "suspension",
                "label": "Nine-month licence suspension",
                "description": "Licence suspended for nine months.",
                "status": "imposed",
                "amount": None,
                "duration": "nine months",
                "period": {
                    "text": "3 July 2026 to 2 April 2027",
                    "start": "2026-07-03",
                    "end": "2027-04-02",
                    "evidence": {"quote": "3 July 2026 to 2 April 2027"},
                },
                "geographies": [],
                "attributes": [],
                "evidence": {"quote": "suspended the licence"},
            }
        ],
    }


def test_accepts_graph_extraction() -> None:
    result = ReleaseExtraction.model_validate(extraction())
    serialized = result.model_dump(mode="json")

    assert result.mentions[0].aliases == ["Timmy Wong"]
    assert result.risks[0].type.family == RiskFamily.SYSTEMS_CONTROLS
    assert result.actions[0].type.family == ActionFamily.SANCTION
    assert result.actions[0].period.start.isoformat() == "2026-07-03"
    assert "family" not in serialized["risks"][0]
    assert "family" not in serialized["actions"][0]


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("risks", 0, "type"), "authorization_failure"),
        (("actions", 0, "type"), "license_suspension"),
        (
            ("mentions", 0, "geographies"),
            [{"name": "Hong Kong", "role": "name_reference", "evidence": {"quote": "Mr Wong Tim Hi"}}],
        ),
    ],
)
def test_rejects_uncontrolled_taxonomy(path: tuple[str | int, ...], value: object) -> None:
    data = extraction()
    target = data
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = value

    with pytest.raises(ValidationError):
        ReleaseExtraction.model_validate(data)


@pytest.mark.parametrize(
    "status",
    [
        "commenced",
        "denied",
        "dismissed",
        "upheld",
        "varied",
        "adjourned",
        "withdrawn",
        "revoked",
        "lifted",
        "completed",
    ],
)
def test_preserves_action_lifecycle(status: str) -> None:
    data = extraction()
    data["actions"][0]["status"] = status

    assert ReleaseExtraction.model_validate(data).actions[0].status == status


@pytest.mark.parametrize(
    ("action_type", "family"),
    [
        (ActionType.ARREST, ActionFamily.INVESTIGATIVE),
        (ActionType.CHARGE, ActionFamily.PROCEEDING),
        (ActionType.ADJOURNMENT, ActionFamily.PROCEDURAL),
        (ActionType.CONVICTION, ActionFamily.DECISION),
        (ActionType.PLEA, ActionFamily.DECISION),
        (ActionType.RESTRICTION_NOTICE, ActionFamily.PROTECTIVE),
        (ActionType.COMPENSATION, ActionFamily.REMEDIAL),
        (ActionType.FINE, ActionFamily.SANCTION),
        (ActionType.LISTING_CANCELLATION, ActionFamily.ADMINISTRATIVE),
        (ActionType.OTHER, ActionFamily.OTHER),
    ],
)
def test_action_type_owns_family(action_type: ActionType, family: ActionFamily) -> None:
    assert action_type.family == family


@pytest.mark.parametrize(
    ("risk_type", "family"),
    [
        (RiskType.INSIDER_DEALING, RiskFamily.MARKET_MISCONDUCT),
        (RiskType.FRAUD, RiskFamily.FRAUD_DISHONESTY),
        (RiskType.MONEY_LAUNDERING, RiskFamily.FINANCIAL_CRIME),
        (RiskType.UNLICENSED_ACTIVITY, RiskFamily.LICENSING_FITNESS),
        (RiskType.CLIENT_SUITABILITY, RiskFamily.CLIENT_PROTECTION),
        (RiskType.SYSTEMS_CONTROLS_FAILURE, RiskFamily.SYSTEMS_CONTROLS),
        (RiskType.DIRECTOR_DUTY_BREACH, RiskFamily.GOVERNANCE_OVERSIGHT),
        (RiskType.REPORTING_FAILURE, RiskFamily.DISCLOSURE_REPORTING),
        (RiskType.CYBERSECURITY_FAILURE, RiskFamily.CYBERSECURITY),
        (RiskType.LEGAL_NONCOMPLIANCE, RiskFamily.LEGAL_PROCESS),
        (RiskType.OTHER, RiskFamily.OTHER),
    ],
)
def test_risk_type_owns_family(risk_type: RiskType, family: RiskFamily) -> None:
    assert risk_type.family == family


def test_rejects_unknown_mention_reference() -> None:
    data = extraction()
    data["actions"][0]["target_ids"] = ["mention_99"]

    with pytest.raises(ValidationError, match="unknown mention ids"):
        ReleaseExtraction.model_validate(data)


def test_rejects_unknown_matter_reference() -> None:
    data = extraction()
    data["risks"][0]["matter_id"] = "matter_99"

    with pytest.raises(ValidationError, match="unknown matter ids"):
        ReleaseExtraction.model_validate(data)


def test_rejects_duplicate_assertion_ids() -> None:
    data = extraction()
    data["actions"].append(deepcopy(data["actions"][0]))

    with pytest.raises(ValidationError, match="action ids must be unique"):
        ReleaseExtraction.model_validate(data)


def test_rejects_reversed_period() -> None:
    data = extraction()
    data["actions"][0]["period"]["start"] = "2027-01-01"
    data["actions"][0]["period"]["end"] = "2026-01-01"

    with pytest.raises(ValidationError, match="period start must not follow end"):
        ReleaseExtraction.model_validate(data)
