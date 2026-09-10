type LogLevel = "info" | "warn" | "error";

type LogEvent = {
  event: string;
  requestId?: string;
  durationMs?: number;
  status?: string;
  category?: string;
  platformId?: string;
  model?: string;
  ragEnabled?: boolean;
  ragUsed?: boolean;
  ragResultCount?: number;
  ragSourceCount?: number;
  errorCode?: string;
  message?: string;
};

function sanitizeText(value: unknown, max = 240) {
  if (typeof value !== "string") return undefined;
  return value.replace(/[\r\n\t]+/g, " ").slice(0, max);
}

export function createRequestId() {
  return crypto.randomUUID();
}

export function classifyError(error: unknown) {
  if (!(error instanceof Error)) return { code: "UNKNOWN_ERROR", message: "Unknown error" };
  const message = error.message || "Unknown error";
  const lower = message.toLowerCase();
  let code = "GENERATION_ERROR";
  if (lower.includes("openai_api_key")) code = "OPENAI_CONFIG_ERROR";
  else if (lower.includes("vector") || lower.includes("file_search")) code = "RAG_ERROR";
  else if (lower.includes("json")) code = "AI_RESPONSE_PARSE_ERROR";
  else if (lower.includes("timeout") || lower.includes("timed out")) code = "UPSTREAM_TIMEOUT";
  else if (lower.includes("rate") || lower.includes("429")) code = "UPSTREAM_RATE_LIMIT";
  return { code, message: sanitizeText(message) ?? code };
}

export function logEvent(level: LogLevel, input: LogEvent) {
  const payload = {
    timestamp: new Date().toISOString(),
    service: "blotori",
    level,
    ...input,
    message: sanitizeText(input.message),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function getObservabilityConfig() {
  return {
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    ragEnabled: process.env.BLOTORI_RAG_ENABLED !== "false",
    vectorStoreConfigured: Boolean(process.env.OPENAI_VECTOR_STORE_ID?.trim()),
    ragCategories: (process.env.BLOTORI_RAG_CATEGORIES || "health")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}
