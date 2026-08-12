from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

from qf_sfc.models import SCHEMA_VERSION, ReleaseExtraction
from qf_sfc.store import Database

SOURCE_URL = "https://apps.sfc.hk/edistributionWeb/gateway/EN/news-and-announcements/news/enforcement-news/doc?refNo="
DEFAULT_MODEL = "gpt-5.6"


def export_graph(
    database: Database, model: str = DEFAULT_MODEL, language: str = "EN"
) -> dict[str, list[dict[str, Any]]]:
    nodes: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []
    releases: list[dict[str, Any]] = []
    known_releases: set[str] = set()

    for raw, data in database.extractions(SCHEMA_VERSION, model, language):
        extraction = ReleaseExtraction.model_validate(data)
        ref = raw["newsRefNo"]
        known_releases.add(ref)
        release_id = f"release:{ref}"
        nodes.append(node(release_id, f"{ref} · {raw['title'].strip()}", "release", raw["title"], ref))
        releases.append(
            {
                "ref": ref,
                "title": raw["title"].strip(),
                "issueDate": raw["issueDate"],
                "url": SOURCE_URL + ref,
            }
        )
        project_release(ref, extraction, nodes, links)

    for source_ref, target_ref in database.release_links(known_releases):
        target_id = f"release:{target_ref}"
        if target_ref not in known_releases:
            nodes.append(node(target_id, target_ref, "release", "Referenced SFC release not stored locally.", target_ref))
            known_releases.add(target_ref)
        links.append(link(f"release:{source_ref}", target_id, "references", "Related SFC release", source_ref))

    return {"nodes": nodes, "links": links, "releases": releases}


def project_release(
    ref: str,
    extraction: ReleaseExtraction,
    nodes: list[dict[str, Any]],
    links: list[dict[str, Any]],
) -> None:
    mention_ids = {mention.id: f"mention:{ref}:{mention.id}" for mention in extraction.mentions}
    matter_ids = {matter.id: f"matter:{ref}:{matter.id}" for matter in extraction.matters}

    for mention in extraction.mentions:
        mention_id = mention_ids[mention.id]
        kind = {"person_group": "group", "financial_instrument": "instrument"}.get(
            mention.type, mention.type
        )
        nodes.append(node(mention_id, mention.name, kind, mention.description, ref))
        links.append(
            link(
                f"release:{ref}",
                mention_id,
                "primary_mention" if mention.relevance == "primary" else "mentions",
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
                relationship.evidence.quote,
                ref,
            )
        )

    for matter in extraction.matters:
        matter_id = matter_ids[matter.id]
        nodes.append(node(matter_id, matter.kind.replace("_", " ").title(), "matter", matter.description, ref))
        links.append(link(f"release:{ref}", matter_id, "reports", matter.evidence.quote, ref))
        connect(links, mention_ids, matter.authority_ids, matter_id, "authority_for", matter.evidence.quote, ref)
        connect(links, mention_ids, matter.subject_ids, matter_id, "subject_of", matter.evidence.quote, ref)

    for risk in extraction.risks:
        risk_id = f"risk:{ref}:{risk.id}"
        nodes.append(node(risk_id, risk.category.replace("_", " ").title(), "risk", risk.description, ref))
        links.append(link(f"release:{ref}", risk_id, "asserts", risk.evidence.quote, ref))
        if risk.matter_id:
            links.append(link(risk_id, matter_ids[risk.matter_id], "belongs_to", risk.evidence.quote, ref))
        connect(links, mention_ids, risk.authority_ids, risk_id, "authority_for", risk.evidence.quote, ref)
        connect(links, mention_ids, risk.subject_ids, risk_id, "subject_of", risk.evidence.quote, ref)
        connect(links, mention_ids, risk.affected_ids, risk_id, "affected_by", risk.evidence.quote, ref)

    for action in extraction.actions:
        action_id = f"action:{ref}:{action.id}"
        nodes.append(node(action_id, action.type.replace("_", " ").title(), "action", action.description, ref))
        links.append(link(f"release:{ref}", action_id, "reports", action.evidence.quote, ref))
        if action.matter_id:
            links.append(link(action_id, matter_ids[action.matter_id], "belongs_to", action.evidence.quote, ref))
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
    links.extend(link(mention_ids[mention], target, kind, evidence, ref) for mention in mentions)


def node(id: str, label: str, kind: str, summary: str, ref: str) -> dict[str, Any]:
    return {"id": id, "label": label, "kind": kind, "summary": summary, "releaseRefs": [ref]}


def link(source: str, target: str, kind: str, evidence: str, ref: str) -> dict[str, str]:
    return {"source": source, "target": target, "kind": kind, "evidence": evidence, "releaseRef": ref}


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
