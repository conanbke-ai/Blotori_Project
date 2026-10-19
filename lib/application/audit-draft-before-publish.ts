import type { BlogDraft, GenerateRequest } from "../domain/types";
import { findDraftQualityIssues, findUnsupportedFactSignals } from "../domain/rules";

/**
 * Read-only, deterministic pre-publication audit. No database, provider calls,
 * mutations or automatic rewrite. Heuristics are reviewer prompts, not proof.
 */
export type DraftAuditFinding = {
  code: "MISSING_CONTENT" | "DUPLICATE_HEADING" | "MISSING_IMAGE_PLAN" | "QUALITY_SIGNAL" | "FACT_SIGNAL";
  severity: "error" | "review";
  message: string;
};

const normalized = (text: string) => text.trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");

export function auditDraftBeforePublish(draft: BlogDraft, input: GenerateRequest): DraftAuditFinding[] {
  const findings: DraftAuditFinding[] = [];
  const add = (code: DraftAuditFinding["code"], severity: DraftAuditFinding["severity"], message: string) =>
    findings.push({ code, severity, message });
  if (!draft.title?.trim() || !draft.intro?.some(p => p.trim()) ||
    !draft.sections?.some(s => s.paragraphs?.some(p => p.trim())) ||
    !draft.closing?.some(p => p.trim())) {
    add("MISSING_CONTENT", "error", "제목·도입·본문·마무리 중 비어 있는 부분이 있습니다.");
  }
  const headings = draft.sections.map(s => normalized(s.heading)).filter(Boolean);
  if (headings.length !== new Set(headings).size) {
    add("DUPLICATE_HEADING", "review", "같은 소제목이 반복됩니다.");
  }
  if (draft.images.length < input.imageCount) {
    add("MISSING_IMAGE_PLAN", "review", "설정한 이미지 수보다 이미지 기획이 적습니다.");
  }
  for (const message of findDraftQualityIssues(draft)) add("QUALITY_SIGNAL", "review", message);
  for (const message of findUnsupportedFactSignals(draft, input)) add("FACT_SIGNAL", "review", message);
  return findings;
}
