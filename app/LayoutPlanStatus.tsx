import type { BlogDraft } from "../lib/domain/types";
import "./layout-plan-status.css";

const INTENT_LABEL = {
  experience: "경험 흐름",
  information: "정보 흐름",
  curation: "큐레이션 흐름",
} as const;

type PlannedSection = { id: string; priority: number; heading: string; paragraphRange: [number, number] };
export type LayoutPlanStatusView =
  | { kind: "legacy" }
  | { kind: "invalid" }
  | { kind: "planned"; version: 1; intent: keyof typeof INTENT_LABEL; sections: PlannedSection[]; naverLoss: string[]; missingFacts: string[] };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Read persisted runtime data without mutating or trusting its TypeScript shape. */
export function readLayoutPlanStatus(value: unknown): LayoutPlanStatusView {
  if (value === undefined || value === null) return { kind: "legacy" };
  if (!record(value) || value.version !== 1
    || !["experience", "information", "curation"].includes(String(value.intent))
    || !Array.isArray(value.sections) || value.sections.length === 0
    || !Array.isArray(value.naverLoss) || !Array.isArray(value.missingFacts)) return { kind: "invalid" };
  const sections: PlannedSection[] = [];
  const ids = new Set<string>();
  for (const item of value.sections) {
    if (!record(item) || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id)
      || typeof item.heading !== "string" || !item.heading.trim()
      || !Number.isInteger(item.priority) || (item.priority as number) < 1
      || !Array.isArray(item.paragraphRange) || item.paragraphRange.length !== 2
      || !item.paragraphRange.every((entry) => Number.isInteger(entry) && entry >= 1)
      || (item.paragraphRange[0] as number) > (item.paragraphRange[1] as number)) return { kind: "invalid" };
    ids.add(item.id);
    sections.push({ id: item.id, priority: item.priority as number, heading: item.heading,
      paragraphRange: [item.paragraphRange[0] as number, item.paragraphRange[1] as number] });
  }
  if (!value.naverLoss.every((item) => record(item) && typeof item.feature === "string" && item.feature.trim()
    && ["EQUIVALENT", "DEGRADED"].includes(String(item.outcome)))
    || !value.missingFacts.every((item) => typeof item === "string")) return { kind: "invalid" };
  return {
    kind: "planned", version: 1, intent: value.intent as keyof typeof INTENT_LABEL, sections,
    naverLoss: value.naverLoss.map((item) => (item as Record<string, unknown>).feature as string),
    missingFacts: [...value.missingFacts] as string[],
  };
}

export function safeDraftForLayoutPlanDisplay(draft: BlogDraft | null): BlogDraft | null {
  if (!draft || readLayoutPlanStatus(draft.contentLayoutPlan).kind !== "invalid") return draft;
  return { ...draft, contentLayoutPlan: undefined };
}

export default function LayoutPlanStatus({ draft }: { draft: BlogDraft }) {
  const plan = readLayoutPlanStatus(draft.contentLayoutPlan);
  if (plan.kind === "legacy") return <section className="layoutPlanStatus layoutPlanStatus--legacy" aria-label="편집 계획 상태">
    <span>이전 원고 형식</span><strong>기존 원고와 이미지 배치를 그대로 유지합니다.</strong>
    <p>이 원고에는 편집 계획이 저장되어 있지 않습니다. 자동으로 다시 배열하지 않으며, 새 초안을 만들 때부터 편집 계획을 저장합니다.</p>
  </section>;
  if (plan.kind === "invalid") return <section className="layoutPlanStatus layoutPlanStatus--invalid" aria-label="편집 계획 상태" role="status">
    <span>편집 계획 확인 필요</span><strong>저장된 원고는 바꾸지 않고 안전하게 표시합니다.</strong>
    <p>이 원고의 편집 계획이 불완전해 세부 순서를 표시할 수 없습니다. 원고와 이미지 배치는 자동 변경하지 않습니다.</p>
  </section>;
  return <details className="layoutPlanStatus" aria-label="편집 계획 상태">
    <summary><span>편집 계획 v{plan.version}</span><strong>{INTENT_LABEL[plan.intent]} · {plan.sections.length}개 구간</strong></summary>
    <p>생성할 때 확정한 흐름입니다. 플랫폼을 바꾸거나 미리보기를 열어도 원고 본문과 이미지 배치를 다시 배열하지 않습니다.</p>
    <ol>{plan.sections.map((section) => <li key={section.id}>
      <span>{section.priority}</span><strong>{section.heading}</strong><small>문단 {section.paragraphRange[0]}~{section.paragraphRange[1]}개</small>
    </li>)}</ol>
    {plan.naverLoss.length > 0 && <p className="layoutPlanStatus__loss">네이버 변환 시 단순화: {plan.naverLoss.join(" · ")}</p>}
  </details>;
}
