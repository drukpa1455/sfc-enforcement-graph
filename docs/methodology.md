# Methodology

## Pipeline

```text
public SFC API
    ↓ sync
raw release + version metadata in SQLite
    ↓ extract
typed source-relative records + exact evidence
    ↓ export
deterministic graph.json
    ↓ serve
replaceable Graphology analytics
```

### 1. Synchronize

The sync client reads the SFC enforcement-news search and content endpoints.
SQLite stores the release body, language, issue date, modification time, and
full-sync state. Changed version metadata triggers a new download; unchanged
releases are not rewritten. Requests have bounded timeouts and three total
attempts for transient failures.

### 2. Extract

Each model call receives one release and may use only that release. The typed
schema captures mentions, matters, risks, actions, relationships, attributes,
money, periods, geography, statuses, and evidence.

One extraction task permits at most one provider request. Model validation and
transport failures are surfaced without retry so call budgets remain explicit;
their diagnostics and available usage are retained, and replay is an operator
decision.

Risk and action types are controlled vocabularies. Each type owns one stable
family, derived by code rather than extracted separately. A concise
source-grounded label preserves detail beyond the controlled type. Relationship
predicates and attributes retain source-specific detail; their controlled kind
or owning node type is the stable query dimension. Geography records only an
actual source-stated relationship, never a place that merely appears in a name.

Every evidence quote must be an exact contiguous substring of the title or
release text. An unsupported optional period is discarded without discarding
its containing evidence-backed relationship, risk, or action; other invalid
evidence rejects the extraction. SQLite records the extraction schema version,
model, run identifier, and usage so stale outputs can be identified and
replaced deliberately.

### 3. Resolve identity and export

The extraction explicitly distinguishes named entities from descriptive mentions.
Named people, organizations, funds, and instruments are coalesced only by kind
plus normalized name; normalization folds case and spacing and ignores a leading
English definite article. Descriptive parties, unnamed people, generic groups,
and context-dependent references remain release-local. Capitalization is not an
identity signal. This is conservative string identity, not verified real-world
entity resolution.

Descriptions remain source-relative evidence-backed facts. Once an entity spans
multiple releases its display summary becomes neutral, so whichever release is
exported first does not silently become its canonical description.

The exporter produces nodes, explicit directed links, source releases, facets,
facts, and evidence. Ordering and identifiers are deterministic. Rebuilding
`data/graph.json` from the same SQLite state produces the same projection.
Graphology derives metrics when the application starts; analytics are not
persisted in the projection and can be rebuilt without extraction.

Risk families are market misconduct, fraud and dishonesty, financial crime,
licensing and fitness, client protection, systems and controls, governance and
oversight, disclosure and reporting, cybersecurity, legal process, and other.
Action families are investigative, proceeding, procedural, decision,
protective, remedial, sanction, administrative, and other.

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
| Component | Stable identifier derived from the component's canonical first node |
| PageRank | PageRank over the hub-filtered semantic graph |
| Betweenness | Normalized exact betweenness centrality |
| Core | Highest k-core containing the node |
| Community | Louvain community identifier |

Metrics are derived and replaceable. Rank exposes release count, degree,
PageRank, betweenness, and core individually. Component and community are
bounded structural views rather than rankable scores. None measures wrongdoing,
materiality, credibility, or causal importance.

## Boundaries and limitations

- Coverage is limited to releases synchronized and successfully extracted into
  the deployed projection; `/api/v1/metrics` reports the current date range.
- Model extraction can omit or misclassify source language despite schema and
  evidence validation.
- Explicit named-entity classification can be wrong; exact-name coalescing can
  join namesakes or miss spelling variants.
- A release may describe allegations, procedural steps, findings, or outcomes;
  the status must travel with any interpretation.
- The original SFC release remains the authoritative source.
