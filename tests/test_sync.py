from pathlib import Path

import pytest

from qf_sfc.sync import PAGE_SIZE, SfcError, sync
from qf_sfc.store import Database, related_release_refs


class FakeClient:
    def __init__(self, items: list[dict], contents: dict[str, dict]) -> None:
        self.items = items
        self.contents = contents
        self.content_calls: list[str] = []

    def search(self, page: int, language: str) -> dict:
        start = page * PAGE_SIZE
        return {"items": self.items[start : start + PAGE_SIZE], "total": len(self.items)}

    def content(self, ref: str, language: str) -> dict:
        self.content_calls.append(ref)
        return self.contents[ref]


def item(ref: str, issue: str, modified: str, news_type: str = "EF") -> dict:
    return {
        "newsRefNo": ref,
        "newsType": news_type,
        "issueDate": issue,
        "modificationTime": modified,
    }


def content(ref: str, issue: str, modified: str) -> dict:
    return {
        "newsRefNo": ref,
        "lang": "EN",
        "title": f"Release {ref}",
        "html": "<p>Body</p>",
        "issueDate": issue,
        "modificationTime": modified,
    }


def test_limit_counts_only_enforcement_items(tmp_path: Path) -> None:
    items = [item("general", "2026-01-03", "2026-01-03", "GN")]
    contents = {}
    for number in range(12):
        ref = f"release{number}"
        issue = f"2026-01-{12 - number:02d}"
        items.append(item(ref, issue, issue))
        contents[ref] = content(ref, issue, issue)

    with Database(tmp_path / "test.sqlite3") as database:
        result = sync(FakeClient(items, contents), database, limit=10)
        saved = database.release_versions("EN")

    assert result.added == 10
    assert len(saved) == 10


def test_sync_downloads_new_and_skips_known(tmp_path: Path) -> None:
    known = content("known", "2026-01-01", "2026-01-01")
    new = content("new", "2026-01-02", "2026-01-02")
    client = FakeClient(
        [item("new", "2026-01-02", "2026-01-02"), item("known", "2026-01-01", "2026-01-01")],
        {"new": new, "known": known},
    )

    with Database(tmp_path / "test.sqlite3") as database:
        database.save_release(content("known", "2026-01-01", "2026-01-01"))
        database.set_full_sync_completed("EN", True)
        result = sync(client, database, limit=None)

    assert result.added == 1
    assert result.unchanged == 1
    assert client.content_calls == ["new"]


def test_incremental_sync_finds_updates_beyond_an_unchanged_page(tmp_path: Path) -> None:
    items = []
    contents = {}
    for number in range(PAGE_SIZE + 1):
        ref = f"release{number}"
        issue = f"2026-01-{PAGE_SIZE + 1 - number:02d}"
        modified = "2026-02-01" if number == PAGE_SIZE else issue
        items.append(item(ref, issue, modified))
        contents[ref] = content(ref, issue, modified)

    client = FakeClient(items, contents)
    with Database(tmp_path / "test.sqlite3") as database:
        for source in contents.values():
            database.save_release({**source, "modificationTime": source["issueDate"]})
        database.set_full_sync_completed("EN", True)
        result = sync(client, database, limit=None)

    assert result.updated == 1
    assert result.unchanged == PAGE_SIZE
    assert client.content_calls == [f"release{PAGE_SIZE}"]


def test_sync_requires_complete_baseline(tmp_path: Path) -> None:
    with Database(tmp_path / "test.sqlite3") as database:
        with pytest.raises(SfcError, match="run with --full first"):
            sync(FakeClient([], {}), database, limit=None)


def test_release_links_are_derived_from_raw_html(tmp_path: Path) -> None:
    raw = content("new", "2026-01-02", "2026-01-02")
    raw["html"] = (
        '<a href="doc?refNo=25PR1">first</a>'
        '<a href="doc?lang=EN&refNo=24PR2">second</a>'
        '<a href="doc?refNo=25PR1">duplicate</a>'
    )

    assert related_release_refs(raw) == ["24PR2", "25PR1"]

    with Database(tmp_path / "test.sqlite3") as database:
        database.save_release(raw)
        links = database.connection.execute(
            "SELECT target_ref FROM release_links ORDER BY target_ref"
        ).fetchall()
        related = database.related_releases("new")

    assert [row["target_ref"] for row in links] == ["24PR2", "25PR1"]
    assert related == ["24PR2", "25PR1"]
