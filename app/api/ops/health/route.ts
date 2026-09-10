import { NextResponse } from "next/server";
import { getObservabilityConfig } from "../../../../lib/infrastructure/observability";

export const runtime = "nodejs";

export async function GET() {
  const config = getObservabilityConfig();
  const healthy = config.openAiConfigured && (!config.ragEnabled || config.vectorStoreConfigured);

  return NextResponse.json(
    {
      ok: healthy,
      service: "blotori",
      timestamp: new Date().toISOString(),
      dependencies: {
        openai: config.openAiConfigured ? "configured" : "missing",
        rag: config.ragEnabled ? "enabled" : "disabled",
        vectorStore: config.vectorStoreConfigured ? "configured" : "missing",
      },
      model: config.model,
      ragCategories: config.ragCategories,
    },
    { status: healthy ? 200 : 503 },
  );
}
