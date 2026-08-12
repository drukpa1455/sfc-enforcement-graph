# Quickstart

## Requirements

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- Node.js 22+
- an OpenAI API key for extraction and chat

```bash
git clone https://github.com/drukpa1455/sfc-enforcement-graph.git
cd sfc-enforcement-graph
uv sync --group dev
npm ci
```

Set the key without committing it:

```bash
export OPENAI_API_KEY=...
```

## Run the included graph

```bash
npm run dev
```

Open the application at `http://localhost:5173` and these docs at
`http://localhost:5173/docs/`. The API is proxied to the Hono server on port
`8787`.

## Rebuild the dataset

The repository includes a current SQLite database and graph projection. To
rebuild them from source:

```bash
uv run sfc-graph-sync --full
uv run sfc-graph-extract --full --workers 4
uv run sfc-graph-export
```

Extraction makes model calls. Use `--limit N` before a full run when validating
configuration or cost.

## Verify the repository

```bash
uv run pytest -q
npm test
npm run lint
npm run build
```
