import type { BlogDraft, BlogSection } from "./types";

export type SectionMoveDirection = "up" | "down";

export function editableSectionIds(draft: Pick<BlogDraft, "sections">): string[] {
  return draft.sections.filter((section) => section.presentation?.visualStyle !== "glossary").map((section) => section.id);
}

function sameIds(current: string[], requested: string[]): boolean {
  return current.length === requested.length
    && new Set(requested).size === requested.length
    && current.every((id) => requested.includes(id));
}

function reorderVisibleSections(sections: BlogSection[], orderedIds: string[]): BlogSection[] {
  const byId = new Map(sections.map((section) => [section.id, section]));
  let cursor = 0;
  return sections.map((section) => section.presentation?.visualStyle === "glossary"
    ? section
    : byId.get(orderedIds[cursor++])!);
}

function reorderLayoutPlan(draft: BlogDraft, orderedIds: string[]): BlogDraft["contentLayoutPlan"] {
  const plan = draft.contentLayoutPlan;
  if (!plan || plan.version !== 1 || !Array.isArray(plan.sections)) return plan;
  const planIds = plan.sections.map((section) => section?.id);
  if (planIds.some((id) => typeof id !== "string") || !sameIds(orderedIds, planIds as string[])) return plan;
  const byId = new Map(plan.sections.map((section) => [section.id, section]));
  return {
    ...plan,
    sections: orderedIds.map((id, index) => ({ ...byId.get(id)!, priority: index + 1 })),
  };
}

/** Reorder only section arrays. Paragraphs, images, image anchors, and asset references are untouched. */
export function applyDraftSectionOrder(draft: BlogDraft, orderedIds: string[]): BlogDraft {
  const current = editableSectionIds(draft);
  if (!sameIds(current, orderedIds) || current.every((id, index) => id === orderedIds[index])) return draft;
  return {
    ...draft,
    sections: reorderVisibleSections(draft.sections, orderedIds),
    contentLayoutPlan: reorderLayoutPlan(draft, orderedIds),
  };
}

export function moveDraftSection(draft: BlogDraft, sectionId: string, direction: SectionMoveDirection): BlogDraft {
  const current = editableSectionIds(draft);
  const from = current.indexOf(sectionId);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= current.length) return draft;
  const next = [...current];
  [next[from], next[to]] = [next[to], next[from]];
  return applyDraftSectionOrder(draft, next);
}
