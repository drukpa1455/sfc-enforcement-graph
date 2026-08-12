import asyncio
import json
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from pydantic_ai import Agent
from pydantic_ai.exceptions import UnexpectedModelBehavior
from pydantic_ai.models.test import TestModel
from pydantic_ai.usage import RunUsage

from sfc_enforcement_graph.extract import (
    ExtractError,
    bounded_model,
    extract_release,
    extract_releases,
    extract_text,
    repair_evidence,
    single_attempt_provider,
    validate_evidence,
)
from sfc_enforcement_graph.models import EXTRACTION_VERSION, ReleaseExtraction
from sfc_enforcement_graph.store import Database


def extraction(quote: str = "Example Limited") -> ReleaseExtraction:
    return ReleaseExtraction.model_validate(
        {
            "mentions": [
                {
                    "id": "mention_1",
                    "type": "organization",
                    "name": "Example Limited",
                    "aliases": [],
                    "relevance": "primary",
                    "involvement": ["subject"],
                    "description": "Company named in the release.",
                    "geographies": [],
                    "attributes": [],
                    "evidence": {"quote": quote},
                }
            ],
            "matters": [],
            "relationships": [],
            "risks": [],
            "actions": [],
        }
    )


def test_extract_text_normalizes_html() -> None:
    assert extract_text("<p>Example&nbsp;Limited</p><p>Second line</p>") == "Example Limited Second line"


def test_rejects_non_source_evidence() -> None:
    with pytest.raises(ExtractError, match="not present"):
        validate_evidence(extraction("paraphrased evidence"), "Example Limited")


def test_accepts_title_evidence() -> None:
    validate_evidence(extraction("Sample title"), "Sample title\nExample Limited")


def test_repairs_unique_evidence_casing() -> None:
    repaired = repair_evidence(extraction("example limited"), "Example Limited")

    assert repaired.mentions[0].evidence.quote == "Example Limited"


def test_drops_only_an_unverifiable_optional_period() -> None:
    data = extraction().model_dump(mode="json")
    data["risks"] = [
        {
            "id": "risk_1",
            "matter_id": None,
            "authority_ids": [],
            "subject_ids": ["mention_1"],
            "affected_ids": [],
            "type": "legal_noncompliance",
            "label": "Example conduct",
            "description": "Example conduct described in the release.",
            "status": "reported",
            "period": {
                "text": "November 2009 to August 2025",
                "evidence": {"quote": "November 2009 to August 2025"},
            },
            "geographies": [],
            "negated": False,
            "attributes": [],
            "evidence": {"quote": "Example Limited"},
        }
    ]

    repaired = repair_evidence(ReleaseExtraction.model_validate(data), "Example Limited")

    assert repaired.risks[0].period is None
    assert repaired.risks[0].evidence.quote == "Example Limited"


def test_extract_releases_writes_validated_record(tmp_path: Path, monkeypatch) -> None:
    call = {}
    result = SimpleNamespace(
        output=extraction(),
        usage=RunUsage(input_tokens=10, output_tokens=20, cost=Decimal("0.25")),
        run_id="run_1",
    )

    def run_sync(*args, **kwargs):
        call.update(kwargs)
        return result

    agent = SimpleNamespace(run_sync=run_sync)
    monkeypatch.setattr(
        "sfc_enforcement_graph.extract.bounded_model", lambda model: f"bounded:{model}"
    )

    with Database(tmp_path / "test.sqlite3") as database:
        database.save_release(
            {
                "newsRefNo": "sample",
                "lang": "EN",
                "title": "Sample",
                "html": "<p>Example Limited</p>",
                "issueDate": "2026-01-01",
                "modificationTime": "2026-01-02",
            }
        )
        extracted, skipped = extract_releases(
            agent, database, "EN", "test-model", 1, set(), False, 1_000
        )
        saved = database.connection.execute("SELECT * FROM extractions").fetchone()

    assert (extracted, skipped) == (1, 0)
    assert call["model"] == "bounded:test-model"
    assert call["model_settings"]["openai_reasoning_effort"] == "medium"
    assert call["model_settings"]["timeout"] == 180
    assert call["usage_limits"].request_limit == 1
    assert call["usage"].requests == 0
    assert call["retries"] == 0
    assert saved["source_ref"] == "sample"
    usage = json.loads(saved["usage_json"])
    assert (usage["input_tokens"], usage["output_tokens"]) == (10, 20)
    assert usage["cost"] == "0.25"


def test_bounded_model_disables_transport_retries(monkeypatch) -> None:
    client = SimpleNamespace(max_retries=2)
    provider = SimpleNamespace(client=client)
    call = {}

    monkeypatch.setattr(
        "sfc_enforcement_graph.extract.infer_provider_class", lambda name: lambda: provider
    )

    def infer_model(ref, provider_factory):
        call["ref"] = ref
        call["provider"] = provider_factory("azure-responses")
        return "model"

    monkeypatch.setattr("sfc_enforcement_graph.extract.infer_model", infer_model)

    assert bounded_model("test-model") == "model"
    assert call == {"ref": "azure-responses:test-model", "provider": provider}
    assert client.max_retries == 0


