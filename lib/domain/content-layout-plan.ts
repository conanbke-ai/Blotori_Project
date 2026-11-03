import { getCategory, getPreset } from "./content-config";
import type {
  ContentIntent,
  ContentLayoutPlan,
  ContentLayoutSection,
  ContentPurposeField,
} from "./content-layout-plan-contract";
import type { BlogDraft, GenerateRequest, ImageRole, SectionVisualStyle, StructureId } from "./types";
import type { FactPlan } from "./fact-provenance";
import {
  projectedFoodReviewSourceFields,
  buildFoodReviewFactPlan,
  foodReviewMissingFacts,
  foodReviewOutputLines,
  foodReviewPrompt,
  isProtectedFoodReviewSourceField,
  validFoodReviewFactPlan,
  validateFoodReviewDraftFacts,
} from "./food-review";
import {
  observedStylePrompt,
  resolveObservedStyleGuidance,
  validateObservedStylePlanProjection,
  type ObservedStyleResolution,
} from "./observed-style";

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

function admittedGenerationInput(
  input: GenerateRequest,
  purpose: ReturnType<typeof resolvePurpose>,
  factPlan: FactPlan | undefined,
): GenerateRequest {
  const projectedFoodFields = projectedFoodReviewSourceFields(factPlan);
  const attributes = Object.fromEntries(Object.entries(input.attributes ?? {})
    .filter(([key]) => !(PURPOSE_FIELDS as readonly string[]).includes(key))
    .filter(([key]) => !factPlan || !isProtectedFoodReviewSourceField(key) || projectedFoodFields.has(key)));
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
  const paragraphRange: [number, number] = kind === "takeaway" || kind === "verdict"
    ? [1, 1]
    : kind === "evidence" || kind === "practical"
      ? intent === "information" ? [2, 3] : [2, 2]
      : kind === "application" || kind === "food"
        ? intent === "experience" ? [2, 2] : [1, 2]
        : [1, 2];
  return {
    id,
    kind,
    heading,
    priority,
    requiredAnyOf,
    optionalFactKeys: [],
    paragraphRange,
    visualStyle: "standard",
  };
}

