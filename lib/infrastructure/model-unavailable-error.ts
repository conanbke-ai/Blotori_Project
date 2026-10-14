import OpenAI from "openai";

/**
 * Strictly identify an OpenAI model-id failure.
 * Source: official openai-node APIError status classes and the documented
 * model_not_found error payload. Never infer replacement from HTTP status
 * alone, free-form message text, 403, 429, or network exceptions.
 */
export class ModelUnavailableError extends Error {
  readonly code = "MODEL_UNAVAILABLE" as const;
  constructor(readonly modelId: string, readonly upstreamRequestId?: string) {
    super("The configured OpenAI model is unavailable.");
    this.name = "ModelUnavailableError";
  }
}

export function isConfirmedModelNotFound(error: unknown): boolean {
  if (!(error instanceof OpenAI.APIError)) return false;
  if (error.status !== 404) return false;
  const body = error.error;
  if (!body || typeof body !== "object") return false;
  const payload = body as Record<string, unknown>;
  return payload.code === "model_not_found" &&
    payload.type === "invalid_request_error";
}

export function normalizeModelUnavailable(error: unknown, modelId: string): unknown {
  if (!isConfirmedModelNotFound(error)) return error;
  const requestID = error instanceof OpenAI.APIError ? error.requestID : undefined;
  return new ModelUnavailableError(modelId, requestID);
}
