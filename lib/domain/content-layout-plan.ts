import { getCategory, getPreset } from "./content-config";
import type {
  ContentIntent,
  ContentLayoutPlan,
  ContentLayoutSection,
  ContentPurposeField,
} from "./content-layout-plan-contract";
import type { BlogDraft, GenerateRequest, ImageRole, SectionVisualStyle, StructureId } from "./types";

const PURPOSE_FIELDS = ["goal", "learningGoal", "visitPurpose"] as const satisfies readonly ContentPurposeField[];

export interface ContentLayoutPlanBuildResult {
  plan: ContentLayoutPlan;
  /** A derived request admitted by the selected category/preset schema. The raw request is never mutated. */
  generationInput: GenerateRequest;
  warnings: string[];
}

export interface LayoutPlanValidation {
  ok: boolean;
  reasons: string[];
}

function structureIntent(value: StructureId | undefined): ContentIntent | undefined {
  if (value === "review" || value === "story") return "experience";
  if (value === "comparison") return "curation";
  if (value && value !== "auto" && value !== "custom") return "information";
}

function intentFromText(value: string): ContentIntent | undefined {
  if (/큐레이션|매거진|비교|선별|에디토리얼|핵심 평가|추천 대상|저장.?공유/.test(value)) return "curation";
  if (/사진.?중심|포토|에세이|장면|방문기|여행기|일상 기록|스토리|경험/.test(value)) return "experience";
  if (/가이드|체크리스트|정보|교육|정리|안내|실무|방법/.test(value)) return "information";
}

function resolvePurpose(input: GenerateRequest) {
  const category = getCategory(input.categoryId);
  const preset = getPreset(input.categoryId, input.presetId);
  const activeFields = new Set(preset?.fieldIds ?? category?.defaultFieldIds ?? []);
  const activePurposeFields = PURPOSE_FIELDS.filter((field) => activeFields.has(field));
  const suppliedPurposeFields = PURPOSE_FIELDS.filter((field) => Boolean(input.attributes?.[field]?.trim()));
  const warnings: string[] = [];

  // Current form definitions expose at most one purpose field per category/preset.
  // If that schema changes, avoid inventing a precedence rule.
  const schemaPurposeField = activePurposeFields.length === 1 ? activePurposeFields[0] : null;
  const purposeField = schemaPurposeField && suppliedPurposeFields.includes(schemaPurposeField) ? schemaPurposeField : null;
  if (activePurposeFields.length > 1) {
    warnings.push(`편집 계획 입력 확인: 활성 목적 필드가 여러 개라 목적값을 계획에 적용하지 않았어요 (${activePurposeFields.join(", ")}).`);
  }

  const excludedPurposeFields = suppliedPurposeFields.filter((field) => field !== purposeField);
  const inactivePurposeFields = suppliedPurposeFields.filter((field) => !activeFields.has(field));
  if (inactivePurposeFields.length > 0) {
    warnings.push(`편집 계획 입력 확인: 현재 카테고리·주제에서 사용하지 않는 목적 필드를 계획에서 제외했어요 (${inactivePurposeFields.join(", ")}).`);
  }

  return {
    purposeField,
    purposeValue: purposeField ? input.attributes?.[purposeField] ?? "" : "",
    excludedPurposeFields,
    warnings,
  };
}

function admittedGenerationInput(input: GenerateRequest, purpose: ReturnType<typeof resolvePurpose>): GenerateRequest {
  const attributes = Object.fromEntries(Object.entries(input.attributes ?? {})
    .filter(([key]) => !(PURPOSE_FIELDS as readonly string[]).includes(key)));
  if (purpose.purposeField) attributes[purpose.purposeField] = purpose.purposeValue;
  return { ...input, attributes };
}

function resolveIntent(input: GenerateRequest, purposeValue: string): ContentIntent {
  const categoryIntent: ContentIntent = ["food", "daily", "travel", "hobby"].includes(input.categoryId ?? "")
    ? "experience"
    : "information";
  const preset = getPreset(input.categoryId, input.presetId);
  let intent = structureIntent(preset?.recommendedStructureIds[0]) ?? categoryIntent;
  const styleIntent = input.styleId === "emotional-essay" || input.styleId === "casual-daily" || input.styleId === "honest-review"
    ? "experience"
    : input.styleId === "shareable-info" || input.styleId === "professional-column"
      ? "curation"
      : undefined;
  intent = styleIntent ?? intent;
  intent = intentFromText(purposeValue) ?? intentFromText(input.customStyle ?? "") ?? intent;
  if (input.blogDNA && input.blogDNAApply?.structure !== false && input.structureId === "auto") {
    intent = intentFromText(`${input.blogDNA.structure.summary} ${input.blogDNA.structure.sectionPatterns.join(" ")}`) ?? intent;
  }
  return structureIntent(input.structureId)
    ?? (input.structureId === "custom" ? intentFromText(input.customStructure ?? "") ?? intent : intent);
}

