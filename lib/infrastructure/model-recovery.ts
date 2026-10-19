import { ModelUnavailableError } from "./model-unavailable-error";

/** A product supplies an audited price/capability catalog and durable store.
 * This module does not guess capabilities or prices from model IDs. */
export interface RecoveryCandidate {
  id: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  compatible: boolean;
}
export interface ModelState { id: string; version: number; }
export interface RecoveryStore {
  read(): Promise<ModelState>;
  /** Atomically replace only when the current ID and version still match. */
  compareAndSwap(expected: ModelState, nextId: string): Promise<boolean>;
}
export interface RecoveryDependencies<T> {
  store: RecoveryStore;
  generate(model: string): Promise<T>;
  validate(response: T): boolean;
  listModels(): Promise<ReadonlyArray<string>>;
  candidates: ReadonlyArray<RecoveryCandidate>;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  maximumEstimatedUsd: number;
}
export type RecoveryResult<T> = {
  response: T;
  model: string;
  persistence: "unchanged" | "replaced" | "conflict";
};

export async function generateWithModelRecovery<T>(
  d: RecoveryDependencies<T>,
): Promise<RecoveryResult<T>> {
  const active = await d.store.read();
  try {
    const response = await d.generate(active.id);
    if (!d.validate(response)) throw new Error("MODEL_RESPONSE_CONTRACT_INVALID");
    return { response, model: active.id, persistence: "unchanged" };
  } catch (error) {
    // Never list models for anything other than an explicitly classified failure
    // of the very model that this request used.
    if (!(error instanceof ModelUnavailableError) || error.modelId !== active.id) {
      throw error;
    }

    const available = new Set(await d.listModels());
    const input = d.estimatedInputTokens;
    const output = d.estimatedOutputTokens;
    const budget = d.maximumEstimatedUsd;
    if (![input, output, budget].every((v) => Number.isFinite(v) && v >= 0)) {
      throw new Error("MODEL_RECOVERY_PRICING_INVALID");
    }
    const priced = d.candidates
      .filter((c) => c.compatible && c.id !== active.id && available.has(c.id))
      .filter((c) => Number.isFinite(c.inputUsdPerMillion) && c.inputUsdPerMillion >= 0 &&
        Number.isFinite(c.outputUsdPerMillion) && c.outputUsdPerMillion >= 0)
      .map((c) => ({ id: c.id, cost: (input * c.inputUsdPerMillion + output * c.outputUsdPerMillion) / 1_000_000 }))
      .filter((c) => c.cost <= budget)
      .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
    if (!priced.length) throw new Error("MODEL_RECOVERY_NO_APPROVED_CANDIDATE");

    // Only one alternate generation attempt, no silent loop through candidates.
    const selected = priced[0].id;
    const response = await d.generate(selected);
    if (!d.validate(response)) throw new Error("MODEL_RECOVERY_RESPONSE_INVALID");
    const swapped = await d.store.compareAndSwap(active, selected);
    return { response, model: selected, persistence: swapped ? "replaced" : "conflict" };
  }
}
