from __future__ import annotations

import json
import re
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS releases (
    source_ref TEXT NOT NULL,
    language TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    modification_time TEXT NOT NULL,
    raw_json TEXT NOT NULL CHECK (json_valid(raw_json)),
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (source_ref, language)
);

CREATE TABLE IF NOT EXISTS extractions (
    source_ref TEXT NOT NULL,
    language TEXT NOT NULL,
    source_modification_time TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    model TEXT NOT NULL,
    extraction_json TEXT NOT NULL CHECK (json_valid(extraction_json)),
    extracted_at TEXT NOT NULL,
    run_id TEXT,
    usage_json TEXT CHECK (usage_json IS NULL OR json_valid(usage_json)),
    PRIMARY KEY (source_ref, language, source_modification_time, schema_version, model),
    FOREIGN KEY (source_ref, language) REFERENCES releases (source_ref, language)
);

CREATE TABLE IF NOT EXISTS sync_state (
    language TEXT PRIMARY KEY,
    full_sync_completed INTEGER NOT NULL CHECK (full_sync_completed IN (0, 1))
);

CREATE TABLE IF NOT EXISTS release_links (
    source_ref TEXT NOT NULL,
    language TEXT NOT NULL,
    target_ref TEXT NOT NULL,
    PRIMARY KEY (source_ref, language, target_ref),
    FOREIGN KEY (source_ref, language) REFERENCES releases (source_ref, language) ON DELETE CASCADE
);
"""

RELEASE_LINK = re.compile(r"[?&]refNo=([0-9]{2}PR[0-9]+)", re.IGNORECASE)


class Database:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path)
        self.connection.row_factory = sqlite3.Row
        self.connection.executescript(SCHEMA)

    def close(self) -> None:
        self.connection.close()

    def __enter__(self) -> Database:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def save_release(self, raw: dict[str, Any]) -> None:
        values = (
            raw["newsRefNo"],
            raw["lang"].upper(),
            raw["issueDate"],
            raw["modificationTime"],
            encode(raw),
            now(),
        )
        with self.connection:
            self.connection.execute(
                """INSERT INTO releases VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (source_ref, language) DO UPDATE SET
                    issue_date = excluded.issue_date,
                    modification_time = excluded.modification_time,
                    raw_json = excluded.raw_json,
                    fetched_at = excluded.fetched_at""",
                values,
            )
            self.connection.execute(
                "DELETE FROM release_links WHERE source_ref = ? AND language = ?", values[:2]
            )
            self.connection.executemany(
                "INSERT INTO release_links VALUES (?, ?, ?)",
                ((values[0], values[1], target) for target in related_release_refs(raw)),
            )

    def release_versions(self, language: str) -> dict[str, tuple[str, str]]:
        rows = self.connection.execute(
            "SELECT source_ref, issue_date, modification_time FROM releases WHERE language = ?",
            (language.upper(),),
        )
        return {row["source_ref"]: (row["issue_date"], row["modification_time"]) for row in rows}

    def releases(self, language: str, refs: set[str]) -> Iterable[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT raw_json FROM releases WHERE language = ? ORDER BY issue_date DESC, source_ref DESC",
            (language.upper(),),
        ).fetchall()
        for row in rows:
            raw = json.loads(row["raw_json"])
            if not refs or raw["newsRefNo"] in refs:
                yield raw

    def related_releases(self, source_ref: str, language: str = "EN") -> list[str]:
        rows = self.connection.execute(
            "SELECT target_ref FROM release_links WHERE source_ref = ? AND language = ? ORDER BY target_ref",
            (source_ref, language.upper()),
        )
        return [row["target_ref"] for row in rows]

    def release_links(self, source_refs: set[str]) -> Iterable[tuple[str, str]]:
        if not source_refs:
            return
        placeholders = ",".join("?" for _ in source_refs)
        rows = self.connection.execute(
            f"SELECT source_ref, target_ref FROM release_links WHERE source_ref IN ({placeholders}) ORDER BY source_ref, target_ref",
            tuple(sorted(source_refs)),
        )
        yield from ((row["source_ref"], row["target_ref"]) for row in rows)

    def extractions(
        self, schema_version: int, model: str, language: str
    ) -> Iterable[tuple[dict[str, Any], dict[str, Any]]]:
        rows = self.connection.execute(
            """SELECT r.raw_json, e.extraction_json
            FROM extractions e
            JOIN releases r USING (source_ref, language)
            WHERE e.schema_version = ? AND e.model = ? AND r.language = ?
              AND e.source_modification_time = r.modification_time
            ORDER BY r.issue_date DESC, r.source_ref DESC""",
            (schema_version, model, language.upper()),
        )
        for row in rows:
            yield json.loads(row["raw_json"]), json.loads(row["extraction_json"])

    def extraction_is_current(self, raw: dict[str, Any], schema_version: int, model: str) -> bool:
        row = self.connection.execute(
            """SELECT 1 FROM extractions
            WHERE source_ref = ? AND language = ? AND source_modification_time = ?
              AND schema_version = ? AND model = ?""",
            (
                raw["newsRefNo"],
                raw["lang"].upper(),
                raw["modificationTime"],
                schema_version,
                model,
            ),
        ).fetchone()
        return row is not None

    def save_extraction(
        self,
        raw: dict[str, Any],
        schema_version: int,
        model: str,
        extraction: dict[str, Any],
        run_id: str | None,
        usage: dict[str, Any] | None,
    ) -> None:
        values = (
            raw["newsRefNo"],
            raw["lang"].upper(),
            raw["modificationTime"],
            schema_version,
            model,
            encode(extraction),
            now(),
            run_id,
            encode(usage) if usage is not None else None,
        )
        with self.connection:
            self.connection.execute(
                "INSERT OR REPLACE INTO extractions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", values
            )

    def full_sync_completed(self, language: str) -> bool:
        row = self.connection.execute(
            "SELECT full_sync_completed FROM sync_state WHERE language = ?", (language.upper(),)
        ).fetchone()
        return row is not None and row["full_sync_completed"] == 1

    def set_full_sync_completed(self, language: str, completed: bool) -> None:
        with self.connection:
            self.connection.execute(
                "INSERT OR REPLACE INTO sync_state VALUES (?, ?)", (language.upper(), completed)
            )


def encode(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def now() -> str:
    return datetime.now(UTC).isoformat()


def related_release_refs(raw: dict[str, Any]) -> list[str]:
    html = raw.get("html")
    if not isinstance(html, str):
        return []
    source_ref = raw.get("newsRefNo")
    return sorted({match.upper() for match in RELEASE_LINK.findall(html) if match.upper() != source_ref})