function decoratedSections(
  sections: ContentLayoutSection[],
  intent: ContentIntent,
  cardLimit: number,
): ContentLayoutSection[] {
  const preferredKinds: ContentLayoutSection["kind"][] = intent === "experience"
    ? ["takeaway", "verdict", "application", "practical"]
    : intent === "information"
      ? ["application", "practical", "takeaway", "verdict"]
      : ["takeaway", "verdict", "evidence", "application"];
  const preferred = sections
    .map((item, index) => ({ item, index, rank: preferredKinds.indexOf(item.kind) }))
    .filter((entry) => entry.item.id !== "food-facts" && entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, cardLimit);
  const selected = new Set(preferred.map((entry) => entry.item.id));
  return sections.map((item) => {
    if (!selected.has(item.id)) return item;
    const visualStyle: SectionVisualStyle = item.kind === "takeaway" || item.kind === "verdict"
      ? "callout"
      : "key-point";
    return { ...item, visualStyle };
  });
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

function withFoodFactSection(
  sections: ContentLayoutSection[],
  factPlan: FactPlan | undefined,
  intent: ContentIntent,
): ContentLayoutSection[] {
  if (factPlan?.scope !== "food-review") return sections;
  const factSection = section("food-facts", "evidence", "방문 정보", 1, [], intent);
  const publicLineCount = foodReviewOutputLines(factPlan).length;
  if (publicLineCount === 0) return sections;
  factSection.paragraphRange = [publicLineCount, publicLineCount];
  factSection.visualStyle = "key-point";
  factSection.optionalFactKeys = factPlan.facts
    .filter((fact) => fact.status === "RAW_USER_INPUT" || fact.status === "USER_CONFIRMED" || fact.status === "EXTERNAL_VERIFIED")
    .map((fact) => fact.key);
  const insertAt = Math.min(1, sections.length);
  return [...sections.slice(0, insertAt), factSection, ...sections.slice(insertAt)]
    .map((item, index) => ({ ...item, priority: index + 1 }));
}

function applyObservedParagraphRhythm(
  sections: ContentLayoutSection[],
  observed: ObservedStyleResolution,
): ContentLayoutSection[] {
  if (!observed.guidance || !observed.provenance.toggles.paragraph) return sections;
  const band = observed.guidance.paragraph.band;
  return sections.map((item) => {
    if (item.id === "food-facts" || item.kind === "takeaway" || item.kind === "verdict") return item;
    const paragraphRange: [number, number] = band === "compact" ? [1, 2]
      : band === "extended" ? [2, 3]
        : item.kind === "context" || item.kind === "scene" ? [1, 2] : [2, 3];
    return { ...item, paragraphRange };
  });
}

function buildImageAnchors(
  input: GenerateRequest,
  sections: ContentLayoutSection[],
  intent: ContentIntent,
  observed: ObservedStyleResolution,
) {
  const count = Math.max(0, Math.min(6, input.imageCount));
  const roles = getPreset(input.categoryId, input.presetId)?.suggestedImageRoles ?? ["HERO", "CONTEXT", "EXPLAINER", "TIP"];
  const editorialSections = sections.filter((item) => item.id !== "food-facts");
  return Array.from({ length: count }, (_, slot) => {
    if (slot === 0) return {
      slot,
      role: "HERO" as ImageRole,
      afterSectionId: null,
      display: { widthPercent: 100 as const, align: "center" as const },
    };
    const observedPlacement = observed.provenance.toggles.image ? observed.guidance?.image.placement : undefined;
    const observedGrouped = observedPlacement === "grouped";
    const dnaGrouped = Boolean(input.blogDNA && input.blogDNAApply?.imageRhythm !== false
      && /묶음|그룹|연속/.test(input.blogDNA.imageRhythm.grouping));
    const index = observedGrouped || (dnaGrouped && intent === "curation")
      ? Math.min(1, editorialSections.length - 1)
      : observedPlacement === "section-transition"
        ? Math.min(slot, editorialSections.length - 1)
      : intent === "information"
        ? Math.min(slot, editorialSections.length - 1)
        : Math.min(slot - 1, editorialSections.length - 1);
    const role = (roles[Math.min(slot, roles.length - 1)] ?? "CONTEXT") as ImageRole;
    const widthPercent = role === "TIP" || role === "CAUTION" ? 50 as const
      : role === "EXPLAINER" || role === "PROCESS" ? 75 as const
        : 100 as const;
    return {
      slot,
      role,
      afterSectionId: editorialSections[index]?.id ?? null,
      display: { widthPercent, align: "center" as const },
    };
  });
}

export function buildContentLayoutPlan(input: GenerateRequest): ContentLayoutPlanBuildResult {
  const purpose = resolvePurpose(input);
  const factPlan = buildFoodReviewFactPlan(input);
  const generationInput = admittedGenerationInput(input, purpose, factPlan);
  const observed = resolveObservedStyleGuidance(generationInput);
  const intent = resolveIntent(generationInput, purpose.purposeValue);
  const intensity = input.styleIntensity ?? 3;
  const requestedCardLimit = intensity <= 1 ? 0 : intensity >= 4 || intent === "curation" ? 2 : 1;
  const rawSections = applyObservedParagraphRhythm(
    withFoodFactSection(planSections(generationInput, intent), factPlan, intent),
    observed,
  );
  const cardLimit = Math.min(requestedCardLimit, rawSections.filter((item) => item.id !== "food-facts").length);
  const sections = decoratedSections(rawSections, intent, cardLimit);
  const visualDNA = input.blogDNA && input.blogDNAApply?.visual !== false ? input.blogDNA.visual : null;
  const observedVisual = observed.provenance.toggles.visual ? observed.guidance?.visual : undefined;
  const observedCentered = observedVisual?.alignment === "center-mixed";
  const centered = Boolean(visualDNA && /가운데|중앙/.test(visualDNA.alignment));
  const eligibleEmphasisSections = sections.filter((item) => item.id !== "food-facts").length;
  const minimumEmphasisSections = intensity <= 1 ? 0 : Math.min(intensity >= 4 ? 2 : 1, eligibleEmphasisSections);
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
      observedStyle: observed.provenance,
    },
    ...(observed.guidance ? { observedStyle: observed.guidance } : {}),
    sections,
    paragraphChars: observed.provenance.toggles.paragraph && observed.guidance
      ? observed.guidance.paragraph.band === "compact" ? [30, 110]
        : observed.guidance.paragraph.band === "extended" ? [85, 240]
          : [55, 175]
      : intent === "experience" ? [45, 145] : intent === "information" ? [85, 230] : [55, 175],
    headingDensity: observed.provenance.toggles.visual && observedVisual
      ? observedVisual.headingStyle === "heading-led" ? "high" : "sparse"
      : intent === "experience" ? "sparse" : intent === "information" ? "high" : "regular",
    imageAnchors: buildImageAnchors(generationInput, sections, intent, observed),
    typography: {
      title: intent === "experience" ? "editorial" : intent === "information" ? "utility" : "feature",
      body: intent === "experience" ? "narrative" : intent === "information" ? "scannable" : "mixed",
      titleAlign: centered || observedCentered ? "center" : "left",
      introAlign: "left",
      density: observedVisual?.whitespace === "airy" ? "airy"
        : observedVisual?.whitespace === "dense" ? "dense"
          : intent === "experience" ? "airy" : intent === "information" ? "dense" : "balanced",
    },
    emphasis: {
      maxPerSection: intensity <= 1 ? 0 : observedVisual?.emphasis === "selective" ? 1
        : intensity <= 3 || intent === "experience" ? 1 : 2,
      kinds: intent === "experience" ? ["bold"] : intent === "information" ? ["bold", "highlight"] : ["bold", "accent"],
      cardLimit,
      minimumSections: minimumEmphasisSections,
    },
    // Platform conversion remains separate; food fact completeness is an additive plan projection.
    naverLoss: [],
    missingFacts: foodReviewMissingFacts(factPlan),
    ...(factPlan ? { factPlan } : {}),
    consistencyWarnings: [...purpose.warnings],
  };
  return { plan, generationInput, warnings: [...purpose.warnings] };
}

