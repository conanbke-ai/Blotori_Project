# Model recovery persistence — integration gate

Status: **ADAPTER_ONLY / NOT_ENABLED**.

The PostgreSQL adapter in `lib/infrastructure/postgres-model-recovery-store.ts` implements `RecoveryStore`; it does **not** create a database, connect to one, select an approved model, or activate automatic retries.

## Prerequisites

1. Choose an operating PostgreSQL instance and configure a connection pool outside this module. Credentials must remain in deployment secrets, not Git.
2. Apply `db/migrations/0001_model_recovery_state.sql` through the deployment migration process. No default row is created.
3. Independently audit the initial model ID, feature compatibility (including Responses API, JSON output, file search where needed), and a current price/capability catalog. Insert the approved state row explicitly.
4. Inject a real parameterized `query(sql, values)` client into `PostgresModelRecoveryStore`.
5. Wire the existing `generateWithModelRecovery` only after the request path can pass the active model ID to the OpenAI adapter, validate the complete draft contract, and supply the approved candidate list and per-request maximum cost.
6. Record actual selected model, persistence result, and request ID. Do not claim the env configured model was used when fallback happened.

## Required offline gates (no paid generation)

- read of provisioned state; missing row is a hard error
- successful compare-and-swap increments version once
- stale ID or version returns false without changing state
- simulated database errors propagate; no memory-only fallback
- unauthorized/unpriced candidate never retried
- 400, 403, 429, 5xx, transport errors and malformed model errors never trigger recovery
- confirmed structured model-not-found triggers at most one approved alternate attempt
- alternate response contract failure does not persist the selected ID
- concurrent winners cannot both commit on the same version

Never enable this feature via the presence of a database URL alone. Require an explicit feature gate and integration tests. The local HTTPS smoke test must continue to block `/api/generate` paid requests.