def test_provider_fails_closed_when_retry_policy_is_unknown(monkeypatch) -> None:
    provider = SimpleNamespace(client=SimpleNamespace())
    monkeypatch.setattr(
        "sfc_enforcement_graph.extract.infer_provider_class", lambda name: lambda: provider
    )

    with pytest.raises(ExtractError, match="retry policy is unknown"):
        single_attempt_provider("azure-responses")


def test_invalid_output_exposes_validation_error_without_retry(monkeypatch) -> None:
    raw = {
        "newsRefNo": "sample",
        "lang": "EN",
        "title": "Sample",
        "html": "<p>Example Limited</p>",
        "issueDate": "2026-01-01",
        "modificationTime": "2026-01-02",
    }
    usage = RunUsage()
    model = TestModel(custom_output_args={"wrong": "value"})
    monkeypatch.setattr("sfc_enforcement_graph.extract.bounded_model", lambda name: model)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        with pytest.raises(UnexpectedModelBehavior) as caught:
            extract_release(Agent(output_type=ReleaseExtraction), raw, "test-model", 1_000, usage)
    finally:
        loop.close()
        asyncio.set_event_loop(None)

    assert usage.requests == 1
    assert isinstance(caught.value.__cause__, ValidationError)


def test_release_iteration_does_not_hold_a_read_lock(tmp_path: Path) -> None:
    path = tmp_path / "test.sqlite3"
    first = {
        "newsRefNo": "first",
        "lang": "EN",
        "title": "First",
        "html": "<p>First</p>",
        "issueDate": "2026-01-02",
        "modificationTime": "2026-01-02",
    }
    second = {**first, "newsRefNo": "second", "title": "Second", "issueDate": "2026-01-01"}
    third = {**first, "newsRefNo": "third", "title": "Third", "issueDate": "2026-01-03"}

    with Database(path) as reader, Database(path) as writer:
        reader.save_release(first)
        reader.save_release(second)
        releases = reader.releases("EN", set())
        next(releases)
        writer.connection.execute("PRAGMA busy_timeout = 1")

        writer.save_release(third)


def test_parallel_extraction_has_one_database_writer(tmp_path: Path, monkeypatch) -> None:
    path = tmp_path / "test.sqlite3"
    result = SimpleNamespace(
        output=extraction(),
        usage=RunUsage(),
        run_id="run_1",
    )
    agent = SimpleNamespace(run_sync=lambda *args, **kwargs: result)
    monkeypatch.setattr("sfc_enforcement_graph.extract.bounded_model", lambda model: model)

    with Database(path) as database:
        for ref in ("first", "second"):
            database.save_release(
                {
                    "newsRefNo": ref,
                    "lang": "EN",
                    "title": "Sample",
                    "html": "<p>Example Limited</p>",
                    "issueDate": "2026-01-01",
                    "modificationTime": "2026-01-01",
                }
            )
        extracted, skipped = extract_releases(
            agent, database, "EN", "test-model", None, set(), False, 1_000, workers=2
        )

        assert (extracted, skipped) == (2, 0)
        assert database.connection.execute("SELECT count(*) FROM extractions").fetchone()[0] == 2


def test_parallel_extraction_saves_successes_before_reporting_failures(
    tmp_path: Path, monkeypatch
) -> None:
    path = tmp_path / "test.sqlite3"

    def run_sync(prompt: str, **kwargs):
        if '"reference": "bad"' in prompt:
            kwargs["usage"].incr(RunUsage(requests=1, input_tokens=10, output_tokens=20))
            raise RuntimeError("invalid output") from ValueError("missing field")
        return SimpleNamespace(output=extraction(), usage=RunUsage(), run_id="run_1")

    monkeypatch.setattr("sfc_enforcement_graph.extract.bounded_model", lambda model: model)

    with Database(path) as database:
        for ref in ("good", "bad"):
            database.save_release(
                {
                    "newsRefNo": ref,
                    "lang": "EN",
                    "title": "Sample",
                    "html": "<p>Example Limited</p>",
                    "issueDate": "2026-01-01",
                    "modificationTime": "2026-01-01",
                }
            )

        with pytest.raises(ExtractError, match="1 extraction.*bad.*invalid output"):
            extract_releases(
                SimpleNamespace(run_sync=run_sync),
                database,
                "EN",
                "test-model",
                None,
                set(),
                False,
                1_000,
                workers=2,
            )

        assert database.connection.execute("SELECT source_ref FROM extractions").fetchone()[0] == "good"
        failed = database.connection.execute("SELECT * FROM extraction_failures").fetchone()
        assert failed["source_ref"] == "bad"
        assert failed["error_type"] == "RuntimeError"
        assert failed["error_message"] == (
            "RuntimeError: invalid output\nCaused by: ValueError: missing field"
        )
        assert json.loads(failed["usage_json"])["requests"] == 1

        database.save_extraction(
            next(database.releases("EN", {"bad"})),
            EXTRACTION_VERSION,
            "test-model",
            extraction().model_dump(mode="json"),
            "run_2",
            None,
        )
        assert database.connection.execute("SELECT count(*) FROM extraction_failures").fetchone()[0] == 0
