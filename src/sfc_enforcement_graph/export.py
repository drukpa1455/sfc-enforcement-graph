from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import unicodedata
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Iterable

from sfc_enforcement_graph.analytics import add_metrics
from sfc_enforcement_graph.models import (
    EXTRACTION_VERSION,
    Action,
    Attribute,
    Geography,
    Money,
    Period,
    ReleaseExtraction,
    SourcedText,
)
from sfc_enforcement_graph.store import Database

SOURCE_URL = "https://apps.sfc.hk/edistributionWeb/gateway/EN/news-and-announcements/news/enforcement-news/doc?refNo="
DEFAULT_MODEL = "gpt-5.6"
MERGED_ENTITY_KINDS = {"person", "organization", "fund", "instrument"}

ACTION_FAMILIES = {
    "remedy": ("compensation", "disgorg", "restitut", "repay", "restore", "damages", "recovery"),
    "penalty": (
        "fine", "reprimand", "suspension", "ban", "prohibition", "disqualif", "revocation",
        "cancellation", "imprison", "sentence", "conviction", "community_service", "censure",
    ),
    "protective": ("restriction", "freeze", "injunction", "restraint", "seiz", "warrant", "receiver"),
    "procedural": ("bail", "remand", "adjourn", "withdraw", "stay", "hearing", "trial", "plea", "release"),
    "proceeding": ("proceed", "prosecut", "charge", "investigat", "appeal", "review", "application", "petition"),
}


def export_graph(
    database: Database, model: str = DEFAULT_MODEL, language: str = "EN"
) -> dict[str, list[dict[str, Any]]]:
    nodes: dict[str, dict[str, Any]] = {}
    links: list[dict[str, Any]] = []
    releases: list[dict[str, Any]] = []
    known_releases: set[str] = set()

    for raw, data in database.extractions(EXTRACTION_VERSION, model, language):
        extraction = ReleaseExtraction.model_validate(data)
        ref = raw["newsRefNo"]
        known_releases.add(ref)
        release_id = f"release:{ref}"
        add_node(nodes, node(release_id, f"{ref} · {raw['title'].strip()}", "release", raw["title"], ref))
        releases.append(
            {
                "ref": ref,
                "title": raw["title"].strip(),
                "issueDate": raw["issueDate"],
                "url": SOURCE_URL + ref,
            }
        )
        project_release(ref, extraction, nodes, links)

    for source_ref, target_ref in database.release_links(known_releases, language):
        target_id = f"release:{target_ref}"
        if target_ref not in known_releases:
            add_node(nodes, node(target_id, target_ref, "release", "Referenced SFC release not stored locally.", target_ref))
            known_releases.add(target_ref)
        links.append(link(f"release:{source_ref}", target_id, "references", "evidence", "Related SFC release", source_ref))

    add_metrics(nodes, links)
    return {"nodes": list(nodes.values()), "links": links, "releases": releases}


