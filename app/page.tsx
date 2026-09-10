"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildPlatformExport } from "../lib/application/platform-exporter";
import type {
  BlogDraft,
  BlogSection,
  GenerateRequest,
  ImagePlan,
  Length,
  PlatformId,
  StructureId,
  StyleId,
  TextEmphasis,
} from "../lib/domain/types";
import {
  CATEGORY_DEFINITIONS,
  FIELD_DEFINITIONS,
  PLATFORM_PROFILES,
  STRUCTURE_DEFINITIONS,
  STYLE_DEFINITIONS,
  getCategory,
  getPreset,
} from "../lib/domain/content-config";

type ComposerForm = Omit<GenerateRequest, "platformId"> & { platformId: PlatformId | "" };
type ApiHealth = {
  ok: boolean;
  keyDetected: boolean;
  model: string;
  verified: boolean;
  message: string;
  sample?: string;
};

const initialForm: ComposerForm = {
  platformId: "",
  otherPlatform: "",
  categoryId: "",
  presetId: "",
  freeTopic: "",
  attributes: {},
  extraConditions: "",
  styleId: "auto",
  customStyle: "",
  structureId: "auto",
  customStructure: "",
  length: "medium",
  imageCount: 4,
};

const lengthLabel: Record<Length, string> = { short: "짧게", medium: "보통", long: "길게" };
const loadingStages = [
  "주제와 플랫폼 조건을 정리하고 있어요.",
  "제목·본문 구성과 문체를 맞추고 있어요.",
  "강조 포인트와 이미지 위치를 정리하고 있어요.",
  "최종 미리보기를 정돈하고 있어요.",
];

