from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from qf_sfc.store import Database

BASE_URL = "https://apps.sfc.hk/edistributionWeb/api/news"
PAGE_SIZE = 100


class SfcError(RuntimeError):
    pass


@dataclass(frozen=True)
class SyncResult:
    checked: int = 0
    added: int = 0
    updated: int = 0
    unchanged: int = 0

    def add(self, **changes: int) -> SyncResult:
        return SyncResult(
            checked=self.checked + changes.get("checked", 0),
            added=self.added + changes.get("added", 0),
            updated=self.updated + changes.get("updated", 0),
            unchanged=self.unchanged + changes.get("unchanged", 0),
        )


class SfcClient:
    def __init__(self, timeout: float = 20, retries: int = 3) -> None:
        self.timeout = timeout
        self.retries = retries

    def search(self, page: int, language: str) -> dict[str, Any]:
        payload = {
            "lang": language,
            "category": "all",
            "year": "all",
            "month": "all",
            "ceTargetName": "",
            "searchMode": "by-year",
            "pageNo": page,
            "pageSize": PAGE_SIZE,
        }
        return self._request("search", payload)

    def content(self, ref: str, language: str) -> dict[str, Any]:
        query = urlencode({"refNo": ref, "lang": language})
        return self._request(f"content?{query}")

    def _request(self, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        body = json.dumps(payload).encode() if payload is not None else None
        request = Request(
            f"{BASE_URL}/{path}",
            data=body,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST" if body is not None else "GET",
        )

        for attempt in range(self.retries):
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    data = json.load(response)
                if not isinstance(data, dict):
                    raise SfcError(f"expected JSON object from {request.full_url}")
                return data
            except HTTPError as error:
                if error.code < 500 and error.code != 429:
                    raise SfcError(f"SFC returned HTTP {error.code} for {request.full_url}") from error
                last_error: Exception = error
            except (URLError, TimeoutError, json.JSONDecodeError) as error:
                last_error = error

            if attempt + 1 < self.retries:
                time.sleep(2**attempt)

        raise SfcError(f"failed after {self.retries} attempts: {request.full_url}") from last_error


def sync(
    client: SfcClient,
    database: Database,
    language: str = "EN",
    limit: int | None = 10,
    full: bool = False,
) -> SyncResult:
    language = language.upper()
    if not full and limit is None and not database.full_sync_completed(language):
        raise SfcError("incremental sync requires a complete baseline; run with --full first")

    known = database.release_versions(language)
    latest_issue = max((issue for issue, _ in known.values()), default=None)
    result = SyncResult()
    page = 0
    archive_exhausted = False

    while limit is None or result.checked < limit:
        response = client.search(page, language)
        items = response.get("items")
        total = response.get("total")
        if not isinstance(items, list) or not isinstance(total, int):
            raise SfcError("search response must contain items and total")
        if not items:
            archive_exhausted = True
            break

        page_changed = False
        enforcement_items = [item for item in items if item.get("newsType") == "EF"]
        for item in enforcement_items:
            if limit is not None and result.checked >= limit:
                break

            ref, version = item_version(item)
            result = result.add(checked=1)
            if known.get(ref) == version:
                result = result.add(unchanged=1)
                continue

            content = client.content(ref, language)
            validate_content(content, ref, language)
            database.save_release(content)
            page_changed = True
            if ref in known:
                result = result.add(updated=1)
            else:
                result = result.add(added=1)
            known[ref] = version

        page += 1
        exhausted = page * PAGE_SIZE >= total
        if exhausted:
            archive_exhausted = True
            break
        if not full and limit is None and latest_issue is not None:
            page_reaches_known_history = any(item.get("issueDate", "") <= latest_issue for item in items)
            if page_reaches_known_history and not page_changed:
                break

    if archive_exhausted and full:
        database.set_full_sync_completed(language, True)
    return result


def item_version(item: Any) -> tuple[str, tuple[str, str]]:
    try:
        ref = item["newsRefNo"]
        issue = item["issueDate"]
        modified = item["modificationTime"]
    except (KeyError, TypeError) as error:
        raise SfcError("enforcement search item is missing version fields") from error
    if not all(isinstance(value, str) and value for value in (ref, issue, modified)):
        raise SfcError("enforcement search item has invalid version fields")
    return ref, (issue, modified)


def validate_content(content: dict[str, Any], ref: str, language: str) -> None:
    if content.get("newsRefNo") != ref or content.get("lang", "").upper() != language.upper():
        raise SfcError(f"content identity mismatch for {ref}")
    for field in ("title", "html", "issueDate", "modificationTime"):
        if not isinstance(content.get(field), str):
            raise SfcError(f"content for {ref} has invalid {field}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync SFC enforcement releases into SQLite.")
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--full", action="store_true", help="Reconcile the complete news archive.")
    scope.add_argument("--limit", type=int, help="Reconcile the newest N enforcement releases.")
    parser.add_argument("--language", default="EN", help="SFC language code (default: EN).")
    parser.add_argument("--db", type=Path, default=Path("data/sfc.sqlite3"))
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be positive")
    return args


def main() -> None:
    args = parse_args()
    limit = None if args.full or args.limit is None else args.limit
    try:
        with Database(args.db) as database:
            result = sync(SfcClient(), database, language=args.language, limit=limit, full=args.full)
    except SfcError as error:
        raise SystemExit(f"error: {error}") from None
    print(
        f"checked={result.checked} added={result.added} "
        f"updated={result.updated} unchanged={result.unchanged}"
    )


if __name__ == "__main__":
    main()
