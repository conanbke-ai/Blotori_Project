"use client";
import { useEffect, useRef, useState } from "react";
import type { BlogSection, ImagePlan } from "../lib/domain/types";
import { deleteDraftImage, loadDraftImages, saveDraftImage, type DraftImageAsset } from "../lib/infrastructure/draft-workspace-storage";
import "./draft-images.css";

const maxBytes = 15 * 1024 * 1024;
const types = new Set(["image/png", "image/jpeg", "image/webp"]);

export default function DraftImageControl({ draftId, image, sections, onChange }: {
  draftId: string; image: ImagePlan; sections: BlogSection[];
  onChange: (id: string, patch: Partial<ImagePlan>) => void;
}) {
  const [asset, setAsset] = useState<DraftImageAsset | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState<DraftImageAsset | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    let cancelled = false;
    setReady(false); setAsset(null); setError("");
    loadDraftImages(draftId).then((items) => {
      if (!cancelled) { setAsset(items.find((item) => item.imageId === image.id) ?? null); setReady(true); }
    }).catch(() => {
      if (!cancelled) setError("저장된 이미지를 읽지 못했어요. 기존 파일을 보호하기 위해 이미지 변경을 중지했어요.");
    });
    return () => { cancelled = true; active.current = false; };
  }, [draftId, image.id]);
  useEffect(() => {
    if (!asset) { setUrl(""); return; }
    const next = URL.createObjectURL(asset.blob); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [asset]);

  async function storeAsset(next: DraftImageAsset) {
    setBusy(true); setError("");
    try {
      await saveDraftImage(next);
      if (active.current) { setAsset(next); setPending(null); }
    } catch {
      if (active.current) { setPending(next); setError("이미지를 보관하지 못했어요. 저장 공간·브라우저 설정을 확인해 주세요. 기존 저장 파일은 유지했어요."); }
    } finally { if (active.current) setBusy(false); }
  }
  function takeFile(file?: File) {
    if (!file || !ready || busy) return;
    if (!types.has(file.type) || file.size > maxBytes || file.size === 0) {
      setError("비어 있지 않은 PNG · JPG · WebP 파일을 15MB 이하로 선택해 주세요."); return;
    }
    void storeAsset({ draftId, imageId: image.id, blob: file, name: file.name, updatedAt: new Date().toISOString() });
  }
  async function remove() {
    setBusy(true); setError("");
    try { await deleteDraftImage(draftId, image.id); if (active.current) { setAsset(null); setPending(null); } }
    catch { if (active.current) setError("이미지를 삭제하지 못했어요. 기존 파일을 유지했어요."); }
    finally { if (active.current) setBusy(false); }
  }
  const width = image.display?.widthPercent ?? 100;
  const alignment = image.display?.align ?? "center";
  const downloadName = `${image.id.replace(/[^A-Za-z0-9_-]/g, "_")}.${asset?.blob.type === "image/jpeg" ? "jpg" : asset?.blob.type === "image/webp" ? "webp" : "png"}`;

  return <div className="draftImageControl">
    <div className="draftImageViewport" style={{ justifyContent: alignment === "left" ? "flex-start" : alignment === "right" ? "flex-end" : "center" }}
      onDragOver={(event) => { event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); takeFile(event.dataTransfer.files[0]); }}>
      {url ? <img src={url} alt={image.label} style={{ width: `${width}%` }} data-draft-image={image.id} />
        : <button type="button" className="draftImageDrop" disabled={!ready || busy} onClick={() => input.current?.click()}>{ready ? "생성한 이미지 넣기" : "저장된 이미지 확인 중…"}<small>클릭 또는 PNG · JPG · WebP 드래그 · 최대 15MB</small></button>}
    </div>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label={`${image.id} 원본 이미지 선택`} className="draftImageInput" disabled={!ready || busy}
      onChange={(event) => { takeFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
    <div className="draftImageActions">
      {asset && <><span title={asset.name}>{asset.name} · 이 브라우저에 원본 보관됨</span><button type="button" disabled={busy} onClick={() => input.current?.click()}>교체</button><button type="button" disabled={busy} onClick={() => void remove()}>이미지 삭제</button><a href={url || undefined} download={downloadName}>원본 다운로드</a></>}
      {busy && <span role="status">이미지 저장 중…</span>}
    </div>
    <div className="draftImagePlacement">
      <label>삽입 위치<select aria-label={`${image.id} 삽입 위치`} value={image.afterSectionId ?? ""} disabled={busy} onChange={(event) => {
        const id = event.target.value || null;
        const heading = sections.find((section) => section.id === id)?.heading;
        onChange(image.id, { afterSectionId: id, placement: heading ? `${heading} 뒤` : "도입부 앞" });
      }}><option value="">도입부 앞</option>{sections.map((section) => <option value={section.id} key={section.id}>{section.heading} 뒤</option>)}</select></label>
      <label>표시 너비<select aria-label={`${image.id} 표시 너비`} value={width} onChange={(event) => onChange(image.id, { display: { widthPercent: Number(event.target.value) as 25 | 50 | 75 | 100, align: alignment } })}>{[100,75,50,25].map((value) => <option value={value} key={value}>{value}%</option>)}</select></label>
      <label>사진 정렬<select aria-label={`${image.id} 사진 정렬`} value={alignment} onChange={(event) => onChange(image.id, { display: { widthPercent: width, align: event.target.value as "left" | "center" | "right" } })}><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label>
    </div>
    <p className="draftImageHint">위치·너비·정렬은 원고에 보관돼요. 네이버에는 원본을 따로 업로드하고 이 설정에 맞춰 조절해 주세요.</p>
    {error && <p className="draftImageError" role="alert">{error}{pending && <button type="button" disabled={busy} onClick={() => void storeAsset(pending)}>저장 다시 시도</button>}</p>}
  </div>;
}