def project_release(
    ref: str,
    extraction: ReleaseExtraction,
    nodes: dict[str, dict[str, Any]],
    links: list[dict[str, Any]],
) -> None:
    mention_ids = {
        mention.id: entity_id(mention_kind(mention.type), mention.name, ref, mention.id)
        for mention in extraction.mentions
    }
    matter_ids = {matter.id: f"matter:{ref}:{matter.id}" for matter in extraction.matters}

    for mention in extraction.mentions:
        mention_id = mention_ids[mention.id]
        kind = mention_kind(mention.type)
        add_node(
            nodes,
            node(
                mention_id,
                mention.name,
                kind,
                mention.description,
                ref,
                {
                    "identity": ["exact_name" if mention_id.startswith("entity:") else "release_local"],
                    "involvement": mention.involvement,
                },
                [
                    *(
                        [fact("description", mention.description, mention.evidence.quote, ref)]
                        if mention_id.startswith("entity:") else []
                    ),
                    *(fact("alias", alias, mention.evidence.quote, ref) for alias in mention.aliases),
                    *geography_facts(mention.geographies, ref),
                    *attribute_facts(mention.attributes, ref),
                ],
            ),
        )
        links.append(
            link(
                f"release:{ref}",
                mention_id,
                "primary_mention" if mention.relevance == "primary" else "mentions",
                "evidence",
                mention.evidence.quote,
                ref,
            )
        )

    for relationship in extraction.relationships:
        links.append(
            link(
                mention_ids[relationship.subject_id],
                mention_ids[relationship.object_id],
                relationship.predicate,
                "relationship",
                relationship.evidence.quote,
                ref,
                {
                    "relationship_kind": [relationship.kind],
                    "claim_status": [relationship.status.value],
                    "negated": [str(relationship.negated).lower()],
                },
                [*period_facts(relationship.period, ref), *attribute_facts(relationship.attributes, ref)],
            )
        )

    for matter in extraction.matters:
        matter_id = matter_ids[matter.id]
        add_node(
            nodes,
            node(
                matter_id,
                label(matter.kind),
                "matter",
                matter.description,
                ref,
                {"matter_kind": [matter.kind]},
                [
                    *sourced_facts("case_number", matter.case_numbers, ref),
                    *sourced_facts("legal_provision", matter.legal_provisions, ref),
                ],
            ),
        )
        links.append(link(f"release:{ref}", matter_id, "reports", "evidence", matter.evidence.quote, ref))
        connect(links, mention_ids, matter.authority_ids, matter_id, "authority_for", matter.evidence.quote, ref)
        connect(links, mention_ids, matter.subject_ids, matter_id, "subject_of", matter.evidence.quote, ref)

    for risk in extraction.risks:
        risk_id = f"risk:{ref}:{risk.id}"
        add_node(
            nodes,
            node(
                risk_id,
                label(risk.category),
                "risk",
                risk.description,
                ref,
                {
                    "risk_family": [risk.family],
                    "claim_status": [risk.status.value],
                    "negated": [str(risk.negated).lower()],
                },
                [
                    *period_facts(risk.period, ref),
                    *geography_facts(risk.geographies, ref),
                    *attribute_facts(risk.attributes, ref),
                ],
            ),
        )
        links.append(link(f"release:{ref}", risk_id, "asserts", "evidence", risk.evidence.quote, ref))
        if risk.matter_id:
            links.append(link(risk_id, matter_ids[risk.matter_id], "belongs_to", "participation", risk.evidence.quote, ref))
        connect(links, mention_ids, risk.authority_ids, risk_id, "authority_for", risk.evidence.quote, ref)
        connect(links, mention_ids, risk.subject_ids, risk_id, "subject_of", risk.evidence.quote, ref)
        connect(links, mention_ids, risk.affected_ids, risk_id, "affected_by", risk.evidence.quote, ref)

    for action in extraction.actions:
        action_id = f"action:{ref}:{action.id}"
        add_node(
            nodes,
            node(
                action_id,
                label(action.type),
                "action",
                action.description,
                ref,
                {"action_family": [action_family(action.type)], "action_status": [action.status.value]},
                action_facts(action, ref),
            ),
        )
        links.append(link(f"release:{ref}", action_id, "reports", "evidence", action.evidence.quote, ref))
        if action.matter_id:
            links.append(link(action_id, matter_ids[action.matter_id], "belongs_to", "participation", action.evidence.quote, ref))
        connect(links, mention_ids, action.actor_ids, action_id, "actor_of", action.evidence.quote, ref)
        connect(links, mention_ids, action.target_ids, action_id, "target_of", action.evidence.quote, ref)
        connect(links, mention_ids, action.affected_ids, action_id, "affected_by", action.evidence.quote, ref)


def connect(
    links: list[dict[str, Any]],
    mention_ids: dict[str, str],
    mentions: list[str],
    target: str,
    kind: str,
    evidence: str,
    ref: str,
) -> None:
    links.extend(link(mention_ids[mention], target, kind, "participation", evidence, ref) for mention in mentions)


def mention_kind(kind: str) -> str:
    return {"person_group": "group", "financial_instrument": "instrument"}.get(kind, kind)


def entity_id(kind: str, name: str, ref: str, local_id: str) -> str:
    if kind not in MERGED_ENTITY_KINDS or not name[:1].isupper():
        return f"mention:{ref}:{local_id}"
    identity = f"{kind}\0{normalize_name(name)}".encode()
    return f"entity:{kind}:{hashlib.sha256(identity).hexdigest()[:16]}"


def normalize_name(name: str) -> str:
    normalized = unicodedata.normalize("NFKC", name).casefold()
    return re.sub(r"\s+", " ", normalized).strip()


