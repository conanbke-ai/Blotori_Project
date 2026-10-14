import type { GenerateRequest, GenerationContext } from "../domain/types";

export function composeGenerationRequest(
  base: GenerateRequest,
  context: GenerationContext,
  variationNonce?: string,
): GenerateRequest {
  return {
    ...base,
    ...context.overrides,
    ...(context.variationPrefix && variationNonce ? { variationNonce } : {}),
  };
}