function emphasizedText(text: string, emphasis: TextEmphasis[] = []) {
  const valid = emphasis
    .filter((item) => item.phrase && text.includes(item.phrase))
    .sort((a, b) => text.indexOf(a.phrase) - text.indexOf(b.phrase));
  if (!valid.length) return text;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  valid.forEach((item, index) => {
    const start = text.indexOf(item.phrase, cursor);
    if (start < 0) return;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(<span key={`${item.phrase}-${index}`} className={`textEmphasis ${item.kind}`}>{item.phrase}</span>);
    cursor = start + item.phrase.length;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export default function Home() {
  const [form, setForm] = useState<ComposerForm>(initialForm);
  const [draft, setDraft] = useState<BlogDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [successVisible, setSuccessVisible] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"mock" | "api" | null>(null);
  const [copied, setCopied] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [guideOpen, setGuideOpen] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [apiHealth, setApiHealth] = useState<ApiHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const previewScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { void loadApiHealth(false); }, []);
  useEffect(() => {
    if (!loading) { setLoadingStage(0); return; }
    const timer = window.setInterval(() => setLoadingStage((current) => Math.min(current + 1, loadingStages.length - 1)), 1150);
    return () => window.clearInterval(timer);
  }, [loading]);
  useEffect(() => {
    if (!successVisible) return;
    const timer = window.setTimeout(() => setSuccessVisible(false), 2600);
    return () => window.clearTimeout(timer);
  }, [successVisible]);

  const category = useMemo(() => getCategory(form.categoryId), [form.categoryId]);
  const preset = useMemo(() => getPreset(form.categoryId, form.presetId), [form.categoryId, form.presetId]);
  const platformProfile = useMemo(() => PLATFORM_PROFILES.find((platform) => platform.id === form.platformId), [form.platformId]);
  const visibleFieldIds = useMemo(() => [...new Set(preset?.fieldIds ?? category?.defaultFieldIds ?? [])], [category, preset]);
  const recommendedStyles = preset?.recommendedStyleIds ?? [];
  const recommendedStructures = preset?.recommendedStructureIds ?? [];
  const imageMap = useMemo(() => {
    const map = new Map<string | null, ImagePlan[]>();
    if (!draft) return map;
    for (const image of draft.images) map.set(image.afterSectionId, [...(map.get(image.afterSectionId) ?? []), image]);
    return map;
  }, [draft]);

  const hasTopic = Boolean(form.presetId || form.freeTopic?.trim());
  const canGenerate = Boolean(form.platformId) && (form.platformId !== "other" || Boolean(form.otherPlatform?.trim())) && hasTopic;
  const platformClass = form.platformId ? `platform-${form.platformId}` : "platform-generic";

  function patch(next: Partial<ComposerForm>) { setForm((prev) => ({ ...prev, ...next })); }
  function setAttribute(id: string, value: string) { setForm((prev) => ({ ...prev, attributes: { ...prev.attributes, [id]: value } })); }

  async function loadApiHealth(verify: boolean) {
    setHealthLoading(true);
    try {
      const res = await fetch(`/api/health${verify ? "?verify=1" : ""}`, { cache: "no-store" });
      setApiHealth(await res.json() as ApiHealth);
    } catch (e) {
      setApiHealth({ ok: false, keyDetected: false, model: "-", verified: verify, message: e instanceof Error ? e.message : "API 진단 요청에 실패했습니다." });
    } finally { setHealthLoading(false); }
  }

  async function generate() {
    if (!form.platformId) return setError("게시할 플랫폼을 선택해 주세요.");
    if (form.platformId === "other" && !form.otherPlatform?.trim()) return setError("기타 플랫폼명을 입력해 주세요.");
    if (!hasTopic) return setError("추천 주제를 선택하거나 자유 주제를 입력해 주세요.");

    setLoading(true); setLoadingStage(0); setSuccessVisible(false); setError("");
    try {
      const payload: GenerateRequest = { ...form, platformId: form.platformId };
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "생성 실패");
      setDraft(data.draft); setMode(data.mode); setEditMode(false); setSuccessVisible(true);
      requestAnimationFrame(() => previewScrollRef.current?.scrollTo({ top: 0 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
      void loadApiHealth(false);
    } finally { setLoading(false); }
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key); window.setTimeout(() => setCopied(""), 1200);
  }

  async function copyPlatformDraft() {
    if (!draft || !form.platformId) return;
    const exported = buildPlatformExport(draft, form.platformId);
    try {
      if (exported.clipboardMode === "rich" && exported.html && "ClipboardItem" in window) {
        const item = new ClipboardItem({
          "text/plain": new Blob([exported.plainText], { type: "text/plain" }),
          "text/html": new Blob([exported.html], { type: "text/html" }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(exported.plainText);
      }
      setCopied("platform"); window.setTimeout(() => setCopied(""), 1200);
    } catch {
      await copyText(exported.plainText, "platform");
    }
  }

  async function copyTags() {
    if (!draft || !form.platformId) return;
    await copyText(buildPlatformExport(draft, form.platformId).tagsText, "tags");
  }

  function updateDraft<K extends keyof BlogDraft>(key: K, value: BlogDraft[K]) {
    setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  }
  function updateArrayItem(key: "intro" | "closing" | "tags", index: number, value: string) {
    setDraft((prev) => prev ? { ...prev, [key]: prev[key].map((item, i) => i === index ? value : item) } : prev);
  }
  function updateSection(sectionId: string, patchValue: Partial<BlogSection>) {
    setDraft((prev) => prev ? { ...prev, sections: prev.sections.map((section) => section.id === sectionId ? { ...section, ...patchValue } : section) } : prev);
  }
  function updateParagraph(sectionId: string, index: number, value: string) {
    setDraft((prev) => prev ? { ...prev, sections: prev.sections.map((section) => section.id === sectionId ? { ...section, paragraphs: section.paragraphs.map((p, i) => i === index ? value : p) } : section) } : prev);
  }
  function updateImage(imageId: string, patchValue: Partial<ImagePlan>) {
    setDraft((prev) => prev ? { ...prev, images: prev.images.map((image) => image.id === imageId ? { ...image, ...patchValue } : image) } : prev);
  }
  function scrollPreview(where: "top" | "bottom") {
    const el = previewScrollRef.current; if (!el) return;
    el.scrollTo({ top: where === "top" ? 0 : el.scrollHeight, behavior: "smooth" });
  }

  return (
    <main className="shell appShell" aria-busy={loading}>
      <header className="topbar blotoriTopbar">
        <div className="brandIntro">
          <img className="blotoriMascotTop" src="/blotori-canonical-mini.webp" alt="블로토리" />
          <div><div className="eyebrow">MULTI-PLATFORM BLOG COMPOSER</div><h1>플랫폼과 주제에 맞춰 블로그를 구성하세요.</h1><p>목적·문체·제목·본문·시각 강조·이미지 위치까지 한 번에 설계합니다.</p></div>
        </div>
        <div className="topActions">
          <div className={`apiStatus ${apiHealth?.ok ? "ok" : "bad"}`} title={apiHealth?.message ?? "API 상태 확인 중"}><span className="apiDot" /><span>{apiHealth ? (apiHealth.keyDetected ? "API 키 감지" : "API 키 미감지") : "API 확인 중"}</span>{apiHealth?.model && <small>{apiHealth.model}</small>}</div>
          <button className="ghost" onClick={() => void loadApiHealth(true)} disabled={healthLoading}>{healthLoading ? "확인 중…" : "연결 테스트"}</button>
          <button className="ghost" onClick={() => setSettingsOpen((v) => !v)}>{settingsOpen ? "설정 접기" : "설정 열기"}</button>
          <button className="ghost" onClick={() => setGuideOpen((v) => !v)}>{guideOpen ? "가이드 접기" : "가이드 열기"}</button>
          <div className="costBadge"><span>AI 기본 호출</span><strong>1회 / 글</strong></div>
        </div>
      </header>

      <div className={`workspace workspaceApp ${settingsOpen ? "" : "settingsClosed"}`}>
        {settingsOpen && <aside className="panel controls scrollPanel">
          <div className="panelHeader"><div><span className="step">01</span><h2>콘텐츠 설정</h2></div><span className="subtle">플랫폼 + 주제 필수</span></div>
          <Field label="게시 플랫폼 *"><select value={form.platformId} onChange={(e) => patch({ platformId: e.target.value as PlatformId | "", otherPlatform: "" })}><option value="">플랫폼 선택</option>{PLATFORM_PROFILES.map((platform) => <option key={platform.id} value={platform.id}>{platform.label}</option>)}</select></Field>
          {platformProfile && <p className="hint platformHint">{platformProfile.description} · {platformProfile.exportHint}</p>}
          {form.platformId === "other" && <Field label="기타 플랫폼명 *"><input value={form.otherPlatform ?? ""} onChange={(e) => patch({ otherPlatform: e.target.value })} placeholder="예: 회사 자체 블로그" /></Field>}
          <Field label="상위 카테고리"><select value={form.categoryId ?? ""} onChange={(e) => patch({ categoryId: e.target.value, presetId: "", attributes: {} })}><option value="">선택 안 함</option>{CATEGORY_DEFINITIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
          {category?.presets.length ? <Field label="추천 주제"><select value={form.presetId ?? ""} onChange={(e) => patch({ presetId: e.target.value })}><option value="">직접 주제 입력</option>{category.presets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field> : null}
          <Field label="자유 주제·추가 설명"><textarea value={form.freeTopic ?? ""} onChange={(e) => patch({ freeTopic: e.target.value })} rows={3} placeholder="주제를 문장이나 단어로 자유롭게 입력" /></Field>
          {visibleFieldIds.length > 0 && <div className="panelHeader miniHeader"><div><span className="step">+</span><h2>주제별 추가 조건</h2></div><span className="subtle">선택사항</span></div>}
          {visibleFieldIds.map((fieldId) => {
            const field = FIELD_DEFINITIONS[fieldId]; if (!field) return null;
            return <Field key={fieldId} label={field.label}>{field.type === "select" ? <select value={form.attributes[fieldId] ?? ""} onChange={(e) => setAttribute(fieldId, e.target.value)}><option value="">지정 안 함</option>{field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <input value={form.attributes[fieldId] ?? ""} onChange={(e) => setAttribute(fieldId, e.target.value)} placeholder={field.placeholder} />}</Field>;
          })}
          <Field label="기타 조건·요청"><textarea value={form.extraConditions ?? ""} onChange={(e) => patch({ extraConditions: e.target.value })} rows={3} placeholder="꼭 넣을 내용, 제외할 표현, 별도 요청" /></Field>
          <Field label="글 구성"><select value={form.structureId} onChange={(e) => patch({ structureId: e.target.value as StructureId })}><option value="auto">자동 추천</option>{recommendedStructures.length > 0 && <optgroup label="이 주제 추천">{recommendedStructures.map((id) => { const item = STRUCTURE_DEFINITIONS.find((x) => x.id === id); return item ? <option key={id} value={id}>★ {item.label}</option> : null; })}</optgroup>}<optgroup label="전체 구성">{STRUCTURE_DEFINITIONS.filter((x) => !recommendedStructures.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup><option value="custom">직접 설정</option></select></Field>
          {form.structureId === "custom" && <Field label="직접 구성"><input value={form.customStructure ?? ""} onChange={(e) => patch({ customStructure: e.target.value })} /></Field>}
          <Field label="문체"><select value={form.styleId} onChange={(e) => patch({ styleId: e.target.value as StyleId })}><option value="auto">자동 추천</option>{recommendedStyles.length > 0 && <optgroup label="이 주제 추천">{recommendedStyles.map((id) => { const item = STYLE_DEFINITIONS.find((x) => x.id === id); return item ? <option key={id} value={id}>★ {item.label}</option> : null; })}</optgroup>}<optgroup label="전체 문체">{STYLE_DEFINITIONS.filter((x) => !recommendedStyles.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup><option value="custom">직접 설정</option></select></Field>
          {form.styleId === "custom" && <Field label="직접 문체"><input value={form.customStyle ?? ""} onChange={(e) => patch({ customStyle: e.target.value })} /></Field>}
          <div className="splitRow"><Field label="글 길이"><select value={form.length} onChange={(e) => patch({ length: e.target.value as Length })}>{(Object.keys(lengthLabel) as Length[]).map((key) => <option key={key} value={key}>{lengthLabel[key]}</option>)}</select></Field><Field label="이미지 수"><select value={form.imageCount} onChange={(e) => patch({ imageCount: Number(e.target.value) })}>{[2,3,4,5].map((n) => <option key={n} value={n}>{n}장</option>)}</select></Field></div>
          <div className="controlsActionDock">{error && <div className="errorBox stickyError">{error}</div>}{!apiHealth?.keyDetected && apiHealth && <div className="apiWarning">{apiHealth.message}</div>}<button className="primary" onClick={generate} disabled={loading || !canGenerate}>{loading ? "구성 중…" : "✦ 블로그 콘텐츠 생성"}</button></div>
        </aside>}

        <section className="panel previewPanel appPreviewPanel">
          <div className="panelHeader previewHeader">
            <div><span className="step">02</span><h2>{platformProfile ? `${platformProfile.label} 미리보기` : "플랫폼 미리보기"}</h2></div>
            <div className="headerActions">
              {mode && <span className={`mode ${mode}`}>{mode === "api" ? "API 생성" : "샘플 모드"}</span>}
              <button className={`ghost ${editMode ? "active" : ""}`} disabled={!draft} onClick={() => setEditMode((v) => !v)}>{editMode ? "미리보기 모드" : "편집 모드"}</button>
              <button className="ghost" disabled={!draft || !form.platformId} onClick={copyPlatformDraft}>{copied === "platform" ? "본문 복사됨 ✓" : `${platformProfile?.label ?? "플랫폼"}용 본문 복사`}</button>
              <button className="ghost" disabled={!draft} onClick={copyTags}>{copied === "tags" ? "태그 복사됨 ✓" : "태그 복사"}</button>
            </div>
          </div>

          {!draft ? <div className="emptyState blotoriEmptyState"><img className="blotoriMascotEmpty" src="/blotori-canonical-mini.webp" alt="블로토리" /><div><h3>플랫폼과 주제를 선택해 주세요.</h3><p>설정이 끝나면 왼쪽 아래의 생성 버튼으로 실제 원고를 만들 수 있어요.</p><p className="emptyApiHint">{apiHealth?.keyDetected ? `API 키 감지됨 · ${apiHealth.model}` : "API 연결 상태를 확인 중입니다."}</p></div></div> :
          <div className={`previewLayout appPreviewLayout ${guideOpen ? "" : "guideClosed"}`}>
            <div className="blogScroller" ref={previewScrollRef}>
              <article className={`blogPaper ${platformClass} density-${draft.presentation?.density ?? "balanced"}`}>
                {editMode ? <input className="titleEdit" value={draft.title} onChange={(e) => updateDraft("title", e.target.value)} /> : <h1 className={`previewTitle align-${draft.presentation?.titleAlign ?? "left"}`}>{draft.title}</h1>}
                {draft.titleCandidates?.length ? <div className="titleCandidatePanel"><div><strong>제목 후보</strong>{draft.titlePurpose && <span>{draft.titlePurpose}</span>}</div><div className="titleCandidateList">{draft.titleCandidates.slice(0,3).map((candidate, index) => <button key={`${candidate}-${index}`} className={candidate === draft.title ? "selected" : ""} onClick={() => updateDraft("title", candidate)}><b>{index + 1}</b><span>{candidate}</span></button>)}</div></div> : null}
                {editMode ? <textarea className="summaryEdit" value={draft.summary} onChange={(e) => updateDraft("summary", e.target.value)} rows={3} /> : <p className="summary">{draft.summary}</p>}
                {(imageMap.get(null) ?? []).map((image) => <ImageSlot key={image.id} image={image} editMode={editMode} updateImage={updateImage} copyText={copyText} copied={copied} />)}
                <div className={`introBlock align-${draft.presentation?.introAlign ?? "left"}`}>{draft.intro.map((p, i) => editMode ? <textarea key={i} className="paragraphEdit" value={p} onChange={(e) => updateArrayItem("intro", i, e.target.value)} rows={Math.max(3, Math.ceil(p.length/38))} /> : <p key={i}>{p}</p>)}</div>
                {draft.sections.map((section) => <SectionPreview key={section.id} section={section} editMode={editMode} updateSection={updateSection} updateParagraph={updateParagraph}>{(imageMap.get(section.id) ?? []).map((image) => <ImageSlot key={image.id} image={image} editMode={editMode} updateImage={updateImage} copyText={copyText} copied={copied} />)}</SectionPreview>)}
                <div className="closingBlock">{draft.closing.map((p, i) => editMode ? <textarea key={i} className="paragraphEdit" value={p} onChange={(e) => updateArrayItem("closing", i, e.target.value)} rows={Math.max(3, Math.ceil(p.length/38))} /> : <p key={i}>{p}</p>)}</div>
                <div className={`tags ${editMode ? "tagsEditing" : ""}`}>{draft.tags.map((tag, i) => editMode ? <input key={i} value={tag} onChange={(e) => updateArrayItem("tags", i, e.target.value)} aria-label={`태그 ${i+1}`} /> : <span key={`${tag}-${i}`}>#{tag.replace(/^#/, "")}</span>)}</div>
              </article>
            </div>
            {guideOpen && <aside className="guideRail scrollPanel"><div className="guideTitle"><strong>이미지 제작 가이드</strong><span>{draft.images.length}개</span></div>{draft.images.map((image) => <PromptCard key={image.id} image={image} editMode={editMode} updateImage={updateImage} copyText={copyText} copied={copied} />)}</aside>}
          </div>}
        </section>
      </div>

      {loading && <div className="generationOverlay" role="status" aria-live="polite"><div className="blotoriStateCard"><img className="loadingMascot" src="/blotori-canonical-mini.webp" alt="블로토리" /><div className="blotoriStateEyebrow">BLOTORI IS COMPOSING</div><h2>글과 이미지를 차근차근 엮고 있어요.</h2><p>{loadingStages[loadingStage]}</p><div className="blotoriProgressTrack"><div className="blotoriProgressBar" /></div><div className="blotoriStageList">{loadingStages.map((stage, index) => <div key={stage} className={`blotoriStageRow ${index < loadingStage ? "done" : index === loadingStage ? "active" : ""}`}><span className="stageDot">{index < loadingStage ? "✓" : index + 1}</span><span>{stage}</span></div>)}</div><span className="generationMeta">AI 호출은 기존 1회 그대로예요.</span></div></div>}
      {successVisible && draft && <div className="successToast" role="status" aria-live="polite"><div className="successPaw">✦</div><div><strong>블로토리가 원고를 완성했어요.</strong><span>제목 후보와 플랫폼용 복사 결과까지 확인해 주세요.</span></div><button onClick={() => setSuccessVisible(false)} aria-label="완료 알림 닫기">×</button></div>}
      {draft && <div className="scrollNav" aria-label="미리보기 빠른 이동"><button onClick={() => scrollPreview("top")} title="맨 위로">TOP</button><button onClick={() => scrollPreview("bottom")} title="맨 아래로">BOTTOM</button></div>}
    </main>
  );
}

function SectionPreview({ section, editMode, updateSection, updateParagraph, children }: { section: BlogSection; editMode: boolean; updateSection: (sectionId: string, patchValue: Partial<BlogSection>) => void; updateParagraph: (sectionId: string, index: number, value: string) => void; children: ReactNode }) {
  const p = section.presentation;
  return <section className={`articleSection visual-${p?.visualStyle ?? "standard"}`}>
    {editMode ? <input className="sectionHeadingEdit" value={section.heading} onChange={(e) => updateSection(section.id, { heading: e.target.value })} /> : <h3 className={`align-${p?.headingAlign ?? "left"}`}>{section.heading}</h3>}
    <div className={`sectionBody align-${p?.bodyAlign ?? "left"}`}>{section.paragraphs.map((paragraph, index) => editMode ? <textarea key={index} className="paragraphEdit" value={paragraph} onChange={(e) => updateParagraph(section.id, index, e.target.value)} rows={Math.max(3, Math.ceil(paragraph.length / 38))} /> : <p key={index}>{emphasizedText(paragraph, p?.emphasis)}</p>)}</div>{children}
  </section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }

function ImageSlot({ image, editMode, updateImage, copyText, copied }: { image: ImagePlan; editMode: boolean; updateImage: (id: string, patchValue: Partial<ImagePlan>) => void; copyText: (text: string, key: string) => Promise<void>; copied: string }) {
  return <div className="imageSlot"><div className="slotBadge">{image.id}</div><div className="slotArt"><span>IMAGE</span><small>{image.ratio}</small></div><div className="slotInfo">{editMode ? <><input value={image.label} onChange={(e) => updateImage(image.id, { label: e.target.value })} /><input value={image.placement} onChange={(e) => updateImage(image.id, { placement: e.target.value })} /></> : <><div><strong>{image.label}</strong><span>{image.size}</span></div><p>{image.placement}</p></>}<button onClick={() => copyText(image.prompt, image.id)}>{copied === image.id ? "프롬프트 복사됨 ✓" : "이 이미지 프롬프트 복사"}</button></div></div>;
}

function PromptCard({ image, editMode, updateImage, copyText, copied }: { image: ImagePlan; editMode: boolean; updateImage: (id: string, patchValue: Partial<ImagePlan>) => void; copyText: (text: string, key: string) => Promise<void>; copied: string }) {
  return <div className="promptCard"><div className="promptTop"><strong>{image.id}</strong><span>{image.ratio}</span></div>{editMode ? <><input className="promptEdit" value={image.label} onChange={(e) => updateImage(image.id, { label: e.target.value })} /><input className="promptEdit" value={image.placement} onChange={(e) => updateImage(image.id, { placement: e.target.value })} /><textarea className="promptTextarea" value={image.prompt} onChange={(e) => updateImage(image.id, { prompt: e.target.value })} rows={7} /></> : <><p className="promptLabel">{image.label}</p><div className="meta"><span>{image.size}</span><span>{image.placement}</span>{image.continuityMode === "series" && <span>동일 인물 연속 · {image.continuityGroup ?? "series"}</span>}</div><p className="promptText">{image.prompt}</p></>}<button className="copyButton" onClick={() => copyText(image.prompt, image.id)}>{copied === image.id ? "복사됨 ✓" : "프롬프트 복사"}</button></div>;
}
