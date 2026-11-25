import {
  admittedProvenanceValue,
  projectedProvenanceValue,
  validCalendarDate,
  validHttpsSourceUrl,
  type FactAdmissionStatus,
  type FactPlan,
  type PlannedFact,
  type ProvenanceFact,
} from "./fact-provenance";
import type { BlogDraft } from "./types";

export { validCalendarDate, validHttpsSourceUrl } from "./fact-provenance";
export type FoodFactStatus = FactAdmissionStatus;
export type FoodFactKey = "visit" | "place" | "orderedMenu" | "visitPurpose" | "taste" | "price" | "priceRange" | "wait" | "parking" | "hours" | "address" | "recommendation" | "tradeoff";

export interface FoodFact extends ProvenanceFact {}

export type FoodReviewFacts = Partial<Record<FoodFactKey, FoodFact>>;

export const FOOD_FACT_LABELS: Record<FoodFactKey, string> = {
  visit: "방문 경험", place: "장소", orderedMenu: "실제 주문", visitPurpose: "방문 목적", taste: "맛·식감 체감",
  price: "당시 가격", priceRange: "가격대", wait: "대기", parking: "주차", hours: "영업시간", address: "주소",
  recommendation: "추천 대상", tradeoff: "아쉬운 점",
};

export const FOOD_FACT_KEYS = Object.keys(FOOD_FACT_LABELS) as FoodFactKey[];
const VOLATILE_FOOD_FACTS = new Set<FoodFactKey>(["price", "wait", "parking", "hours", "address"]);
const FOOD_FACT_STATUSES = new Set<FoodFactStatus>(["RAW_USER_INPUT", "USER_CONFIRMED", "EXTERNAL_VERIFIED", "UNKNOWN", "NOT_APPLICABLE"]);

export function validFoodReviewFacts(input: unknown): input is FoodReviewFacts {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  return Object.entries(input).every(([key, fact]) => {
    if (!FOOD_FACT_KEYS.includes(key as FoodFactKey) || !fact || typeof fact !== "object" || Array.isArray(fact)) return false;
    const value = fact as Record<string, unknown>;
    return FOOD_FACT_STATUSES.has(value.status as FoodFactStatus)
      && (value.value === undefined || (typeof value.value === "string" && value.value.length <= 500))
      && (value.sourceUrl === undefined || (typeof value.sourceUrl === "string" && value.sourceUrl.length <= 2048))
      && (value.checkedAt === undefined || (typeof value.checkedAt === "string" && validCalendarDate(value.checkedAt)));
  });
}

export function usableFoodFact(key: FoodFactKey, fact: FoodFact | undefined): fact is FoodFact & { value: string } {
  return admittedProvenanceValue(fact, VOLATILE_FOOD_FACTS.has(key)) !== null;
}

export function foodFactLines(facts: FoodReviewFacts): string[] {
  return FOOD_FACT_KEYS.flatMap((key) => {
    const fact = facts[key];
    if (!usableFoodFact(key, fact)) return [];
    const provenance = fact.status === "EXTERNAL_VERIFIED"
      ? `사용자가 외부 자료 확인${fact.checkedAt ? ` ${fact.checkedAt} 기준` : ""}; 출처 URL은 입력 모델에 보존`
      : `사용자 확인${fact.checkedAt ? ` ${fact.checkedAt} 기준` : ""}`;
    return [`${FOOD_FACT_LABELS[key]}: ${fact.value.trim()} (${provenance})`];
  });
}

type FoodReviewFormInput = {
  categoryId?: string;
  presetId?: string;
  attributes?: Record<string, string>;
};

type FoodFormFactSpec = {
  key: FoodFactKey;
  sourceField: string | null;
  unknownHandling: PlannedFact["unknownHandling"];
};

const FOOD_REVIEW_FORM_FACTS: readonly FoodFormFactSpec[] = [
  { key: "visit", sourceField: null, unknownHandling: "explicit" },
  { key: "place", sourceField: "place", unknownHandling: "explicit" },
  { key: "orderedMenu", sourceField: "menu", unknownHandling: "explicit" },
  { key: "visitPurpose", sourceField: "visitPurpose", unknownHandling: "explicit" },
  { key: "priceRange", sourceField: "priceRange", unknownHandling: "explicit" },
  { key: "taste", sourceField: "tastePoint", unknownHandling: "omit" },
  { key: "hours", sourceField: null, unknownHandling: "explicit" },
  { key: "address", sourceField: null, unknownHandling: "explicit" },
];

