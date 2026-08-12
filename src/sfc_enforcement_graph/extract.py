from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
from dataclasses import asdict
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from pydantic_ai import Agent
from sfc_enforcement_graph.models import EXTRACTION_VERSION, ReleaseExtraction
from sfc_enforcement_graph.sync import SfcError
from sfc_enforcement_graph.store import Database

DEFAULT_MODEL = "gpt-5.6-sol"
DEFAULT_MAX_OUTPUT_TOKENS = 12_000
REQUEST_TIMEOUT_SECONDS = 180
INSTRUCTIONS = """You extract a high-recall, evidence-backed graph from an SFC enforcement release.

Rules:
- Use only the supplied release. Do not add external knowledge or infer unstated facts.
- Extract every named or distinctly described person, organization, fund, and financial instrument as a source-relative mention. Canonical entity resolution happens later.
- Treat a company or other issuer as an organization. Treat its shares, bonds, accounts, and other securities as financial instruments; a stock code does not turn the issuer into an instrument.
- Extract each named entity separately. Use one grouped mention only when the release withholds individual names.
- Include regulators, courts, affected parties, employers, counterparties, issuers, and spokespeople as secondary mentions.
- Primary is narrow and document-relative: use it for direct subjects of the new central risk or action announced by this release, plus a named company central to that event. A person sanctioned in an earlier proceeding remains secondary when that outcome appears only as history or in notes. Intermediaries and legally bound notice recipients remain secondary when the release says they are not investigation subjects. Beneficiaries, affected clients or shareholders, regulators, courts, incidental issuers, and other background parties are secondary.
- Regulators, law-enforcement bodies, courts, and quoted spokespeople are secondary unless they are themselves subject to the action. Acting in the headline or opening sentence does not make them primary.
- Assign mention, matter, relationship, risk, and action IDs sequentially within their type.
- Use involvement only for subject, affected, authority, intermediary, or related. Put exact jobs and functions in attributes or relationships.
- Group risks and actions under a matter only when the release identifies an investigation, disciplinary proceeding, court case, tribunal proceeding, or appeal. Do not create a matter merely because an action exists. An action such as a restriction notice belongs to the investigation or proceeding it supports when the source connects them; otherwise its matter_id is null. Capture case numbers and shared legal provisions on the matter instead of repeating them on every assertion.
- Choose exactly one controlled risk type and add a concise source-grounded label for the specific conduct or impact. The risk family is derived later.
- Choose exactly one controlled action type and add a concise source-grounded label for the specific event. The action family is derived later.
- Normalize source wording to the controlled type: convictions, pleas, and findings are decisions; arrests and searches are investigative; charges and prosecutions are proceedings; asset freezes and restriction notices are protective; compensation and restoration are remedial; fines and licence sanctions are sanctions; and listing or governance changes are administrative. Use other only when no controlled type fits.
- Preserve whether conduct is reported, suspected, alleged, considered, admitted, found, convicted, acquitted, dismissed, or ordered.
- Preserve explicit negation and exculpatory statements.
- Use aliases only for alternative names or abbreviations explicitly introduced with wording such as 'also known as', 'formerly known as', or a parenthetical abbreviation. A surname-only later mention is not an alias.
- Do not emit duplicate relationships that express the same underlying role or affiliation.
- For actions, distinguish the actor, the legally bound target, and other affected entities. Receiving a notice does not imply misconduct. Preserve procedural changes such as commencement, adjournment, withdrawal, revocation, and completion.
- Emit one action for one source-described action. Group targets that share the same type, status, amount, duration, and evidentiary basis; separate actions when those facts differ. Distinct claims or proceedings under different legal provisions may remain separate.
- Emit an action only when the release explicitly says it was issued, imposed, sought, granted, agreed, ordered, or remains pending. Do not turn generic words such as 'disciplinary action' or 'sanction' into a specific reprimand, fine, or other action.
- Never infer an authority or action actor. Leave its ID list empty when passive wording does not identify one.
- Capture uncommon facts as source-specific attributes rather than dropping them; attributes are not a canonical taxonomy.
- Add geography only for an actual source-stated relationship such as residence, incorporation, operations, listing, regulation, proceedings, conduct, assets, or restrictions. A place inside an entity name is not geography by itself.
- Preserve monetary source text and also normalize currency, amount, and qualifier only when unambiguous. Preserve period text and normalize complete dates only when explicitly stated.
- Every evidence quote must be an exact contiguous substring of the supplied title or source_text. Never paraphrase evidence.
"""

extractor = Agent(output_type=ReleaseExtraction, instructions=INSTRUCTIONS)


class ExtractError(RuntimeError):
    pass


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"br", "li", "p"}:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def text(self) -> str:
        return re.sub(r"\s+", " ", "".join(self.parts)).strip()


def extract_text(html: str) -> str:
    parser = TextExtractor()
    parser.feed(html)
    parser.close()
    return parser.text()


