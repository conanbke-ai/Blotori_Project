import type { BlogDraft, ImagePlan } from "./types";

const riskyExpressions = [
  /100\s*%/gi,
  /완치/gi,
  /무조건\s*(낫|개선|치료)/gi,
  /즉시\s*(개선|치료|회복)/gi,
  /부작용\s*(이|가)?\s*없/gi,
  /최고의?\s*(치료|효과|병원)/gi,
  /유일한\s*(치료|방법)/gi,
  /확실히\s*(낫|개선|치료)/gi,
];

export function findRiskyExpressions(draft: BlogDraft): string[] {
  const fullText = [
    draft.title,
    ...draft.intro,
    ...draft.sections.flatMap((s) => [s.heading, ...s.paragraphs]),
    ...draft.closing,
  ].join("\n");

  const found = new Set<string>();
  for (const regex of riskyExpressions) {
    for (const match of fullText.matchAll(regex)) {
      found.add(match[0]);
    }
  }
  return [...found];
}

export function normalizeImagePlans(images: ImagePlan[], maxImages: number): ImagePlan[] {
  const roleOrder = ["HERO", "POSTURE", "BODY", "TREATMENT", "TIP", "CAUTION"];
  return images
    .slice(0, Math.max(1, Math.min(6, maxImages)))
    .sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role))
    .map((image, index) => ({
      ...image,
      id: `IMG-${String(index + 1).padStart(2, "0")}-${image.role}`,
    }));
}

export function ensureWarnings(draft: BlogDraft): BlogDraft {
  const detected = findRiskyExpressions(draft);
  const warnings = [...new Set([...(draft.warnings ?? []), ...detected.map((x) => `주의 표현 감지: “${x}”`)])];
  return { ...draft, warnings };
}