const FOOD_REVIEW_PROTECTED_SOURCE_FIELDS = new Set([
  "visit", "place", "menu", "orderedMenu", "visitPurpose", "price", "priceRange", "taste", "tastePoint",
  "wait", "parking", "hours", "address", "recommendation", "tradeoff",
]);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Runtime boundary for API and persisted drafts. Unknown scopes and partial plans are not food plans. */
export function validFoodReviewFactPlan(value: unknown): value is FactPlan {
  if (!record(value) || value.version !== 1 || value.scope !== "food-review") return false;
  const facts = value.facts;
  if (!Array.isArray(facts) || facts.length !== FOOD_REVIEW_FORM_FACTS.length) return false;
  return FOOD_REVIEW_FORM_FACTS.every((spec, index) => {
    const fact = facts[index];
    if (!record(fact) || fact.key !== spec.key || fact.label !== FOOD_FACT_LABELS[spec.key]
      || fact.sourceField !== spec.sourceField || fact.unknownHandling !== spec.unknownHandling
      || typeof fact.rawValue !== "string" || fact.rawValue.length > 500
      || !FOOD_FACT_STATUSES.has(fact.status as FoodFactStatus)
      || (fact.value !== undefined && (typeof fact.value !== "string" || fact.value.length > 500))
      || (fact.sourceUrl !== undefined && (typeof fact.sourceUrl !== "string" || fact.sourceUrl.length > 2048))
      || (fact.checkedAt !== undefined && (typeof fact.checkedAt !== "string" || !validCalendarDate(fact.checkedAt)))) return false;
    const normalized = typeof fact.value === "string" ? fact.value.trim() : "";
    if (fact.status === "RAW_USER_INPUT") return Boolean(normalized) && fact.rawValue.trim() === normalized;
    if (fact.status === "USER_CONFIRMED") return Boolean(normalized)
      && (!VOLATILE_FOOD_FACTS.has(spec.key)
        || (typeof fact.checkedAt === "string" && validCalendarDate(fact.checkedAt)));
    if (fact.status === "EXTERNAL_VERIFIED") return Boolean(normalized)
      && typeof fact.sourceUrl === "string" && validHttpsSourceUrl(fact.sourceUrl)
      && typeof fact.checkedAt === "string";
    return !normalized;
  });
}

export function buildFoodReviewFactPlan(input: FoodReviewFormInput): FactPlan | undefined {
  if (input.categoryId !== "food" || input.presetId !== "restaurant-review") return undefined;
  const facts = FOOD_REVIEW_FORM_FACTS.map((spec): PlannedFact => {
    const rawValue = spec.sourceField ? input.attributes?.[spec.sourceField] ?? "" : "";
    const value = rawValue.trim();
    return {
      key: spec.key,
      label: FOOD_FACT_LABELS[spec.key],
      sourceField: spec.sourceField,
      rawValue,
      status: value ? "RAW_USER_INPUT" : "UNKNOWN",
      ...(value ? { value } : {}),
      unknownHandling: spec.unknownHandling,
    };
  });
  return { version: 1, scope: "food-review", facts };
}

export function isProtectedFoodReviewSourceField(field: string): boolean {
  return FOOD_REVIEW_PROTECTED_SOURCE_FIELDS.has(field);
}

export function projectedFoodReviewSourceFields(plan: FactPlan | undefined): Set<string> {
  return new Set((validFoodReviewFactPlan(plan) ? plan.facts : [])
    .filter((fact) => projectedProvenanceValue(fact) !== null)
    .flatMap((fact) => fact.sourceField ? [fact.sourceField] : []));
}

export function foodReviewOutputLines(plan: FactPlan): string[] {
  if (!validFoodReviewFactPlan(plan)) return [];
  const rows = plan.facts.flatMap((fact) => {
    const value = projectedProvenanceValue(fact);
    return value ? [{ label: fact.label, value }] : [];
  });
  if (rows.length <= 4) return rows.map((fact) => `${fact.label}: ${fact.value}`);
  return [
    ...rows.slice(0, 3).map((fact) => `${fact.label}: ${fact.value}`),
    rows.slice(3).map((fact) => `${fact.label}: ${fact.value}`).join(" · "),
  ];
}

export function foodReviewMissingFacts(plan: FactPlan | undefined): string[] {
  if (!validFoodReviewFactPlan(plan)) return [];
  return plan.facts.filter((fact) => fact.status === "UNKNOWN" && fact.unknownHandling === "explicit")
    .map((fact) => fact.label);
}

