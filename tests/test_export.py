from pathlib import Path

from sfc_enforcement_graph.export import export_graph
from sfc_enforcement_graph.models import EXTRACTION_VERSION
from sfc_enforcement_graph.store import Database
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
        database.save_release({**raw, "lang": "ZH", "html": '<a href="doc?refNo=24PR98">related</a>'})
        data = extraction()
        data["mentions"][0]["attributes"] = [{
            "name": "age", "value": "42", "evidence": {"quote": "Mr Wong Tim Hi"},
        }]
        data["relationships"] = [{
            "id": "relationship_1", "subject_id": "mention_1", "object_id": "mention_2",
            "kind": "affiliation", "predicate": "regulated_by", "period": None,
            "status": "reported", "negated": False, "attributes": [],
            "evidence": {"quote": "SFC suspends Wong Tim Hi"},
        }]
        database.save_extraction(raw, EXTRACTION_VERSION, "test-model", data, None, None)

        graph = export_graph(database, "test-model")

    ids = {node["id"] for node in graph["nodes"]}
    assert {
        "release:26PR104",
        "matter:26PR104:matter_1",
        "risk:26PR104:risk_1",
        "action:26PR104:action_1",
        "release:24PR97",
    } <= ids
    assert any(node["id"].startswith("entity:person:") for node in graph["nodes"])
    assert any(link["kind"] == "target_of" for link in graph["links"])
    assert any(link["kind"] == "references" for link in graph["links"])
    assert "release:24PR98" not in ids
    person = next(node for node in graph["nodes"] if node["kind"] == "person")
    action = next(node for node in graph["nodes"] if node["kind"] == "action")
    relationship = next(link for link in graph["links"] if link["kind"] == "regulated_by")
    assert person["facets"] == {"identity": ["exact_name"], "involvement": ["subject"]}
    assert {item["name"] for item in person["facts"]} == {"description", "alias", "age"}
    assert action["label"] == "Nine-month licence suspension"
    assert action["facets"] == {
        "action_family": ["sanction"],
        "action_type": ["suspension"],
        "action_status": ["imposed"],
    }
    risk = next(node for node in graph["nodes"] if node["kind"] == "risk")
    assert risk["label"] == "Written authorization failure"
    assert risk["facets"]["risk_type"] == ["systems_controls_failure"]
    assert relationship["family"] == "relationship"
    assert relationship["facets"]["relationship_kind"] == ["affiliation"]


def test_coalesces_exact_named_entities_across_releases(tmp_path: Path) -> None:
    first = {
        "newsRefNo": "first",
        "lang": "EN",
        "title": "First release",
        "html": "<p>Body</p>",
        "issueDate": "2026-01-02",
        "modificationTime": "2026-01-02",
    }
    second = {**first, "newsRefNo": "second", "title": "Second release", "issueDate": "2026-01-01"}
    with Database(tmp_path / "test.sqlite3") as database:
        for raw in (first, second):
            database.save_release(raw)
            database.save_extraction(raw, EXTRACTION_VERSION, "test-model", extraction(), None, None)

        graph = export_graph(database, "test-model")

    regulators = [node for node in graph["nodes"] if node["label"] == "Securities and Futures Commission"]
    assert len(regulators) == 1
    assert regulators[0]["releaseRefs"] == ["first", "second"]


def test_keeps_generic_groups_local_to_their_release(tmp_path: Path) -> None:
    first = {
        "newsRefNo": "first",
        "lang": "EN",
        "title": "First release",
        "html": "<p>Body</p>",
        "issueDate": "2026-01-02",
        "modificationTime": "2026-01-02",
    }
    second = {**first, "newsRefNo": "second", "title": "Second release", "issueDate": "2026-01-01"}
    group = extraction()
    group["mentions"][0]["type"] = "person_group"
    with Database(tmp_path / "test.sqlite3") as database:
        for raw in (first, second):
            database.save_release(raw)
            database.save_extraction(raw, EXTRACTION_VERSION, "test-model", group, None, None)

        graph = export_graph(database, "test-model")

    groups = [node for node in graph["nodes"] if node["label"] == "Wong Tim Hi"]
    assert {node["id"] for node in groups} == {
        "mention:first:mention_1",
        "mention:second:mention_1",
    }


def test_keeps_descriptive_people_local_to_their_release(tmp_path: Path) -> None:
    first = {
        "newsRefNo": "first", "lang": "EN", "title": "First", "html": "<p>Body</p>",
        "issueDate": "2026-01-02", "modificationTime": "2026-01-02",
    }
    second = {**first, "newsRefNo": "second", "title": "Second"}
    data = extraction()
    data["mentions"][0]["name"] = "another person"
    with Database(tmp_path / "test.sqlite3") as database:
        for raw in (first, second):
            database.save_release(raw)
            database.save_extraction(raw, EXTRACTION_VERSION, "test-model", data, None, None)

        graph = export_graph(database, "test-model")

    assert {node["id"] for node in graph["nodes"] if node["label"] == "another person"} == {
        "mention:first:mention_1", "mention:second:mention_1",
    }


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
        database.save_extraction(raw, EXTRACTION_VERSION - 1, "test-model", {"historical": True}, None, None)

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
        database.save_extraction(old, EXTRACTION_VERSION, "test-model", extraction(), None, None)
        database.save_release(new)

        assert export_graph(database, "test-model") == {"nodes": [], "links": [], "releases": []}
