# Methodology

## Pipeline

```text
public SFC API
    ↓ sync
raw release + version metadata in SQLite
    ↓ extract
typed source-relative records + exact evidence
    ↓ export
deterministic graph + replaceable analytics
```

### 1. Synchronize

The sync client reads the SFC enforcement-news search and content endpoints.
SQLite stores the release body, language, issue date, modification time, and
full-sync state. Changed version metadata triggers a new download; unchanged
releases are not rewritten. Requests have bounded timeouts and three retries for
transient failures.

### 2. Extract

Each model call receives one release and may use only that release. The typed
schema captures mentions, matters, risks, actions, relationships, attributes,
money, periods, geography, statuses, and evidence.

Every evidence quote must be an exact contiguous substring of the title or
release text. Invalid evidence rejects the extraction. SQLite records the
extraction schema version, model, run identifier, and usage so stale outputs can
be identified and replaced deliberately.

### 3. Resolve identity and export

Probable proper names are coalesced only by kind plus exact normalized name.
Descriptive parties, unnamed people, and generic groups remain release-local.
This is conservative string identity, not verified real-world entity resolution.

The exporter produces nodes, explicit directed links, source releases, facets,
facts, and evidence. Ordering and identifiers are deterministic. Rebuilding
`data/graph.json` from the same SQLite state produces the same projection.

## Graph semantics

| Family | Meaning |
|---|---|
| Evidence | A release mentions, reports, asserts, or references a node |
| Participation | A sourced role connects an entity to a matter, risk, or action |
| Relationship | The release explicitly states a relationship between entities |

No inferred shortcut edge is stored. Neighborhood and path queries traverse
existing semantic links and return the underlying evidence-bearing edges.

## Metrics

Analytics exclude document edges and authority hubs by default so regulator and
release nodes do not dominate semantic topology.

| Metric | Definition |
|---|---|
| Degree | Direct semantic neighbors |
| Release count | Distinct source releases attached to a node |
| Component size | Nodes in the same semantic connected component |
| Component | Stable identifier of the semantic connected component |
| PageRank | PageRank over the hub-filtered semantic graph |
| Betweenness | Normalized exact betweenness centrality |
| Core | Highest k-core containing the node |
| Community | Louvain community identifier |

Metrics are derived and replaceable. They rank graph structure; they do not
measure wrongdoing, materiality, credibility, or causal importance.

## Boundaries and limitations

- Coverage is limited to releases synchronized and successfully extracted into
  the deployed projection; `/api/v1/metrics` reports the current date range.
- Model extraction can omit or misclassify source language despite schema and
  evidence validation.
- Exact-name coalescing can join namesakes or miss spelling variants.
- A release may describe allegations, procedural steps, findings, or outcomes;
  the status must travel with any interpretation.
- The original SFC release remains the authoritative source.
