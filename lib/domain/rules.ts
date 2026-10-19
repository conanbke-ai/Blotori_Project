import type { BlogDraft, GenerateRequest, ImagePlan } from "./types";

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

const placeholderPatterns = [
  /실제 API(?:\s*모드)?에서는/,
  /필요한 (?:조건|정보)(?:을|만) 입력하면/,
  /선택한 (?:글 )?구성에 맞춰/,
  /핵심 내용을? 정리(?:합니다|해요)/,
];

function normalizedHeading(value: string) {
  return value.toLowerCase().replace(/[\s·:：!?.,()\[\]{}'“”‘’_-]+/g, "");
}

function paragraphLead(value: string) {
  return value.trim().match(/^([가-힣A-Za-z]{2,12})(?:은|는|이|가|을|를|에서|부터|그리고|그래서|하지만|또한|특히|먼저|마지막으로)?[\s,]/)?.[1] ?? "";
}

export function findDraftQualityIssues(draft: BlogDraft): string[] {
  const issues: string[] = [];
  const headings = draft.sections.map((section) => normalizedHeading(section.heading)).filter(Boolean);
  if (new Set(headings).size !== headings.length) {
    issues.push("품질 확인: 동일하거나 거의 같은 소제목이 반복됩니다.");
  }

  const paragraphs = [...draft.intro, ...draft.sections.flatMap((section) => section.paragraphs), ...draft.closing]
    .map((value) => value.trim())
    .filter(Boolean);
  if (paragraphs.some((paragraph) => placeholderPatterns.some((pattern) => pattern.test(paragraph)))) {
    issues.push("품질 확인: 실제 내용 대신 템플릿·자리표시자 문장이 남아 있습니다.");
  }

  const leads = paragraphs.map(paragraphLead).filter(Boolean);
  const leadCounts = new Map<string, number>();
  for (const lead of leads) leadCounts.set(lead, (leadCounts.get(lead) ?? 0) + 1);
  if (paragraphs.length >= 4 && [...leadCounts.values()].some((count) => count >= 3)) {
    issues.push("품질 확인: 같은 연결 방식으로 시작하는 문단이 반복됩니다.");
  }

  const lengths = paragraphs.map((paragraph) => paragraph.length);
  if (lengths.length >= 5 && Math.max(...lengths) - Math.min(...lengths) <= 12) {
    issues.push("품질 확인: 문단 길이가 지나치게 균일해 정형적으로 보일 수 있습니다.");
  }
  return issues;
}

function normalizedEvidence(value: string) {
  return value.toLowerCase().replace(/[\s,]/g, "");
}

export function findUnsupportedFactSignals(draft: BlogDraft, input: GenerateRequest): string[] {
  const evidence = [input.freeTopic, input.extraConditions, ...Object.values(input.attributes ?? {})]
    .filter(Boolean).join("\n");
  const evidenceNormalized = normalizedEvidence(evidence);
  const fullText = [draft.title, ...draft.intro, ...draft.sections.flatMap((section) => [section.heading, ...section.paragraphs]), ...draft.closing].join("\n");
  const issues: string[] = [];

  const experienceClaim = /(다녀왔|방문했|먹어봤|먹었(?:어요|습니다)|써봤|사용했|구매했|예약했|체험했|숙박했|치료받았)/;
  const experienceEvidence = /(후기|경험|방문|다녀|시식|먹어|사용|써본|구매|예약|체험|숙박|치료받)/;
  if (experienceClaim.test(fullText) && !experienceEvidence.test(evidence)) {
    issues.push("근거 확인: 입력에 없는 1인칭 방문·구매·사용 경험이 사실처럼 표현됐을 수 있습니다.");
  }

  const concreteValuePatterns = [
    /(?:\d{1,3}(?:,\d{3})+|\d+)\s*원/g,
    /\d+(?:\.\d+)?\s*(?:분|시간|일|주|개월|년)/g,
    /(?:평점|별점)\s*\d+(?:\.\d+)?/g,
  ];
  const unsupportedValues = new Set<string>();
  for (const pattern of concreteValuePatterns) {
    for (const match of fullText.matchAll(pattern)) {
      if (!evidenceNormalized.includes(normalizedEvidence(match[0]))) unsupportedValues.add(match[0]);
    }
  }
  if (unsupportedValues.size) {
    issues.push(`근거 확인: 입력에서 찾을 수 없는 구체값(${[...unsupportedValues].slice(0, 5).join(", ")})이 포함됐습니다.`);
  }
  return issues;
}

export function normalizeImagePlans(images: ImagePlan[], maxImages: number): ImagePlan[] {
  const roleOrder = ["HERO", "CONTEXT", "EXPLAINER", "PROCESS", "TIP", "CAUTION"];
  return images
    .slice(0, Math.max(1, Math.min(6, maxImages)))
    .sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role))
    .map((image, index) => ({
      ...image,
      id: `IMG-${String(index + 1).padStart(2, "0")}-${image.role}`,
    }));
}

export function ensureWarnings(draft: BlogDraft, input?: GenerateRequest): BlogDraft {
  const detected = findRiskyExpressions(draft);
  const qualityIssues = findDraftQualityIssues(draft);
  const unsupportedFacts = input ? findUnsupportedFactSignals(draft, input) : [];
  const warnings = [...new Set([...(draft.warnings ?? []), ...detected.map((x) => `주의 표현 감지: “${x}”`), ...qualityIssues, ...unsupportedFacts])];
  return { ...draft, warnings };
}
