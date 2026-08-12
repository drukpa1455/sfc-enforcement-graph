# qf-sfc

An evidence-backed graph of SFC enforcement releases with a read-only research agent.

```text
SFC API → SQLite → typed extraction → canonical graph → Vite + Hono agent
```

SQLite owns raw releases, versioned extraction JSON, sync state, and deterministic
release links. Extraction owns source-relative mentions and assertions. Canonical
entities and matters are resolved later and exported to replaceable `data/graph.json`.

## Data pipeline

```sh
uv sync --group dev
uv run qf-sfc-pull --limit 50
uv run qf-sfc-extract --limit 1
uv run pytest -q
```

## Application

```sh
npm install
OPENAI_API_KEY=... npm run dev
```

Vite serves the UI on `http://localhost:5173`; it proxies `/api` to Hono on port `8787`.

```sh
npm test
npm run lint
npm run build
npm start
```

The research agent can search, inspect, expand, and trace the shortest
evidence-backed path. Each tool result carries a focused graph view.