export function contentLayoutPrompt(plan: ContentLayoutPlan): string {
  const sections = plan.sections.map((item, index) => `${index + 1}. id=${item.id}, kind=${item.kind}, 소제목=${item.heading}, paragraphs=${item.paragraphRange[0]}~${item.paragraphRange[1]}, visualStyle=${item.visualStyle}`).join("\n");
  const anchors = plan.imageAnchors.map((item) => {
    const display = item.display ? `, width=${item.display.widthPercent}%, align=${item.display.align}` : "";
    return `${item.slot + 1}: role=${item.role}, after=${item.afterSectionId ?? "TITLE"}${display}`;
  }).join("; ") || "NONE";
  const factPrompt = plan.factPlan?.scope === "food-review" ? `\n\n${foodReviewPrompt(plan.factPlan)}` : "";
  const aggregatePrompt = plan.observedStyle && plan.source.observedStyle
    ? `\n\n${observedStylePrompt(plan.observedStyle, plan.source.observedStyle)}`
    : "";
  return `[CONTENT LAYOUT PLAN v1 - APPLY TO OUTPUT]
Keep every section id, heading, order, paragraph count, visualStyle, and image placement exactly as specified. 각 id와 소제목은 철자까지 그대로 사용한다. Do not add another section.
Do not invent facts. Leave an unsupported value unconfirmed instead of guessing it.
- intent=${plan.intent}; headingDensity=${plan.headingDensity}; paragraphChars=${plan.paragraphChars[0]}~${plan.paragraphChars[1]}
- titleStyle=${plan.typography.title}; bodyStyle=${plan.typography.body}; titleAlign=${plan.typography.titleAlign ?? "legacy"}; introAlign=${plan.typography.introAlign ?? "legacy"}; density=${plan.typography.density ?? "legacy"}
- emphasis: maxPerSection=${plan.emphasis.maxPerSection}; allowedKinds=${plan.emphasis.kinds.join(",") || "none"}; minimumSections=${plan.emphasis.minimumSections ?? 0}. Every phrase must occur verbatim in that section paragraph.
- cards: maximum=${plan.emphasis.cardLimit}. Use each visualStyle below; do not turn every section into a card.
${sections}
Images (${plan.imageAnchors.length}): ${anchors}.
Return the plan in the actual JSON fields; do not merely describe it or repair the result after generation.${aggregatePrompt}${factPrompt}`;
}

