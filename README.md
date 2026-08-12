# qf-sfc

SFC enforcement releases distilled into an evidence-backed graph.

```text
SFC API → releases ──references──> releases
             │
             └→ extraction
                  ├→ mentions ──relationships──> mentions
                  ├→ matters
                  ├→ risks   ──belongs_to──────> matters
                  └→ actions ──belongs_to──────> matters
```

SQLite owns raw releases, versioned extraction JSON, sync state, and deterministic
release links. Extraction owns only source-relative mentions and assertions.
Canonical entities and matters are a later resolution phase; they must not be
invented by the document extractor.

```bash
uv sync --group dev
uv run qf-sfc-pull --limit 50
uv run qf-sfc-extract --limit 1
uv run pytest -q
```
