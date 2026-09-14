"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";

type StyleSourceType = "preset" | "blog" | "post" | "pasted_text" | "manual";
type StyleProfile = {
  id: string;
  name: string;
  sourceType: StyleSourceType;
  sourceUrl?: string;
  signature: string;
  defaultIntensity: 1 | 2 | 3 | 4 | 5;
  createdAt: string;
  updatedAt: string;
};
type MaterialRecord = {
  id: string;
  name: string;
  type: string;
  size: number;
  updatedAt: string;
  blob: Blob;
};
type PackManifest = {
  kind: "blotori-pack";
  version: 1;
  name: string;
  exportedAt: string;
  styles: StyleProfile[];
  materials: Array<{ id: string; name: string; type: string; size: number; updatedAt: string; dataUrl: string }>;
};

const STYLE_KEY = "blotori.style-profiles.v1";
const SELECTED_STYLE_KEY = "blotori.selected-style.v1";
const DB_NAME = "blotori-assets-v1";
const STORE = "materials";
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "text/plain", "text/markdown", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
function loadStyles(): StyleProfile[] {
  try { return JSON.parse(localStorage.getItem(STYLE_KEY) || "[]") as StyleProfile[]; } catch { return []; }
}
function saveStyles(styles: StyleProfile[]) { localStorage.setItem(STYLE_KEY, JSON.stringify(styles)); }
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function listMaterials(): Promise<MaterialRecord[]> {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as MaterialRecord[]).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)));
    req.onerror = () => reject(req.error);
  });
}
async function putMaterial(record: MaterialRecord) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}
async function deleteMaterial(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}
function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
}
function dataUrlToBlob(dataUrl: string) {
  const [meta, base64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(meta)?.[1] || "application/octet-stream";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}
function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function BlotoriAssetStudio() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [styles, setStyles] = useState<StyleProfile[]>([]);
  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState("");
  const [sourceType, setSourceType] = useState<StyleSourceType>("post");
  const [source, setSource] = useState("");
  const [styleName, setStyleName] = useState("");
  const [signature, setSignature] = useState("");
  const [intensity, setIntensity] = useState<1|2|3|4|5>(3);
  const [analyzing, setAnalyzing] = useState(false);
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const packInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStyles(loadStyles());
    setSelectedStyleId(localStorage.getItem(SELECTED_STYLE_KEY) || "");
    void listMaterials().then(setMaterials);
    let currentHost: HTMLElement | null = null;
    let scheduled = false;
    const attach = () => {
      scheduled = false;
      const rail = document.querySelector<HTMLElement>(".settingsRail");
      if (!rail) return;
      let host = rail.querySelector<HTMLElement>("[data-blotori-asset-studio]");
      if (!host) {
        host = document.createElement("div");
        host.dataset.blotoriAssetStudio = "true";
        const groups = [...rail.querySelectorAll<HTMLElement>(".settingGroup")];
        const topic = groups.find((group) => group.querySelector("h3")?.textContent?.trim() === "주제");
        if (topic) topic.insertAdjacentElement("afterend", host);
        else rail.querySelector(".stickyGenerateDock")?.insertAdjacentElement("beforebegin", host);
      }
      if (host && host !== currentHost) {
        currentHost = host;
        setMount(host);
      }
    };
    const scheduleAttach = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(attach);
    };
    attach();
    const observer = new MutationObserver(scheduleAttach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/generate") || init?.method !== "POST" || typeof init.body !== "string") return nativeFetch(input, init);
      try {
        const payload = JSON.parse(init.body) as Record<string, unknown>;
        const profile = styles.find((item) => item.id === selectedStyleId);
        if (profile) {
          payload.styleId = "custom";
          payload.customStyle = `${profile.signature}\n\n이 문체 프로필의 이름은 '${profile.name}'이다. 문장 자체를 복제하지 말고 분석된 특성만 적용한다.`;
          payload.styleIntensity = profile.defaultIntensity;
          payload.styleProfileName = profile.name;
        }
        const chosen = materials.filter((item) => selectedMaterialIds.includes(item.id));
        if (chosen.length) {
          payload.referenceFiles = await Promise.all(chosen.map(async (item) => ({
            id: item.id, name: item.name, mimeType: item.type, size: item.size, dataUrl: await readAsDataUrl(item.blob),
          })));
        }
        return nativeFetch(input, { ...init, body: JSON.stringify(payload) });
      } catch { return nativeFetch(input, init); }
    };
    return () => { window.fetch = nativeFetch; };
  }, [materials, selectedMaterialIds, selectedStyleId, styles]);

  const selectedStyle = useMemo(() => styles.find((item) => item.id === selectedStyleId), [styles, selectedStyleId]);

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) { setNotice(`${file.name}: 12MB 이하 파일만 등록할 수 있어요.`); continue; }
      if (!ACCEPTED.includes(file.type) && !/\.(pdf|txt|md|docx)$/i.test(file.name)) { setNotice(`${file.name}: PDF, DOCX, TXT, MD만 지원해요.`); continue; }
      const record: MaterialRecord = { id: uid("material"), name: file.name, type: file.type || "application/octet-stream", size: file.size, updatedAt: new Date().toISOString(), blob: file };
      await putMaterial(record);
      setMaterials((current) => [record, ...current]);
      setSelectedMaterialIds((current) => [...current, record.id]);
    }
    event.target.value = "";
  }

  async function analyzeStyle() {
    if (!source.trim()) { setNotice("참고할 링크나 글을 입력해 주세요."); return; }
    setAnalyzing(true); setNotice("");
    try {
      const response = await fetch("/api/style/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceType, source: source.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "문체 분석에 실패했습니다.");
      setSignature(data.signature || "");
      if (!styleName) setStyleName(data.suggestedName || "새 문체");
    } catch (error) { setNotice(error instanceof Error ? error.message : "문체 분석에 실패했습니다."); }
    finally { setAnalyzing(false); }
  }

  function saveStyle() {
    if (!styleName.trim() || !signature.trim()) { setNotice("문체 이름과 분석 결과가 필요해요."); return; }
    const now = new Date().toISOString();
    const profile: StyleProfile = { id: uid("style"), name: styleName.trim(), sourceType, sourceUrl: sourceType === "blog" || sourceType === "post" ? source.trim() : undefined, signature: signature.trim(), defaultIntensity: intensity, createdAt: now, updatedAt: now };
    const next = [profile, ...styles]; saveStyles(next); setStyles(next); setSelectedStyleId(profile.id); localStorage.setItem(SELECTED_STYLE_KEY, profile.id); setNotice(`'${profile.name}' 문체를 저장했어요.`);
  }

  function chooseStyle(id: string) { setSelectedStyleId(id); if (id) localStorage.setItem(SELECTED_STYLE_KEY, id); else localStorage.removeItem(SELECTED_STYLE_KEY); }
  function removeStyle(id: string) {
    const next = styles.filter((item) => item.id !== id); saveStyles(next); setStyles(next);
    if (selectedStyleId === id) chooseStyle("");
  }

  async function exportPack() {
    const chosenMaterials = materials.filter((item) => selectedMaterialIds.includes(item.id));
    const manifest: PackManifest = {
      kind: "blotori-pack", version: 1, name: "내 블로토리 팩", exportedAt: new Date().toISOString(), styles,
      materials: await Promise.all(chosenMaterials.map(async (item) => ({ id: item.id, name: item.name, type: item.type, size: item.size, updatedAt: item.updatedAt, dataUrl: await readAsDataUrl(item.blob) }))),
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: "application/vnd.blotori+json" });
    const href = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = href; anchor.download = `blotori-pack-${new Date().toISOString().slice(0,10)}.blotori`; anchor.click(); URL.revokeObjectURL(href);
  }

  async function importPack(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("팩 파일은 50MB 이하만 가져올 수 있어요.");
      const pack = JSON.parse(await file.text()) as PackManifest;
      if (pack.kind !== "blotori-pack" || pack.version !== 1 || !Array.isArray(pack.styles) || !Array.isArray(pack.materials)) throw new Error("지원하지 않는 블로토리 팩이에요.");
      const importedStyles = pack.styles.map((item) => ({ ...item, id: uid("style"), updatedAt: new Date().toISOString() }));
      const nextStyles = [...importedStyles, ...styles]; saveStyles(nextStyles); setStyles(nextStyles);
      for (const item of pack.materials) {
        if (!item.dataUrl || item.size > MAX_FILE_BYTES) continue;
        await putMaterial({ id: uid("material"), name: item.name, type: item.type, size: item.size, updatedAt: new Date().toISOString(), blob: dataUrlToBlob(item.dataUrl) });
      }
      setMaterials(await listMaterials()); setNotice(`문체 ${importedStyles.length}개와 자료 ${pack.materials.length}개를 가져왔어요.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "팩을 가져오지 못했어요."); }
    finally { event.target.value = ""; }
  }

  if (!mount) return null;
  return createPortal(<>
    <section className="settingGroup assetStudioGroup referenceMaterialGroup">
      <div className="settingGroupHeader"><span>3</span><div><div className="settingGroupTitle"><h3>참고자료</h3><em>선택</em></div><p>이번 글의 내용·근거로 참고할 파일을 올리거나 자료함에서 골라요.</p></div></div>
      <div className="settingGroupBody assetStudioBody">
        <input ref={fileInput} className="assetHiddenInput" type="file" multiple accept=".pdf,.docx,.txt,.md" onChange={addFiles} />
        <button type="button" className="assetDropzone" onClick={() => fileInput.current?.click()}><strong>＋ 참고자료 추가</strong><span>PDF · DOCX · TXT · MD, 파일당 12MB 이하</span></button>
        {materials.length > 0 && <div className="assetList">{materials.map((item) => <label key={item.id} className={`assetRow ${selectedMaterialIds.includes(item.id) ? "selected" : ""}`}><input type="checkbox" checked={selectedMaterialIds.includes(item.id)} onChange={() => setSelectedMaterialIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span><strong>{item.name}</strong><small>{formatBytes(item.size)} · 내 자료함</small></span><button type="button" className="assetMiniButton danger" onClick={(event) => { event.preventDefault(); void deleteMaterial(item.id).then(() => { setMaterials((current) => current.filter((x) => x.id !== item.id)); setSelectedMaterialIds((current) => current.filter((id) => id !== item.id)); }); }}>삭제</button></label>)}</div>}
        <p className="assetHint">체크한 자료만 이번 글 생성 요청에 함께 들어가요. 파일은 브라우저의 내 자료함에 보관됩니다.</p>
      </div>
    </section>

    <section className="settingGroup assetStudioGroup styleProfileGroup">
      <div className="settingGroupHeader"><span>4</span><div><div className="settingGroupTitle"><h3>내 문체</h3></div><p>한 번 만든 문체를 이름 붙여 저장하고 다음 글에서도 다시 사용해요.</p></div></div>
      <div className="settingGroupBody assetStudioBody">
        <label className="field"><span>저장한 문체</span><select value={selectedStyleId} onChange={(e) => chooseStyle(e.target.value)}><option value="">블로토리 기본 문체 사용</option>{styles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {selectedStyle && <div className="selectedStyleCard"><div><strong>{selectedStyle.name}</strong><span>기본 강도 {selectedStyle.defaultIntensity}/5 · {selectedStyle.sourceType}</span></div><button type="button" className="assetMiniButton danger" onClick={() => removeStyle(selectedStyle.id)}>삭제</button><p>{selectedStyle.signature}</p></div>}
        <details className="styleBuilder"><summary>＋ 새 문체 만들기</summary><div className="styleBuilderBody">
          <div className="sourceTabs">{([['blog','블로그 전체'],['post','포스팅 1개'],['pasted_text','글 붙여넣기'],['manual','직접 설정']] as const).map(([id,label]) => <button key={id} type="button" className={sourceType === id ? "active" : ""} onClick={() => { setSourceType(id); setSource(""); setSignature(""); }}>{label}</button>)}</div>
          <label className="field"><span>{sourceType === "blog" ? "블로그 주소" : sourceType === "post" ? "포스팅 주소" : sourceType === "pasted_text" ? "참고할 글" : "원하는 문체 설명"}</span>{sourceType === "pasted_text" || sourceType === "manual" ? <textarea rows={5} value={source} onChange={(e) => setSource(e.target.value)} placeholder={sourceType === "pasted_text" ? "참고하고 싶은 글 일부를 붙여넣으세요." : "예: 짧은 문단, 부드러운 해요체, 공감 질문으로 시작"} /> : <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://..." />}</label>
          <button type="button" className="secondaryAction assetAnalyze" disabled={analyzing} onClick={analyzeStyle}>{analyzing ? "문체 분석 중…" : "문체 분석하기"}</button>
          {signature && <><label className="field"><span>분석된 문체 특성</span><textarea rows={6} value={signature} onChange={(e) => setSignature(e.target.value)} /></label><label className="field"><span>문체 이름</span><input value={styleName} onChange={(e) => setStyleName(e.target.value)} placeholder="예: 내 건강정보 블로그체" /></label><label className="field"><span>기본 문체 강도</span><select value={intensity} onChange={(e) => setIntensity(Number(e.target.value) as 1|2|3|4|5)}>{[1,2,3,4,5].map((level) => <option key={level} value={level}>{level}</option>)}</select></label><button type="button" className="primary assetSaveStyle" onClick={saveStyle}>내 문체로 저장</button></>}
          <p className="assetHint">원문 문장을 저장해 복제하는 대신 말투·문장 길이·문단 리듬·도입·소제목·마무리 방식 같은 스타일 특성을 저장합니다.</p>
        </div></details>
      </div>
    </section>

    <section className="settingGroup assetStudioGroup packGroup">
      <div className="settingGroupHeader"><span>5</span><div><div className="settingGroupTitle"><h3>공유 팩</h3><em>선택</em></div><p>문체와 자료를 .blotori 파일로 내보내 다른 사용자에게 전달할 수 있어요.</p></div></div>
      <div className="settingGroupBody packActions"><input ref={packInput} className="assetHiddenInput" type="file" accept=".blotori,application/json" onChange={importPack} /><button type="button" className="ghost" onClick={() => packInput.current?.click()}>팩 가져오기</button><button type="button" className="ghost" onClick={() => void exportPack()}>자료·문체 내보내기</button></div>
    </section>
    {notice && <div className="assetNotice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>×</button></div>}
  </>, mount);
}
