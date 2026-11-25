import type { ContentGenerationPort } from "../application/content-generation-port";
import { makeMockDraft } from "./mock-content-adapter";
import { generateWithOpenAI } from "./openai-content-adapter";

export function resolveContentGenerationPort(): ContentGenerationPort {
  if (process.env.OPENAI_API_KEY) {
    return { mode: "api", generate: generateWithOpenAI };
  }
  if (process.env.BLOTORI_MOCK_MODE === "true") {
    return { mode: "mock", generate: async (input, plan) => makeMockDraft(input, plan) };
  }
  throw new Error(
    "OPENAI_API_KEY가 서버에서 감지되지 않았습니다. 프로젝트 루트의 .env.local을 확인한 뒤 개발 서버를 완전히 종료하고 npm run dev로 다시 시작해 주세요.",
  );
}