function validateObservedStylePlanApplication(plan: ContentLayoutPlan): string[] {
  const provenance = plan.source.observedStyle;
  const guidance = plan.observedStyle;
  if (provenance?.status !== "applied" || !guidance) return [];
  const reasons: string[] = [];
  if (provenance.toggles.paragraph) {
    const expected: [number, number] = guidance.paragraph.band === "compact" ? [30, 110]
      : guidance.paragraph.band === "extended" ? [85, 240] : [55, 175];
    if (plan.paragraphChars[0] !== expected[0] || plan.paragraphChars[1] !== expected[1]) {
      reasons.push("Observed paragraph rhythm is not reflected in the layout plan.");
    }
  }
  if (provenance.toggles.visual) {
    const expectedHeadingDensity = guidance.visual.headingStyle === "heading-led" ? "high" : "sparse";
    const expectedTitleAlign = guidance.visual.alignment === "center-mixed" ? "center" : "left";
    const expectedDensity = guidance.visual.whitespace === "airy" ? "airy" : "dense";
    if (plan.headingDensity !== expectedHeadingDensity || plan.typography.titleAlign !== expectedTitleAlign
      || plan.typography.density !== expectedDensity) {
      reasons.push("Observed visual guidance is not reflected in the layout plan.");
    }
    if (guidance.visual.emphasis === "selective" && plan.emphasis.maxPerSection > 1) {
      reasons.push("Observed selective emphasis limit is not reflected in the layout plan.");
    }
  }
  if (plan.imageAnchors.some((item) => item.afterSectionId === "food-facts")) {
    reasons.push("Observed image rhythm cannot override the protected food-facts boundary.");
  }
  return reasons;
}