function section(
  id: string,
  kind: ContentLayoutSection["kind"],
  heading: string,
  priority: number,
  requiredAnyOf: string[],
  intent: ContentIntent,
): ContentLayoutSection {
  const visualStyle: SectionVisualStyle = intent === "curation" && kind === "takeaway" ? "callout" : "standard";
  return {
    id,
    kind,
    heading,
    priority,
    requiredAnyOf,
    optionalFactKeys: [],
    paragraphRange: intent === "information" ? [1, 3] : [1, 2],
    visualStyle,
  };
}

function genericSections(input: GenerateRequest, intent: ContentIntent): ContentLayoutSection[] {
  const category = getCategory(input.categoryId);
  const preset = getPreset(input.categoryId, input.presetId);
  const given = new Set(Object.entries(input.attributes ?? {}).filter(([, value]) => value?.trim()).map(([key]) => key));
  const base = [
    section("layout-context", "context", intent === "experience" ? "시작한 장면" : "먼저 볼 핵심", 1, ["situation", "event", "place", "activity"], intent),
    section("layout-evidence", "evidence", intent === "curation" ? "선별한 근거" : "확인한 내용", 2, preset?.fieldIds ?? category?.defaultFieldIds ?? [], intent),
    section("layout-application", "application", intent === "information" ? "적용과 활용" : "이어지는 포인트", 3, ["goal", "highlight", "learningGoal", "pros", "cons"], intent),
    section("layout-takeaway", "takeaway", intent === "curation" ? "누구에게 맞을까" : "마지막 판단", 4, ["audience", "targetUser", "goal"], intent),
  ];
  const order = intent === "experience" ? [0, 1, 2, 3] : intent === "information" ? [1, 0, 2, 3] : [3, 1, 0, 2];
  return order.map((index, priority) => ({
    ...base[index],
    priority: priority + 1,
    requiredAnyOf: [],
    optionalFactKeys: base[index].requiredAnyOf.filter((key) => given.has(key)),
  }));
}

function planSections(input: GenerateRequest, intent: ContentIntent): ContentLayoutSection[] {
  const directHeadings = input.structureId === "custom"
    ? (input.customStructure ?? "").split(/→|->|\n/).map((item) => item.trim()).filter(Boolean).slice(0, 6)
    : [];
  if (directHeadings.length >= 2) {
    return directHeadings.map((heading, index) => section(
      `manual-${index + 1}`,
      index === 0 ? "context" : index === directHeadings.length - 1 ? "takeaway" : "evidence",
      heading,
      index + 1,
      [],
      intent,
    ));
  }
  return genericSections(input, intent);
}

function buildImageAnchors(input: GenerateRequest, sections: ContentLayoutSection[], intent: ContentIntent) {
  const count = Math.max(0, Math.min(6, input.imageCount));
  const roles = getPreset(input.categoryId, input.presetId)?.suggestedImageRoles ?? ["HERO", "CONTEXT", "EXPLAINER", "TIP"];
  return Array.from({ length: count }, (_, slot) => {
    if (slot === 0) return { slot, role: "HERO" as ImageRole, afterSectionId: null };
    const grouped = Boolean(input.blogDNA && input.blogDNAApply?.imageRhythm !== false
      && /묶음|그룹|연속/.test(input.blogDNA.imageRhythm.grouping));
    const index = grouped && intent === "curation"
      ? Math.min(1, sections.length - 1)
      : intent === "information"
        ? Math.min(slot, sections.length - 1)
        : Math.min(slot - 1, sections.length - 1);
    return {
      slot,
      role: (roles[Math.min(slot, roles.length - 1)] ?? "CONTEXT") as ImageRole,
      afterSectionId: sections[index]?.id ?? null,
    };
  });
}