def extract_release(
    agent: Agent[None, ReleaseExtraction],
    raw: dict[str, Any],
    model: str,
    max_output_tokens: int,
) -> tuple[ReleaseExtraction, Any]:
    ref = require_string(raw, "newsRefNo")
    title = require_string(raw, "title").strip()
    text = extract_text(require_string(raw, "html"))
    source = {
        "reference": ref,
        "title": title,
        "issue_date": require_string(raw, "issueDate"),
        "source_text": text,
    }
    result = agent.run_sync(
        "SOURCE RELEASE\n" + json.dumps(source, ensure_ascii=False),
        model=model if ":" in model else f"azure-responses:{model}",
        model_settings={
            "max_tokens": max_output_tokens,
            "openai_reasoning_effort": "medium",
            "timeout": REQUEST_TIMEOUT_SECONDS,
        },
    )
    extraction = repair_evidence_case(result.output, f"{title}\n{text}")
    validate_evidence(extraction, f"{title}\n{text}")
    return extraction, result


def repair_evidence_case(extraction: ReleaseExtraction, source_text: str) -> ReleaseExtraction:
    data = extraction.model_dump(mode="json")
    for evidence in evidence_objects(data):
        matches = list(re.finditer(re.escape(evidence["quote"]), source_text, re.IGNORECASE))
        if len(matches) == 1:
            evidence["quote"] = matches[0].group()
    return ReleaseExtraction.model_validate(data)


def validate_evidence(extraction: ReleaseExtraction, source_text: str) -> None:
    missing = sorted({quote for quote in evidence_quotes(extraction.model_dump()) if quote not in source_text})
    if missing:
        preview = missing[0][:120]
        raise ExtractError(f"evidence quote is not present in source text: {preview!r}")


def evidence_quotes(value: Any):
    if isinstance(value, dict):
        if set(value) == {"quote"} and isinstance(value["quote"], str):
            yield value["quote"]
        for child in value.values():
            yield from evidence_quotes(child)
    elif isinstance(value, list):
        for child in value:
            yield from evidence_quotes(child)


def evidence_objects(value: Any):
    if isinstance(value, dict):
        if set(value) == {"quote"} and isinstance(value["quote"], str):
            yield value
        for child in value.values():
            yield from evidence_objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from evidence_objects(child)


def extract_releases(
    agent: Agent[None, ReleaseExtraction],
    database: Database,
    language: str,
    model: str,
    limit: int | None,
    refs: set[str],
    force: bool,
    max_output_tokens: int,
    workers: int = 1,
) -> tuple[int, int]:
    pending = []
    skipped = 0
    for raw in database.releases(language, refs):
        if not force and database.extraction_is_current(raw, EXTRACTION_VERSION, model):
            skipped += 1
            continue
        if limit is not None and len(pending) >= limit:
            break
        pending.append(raw)

    def run(raw: dict[str, Any]):
        extraction, result = extract_release(agent, raw, model, max_output_tokens)
        return raw, extraction, result

    extracted = 0
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(run, raw): raw for raw in pending}
        for future in concurrent.futures.as_completed(futures):
            raw = futures[future]
            try:
                raw, extraction, result = future.result()
            except Exception as error:
                failures.append((require_string(raw, "newsRefNo"), error))
                continue
            database.save_extraction(
                raw,
                EXTRACTION_VERSION,
                model,
                extraction.model_dump(mode="json"),
                result.run_id,
                asdict(result.usage),
            )
            extracted += 1

    if failures:
        ref, error = failures[0]
        raise ExtractError(f"{len(failures)} extraction(s) failed; first was {ref}: {error}") from error
    return extracted, skipped


def require_string(data: dict[str, Any], field: str) -> str:
    value = data.get(field)
    if not isinstance(value, str) or not value:
        raise ExtractError(f"source release has invalid {field}")
    return value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract structured SFC data into SQLite.")
    parser.add_argument("--db", type=Path, default=Path("data/sfc.sqlite3"))
    parser.add_argument("--language", default="EN")
    parser.add_argument("--model", default=os.environ.get("AZURE_OPENAI_MODEL", DEFAULT_MODEL))
    parser.add_argument("--ref", action="append", default=[], help="Extract one release reference; repeatable.")
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--full", action="store_true", help="Extract every stale or missing release.")
    scope.add_argument(
        "--limit",
        type=int,
        help="Extract at most N stale or missing releases (default: 1).",
    )
    parser.add_argument("--force", action="store_true", help="Re-extract current outputs.")
    parser.add_argument("--workers", type=int, default=1, help="Concurrent API calls (default: 1).")
    parser.add_argument(
        "--max-output-tokens",
        type=int,
        default=DEFAULT_MAX_OUTPUT_TOKENS,
        help=f"Per-call output cap (default: {DEFAULT_MAX_OUTPUT_TOKENS}).",
    )
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be positive")
    if args.max_output_tokens < 1:
        parser.error("--max-output-tokens must be positive")
    if args.workers < 1:
        parser.error("--workers must be positive")
    missing = [
        name
        for name in ("AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY")
        if not os.environ.get(name)
    ]
    if missing:
        parser.error(f"{', '.join(missing)} required")
    return args


def main() -> None:
    args = parse_args()
    try:
        with Database(args.db) as database:
            extracted, skipped = extract_releases(
                extractor,
                database,
                language=args.language,
                model=args.model,
                limit=None if args.full else args.limit or 1,
                refs=set(args.ref),
                force=args.force,
                max_output_tokens=args.max_output_tokens,
                workers=args.workers,
            )
    except (ExtractError, SfcError, json.JSONDecodeError) as error:
        raise SystemExit(f"error: {error}") from None
    print(f"extracted={extracted} skipped={skipped} model={args.model}")


if __name__ == "__main__":
    main()
