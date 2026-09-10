"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { PlatformId } from "../lib/domain/types";

type ApiKnowledge = { enabled: boolean; vectorStoreDetected: boolean; ready: boolean; categories: string[]; maxResults: number; message: string; };
type HealthPayload = { ok: boolean; keyDetected: boolean; verified: boolean; model: string; message: string; knowledge?: ApiKnowledge; };
type RuntimeState = { platformId: PlatformId; host: HTMLElement; paper: HTMLElement; signature: string; };

const platformIds: PlatformId[] = ["naver", "tistory", "blogger", "wordpress", "brunch", "other"];

function detectPlatform(): PlatformId | null {
  const select = Array.from(document.querySelectorAll<HTMLSelectElement>("select")).find((item) => platformIds.includes(item.value as PlatformId));
  return select?.value ? select.value as PlatformId : null;
}
function paperSignature(paper: HTMLElement) {
  return [paper.querySelector(".previewTitle")?.textContent ?? "", paper.querySelectorAll(".articleSection").length, paper.querySelectorAll(".textEmphasis").length, paper.querySelectorAll(".imageSlot").length].join("|");
}
function findRuntime(): RuntimeState | null {
  const platformId = detectPlatform();
  const host = document.querySelector<HTMLElement>(".previewPanel .panelHeader.previewHeader");
  const paper = document.querySelector<HTMLElement>(".blogPaper");
  return platformId && host && paper ? { platformId, host, paper, signature: paperSignature(paper) } : null;
}
function clickExistingButton(pattern: RegExp) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) => pattern.test(item.textContent ?? "") && !item.closest(".composerWorkflowEnhancer"));
  button?.click(); return Boolean(button);
}
function formatLabel(platformId: PlatformId) {
  const labels: Record<PlatformId, string> = { naver: "네이버 게시 순서", tistory: "티스토리 게시 순서", blogger: "Blogger 게시 순서", wordpress: "WordPress 게시 순서", brunch: "브런치스토리 게시 순서", other: "게시 순서" };
  return labels[platformId];
}
function buildRenderedGuide(paper: HTMLElement, platformId: PlatformId) {
  const lines: string[] = [];
  const title = paper.querySelector<HTMLElement>(".previewTitle");
  if (title?.classList.contains("align-center")) lines.push("제목은 가운데 정렬로 적용");
  const intro = paper.querySelector<HTMLElement>(".introBlock");
  if (intro?.classList.contains("align-center")) lines.push("도입부는 가운데 정렬로 적용");
  paper.querySelectorAll<HTMLElement>(".articleSection").forEach((section) => {
    const heading = section.querySelector<HTMLElement>("h3"); const headingText = heading?.textContent?.trim(); if (!headingText) return;
    if (heading.classList.contains("align-center")) lines.push(`소제목 ‘${headingText}’ → 가운데 정렬`);
    if (section.classList.contains("visual-key-point")) lines.push(`‘${headingText}’ → 핵심 포인트 영역으로 강조`);
    if (section.classList.contains("visual-callout")) lines.push(`‘${headingText}’ → 안내/주의 박스 느낌으로 강조`);
    if (section.classList.contains("visual-quote")) lines.push(`‘${headingText}’ → 인용/메시지 영역으로 표현`);
    section.querySelectorAll<HTMLElement>(".textEmphasis").forEach((node) => {
      const phrase = node.textContent?.trim(); if (!phrase) return;
      const kind = node.classList.contains("accent") ? "포인트 색 + 굵게" : node.classList.contains("highlight") ? "하이라이트" : "굵게";
      lines.push(`‘${phrase}’ → ${kind}`);
    });
  });
  paper.querySelectorAll<HTMLElement>(".imageSlot").forEach((slot) => {
    const id = slot.querySelector<HTMLElement>(".slotBadge")?.textContent?.trim(); const placement = slot.querySelector<HTMLElement>(".slotInfo p")?.textContent?.trim();
    if (id) lines.push(`${id} → ${placement || "현재 표시된 위치에 이미지 삽입"}`);
  });
  if (platformId === "naver") {
    lines.unshift("네이버 SmartEditor ONE에는 본문을 일반 텍스트로 붙여넣은 뒤 아래 서식을 적용");
    lines.push("이미지는 복붙하지 말고 각 IMG 위치에서 포토업로더로 원본 파일 등록", "태그는 본문에 붙이지 말고 태그 입력 영역에 별도로 등록");
  }
  return [...new Set(lines)];
}