export function validateDraftPresentationAgainstContentLayoutPlan(draft: BlogDraft, plan: ContentLayoutPlan): LayoutPlanValidation {
  const reasons: string[] = [
    ...validateObservedStylePlanProjection(plan.observedStyle, plan.source.observedStyle, plan.source),
    ...validateObservedStylePlanApplication(plan),
  ];
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
  let emphasizedSections = 0;
  for (const [index, draftSection] of sections.entries()) {
    const planned = plan.sections[index];
    if (!planned) continue;
    if (draftSection.presentation?.visualStyle !== planned.visualStyle) {
      reasons.push(`${planned.id}: visualStyle does not match the plan.`);
    }
    if (draftSection.paragraphs.length < planned.paragraphRange[0]
      || draftSection.paragraphs.length > planned.paragraphRange[1]) {
      reasons.push(`${planned.id}: paragraph count is outside the planned range.`);
    }
    const emphasis = draftSection.presentation?.emphasis ?? [];
    if (emphasis.length > plan.emphasis.maxPerSection) reasons.push(`${planned.id}: too many emphasis marks.`);
    if (planned.id !== "food-facts" && emphasis.length > 0) emphasizedSections += 1;
    for (const item of emphasis) {
      if (!plan.emphasis.kinds.includes(item.kind)) reasons.push(`${planned.id}: emphasis kind is not allowed.`);
      if (!item.phrase || !draftSection.paragraphs.some((paragraph) => paragraph.includes(item.phrase))) {
        reasons.push(`${planned.id}: emphasis phrase is absent from the section paragraphs.`);
      }
    }
  }
  const actualCards = sections.filter((item) => item.id !== "food-facts"
    && !["standard", "glossary"].includes(item.presentation?.visualStyle ?? "standard")).length;
  if (actualCards > plan.emphasis.cardLimit) reasons.push("Card section count exceeds the plan.");
  if (emphasizedSections < (plan.emphasis.minimumSections ?? 0)) reasons.push("Too few sections contain planned emphasis.");
  if (plan.typography.titleAlign && draft.presentation?.titleAlign !== plan.typography.titleAlign) reasons.push("Title alignment does not match the plan.");
  if (plan.typography.introAlign && draft.presentation?.introAlign !== plan.typography.introAlign) reasons.push("Intro alignment does not match the plan.");
  if (plan.typography.density && draft.presentation?.density !== plan.typography.density) reasons.push("Content density does not match the plan.");
  for (const anchor of plan.imageAnchors) {
    const image = draft.images[anchor.slot];
    if (image && anchor.display
      && (image.display?.widthPercent !== anchor.display.widthPercent || image.display?.align !== anchor.display.align)) {
      reasons.push(`${anchor.slot + 1}: image width or alignment does not match the plan.`);
    }
    if (!image || image.role !== anchor.role || image.afterSectionId !== anchor.afterSectionId) {
      reasons.push(`${anchor.slot + 1}번 이미지 역할·위치가 계획과 다릅니다.`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

export function validateDraftFactIntegrity(draft: BlogDraft, plan: ContentLayoutPlan): LayoutPlanValidation {
  const foodReviewScope = plan.source.categoryId === "food" && plan.source.presetId === "restaurant-review";
  const attachedDraft = draft.contentLayoutPlan !== undefined;
  const layoutFactPlanValid = plan.factPlan !== undefined && validFoodReviewFactPlan(plan.factPlan);
  const draftFactPlanValid = draft.factIntegrityPlan !== undefined && validFoodReviewFactPlan(draft.factIntegrityPlan);
  const reasons: string[] = [];
  if (foodReviewScope && !layoutFactPlanValid) reasons.push("Food review layout plans require valid fact provenance.");
  if (!foodReviewScope && plan.factPlan !== undefined) reasons.push("Non-food layout plans cannot contain food fact provenance.");
  if (attachedDraft && foodReviewScope && !draftFactPlanValid) reasons.push("Stored food review drafts require valid fact provenance.");
  if (attachedDraft && !foodReviewScope && draft.factIntegrityPlan !== undefined) reasons.push("Non-food drafts cannot contain food fact provenance.");
  if (attachedDraft && layoutFactPlanValid && draftFactPlanValid
    && JSON.stringify(plan.factPlan) !== JSON.stringify(draft.factIntegrityPlan)) {
    reasons.push("Draft and layout food fact provenance do not match.");
  }
  if (layoutFactPlanValid) reasons.push(...validateFoodReviewDraftFacts(draft, plan.factPlan!));
  return { ok: reasons.length === 0, reasons };
}

export function validateDraftAgainstContentLayoutPlan(draft: BlogDraft, plan: ContentLayoutPlan): LayoutPlanValidation {
  const presentation = validateDraftPresentationAgainstContentLayoutPlan(draft, plan);
  const facts = validateDraftFactIntegrity(draft, plan);
  return { ok: presentation.ok && facts.ok, reasons: [...presentation.reasons, ...facts.reasons] };
}
