# API

The versioned API is public, read-only, CORS-enabled, and backed by the same
validated graph used by the interface and agent. It performs no model calls.

```bash
BASE_URL=http://localhost:8787/api/v1
curl "$BASE_URL/metrics"
```

Successful responses include `X-API-Version: 1` and cache headers. Query
failures return HTTP `400`; unknown nodes return `404`.

## Discover

```http
GET /api/v1/
```

Returns the API name, version, and endpoint names.

## OpenAPI

```http
GET /api/v1/openapi.json
```

Returns the generated OpenAPI 3.1 contract. Route definitions, request
validation, and the document share one source of truth.

```bash
curl -L "$BASE_URL/openapi.json" -o openapi.json
```

## Download the graph

```http
GET /api/v1/graph
GET /api/v1/graph?download=1
```

The response contains `nodes`, `links`, and `releases`. `download=1` adds a JSON
attachment filename.

```bash
curl -L "$BASE_URL/graph?download=1" -o sfc-enforcement-graph.json
```

The unversioned `GET /api/graph` remains for the application. External consumers
should use `/api/v1/graph`.

## Graph metrics

```http
GET /api/v1/metrics
```

Returns coverage dates, node/link/release totals, node-kind and edge-family
distributions, connected-component counts, metric definitions, and rankable
metric names.

## Search

```http
GET /api/v1/search?q=Futu%20Securities&limit=5
```

| Parameter | Bounds | Default |
|---|---:|---:|
| `q` | 1–200 characters | required |
| `limit` | 1–50 | 12 |

Search covers labels, summaries, kinds, facets, and sourced facts.

## Inspect a node

```http
GET /api/v1/nodes/{id}
```

Returns the node, all immediate links, neighboring node IDs, and its source
releases. URL-encode the graph ID.

```bash
curl "$BASE_URL/nodes/$(python -c 'import urllib.parse; print(urllib.parse.quote("release:26PR119", safe=""))')"
```

## Traverse a neighborhood

```http
GET /api/v1/neighborhood?id={id}&depth=2&limit=80&includeHubs=false
```

| Parameter | Bounds | Default |
|---|---:|---:|
| `id` | existing graph ID | required |
| `depth` | 1–3 hops | 2 |
| `limit` | 1–200 nodes | 80 |
| `includeHubs` | `true` or `false` | `false` |

The result contains a bounded subgraph, hop counts for people and groups, and a
`truncated` flag. Evidence edges and authority/document hubs are excluded from
traversal by default.

## Expand nodes

```http
GET /api/v1/expand?ids={id},{id}
```

Adds one semantic relationship hop around one to 24 comma-separated graph IDs,
preserving the seed nodes. The response contains a bounded subgraph and a
`truncated` flag.

## Trace a path

```http
GET /api/v1/trace?source={id}&target={id}
```

Returns the shortest evidence-backed semantic path between two nodes, regardless
of link direction. Both endpoints must exist; disconnected endpoints return
HTTP `404`.

## Inspect a community

```http
GET /api/v1/communities/{id}
```

Returns the highest-PageRank members of the node's Louvain community as a
bounded subgraph. Community membership is a structural clue, not evidence of a
relationship or misconduct.

## Inspect a connected component

```http
GET /api/v1/components/{id}
```

Returns at most 80 members of the node's complete connected component. The seed
is retained and remaining members are ordered by PageRank. The response reports
whether the component was truncated. Connectivity is a structural clue, not
evidence of a direct relationship or misconduct.

## Rank nodes

```http
GET /api/v1/rank?metric=pagerank&kind=person&limit=10&includeHubs=false
```

| Parameter | Values | Default |
|---|---|---|
| `metric` | `pagerank`, `betweenness`, `core`, `degree`, `releaseCount` | required |
| `kind` | one documented node kind | all kinds |
| `limit` | 1–50 | 12 |
| `includeHubs` | `true` or `false` | `false` |

The API ranks one metric at a time; it does not combine unlike signals into an
opaque score.

## Stability

`/api/v1` preserves endpoint names, required fields, and field meaning. New
optional fields may appear. Dataset refreshes can add, remove, or correct graph
records. Persist source references and graph IDs together when retaining results.
