# Operations

## Refresh data

Establish the complete archive baseline once:

```bash
uv run sfc-graph-sync --full
```

Subsequent refreshes reconcile release metadata and fetch only changed content:

```bash
uv run sfc-graph-sync
uv run sfc-graph-extract --full --workers 4
uv run sfc-graph-export
```

Extraction defaults to one stale or missing release. `--full` processes every
stale or missing release; `--force` intentionally replaces current outputs.
`--workers N` bounds concurrent model calls while SQLite writes remain
serialized. Each release permits at most one provider request and no transport
retry; failed releases remain stale for deliberate replay. Use `--ref REFERENCE`
for a specific release.

## Source and repair semantics

| Artifact | Role | Repair |
|---|---|---|
| `data/sfc.sqlite3` | Canonical raw releases, extractions, versions, and sync state | Re-sync changed sources; re-extract stale outputs |
| `data/graph.json` | Replaceable application and API projection | Run `sfc-graph-export` |
| `public/docs/` | Ignored generated documentation | Run `npm run docs` |
| `dist/` | Ignored production application | Run `npm run build` |

Export writes atomically. A failed extraction is not presented as a current
record, and a failed export does not make the browser authoritative.

## Environment

| Variable | Purpose | Default |
|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI v1 endpoint | required for model calls |
| `AZURE_OPENAI_API_KEY` | Extraction and research-agent model calls | required for model calls |
| `AZURE_OPENAI_MODEL` | Extraction and chat model | `gpt-5.6-sol` |
| `CHAT_REQUESTS_PER_MINUTE` | Per-process chat admission budget | `12` |
| `PORT` | Production Hono port | `8787` |

The public graph API performs no model calls and requires no credential.

## Build and deploy

```bash
npm run build
npm start
```

The build validates TypeScript, renders MkDocs into `public/docs/`, and then
builds Vite. Hono serves the application, `/docs/`, and `/api/v1`; `/docs`
redirects to the canonical trailing-slash path.

Railway reads `railway.json`, runs the same build, starts Hono, and checks
`/api/health`. Configure the Azure endpoint and key, optional model and chat
budget, and a hard provider spend limit before enabling public chat.

## Verify

```bash
uv run pytest -q
npm test
npm run lint
npm run build
```

The production health check proves process readiness. It does not prove that an
external model provider or the upstream SFC service is available.