def action_family(action_type: str) -> str:
    for family, markers in ACTION_FAMILIES.items():
        if any(marker in action_type for marker in markers):
            return family
    return "other"


def add_node(nodes: dict[str, dict[str, Any]], candidate: dict[str, Any]) -> None:
    existing = nodes.get(candidate["id"])
    if existing is None:
        nodes[candidate["id"]] = candidate
        return
    merge_unique(existing["releaseRefs"], candidate["releaseRefs"])
    merge_unique(existing["facts"], candidate["facts"])
    for name, values in candidate["facets"].items():
        merge_unique(existing["facets"].setdefault(name, []), values)


def merge_unique(target: list[Any], values: Iterable[Any]) -> None:
    for value in values:
        if value not in target:
            target.append(value)


def node(
    id: str,
    label: str,
    kind: str,
    summary: str,
    ref: str,
    facets: dict[str, list[str]] | None = None,
    facts: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    return {
        "id": id,
        "label": label,
        "kind": kind,
        "summary": summary,
        "releaseRefs": [ref],
        "facets": facets or {},
        "facts": facts or [],
        "metrics": {},
    }


def link(
    source: str,
    target: str,
    kind: str,
    family: str,
    evidence: str,
    ref: str,
    facets: dict[str, list[str]] | None = None,
    facts: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    return {
        "source": source,
        "target": target,
        "kind": kind,
        "family": family,
        "evidence": evidence,
        "releaseRef": ref,
        "facets": facets or {},
        "facts": facts or [],
    }


def fact(name: str, value: Any, evidence: str, ref: str) -> dict[str, str]:
    return {"name": name, "value": str(value), "evidence": evidence, "releaseRef": ref}


def sourced_facts(name: str, values: Iterable[SourcedText], ref: str) -> list[dict[str, str]]:
    return [fact(name, value.value, value.evidence.quote, ref) for value in values]


def attribute_facts(values: Iterable[Attribute], ref: str) -> list[dict[str, str]]:
    return [fact(value.name, value.value, value.evidence.quote, ref) for value in values]


def geography_facts(values: Iterable[Geography], ref: str) -> list[dict[str, str]]:
    return [fact(f"geography_{value.role}", value.name, value.evidence.quote, ref) for value in values]


def period_facts(value: Period | None, ref: str) -> list[dict[str, str]]:
    if value is None:
        return []
    result = [fact("period", value.text, value.evidence.quote, ref)]
    if value.start:
        result.append(fact("period_start", value.start.isoformat(), value.evidence.quote, ref))
    if value.end:
        result.append(fact("period_end", value.end.isoformat(), value.evidence.quote, ref))
    return result


def money_facts(value: Money | None, ref: str) -> list[dict[str, str]]:
    if value is None:
        return []
    result = [fact("amount", value.text, value.evidence.quote, ref)]
    for source, name in (("currency", "amount_currency"), ("amount", "amount_normalized"), ("qualifier", "amount_qualifier")):
        normalized = getattr(value, source)
        if normalized is not None:
            result.append(fact(name, normalized, value.evidence.quote, ref))
    return result


def action_facts(action: Action, ref: str) -> list[dict[str, str]]:
    return [
        *money_facts(action.amount, ref),
        *([fact("duration", action.duration, action.evidence.quote, ref)] if action.duration else []),
        *period_facts(action.period, ref),
        *geography_facts(action.geographies, ref),
        *attribute_facts(action.attributes, ref),
    ]


def label(value: str) -> str:
    return value.replace("_", " ").title()


def write_graph(path: Path, graph: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as temporary:
        json.dump(graph, temporary, ensure_ascii=False, indent=2)
        temporary.write("\n")
        temporary_path = Path(temporary.name)
    os.replace(temporary_path, path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Project current SQLite extractions into the application graph.")
    parser.add_argument("--db", type=Path, default=Path("data/sfc.sqlite3"))
    parser.add_argument("--output", type=Path, default=Path("data/graph.json"))
    parser.add_argument("--model", default=os.environ.get("OPENAI_MODEL", DEFAULT_MODEL))
    parser.add_argument("--language", default="EN")
    args = parser.parse_args()
    with Database(args.db) as database:
        write_graph(args.output, export_graph(database, args.model, args.language))


if __name__ == "__main__":
    main()
