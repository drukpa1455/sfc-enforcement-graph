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
- Projects source-linked mentions and assertions into a deterministic graph.
- Lets the agent search, inspect, expand, and trace the graph while keeping every
  filter reversible.

SQLite is the source of truth. `data/graph.json` is a replaceable projection
produced by `qf-sfc-export`; the browser never owns canonical graph data.

```text
src/qf_sfc/  sync, extract, store, export
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
uv run qf-sfc-sync --full
uv run qf-sfc-extract --full --workers 4
uv run qf-sfc-export
```

Subsequent refreshes use the same straight-line workflow; sync and extraction
skip unchanged work by default:

```sh
uv run qf-sfc-sync
uv run qf-sfc-extract --full --workers 4
uv run qf-sfc-export
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