export function buildContentLayoutPlan(input: GenerateRequest): ContentLayoutPlanBuildResult {
  const purpose = resolvePurpose(input);
  const generationInput = admittedGenerationInput(input, purpose);
  const intent = resolveIntent(generationInput, purpose.purposeValue);
  const sections = planSections(generationInput, intent);
  const intensity = input.styleIntensity ?? 3;
  const cardLimit = intent === "experience" ? 0 : intent === "information" ? 1 : 2;
  const plan: ContentLayoutPlan = {
    version: 1,
    intent,
    source: {
      categoryId: input.categoryId ?? "",
      presetId: input.presetId ?? "",
      styleId: input.styleId,
      structureId: input.structureId,
      blogDNA: Boolean(input.blogDNA),
      freeTopic: input.freeTopic ?? "",
      purposeField: purpose.purposeField,
      purposeValue: purpose.purposeValue,
      excludedPurposeFields: [...purpose.excludedPurposeFields],
    },
    sections,
    paragraphChars: intent === "experience" ? [45, 145] : intent === "information" ? [85, 230] : [55, 175],
    headingDensity: intent === "experience" ? "sparse" : intent === "information" ? "high" : "regular",
    imageAnchors: buildImageAnchors(generationInput, sections, intent),
    typography: {
      title: intent === "experience" ? "editorial" : intent === "information" ? "utility" : "feature",
      body: intent === "experience" ? "narrative" : intent === "information" ? "scannable" : "mixed",
    },
    emphasis: {
      maxPerSection: intensity <= 2 ? 1 : intent === "experience" ? 1 : 2,
      kinds: intent === "experience" ? ["bold"] : intent === "information" ? ["bold", "highlight"] : ["bold", "accent"],
      cardLimit,
    },
    // Platform conversion and food-specific completeness belong to separate candidates.
    naverLoss: [],
    missingFacts: [],
    consistencyWarnings: [...purpose.warnings],
  };
  return { plan, generationInput, warnings: [...purpose.warnings] };
}

export function contentLayoutPrompt(plan: ContentLayoutPlan): string {
  const sections = plan.sections.map((item, index) => `${index + 1}. id=${item.id}, 소제목=${item.heading}, 문단 ${item.paragraphRange[0]}~${item.paragraphRange[1]}개`).join("\n");
  const anchors = plan.imageAnchors.map((item) => `${item.slot + 1}번 ${item.role} → ${item.afterSectionId ?? "제목 아래"}`).join("; ") || "사진 없음";
  return `[결정론적 편집 계획 v1]
아래 비-용어해설 섹션을 빠짐없이 같은 순서로 반환한다. 각 id와 소제목은 철자까지 그대로 사용하고 다른 섹션을 추가하지 않는다.
입력에 없는 사실은 만들지 말고 조건부 표현이나 확인할 항목으로 남긴다.
${sections}
이미지는 ${plan.imageAnchors.length}개를 반환하고 역할과 위치를 그대로 따른다: ${anchors}.
이 계획을 다시 해석하거나 새 계획으로 바꾸지 않는다.`;
}

export function validateDraftAgainstContentLayoutPlan(draft: BlogDraft, plan: ContentLayoutPlan): LayoutPlanValidation {
  const reasons: string[] = [];
  const sections = draft.sections.filter((item) => item.presentation?.visualStyle !== "glossary");
  const actualIds = sections.map((item) => item.id);
  const plannedIds = plan.sections.map((item) => item.id);
  if (new Set(actualIds).size !== actualIds.length) reasons.push("섹션 ID가 중복됐습니다.");
  if (actualIds.length !== plannedIds.length || actualIds.some((id, index) => id !== plannedIds[index])) {
    reasons.push(`섹션 ID·순서가 계획과 다릅니다 (계획: ${plannedIds.join(", ")}; 출력: ${actualIds.join(", ")}).`);
  }
  if (sections.some((item, index) => item.heading !== plan.sections[index]?.heading)) {
    reasons.push("섹션 소제목이 계획과 다릅니다.");
  }
  if (draft.images.length !== plan.imageAnchors.length) reasons.push("이미지 수가 계획과 다릅니다.");
  for (const anchor of plan.imageAnchors) {
    const image = draft.images[anchor.slot];
    if (!image || image.role !== anchor.role || image.afterSectionId !== anchor.afterSectionId) {
      reasons.push(`${anchor.slot + 1}번 이미지 역할·위치가 계획과 다릅니다.`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}
