# Blotori Environment & Secret Contract

## Common TORI local filenames

- `.env.example`: committed variable template
- `.env.local`: real local values, ignored by Git
- Render: use the same variable names in Secret/Environment settings

The project must not treat `.env`, `.env.txt`, `.env.local.txt`, or other ad-hoc files as canonical local configuration.

## Runtime variables

| Variable | Type | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Secret | OpenAI Responses / File Search |
| `OPENAI_MODEL` | Config | Text generation model |
| `OPENAI_VECTOR_STORE_ID` | Config | File Search vector store |
| `BLOTORI_RAG_ENABLED` | Config | RAG feature gate |
| `BLOTORI_RAG_CATEGORIES` | Config | Eligible RAG categories |
| `BLOTORI_RAG_MAX_RESULTS` | Config | File Search result cap |
| `BLOTORI_KNOWLEDGE_DIR` | Config | Local knowledge-base root |
| `BLOTORI_KNOWLEDGE_PROFILE` | Config | commercial/research source policy |

`OPENAI_API_KEY` is the only current secret in this inventory. The remaining values are non-secret configuration unless a future provider contract changes that classification.

## Local behavior

- Next.js automatically reads `.env.local`.
- `scripts/sync-knowledge-base.mjs` explicitly reads only `.env.local`.
- Knowledge sync may update `OPENAI_VECTOR_STORE_ID`, `BLOTORI_RAG_ENABLED`, and `BLOTORI_KNOWLEDGE_PROFILE` in `.env.local`.
- Actual values must never be committed or copied into docs/logs.

New environment variables require updates to `.env.example`, this document, and `configs/environment-contract.json`.
