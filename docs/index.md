# SFC Enforcement Graph

Explore entities, actions, risks, matters, and source evidence from public Hong
Kong SFC enforcement releases. The graph and research agent share one bounded,
reversible view of the same data.

<a href="/" class="md-button md-button--primary">Open the graph</a>
[Query the API](api.md){ .md-button }

!!! note "Independent project"

    This project is independent of the SFC. Graph proximity is not evidence of
    misconduct, and the data is not legal or investment advice.

```text
SFC releases → SQLite → typed extraction → graph.json → Graphology analytics
                                                               ↓
                                   graph UI ↔ research agent ↔ read-only API
```

## Start here

- [Quickstart](quickstart.md) runs the application and documentation locally.
- [Using the graph](usage.md) explains navigation, filtering, and agent actions.
- [Methodology](methodology.md) defines extraction, identity, evidence, and metrics.
- [API](api.md) documents bounded queries, OpenAPI, and the complete JSON download.
- [Operations](operations.md) covers refresh, verification, and deployment.

## Ownership

SQLite is the source of truth. `data/graph.json` is a deterministic, replaceable
projection. The browser and public API are readers; neither owns canonical data.
