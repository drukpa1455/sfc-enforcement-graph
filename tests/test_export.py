from pathlib import Path

from qf_sfc.export import export_graph
from qf_sfc.models import SCHEMA_VERSION
from qf_sfc.store import Database
from test_models import extraction


def test_projects_current_extraction_into_graph(tmp_path: Path) -> None:
    raw = {
        "newsRefNo": "26PR104",
        "lang": "EN",
        "title": "SFC suspends Wong Tim Hi",
        "html": '<a href="doc?refNo=24PR97">related</a>',
        "issueDate": "2026-07-06",
        "modificationTime": "2026-07-06",
    }
    with Database(tmp_path / "test.sqlite3") as database:
        database.save_release(raw)
        database.save_extraction(raw, SCHEMA_VERSION, "test-model", extraction(), None, None)

        graph = export_graph(database, "test-model")

    ids = {node["id"] for node in graph["nodes"]}
    assert {
        "release:26PR104",
        "mention:26PR104:mention_1",
        "matter:26PR104:matter_1",
        "risk:26PR104:risk_1",
        "action:26PR104:action_1",
        "release:24PR97",
    } <= ids
    assert any(link["kind"] == "target_of" for link in graph["links"])
    assert any(link["kind"] == "references" for link in graph["links"])


def test_ignores_historical_schema(tmp_path: Path) -> None:
    raw = {
        "newsRefNo": "sample",
        "lang": "EN",
        "title": "Sample",
        "html": "<p>Body</p>",
        "issueDate": "2026-01-01",
        "modificationTime": "2026-01-01",
    }
    with Database(tmp_path / "test.sqlite3") as database:
        database.save_release(raw)
        database.save_extraction(raw, SCHEMA_VERSION - 1, "test-model", {"historical": True}, None, None)

        assert export_graph(database, "test-model") == {"nodes": [], "links": [], "releases": []}


def test_ignores_stale_extraction(tmp_path: Path) -> None:
    old = {
        "newsRefNo": "sample",
        "lang": "EN",
        "title": "Old title",
        "html": "<p>Body</p>",
        "issueDate": "2026-01-01",
        "modificationTime": "2026-01-01",
    }
    new = {**old, "title": "New title", "modificationTime": "2026-01-02"}
    with Database(tmp_path / "test.sqlite3") as database:
        database.save_release(old)
        database.save_extraction(old, SCHEMA_VERSION, "test-model", extraction(), None, None)
        database.save_release(new)

        assert export_graph(database, "test-model") == {"nodes": [], "links": [], "releases": []}