export function foodReviewPrompt(plan: FactPlan): string {
  if (!validFoodReviewFactPlan(plan)) return "[맛집 사실 경계]\n사실 계획 형식이 올바르지 않다. 음식점 사실을 생성하거나 추측하지 않는다.";
  const lines = foodReviewOutputLines(plan);
  return `[맛집 사실 경계]
아래 공개 줄만 food-facts 구간의 paragraphs에 순서와 문구를 그대로 반환한다. 내부 출처 상태 문구는 게시 본문에 쓰지 않는다.
${lines.length ? lines.map((line) => `- ${line}`).join("\n") : "- 공개 줄 없음: food-facts 구간을 생성하지 않는다."}
- 내부 출처 상태: ${plan.facts.map((fact) => `${fact.key}=${fact.status}`).join(", ")}.
- 미확인 항목은 본문과 food-facts 구간에서 생략하고 다른 값으로 채우거나 추측하지 않는다.
- 방문 경험이 미확인이면 직접 방문·주문·시식·결제·내돈내산을 주장하지 않는다.
- 이 계약에 없는 위치·영업시간·가격·메뉴를 생성하지 않는다.`;
}

// Bounded known-claim detector, not a semantic hallucination guarantee. The exact
// structured fact section remains the source of truth; real provider output still
// needs a separate semantic evaluation before release.
const UNKNOWN_CLAIM_PATTERNS: Partial<Record<FoodFactKey, RegExp>> = {
  visit: /다녀왔|방문했|먹어봤|주문했|결제했|내돈내산/,
  place: /(?:주소|위치|식당|가게|매장|장소)(?:은|는|이|가|:)\s*\S+/,
  orderedMenu: /(?:주문한|주문했|메뉴(?:는|:))\s*\S+/,
  visitPurpose: /방문\s*목적(?:은|:)\s*\S+/,
  taste: /(?:맛|식감|간)(?:은|이|가|도|:)\s*\S+/,
  priceRange: /\d[\d,]*\s*(?:원|만원|천원)|가격(?:은|이|가|:)?\s*\d/,
  hours: /(?:영업|운영)\s*시간|(?:오전|오후)\s*\d|\d{1,2}:\d{2}|문(?:을|이)?\s*(?:여는|닫는)|아침(?:부터)?|저녁(?:까지)?|오픈|마감|휴무|opening\s+hours|hours\s*:|opens?\s+(?:at|from)|open\s+daily|from\s+dawn\s+to\s+dusk|closes?\s+at|24\s*\/?\s*7/i,
  address: /(?:주소|위치)(?:는|가|:)?\s*\S+|골목|번지|도로명|근처|인근|자리(?:해|잡|합)|address\s*:|location\s*:|located\s+(?:at|in|near)|\bat\s+\d+\s+[\w.-]+(?:\s+[\w.-]+)*\s+(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr)\b/i,
};

export function validateFoodReviewDraftFacts(draft: BlogDraft, plan: unknown): string[] {
  if (!validFoodReviewFactPlan(plan)) return ["맛집 사실 계획의 저장 형식을 확인할 수 없습니다."];
  const reasons: string[] = [];
  const factSection = draft.sections.find((section) => section.id === "food-facts");
  const expected = foodReviewOutputLines(plan);
  const sectionMatches = expected.length === 0
    ? factSection === undefined
    : Boolean(factSection && factSection.heading === "방문 정보"
      && factSection.presentation?.visualStyle === "key-point"
      && factSection.paragraphs.length === expected.length
      && factSection.paragraphs.every((line, index) => line === expected[index]));
  if (!sectionMatches) {
    reasons.push("맛집 사실 구간이 확인된 입력 및 미확인 규칙과 일치하지 않습니다.");
  }
  if (draft.images.some((image) => image.afterSectionId === "food-facts")) {
    reasons.push("방문 정보 카드는 이미지 배치 기준으로 사용할 수 없습니다.");
  }

  const outsideText = [draft.title, draft.summary, ...draft.intro,
    ...draft.sections.filter((section) => section.id !== "food-facts").flatMap((section) => [section.heading, ...section.paragraphs]),
    ...draft.closing, ...draft.tags,
    ...draft.images.flatMap((image) => [image.label, image.placement, image.prompt])].join("\n");
  if (/사용자 입력·미검증|외부 자료 확인|USER_CONFIRMED|EXTERNAL_VERIFIED|RAW_USER_INPUT/.test(outsideText)) {
    reasons.push("내부 사실 출처 상태가 게시용 본문 또는 이미지 안내에 노출됐습니다.");
  }
  for (const fact of plan.facts.filter((item) => item.status === "UNKNOWN")) {
    const pattern = UNKNOWN_CLAIM_PATTERNS[fact.key as FoodFactKey];
    if (pattern?.test(outsideText)) reasons.push(`미확인 사실을 본문에서 단정했습니다 (${fact.label}).`);
  }
  return reasons;
}
