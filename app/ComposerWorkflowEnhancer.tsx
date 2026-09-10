"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { buildPlatformExport } from "../lib/application/platform-exporter";
import type { BlogDraft, PlatformId } from "../lib/domain/types";

type ApiKnowledge = {
  enabled: boolean;
  vectorStoreDetected: boolean;
  ready: boolean;
  categories: string[];
  maxResults: number;
  message: string;
};

type HealthPayload = {
  ok: boolean;
  keyDetected: boolean;
  verified: boolean;
  model: string;
  message: string;
  knowledge?: ApiKnowledge;
};

type Snapshot = {
  draft: BlogDraft;
  platformId: PlatformId;
  host: HTMLElement;
};

const platformIds: PlatformId[] = ["naver", "tistory", "blogger", "wordpress", "brunch", "other"];

function detectPlatform(): PlatformId | null {
  const select = Array.from(document.querySelectorAll<HTMLSelectElement>("select"))
    .find((item) => platformIds.includes(item.value as PlatformId));
  return select?.value ? select.value as PlatformId : null;
}

function readDraft(): BlogDraft | null {
  const raw = document.querySelector<HTMLScriptElement>("#blotori-draft-snapshot")?.textContent;
  if (!raw) return null;
  try { return JSON.parse(raw) as BlogDraft; } catch { return null; }
}

function findHost() {
  return document.querySelector<HTMLElement>(".previewPanel .panelHeader.previewHeader");
}

function formatLabel(platformId: PlatformId) {
  if (platformId === "naver") return "네이버 게시 순서";
  if (platformId === "tistory") return "티스토리 게시 순서";
  if (platformId === "wordpress") return "WordPress 게시 순서";
  if (platformId === "blogger") return "Blogger 게시 순서";
  if (platformId === "brunch") return "브런치스토리 게시 순서";
  return "게시 순서";
}

export default function ComposerWorkflowEnhancer() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState("");

  const scan = useCallback(() => {
    const draft = readDraft();
    const platformId = detectPlatform();
    const host = findHost();
    if (!draft || !platformId || !host) {
      setSnapshot(null);
      return;
    }
    setSnapshot((current) => current?.host === host && current.platformId === platformId && current.draft.title === draft.title
      ? current
      : { draft, platformId, host });
  }, []);

  useEffect(() => {
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const onChange = () => scan();
    document.addEventListener("change", onChange);
    return () => { observer.disconnect(); document.removeEventListener("change", onChange); };
  }, [scan]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: HealthPayload) => { if (!cancelled) setHealth(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const exported = useMemo(() => snapshot ? buildPlatformExport(snapshot.draft, snapshot.platformId) : null, [snapshot]);
  if (!snapshot || !exported) return null;

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1300);
  }

  const guideLines = exported.formattingGuide ?? [];
  const isNaver = snapshot.platformId === "naver";
  const grounding = snapshot.draft.knowledgeGrounding;

  return createPortal(
    <div className="composerWorkflowEnhancer">
      <button type="button" className="workflowToggle" onClick={() => setOpen((value) => !value)}>
        <span>게시 도우미</span><strong>{open ? "접기" : "열기"}</strong>
      </button>
      {open && <div className="workflowPanel">
        <div className="workflowHeading">
          <div><span>POSTING FLOW</span><strong>{formatLabel(snapshot.platformId)}</strong></div>
          <small>{isNaver ? "제목·본문·이미지·태그를 분리해 안전하게 옮겨요." : "플랫폼 특성에 맞는 복사 결과를 사용해요."}</small>
        </div>

        <div className="workflowSteps">
          <button type="button" onClick={() => copy(exported.titleText, "title")}><b>1</b><span><strong>제목 복사</strong><small>{copied === "title" ? "복사됨 ✓" : "플랫폼 제목 입력란에 붙여넣기"}</small></span></button>
          <button type="button" onClick={() => copy(exported.plainText, "body")}><b>2</b><span><strong>본문 복사</strong><small>{copied === "body" ? "복사됨 ✓" : isNaver ? "SmartEditor ONE 본문에 일반 텍스트로 붙여넣기" : "본문 편집기에 붙여넣기"}</small></span></button>
          <div className="workflowStatic"><b>3</b><span><strong>이미지 넣기</strong><small>IMG 슬롯 순서대로 생성한 원본 이미지를 업로드</small></span></div>
          <button type="button" onClick={() => copy(exported.tagsText, "tags")}><b>4</b><span><strong>태그 복사</strong><small>{copied === "tags" ? "복사됨 ✓" : "플랫폼의 태그/라벨 입력란에 붙여넣기"}</small></span></button>
        </div>

        {guideLines.length > 0 && <details className="formatGuide" open={isNaver}>
          <summary>서식 적용 가이드 <span>{guideLines.length}</span></summary>
          <div className="formatGuideList">{guideLines.map((line, index) => <p key={`${line}-${index}`}><b>{index + 1}</b><span>{line}</span></p>)}</div>
        </details>}

        <div className="runtimeDiagnostics">
          <div className={`diagnosticChip ${health?.keyDetected ? "ok" : "warn"}`}><span>API</span><strong>{health?.keyDetected ? health.model : "키 미감지"}</strong></div>
          <div className={`diagnosticChip ${health?.knowledge?.ready ? "ok" : "neutral"}`} title={health?.knowledge?.message}><span>Knowledge</span><strong>{health?.knowledge?.ready ? "준비됨" : "미사용"}</strong></div>
          {grounding && <div className={`diagnosticChip ${grounding.used ? "ok" : "neutral"}`}><span>이번 글 근거</span><strong>{grounding.used ? `${grounding.resultCount}건 검색` : "검색 결과 없음"}</strong></div>}
        </div>
        {grounding?.sourceNames?.length ? <div className="groundingSources"><strong>이번 글에서 확인된 자료</strong><p>{grounding.sourceNames.join(" · ")}</p></div> : null}
      </div>}
    </div>,
    snapshot.host,
  );
}
