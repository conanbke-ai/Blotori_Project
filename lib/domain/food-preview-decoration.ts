import type { BlogDraft, FoodPreviewDecoration } from "./types";

export function supportsFoodPreviewDecoration(draft: BlogDraft | null | undefined) {
  return draft?.contentLayoutPlan?.source.categoryId === "food"
    && draft.contentLayoutPlan.source.presetId === "restaurant-review";
}

export function readFoodPreviewDecoration(draft: BlogDraft | null | undefined): FoodPreviewDecoration {
  if (!supportsFoodPreviewDecoration(draft)) return "default";
  return draft?.presentation?.foodPreviewDecoration === "visit-guide" ? "visit-guide" : "default";
}

export function applyFoodPreviewDecoration(
  draft: BlogDraft,
  decoration: FoodPreviewDecoration,
): BlogDraft {
  if (!supportsFoodPreviewDecoration(draft)) return draft;
  if (readFoodPreviewDecoration(draft) === decoration) return draft;
  return {
    ...draft,
    presentation: {
      ...draft.presentation,
      foodPreviewDecoration: decoration,
    },
  };
}
