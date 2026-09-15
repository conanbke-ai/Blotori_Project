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
  StyleIntensity,
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
type InspectorTab = "images" | "qa";
type MobilePanel = "settings" | "preview" | "review";

const initialForm: ComposerForm = {
  platformId: "",
  otherPlatform: "",
  categoryId: "",
  presetId: "",
  freeTopic: "",
  attributes: {},
  extraConditions: "",
  styleId: "auto",
  styleIntensity: 3,
  customStyle: "",
  structureId: "auto",
  customStructure: "",
  length: "medium",
  imageCount: 4,
};

const lengthLabel: Record<Length, string> = { short: "짧게", medium: "보통", long: "길게" };
const styleIntensityLabel: Record<StyleIntensity, string> = {
  1: "절제됨",
  2: "부드러움",
  3: "자연스러움",
  4: "적극적",
  5: "개성 강함",
};
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
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("images");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("settings");
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
      setDraft(data.draft); setMode(data.mode); setEditMode(false); setSuccessVisible(true); setMobilePanel("preview");
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
    <main className={`shell appShell workspaceV2 mobile-${mobilePanel}`} aria-busy={loading}>
      <header className="topbar blotoriTopbar workspaceHeader">
        <div className="brandIntro compactBrand">
          <img className="blotoriMascotTop" src="/blotori-face-ui.png" alt="블로토리" />
          <div>
            <div className="eyebrow">BLOTORI · BLOG WORKSPACE</div>
            <h1>글과 이미지를 엮어, 이야기를 완성해요.</h1>
            <p>주제와 몇 가지 조건만 정하면 플랫폼에 맞는 글 구조·강조·이미지 배치까지 한 번에 구성합니다.</p>
          </div>
        </div>
        <div className="topActions workspaceTopActions">
          {platformProfile && <span className="platformChip">{platformProfile.label}</span>}
          <button className="ghost iconGhost" onClick={() => setSettingsOpen((v) => !v)} aria-label="작성 설정 열기 또는 접기">{settingsOpen ? "설정 숨기기" : "설정 열기"}</button>
          <button className="ghost iconGhost" onClick={() => setGuideOpen((v) => !v)} aria-label="검수 패널 열기 또는 접기">{guideOpen ? "검수 숨기기" : "검수 열기"}</button>
          <details className="devStatusMenu">
            <summary aria-label="개발 연결 상태">연결 상태</summary>
            <div className="devStatusPopover">
              <div className={`apiStatus ${apiHealth?.ok ? "ok" : "bad"}`} title={apiHealth?.message ?? "API 상태 확인 중"}><span className="apiDot" /><span>{apiHealth ? (apiHealth.keyDetected ? "API 키 감지" : "API 키 미감지") : "API 확인 중"}</span>{apiHealth?.model && <small>{apiHealth.model}</small>}</div>
              <button className="ghost" onClick={() => void loadApiHealth(true)} disabled={healthLoading}>{healthLoading ? "확인 중…" : "연결 테스트"}</button>
              <div className="costBadge"><span>AI 기본 호출</span><strong>1회 / 글</strong></div>
            </div>
          </details>
        </div>
      </header>

      <nav className="mobileWorkspaceTabs" aria-label="모바일 작업 단계">
        <button className={mobilePanel === "settings" ? "active" : ""} onClick={() => setMobilePanel("settings")}>설정</button>
        <button className={mobilePanel === "preview" ? "active" : ""} onClick={() => setMobilePanel("preview")}>미리보기</button>
        <button className={mobilePanel === "review" ? "active" : ""} onClick={() => setMobilePanel("review")}>이미지·검수</button>
      </nav>

      <div className={`workspace workspaceApp workspaceGridV2 ${settingsOpen ? "" : "settingsClosed"} ${guideOpen ? "" : "guideClosed"}`}>
        {settingsOpen && <aside className="panel controls scrollPanel settingsRail" data-mobile-panel="settings">
          <div className="railHeading">
            <div><span className="step">01</span><div><h2>작성 설정</h2><p>무엇을, 어디에, 어떤 방식으로 쓸지 정해요.</p></div></div>
            <span className="subtle">플랫폼 + 주제 필수</span>
          </div>

          <SettingGroup index="1" title="플랫폼" description="게시할 공간에 맞춰 글 구조와 복사 형식이 달라져요.">
            <Field label="게시 플랫폼 *"><select value={form.platformId} onChange={(e) => patch({ platformId: e.target.value as PlatformId | "", otherPlatform: "" })}><option value="">플랫폼 선택</option>{PLATFORM_PROFILES.map((platform) => <option key={platform.id} value={platform.id}>{platform.label}</option>)}</select></Field>
            {platformProfile && <p className="hint platformHint">{platformProfile.description} · {platformProfile.exportHint}</p>}
            {form.platformId === "other" && <Field label="기타 플랫폼명 *"><input value={form.otherPlatform ?? ""} onChange={(e) => patch({ otherPlatform: e.target.value })} placeholder="예: 회사 자체 블로그" /></Field>}
          </SettingGroup>

          <SettingGroup index="2" title="주제" description="추천 주제를 고르거나 자유롭게 입력할 수 있어요.">
            <Field label="상위 카테고리"><select value={form.categoryId ?? ""} onChange={(e) => patch({ categoryId: e.target.value, presetId: "", attributes: {} })}><option value="">선택 안 함</option>{CATEGORY_DEFINITIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
            {category?.presets.length ? <Field label="추천 주제"><select value={form.presetId ?? ""} onChange={(e) => patch({ presetId: e.target.value })}><option value="">직접 주제 입력</option>{category.presets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field> : null}
            <Field label="자유 주제·추가 설명"><textarea value={form.freeTopic ?? ""} onChange={(e) => patch({ freeTopic: e.target.value })} rows={3} placeholder="주제를 문장이나 단어로 자유롭게 입력" /></Field>
          </SettingGroup>

          {visibleFieldIds.length > 0 && <SettingGroup index="3" title="주제별 추가 조건" description="선택한 주제에 필요한 조건만 보여줘요." optional>
            {visibleFieldIds.map((fieldId) => {
              const field = FIELD_DEFINITIONS[fieldId]; if (!field) return null;
              return <Field key={fieldId} label={field.label}>{field.type === "select" ? <select value={form.attributes[fieldId] ?? ""} onChange={(e) => setAttribute(fieldId, e.target.value)}><option value="">지정 안 함</option>{field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <input value={form.attributes[fieldId] ?? ""} onChange={(e) => setAttribute(fieldId, e.target.value)} placeholder={field.placeholder} />}</Field>;
            })}
          </SettingGroup>}

          <SettingGroup index="4" title="기본 문체 · 글 구성" description="저장한 내 문체를 쓰지 않을 때 적용할 기본값과 글 구조를 정해요.">
            <Field label="글 구성"><select value={form.structureId} onChange={(e) => patch({ structureId: e.target.value as StructureId })}><option value="auto">자동 추천</option>{recommendedStructures.length > 0 && <optgroup label="이 주제 추천">{recommendedStructures.map((id) => { const item = STRUCTURE_DEFINITIONS.find((x) => x.id === id); return item ? <option key={id} value={id}>★ {item.label}</option> : null; })}</optgroup>}<optgroup label="전체 구성">{STRUCTURE_DEFINITIONS.filter((x) => !recommendedStructures.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup><option value="custom">직접 설정</option></select></Field>
            {form.structureId === "custom" && <Field label="직접 구성"><input value={form.customStructure ?? ""} onChange={(e) => patch({ customStructure: e.target.value })} /></Field>}
            <Field label="문체"><select value={form.styleId} onChange={(e) => patch({ styleId: e.target.value as StyleId })}><option value="auto">자동 추천</option>{recommendedStyles.length > 0 && <optgroup label="이 주제 추천">{recommendedStyles.map((id) => { const item = STYLE_DEFINITIONS.find((x) => x.id === id); return item ? <option key={id} value={id}>★ {item.label}</option> : null; })}</optgroup>}<optgroup label="전체 문체">{STYLE_DEFINITIONS.filter((x) => !recommendedStyles.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup><option value="custom">직접 설정</option></select></Field>
            {form.styleId === "custom" && <Field label="직접 문체"><input value={form.customStyle ?? ""} onChange={(e) => patch({ customStyle: e.target.value })} /></Field>}
            <Field label="문체 강도"><select value={form.styleIntensity ?? 3} onChange={(e) => patch({ styleIntensity: Number(e.target.value) as StyleIntensity })}>{([1, 2, 3, 4, 5] as StyleIntensity[]).map((level) => <option key={level} value={level}>{level} · {styleIntensityLabel[level]}</option>)}</select><small className="hint">문체의 특징을 얼마나 선명하게 드러낼지 조절합니다. 기본값은 3이에요.</small></Field>
          </SettingGroup>

          <SettingGroup index="5" title="출력 설정" description="글 길이와 이미지 수, 기타 요청을 마지막으로 확인해요.">
            <div className="splitRow"><Field label="글 길이"><select value={form.length} onChange={(e) => patch({ length: e.target.value as Length })}>{(Object.keys(lengthLabel) as Length[]).map((key) => <option key={key} value={key}>{lengthLabel[key]}</option>)}</select></Field><Field label="이미지 수"><select value={form.imageCount} onChange={(e) => patch({ imageCount: Number(e.target.value) })}>{[2,3,4,5].map((n) => <option key={n} value={n}>{n}장</option>)}</select></Field></div>
            <Field label="기타 조건·요청"><textarea value={form.extraConditions ?? ""} onChange={(e) => patch({ extraConditions: e.target.value })} rows={3} placeholder="꼭 넣을 내용, 제외할 표현, 별도 요청" /></Field>
          </SettingGroup>

          <div className="controlsActionDock stickyGenerateDock">{error && <div className="errorBox stickyError">{error}</div>}{!apiHealth?.keyDetected && apiHealth && <div className="apiWarning">{apiHealth.message}</div>}<button className="primary generatePrimary" onClick={generate} disabled={loading || !canGenerate}>{loading ? "구성 중…" : "✦ 블로그 글 생성하기"}</button><small>글 생성은 기본 AI 호출 1회로 진행돼요.</small></div>
        </aside>}

        <section className="panel previewPanel appPreviewPanel previewStage" data-mobile-panel="preview">
          <div className="panelHeader previewHeader workspacePreviewHeader">
            <div><span className="step">02</span><div><h2>{platformProfile ? `${platformProfile.label} 게시물 미리보기` : "게시물 미리보기"}</h2><p>{platformProfile ? `${platformProfile.label} 형식으로 실제 게시될 모습을 확인해요.` : "플랫폼을 선택하면 해당 형식에 맞춰 보여드려요."}</p></div></div>
            <div className="headerActions">
              {mode && <span className={`mode ${mode}`}>{mode === "api" ? "AI 생성" : "샘플"}</span>}
              <div className="segmentedMode"><button className={!editMode ? "active" : ""} disabled={!draft} onClick={() => setEditMode(false)}>미리보기</button><button className={editMode ? "active" : ""} disabled={!draft} onClick={() => setEditMode(true)}>직접 편집</button></div>
            </div>
          </div>

          {!draft ? <div className="emptyState blotoriEmptyState workspaceEmpty"><img className="blotoriMascotEmpty" src="/blotori-character-ui.png" alt="블로토리" /><div><span className="emptyEyebrow">READY TO COMPOSE</span><h3>왼쪽에서 플랫폼과 주제를 먼저 정해 주세요.</h3><p>글을 만들면 이곳이 실제 게시물 중심의 작업 공간으로 바뀌어요.</p></div></div> :
          <div className="previewLayout appPreviewLayout previewOnlyLayout">
            <div className="blogScroller" ref={previewScrollRef}>
              <article className={`blogPaper ${platformClass} density-${draft.presentation?.density ?? "balanced"}`}>
                {draft.titleCandidates?.length ? <div className="titleCandidatePanel"><div><strong>추천 제목</strong>{draft.titlePurpose && <span>{draft.titlePurpose}</span>}</div><div className="titleCandidateList">{draft.titleCandidates.slice(0,3).map((candidate, index) => <button key={`${candidate}-${index}`} className={candidate === draft.title ? "selected" : ""} onClick={() => updateDraft("title", candidate)}><b>{index + 1}</b><span>{candidate}</span><em>{candidate === draft.title ? "적용됨" : "적용"}</em></button>)}</div></div> : null}
                {editMode ? <input className="titleEdit" value={draft.title} onChange={(e) => updateDraft("title", e.target.value)} /> : <h1 className={`previewTitle align-${draft.presentation?.titleAlign ?? "left"}`}>{draft.title}</h1>}
                {editMode ? <textarea className="summaryEdit" value={draft.summary} onChange={(e) => updateDraft("summary", e.target.value)} rows={3} /> : <p className="summary">{draft.summary}</p>}
                {(imageMap.get(null) ?? []).map((image) => <ImageSlot key={image.id} image={image} editMode={editMode} updateImage={updateImage} copyText={copyText} copied={copied} />)}
                <div className={`introBlock align-${draft.presentation?.introAlign ?? "left"}`}>{draft.intro.map((p, i) => editMode ? <textarea key={i} className="paragraphEdit" value={p} onChange={(e) => updateArrayItem("intro", i, e.target.value)} rows={Math.max(3, Math.ceil(p.length/38))} /> : <p key={i}>{p}</p>)}</div>
                {draft.sections.map((section) => <SectionPreview key={section.id} section={section} editMode={editMode} updateSection={updateSection} updateParagraph={updateParagraph}>{(imageMap.get(section.id) ?? []).map((image) => <ImageSlot key={image.id} image={image} editMode={editMode} updateImage={updateImage} copyText={copyText} copied={copied} />)}</SectionPreview>)}
                <div className="closingBlock">{draft.closing.map((p, i) => editMode ? <textarea key={i} className="paragraphEdit" value={p} onChange={(e) => updateArrayItem("closing", i, e.target.value)} rows={Math.max(3, Math.ceil(p.length/38))} /> : <p key={i}>{p}</p>)}</div>
                <div className={`tags ${editMode ? "tagsEditing" : ""}`}>{draft.tags.map((tag, i) => editMode ? <input key={i} value={tag} onChange={(e) => updateArrayItem("tags", i, e.target.value)} aria-label={`태그 ${i+1}`} /> : <span key={`${tag}-${i}`}>#{tag.replace(/^#/, "")}</span>)}</div>
              </article>
            </div>
          </div>}

          {draft && <div className="previewActionBar"><button className="ghost" onClick={() => scrollPreview("top")}>↑ TOP</button><div><button className="secondaryAction" disabled={!form.platformId} onClick={copyPlatformDraft}>{copied === "platform" ? "본문 복사됨 ✓" : `${platformProfile?.label ?? "플랫폼"}용 본문 복사`}</button><button className="ghost" onClick={copyTags}>{copied === "tags" ? "태그 복사됨 ✓" : "태그 복사"}</button></div><button className="ghost" onClick={() => scrollPreview("bottom")}>↓ END</button></div>}
        </section>

        {guideOpen && <aside className="panel inspectorRail scrollPanel" data-mobile-panel="review">
          <div className="railHeading inspectorHeading"><div><span className="step">03</span><div><h2>이미지 · 검수</h2><p>게시 전 마지막 완성도를 확인해요.</p></div></div></div>
          <div className="inspectorTabs" role="tablist"><button role="tab" aria-selected={inspectorTab === "images"} className={inspectorTab === "images" ? "active" : ""} onClick={() => setInspectorTab("images")}>이미지</button><button role="tab" aria-selected={inspectorTab === "qa"} className={inspectorTab === "qa" ? "active" : ""} onClick={() => setInspectorTab("qa")}>검수</button></div>
          {!draft ? <div className="inspectorEmpty"><strong>글 생성 후 사용할 수 있어요.</strong><p>이미지 프롬프트, 배치 위치, 근거자료 및 표현 검수를 한곳에서 확인합니다.</p></div> : inspectorTab === "images" ? <div className="guideRailContent"><div className="guideTitle"><strong>이미지 제작 가이드</strong><span>{draft.images.length}개</span></div>{draft.images.map((image) => <PromptCard key={image.id} image={image} editMode={editMode} updateImage={updateImage} copyText={copyText} copied={copied} />)}</div> : <QualityInspector draft={draft} />}
        </aside>}
      </div>

      {loading && <div className="generationOverlay" role="status" aria-live="polite"><div className="blotoriStateCard"><img className="loadingMascot" src="/blotori-character-ui.png" alt="블로토리" /><div className="blotoriStateEyebrow">BLOTORI IS COMPOSING</div><h2>글과 이미지를 차근차근 엮고 있어요.</h2><p>{loadingStages[loadingStage]}</p><div className="blotoriProgressTrack"><div className="blotoriProgressBar" /></div><div className="blotoriStageList">{loadingStages.map((stage, index) => <div key={stage} className={`blotoriStageRow ${index < loadingStage ? "done" : index === loadingStage ? "active" : ""}`}><span className="stageDot">{index < loadingStage ? "✓" : index + 1}</span><span>{stage}</span></div>)}</div><span className="generationMeta">AI 호출은 기존 1회 그대로예요.</span></div></div>}
      {successVisible && draft && <div className="successToast" role="status" aria-live="polite"><div className="successPaw">✦</div><div><strong>블로토리가 원고를 완성했어요.</strong><span>제목·이미지·검수 결과까지 확인해 주세요.</span></div><button onClick={() => setSuccessVisible(false)} aria-label="완료 알림 닫기">×</button></div>}
    </main>
  );
}

function SettingGroup({ index, title, description, optional = false, children }: { index: string; title: string; description: string; optional?: boolean; children: ReactNode }) {
  return <section className="settingGroup"><div className="settingGroupHeader"><span>{index}</span><div><div className="settingGroupTitle"><h3>{title}</h3>{optional && <em>선택</em>}</div><p>{description}</p></div></div><div className="settingGroupBody">{children}</div></section>;
}

function QualityInspector({ draft }: { draft: BlogDraft }) {
  const grounding = draft.knowledgeGrounding;
  const glossarySection = draft.sections.find((section) => section.presentation?.visualStyle === "glossary");
  const glossaryCount = glossarySection?.paragraphs.length ?? 0;
  return <div className="qualityInspector">
    <div className={`qaSummary ${draft.warnings.length ? "warn" : "ok"}`}><span>{draft.warnings.length ? "확인 필요" : "검수 양호"}</span><strong>{draft.warnings.length ? `${draft.warnings.length}개 표현을 확인해 주세요.` : "현재 감지된 주의 표현이 없어요."}</strong></div>
    <div className="qaChecklist">
      <QaRow status={grounding?.used ? "ok" : "neutral"} title="전문자료 참고" description={grounding?.used ? `${grounding.sourceNames.length}개 자료에서 근거를 참고했어요.` : "이번 글은 등록된 전문자료를 참고하지 않았어요."} />
      <QaRow status={glossaryCount > 0 ? "ok" : "neutral"} title="전문용어 해설" description={glossaryCount > 0 ? `${glossaryCount}개 용어 해설이 포함되어 있어요.` : "추가된 용어해설이 없어요."} />
      <QaRow status={draft.warnings.length ? "warn" : "ok"} title="표현 안전성" description={draft.warnings.length ? "아래 주의 표현을 게시 전에 확인해 주세요." : "현재 감지된 주의 표현이 없어요."} />
    </div>
    {draft.warnings.length > 0 && <div className="warningList"><strong>주의 표현</strong>{draft.warnings.map((warning, index) => <div key={`${warning}-${index}`}><span>!</span><p>{warning}</p></div>)}</div>}
    {grounding?.used && grounding.sourceNames.length > 0 && <details className="sourceDetails"><summary>참고 자료 보기</summary><ul>{grounding.sourceNames.map((source) => <li key={source}>{source}</li>)}</ul></details>}
  </div>;
}

function QaRow({ status, title, description }: { status: "ok" | "warn" | "neutral"; title: string; description: string }) {
  return <div className={`qaRow ${status}`}><span className="qaIcon">{status === "ok" ? "✓" : status === "warn" ? "!" : "·"}</span><div><strong>{title}</strong><p>{description}</p></div></div>;
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