export default function ComposerWorkflowEnhancer() {
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  const scan = useCallback(() => {
    const next = findRuntime();
    setRuntime((current) => {
      if (!next) return null;
      return current?.host === next.host && current.paper === next.paper && current.platformId === next.platformId && current.signature === next.signature ? current : next;
    });
  }, []);

  useEffect(() => {
    scan();
    let queued = false;
    const observer = new MutationObserver((mutations) => {
      if (mutations.every((mutation) => (mutation.target as Element)?.closest?.(".composerWorkflowEnhancer"))) return;
      if (queued) return; queued = true;
      window.requestAnimationFrame(() => { queued = false; scan(); });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const onChange = () => scan(); document.addEventListener("change", onChange);
    return () => { observer.disconnect(); document.removeEventListener("change", onChange); };
  }, [scan]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health", { cache: "no-store" }).then((response) => response.json()).then((data: HealthPayload) => { if (!cancelled) setHealth(data); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const guideLines = useMemo(() => runtime ? buildRenderedGuide(runtime.paper, runtime.platformId) : [], [runtime]);
  if (!runtime) return null;
  const isNaver = runtime.platformId === "naver";
  function runExisting(pattern: RegExp, key: string) { const ok = clickExistingButton(pattern); setFeedback(ok ? key : "not-found"); window.setTimeout(() => setFeedback(""), 1300); }

  return createPortal(<div className="composerWorkflowEnhancer">
    <button type="button" className="workflowToggle" onClick={() => setOpen((value) => !value)}><span>게시 도우미</span><strong>{open ? "접기" : "열기"}</strong></button>
    {open && <div className="workflowPanel">
      <div className="workflowHeading"><div><span>POSTING FLOW</span><strong>{formatLabel(runtime.platformId)}</strong></div><small>{isNaver ? "제목·본문·이미지·태그를 분리해 안전하게 옮겨요." : "플랫폼 특성에 맞는 기존 복사 기능을 순서대로 사용해요."}</small></div>
      <div className="workflowSteps">
        <button type="button" onClick={() => runExisting(/제목 (복사|복사됨)/, "title")}><b>1</b><span><strong>제목 복사</strong><small>{feedback === "title" ? "복사됨 ✓" : "제목 입력란에 붙여넣기"}</small></span></button>
        <button type="button" onClick={() => runExisting(/용 본문 복사|본문 복사됨/, "body")}><b>2</b><span><strong>본문 복사</strong><small>{feedback === "body" ? "복사됨 ✓" : isNaver ? "SmartEditor ONE에 일반 텍스트로 붙여넣기" : "본문 편집기에 붙여넣기"}</small></span></button>
        <div className="workflowStatic"><b>3</b><span><strong>이미지 넣기</strong><small>IMG 슬롯 순서대로 생성한 원본 이미지 업로드</small></span></div>
        <button type="button" onClick={() => runExisting(/태그 (복사|복사됨)/, "tags")}><b>4</b><span><strong>태그 복사</strong><small>{feedback === "tags" ? "복사됨 ✓" : "태그/라벨 입력란에 붙여넣기"}</small></span></button>
      </div>
      {guideLines.length > 0 && <details className="formatGuide" open={isNaver}><summary>서식 적용 가이드 <span>{guideLines.length}</span></summary><div className="formatGuideList">{guideLines.map((line, index) => <p key={`${line}-${index}`}><b>{index + 1}</b><span>{line}</span></p>)}</div></details>}
      <div className="runtimeDiagnostics"><div className={`diagnosticChip ${health?.keyDetected ? "ok" : "warn"}`}><span>API</span><strong>{health?.keyDetected ? health.model : "키 미감지"}</strong></div><div className={`diagnosticChip ${health?.knowledge?.ready ? "ok" : "neutral"}`} title={health?.knowledge?.message}><span>Knowledge</span><strong>{health?.knowledge?.ready ? "준비됨" : "미사용"}</strong></div><div className={`diagnosticChip ${health?.verified ? "ok" : "neutral"}`}><span>연결 검증</span><strong>{health?.verified ? "완료" : "상단 연결 테스트 사용"}</strong></div></div>
      {feedback === "not-found" && <p className="workflowError">복사 버튼을 찾지 못했어요. 화면을 새로고침한 뒤 다시 시도해 주세요.</p>}
    </div>}
  </div>, runtime.host);
}
