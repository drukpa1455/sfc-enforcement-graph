# qf-sfc

An evidence-backed graph of SFC enforcement releases with a read-only research agent.

```text
SFC → Python extraction → data/graph.json → Vite graph + Hono agent
```

## Run

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

`data/graph.json` is derived and replaceable. Its node IDs are the shared identity between the renderer and agent tools. The backend exporter owns generation; the TypeScript schema rejects duplicate IDs and unknown link endpoints.

The agent has four read-only tools: `search` finds nodes, `inspect` returns one immediate neighborhood, `expand` adds a relationship hop, and `trace` finds the shortest evidence-backed path between two nodes. Each tool result carries a focused graph view; **Show all** restores the complete graph.
