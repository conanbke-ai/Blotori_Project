import { FIELD_DEFINITIONS, getCategory, getPreset } from "./content-config";
import type { ContentLayoutPlan } from "./content-layout-plan-contract";
import type { BlogDraft, GenerateRequest } from "./types";

export const CATEGORY_INPUT_SUMMARY_SECTION_ID = "input-summary";

export interface CategoryInputSummaryItem {
  fieldId: string;
  label: string;
  value: string;
}

/**
 * Project only admitted user input. Callers must pass the already schema-filtered
 * generation input; this helper never fills, infers, or verifies a missing value.
 */
export function projectCategoryInputSummary(input: GenerateRequest): CategoryInputSummaryItem[] {
  if (input.categoryId === "food") return [];
  const category = getCategory(input.categoryId);
  if (!category) return [];
  const fieldIds = getPreset(input.categoryId, input.presetId)?.fieldIds ?? category.defaultFieldIds;
  return fieldIds.flatMap((fieldId) => {
    const field = FIELD_DEFINITIONS[fieldId];
    const value = input.attributes?.[fieldId];
    if (!field || typeof value !== "string" || !value.trim()) return [];
    return [{ fieldId, label: field.label, value: value.trim() }];
  });
}

export function formatCategoryInputSummaryRows(input: GenerateRequest): string[] {
  return projectCategoryInputSummary(input).map((item) => `${item.label}: ${item.value}`);
}

function countLiteralOccurrences(value: string, literal: string): number {
  if (!literal) return 0;
  return value.split(literal).length - 1;
}

export function validateInputSummaryAgainstGenerationInput(
  draft: BlogDraft,
  input: GenerateRequest,
  plan: ContentLayoutPlan,
): string[] {
  const expectedItems = projectCategoryInputSummary(input);
  const expectedRows = expectedItems.map((item) => `${item.label}: ${item.value}`);
  const planned = plan.sections.filter((section) => section.id === CATEGORY_INPUT_SUMMARY_SECTION_ID);
  const actual = draft.sections.filter((section) => section.id === CATEGORY_INPUT_SUMMARY_SECTION_ID);
  const reasons: string[] = [];

  if (expectedItems.length === 0) {
    if (planned.length > 0 || actual.length > 0) reasons.push("Input summary must be absent when no admitted user value exists.");
    return reasons;
  }
  if (planned.length !== 1) reasons.push("Input summary plan section is missing or duplicated.");
  if (actual.length !== 1) reasons.push("Input summary draft section is missing or duplicated.");
  const plannedSection = planned[0];
  const actualSection = actual[0];
  if (!plannedSection || !actualSection) return reasons;

  const expectedIds = expectedItems.map((item) => item.fieldId);
  if (JSON.stringify(plannedSection.optionalFactKeys) !== JSON.stringify(expectedIds)) {
    reasons.push("Input summary field order does not match admitted input.");
  }
  if (plannedSection.visualStyle !== "key-point"
    || plannedSection.paragraphRange[0] !== expectedRows.length
    || plannedSection.paragraphRange[1] !== expectedRows.length) {
    reasons.push("Input summary presentation contract is invalid.");
  }
  if (JSON.stringify(actualSection.paragraphs) !== JSON.stringify(expectedRows)) {
    reasons.push("Input summary rows do not exactly match admitted label/value input.");
  }
  const otherParagraphs = draft.sections
    .filter((section) => section.id !== CATEGORY_INPUT_SUMMARY_SECTION_ID)
    .flatMap((section) => section.paragraphs);
  for (const row of expectedRows) {
    const occurrences = otherParagraphs.reduce(
      (count, paragraph) => count + countLiteralOccurrences(paragraph, row),
      0,
    );
    if (occurrences !== 0) {
      reasons.push(`Input summary row must not repeat outside its section: ${row}`);
    }
  }
  return reasons;
}
