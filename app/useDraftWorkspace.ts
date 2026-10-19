"use client";
import { useEffect, useRef, useState } from "react";
import type { BlogDraft, PlatformId } from "../lib/domain/types";
import { createDraftId, loadActiveWorkspace, saveWorkspace } from "../lib/infrastructure/draft-workspace-storage";

export function useDraftWorkspace(platformId: PlatformId | "") {
  const [draft, setDraft] = useState<BlogDraft | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [restoredPlatform, setRestoredPlatform] = useState<PlatformId | null>(null);
  const [ready, setReady] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  const [message, setMessage] = useState("보관된 원고 확인 중…");
  const version = useRef(0);

  useEffect(() => {
    let cancelled = false;
    loadActiveWorkspace().then((workspace) => {
      if (cancelled) return;
      if (workspace) {
        setDraft(workspace.draft); setDraftId(workspace.id); setRestoredPlatform(workspace.platformId);
      }
      setCanSave(true); setStatus("ready"); setMessage(workspace ? "보관된 원고를 복원했어요." : "원고와 이미지는 이 브라우저에 보관돼요.");
    }).catch(() => {
      if (!cancelled) {
        setCanSave(false); setStatus("error");
        setMessage("저장소를 읽지 못해 자동저장을 중지했어요. 기존 데이터를 보호하고 있어요. 수정 내용은 새로고침 전에 복사해 주세요.");
      }
    }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !canSave || !draft || !draftId || !platformId) return;
    const current = ++version.current;
    setStatus("saving"); setMessage("원고 저장 중… 새로고침하지 말아 주세요.");
    void saveWorkspace({ id: draftId, draft, platformId, updatedAt: new Date().toISOString() }).then(() => {
      if (current === version.current) { setStatus("saved"); setMessage("원고 저장됨 · 이 브라우저에서 복원할 수 있어요."); }
    }).catch(() => {
      if (current === version.current) { setStatus("error"); setMessage("원고를 저장하지 못했어요. 저장 공간·브라우저 설정을 확인하고 새로고침 전에 본문을 복사해 주세요. 이전 저장본은 유지돼요."); }
    });
  }, [ready, canSave, draft, draftId, platformId]);

  useEffect(() => {
    if (!draft || (status !== "saving" && status !== "error")) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft, status]);

  function startDraft(next: BlogDraft) { setDraftId(createDraftId()); setDraft(next); }
  return { draft, setDraft, draftId, restoredPlatform, ready, status, message, startDraft };
}
