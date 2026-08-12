from copy import deepcopy

import pytest
from pydantic import ValidationError

from qf_sfc.models import ReleaseExtraction


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
                "affected_entity_ids": [],
                "family": "controls",
                "category": "authorization_failure",
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
                "affected_entity_ids": [],
                "type": "license_suspension",
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

    assert result.mentions[0].aliases == ["Timmy Wong"]
    assert result.risks[0].family == "controls"
    assert result.actions[0].period.start.isoformat() == "2026-07-03"


@pytest.mark.parametrize("status", ["commenced", "adjourned", "withdrawn", "revoked", "completed"])
def test_preserves_action_lifecycle(status: str) -> None:
    data = extraction()
    data["actions"][0]["status"] = status

    assert ReleaseExtraction.model_validate(data).actions[0].status == status


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
