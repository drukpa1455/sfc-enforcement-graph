# SFC Enforcement Graph

Explore connected entities, actions, and evidence from Hong Kong SFC enforcement
releases with an interactive graph and grounded research agent.

```text
SFC releases → SQLite → typed extraction → graph.json
                                               ↓
                                  graph UI ↔ research agent
```

## What it does

- Pulls public enforcement releases from the SFC.
- Stores source text, extraction versions, and sync state in SQLite.
- Projects source-linked mentions and assertions into a deterministic graph.
- Lets the agent search, inspect, expand, and trace the graph while keeping every
  filter reversible.

SQLite is the source of truth. `data/graph.json` is a replaceable projection
produced by `qf-sfc-export`; the browser never owns canonical graph data.

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
uv run qf-sfc-pull --limit 50
uv run qf-sfc-extract --limit 20
uv run qf-sfc-export
```

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
