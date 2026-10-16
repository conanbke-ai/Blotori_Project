-- Apply manually to the deployment PostgreSQL database before enabling recovery.
-- No default model is inserted: an operator must explicitly approve the initial ID.
CREATE TABLE IF NOT EXISTS blotori_model_state (
    namespace text PRIMARY KEY,
    model_id text NOT NULL CHECK (length(btrim(model_id)) BETWEEN 1 AND 160 AND model_id = btrim(model_id)),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Provision only after an operator verifies the model ID and catalog:
-- INSERT INTO blotori_model_state (namespace, model_id)
-- VALUES ('blotori-draft-generation', '<approved-model-id>')
-- ON CONFLICT (namespace) DO NOTHING;
