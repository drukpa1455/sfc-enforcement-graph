# SFC Enforcement Graph

Explore connected entities, actions, and evidence from Hong Kong SFC enforcement
releases with an interactive graph and grounded research agent.

```text
SFC releases → SQLite → typed extraction → graph.json
                                               ↓
                                  graph UI ↔ research agent
```

## What it does

- Syncs public enforcement releases from the SFC.
- Stores source text, extraction versions, and sync state in SQLite.
- Projects source-linked mentions, assertions, facets, and evidence-backed facts
  into a deterministic graph.
- Coalesces exact normalized probable proper names while leaving descriptive
  parties and generic groups source-local.
- Lets the agent search, inspect, expand, and trace the graph while keeping every
  filter reversible.
- Ranks recurrence, degree, PageRank, and sampled bridge centrality over the
  semantic graph, excluding document and authority hubs by default.
- Traverses bounded one- to three-hop neighborhoods without inventing shortcut
  edges; proximity is never treated as evidence of misconduct.
- Switches between a recent overview and the complete graph, with node- and
  edge-type filters for direct exploration.
- Opens with the latest 50 releases, primary subjects, matters, risks, and
  actions; the agent still queries and focuses the complete graph.

SQLite is the source of truth. `data/graph.json` is a replaceable projection
produced by `sfc-graph-export`; the browser never owns canonical graph data.
Specific risk, action, relationship, and attribute terms remain source-shaped;
controlled families support broad queries without erasing the original wording.

```text
src/sfc_enforcement_graph/  sync, extract, store, export
shared/     graph contract and pure queries
server/     HTTP and research agent
web/        React interface
```

## Run locally

Requires Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js 22+, and an
OpenAI API key for extraction and chat.

```sh
uv sync --group dev
npm install
export OPENAI_API_KEY=...
```

Build the dataset:

```sh
uv run sfc-graph-sync --full
uv run sfc-graph-extract --full --workers 4
uv run sfc-graph-export
```

Subsequent refreshes use the same straight-line workflow; sync reconciles all
release metadata but downloads and extracts only changed work:

```sh
uv run sfc-graph-sync
uv run sfc-graph-extract --full --workers 4
uv run sfc-graph-export
```

Use `--limit N` on sync or extraction for bounded samples. Extraction defaults
to one API call; `--full` processes every stale or missing release, while
`--full --force` intentionally replaces every current output.
`--workers N` bounds concurrent extraction calls; SQLite writes remain serialized.

Start the application:

```sh
npm run dev
```

Vite serves the UI at `http://localhost:5173` and proxies `/api` to Hono on port
`8787`.

## Deploy

Railway reads `railway.json`, builds the Vite client, starts the Hono server, and
checks `/api/health`. Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL`.

Chat accepts at most 12 requests per minute per server process. Override that
single-instance budget with `CHAT_REQUESTS_PER_MINUTE`, and set a hard monthly
spend limit with the model provider before making the service public.

## Verify

```sh
uv run pytest -q
npm test
npm run lint
npm run build
```

## Data and scope

The included dataset is derived from public [SFC enforcement
news](https://apps.sfc.hk/edistributionWeb/gateway/EN/news-and-announcements/news/enforcement-news/).
Source links remain attached to releases, nodes, and relationships. This project
is independent of the SFC and is not legal or investment advice.
