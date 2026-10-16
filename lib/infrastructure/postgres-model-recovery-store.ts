import type { ModelState, RecoveryStore } from "./model-recovery";

/**
 * Durable model selection for deployments backed by PostgreSQL.
 *
 * The caller owns the database connection/pool and runs the migration first.
 * An update succeeds only for the exact (id, version) pair observed by read().
 * This module deliberately has no environment-variable fallback or implicit
 * schema creation: persistence failures must stop recovery, not silently
 * select a model in memory.
 */
export interface ParameterizedSql {
  query<T extends object>(
    sql: string,
    values: readonly (string | number)[],
  ): Promise<{ rows: T[] }>;
}

type StateRow = { model_id: string; version: number | string };
type UpdatedRow = { version: number | string };

function checkedVersion(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("MODEL_STORE_INVALID_VERSION");
  }
  return parsed;
}

function checkedModelId(value: string): string {
  if (!value || !value.trim() || value !== value.trim() || value.length > 160) {
    throw new Error("MODEL_STORE_INVALID_ID");
  }
  return value;
}

export class PostgresModelRecoveryStore implements RecoveryStore {
  constructor(
    private readonly db: ParameterizedSql,
    private readonly namespace = "blotori-draft-generation",
  ) {
    checkedModelId(namespace);
  }

  async read(): Promise<ModelState> {
    const { rows } = await this.db.query<StateRow>(
      "SELECT model_id, version FROM blotori_model_state WHERE namespace = $1",
      [this.namespace],
    );
    if (rows.length !== 1) throw new Error("MODEL_STORE_UNINITIALIZED");
    return {
      id: checkedModelId(rows[0].model_id),
      version: checkedVersion(rows[0].version),
    };
  }

  async compareAndSwap(expected: ModelState, nextId: string): Promise<boolean> {
    checkedModelId(expected.id);
    checkedVersion(expected.version);
    checkedModelId(nextId);
    const { rows } = await this.db.query<UpdatedRow>(
      `UPDATE blotori_model_state
       SET model_id = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE namespace = $2 AND model_id = $3 AND version = $4
       RETURNING version`,
      [nextId, this.namespace, expected.id, expected.version],
    );
    if (rows.length > 1) throw new Error("MODEL_STORE_DUPLICATE_STATE");
    if (rows.length === 1) {
      const actual = checkedVersion(rows[0].version);
      if (actual !== expected.version + 1) throw new Error("MODEL_STORE_INVALID_VERSION");
    }
    return rows.length === 1;
  }
}
