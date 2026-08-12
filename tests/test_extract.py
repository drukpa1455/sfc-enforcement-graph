from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic_ai.usage import RunUsage

from qf_sfc.extract import (
    ExtractError,
    extract_releases,
    extract_text,
    repair_evidence_case,
    validate_evidence,
)
from qf_sfc.models import ReleaseExtraction
from qf_sfc.store import Database


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
    repaired = repair_evidence_case(extraction("example limited"), "Example Limited")

    assert repaired.mentions[0].evidence.quote == "Example Limited"


def test_extract_releases_writes_validated_record(tmp_path: Path) -> None:
    call = {}
    result = SimpleNamespace(
        output=extraction(),
        usage=RunUsage(input_tokens=10, output_tokens=20),
        run_id="run_1",
    )

    def run_sync(*args, **kwargs):
        call.update(kwargs)
        return result

    agent = SimpleNamespace(run_sync=run_sync)

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
    assert call["model"] == "openai-responses:test-model"
    assert call["model_settings"]["openai_reasoning_effort"] == "medium"
    assert call["model_settings"]["timeout"] == 180
    assert saved["source_ref"] == "sample"
    assert saved["usage_json"] == '{"input_tokens":10,"cache_write_tokens":0,"cache_read_tokens":0,"output_tokens":20,"input_audio_tokens":0,"cache_audio_read_tokens":0,"output_audio_tokens":0,"details":{},"requests":0,"tool_calls":0}'


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
