"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  "본문 구성과 문체를 맞추고 있어요.",
  "강조 포인트와 이미지 위치를 정리하고 있어요.",
  "최종 미리보기를 정돈하고 있어요.",
];

function imagePlaceholder(image: ImagePlan) {
  return `\n[${image.id} 삽입]\n위치: ${image.placement}\n권장: ${image.size} · ${image.ratio}\n`;
}

function buildPlainText(draft: BlogDraft) {
  const hero = draft.images.find((img) => img.afterSectionId === null);
  const afterMap = new Map<string, ImagePlan[]>();
  for (const image of draft.images.filter((img) => img.afterSectionId)) {
    const key = image.afterSectionId!;
    afterMap.set(key, [...(afterMap.get(key) ?? []), image]);
  }
  const parts = [draft.title];
  if (hero) parts.push(imagePlaceholder(hero));
  parts.push(...draft.intro);
  for (const section of draft.sections) {
    parts.push(`\n${section.heading}\n`, ...section.paragraphs);
    for (const image of afterMap.get(section.id) ?? []) parts.push(imagePlaceholder(image));
  }
  parts.push(...draft.closing, `\n${draft.tags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}`);
  return parts.join("\n\n");
}

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
    nodes.push(
      <span key={`${item.phrase}-${index}`} className={`textEmphasis ${item.kind}`}>
        {item.phrase}
      </span>,
    );
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
  const previewScrollRef = useRef<HTMLDivElement>(null);

  const category = useMemo(() => getCategory(form.categoryId), [form.categoryId]);
  const preset = useMemo(() => getPreset(form.categoryId, form.presetId), [form.categoryId, form.presetId]);
  const platformProfile = useMemo(
    () => PLATFORM_PROFILES.find((platform) => platform.id === form.platformId),
    [form.platformId],
  );
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

  useEffect(() => {
    if (!loading) {
      setLoadingStage(0);
      return;
    }
    const timer = window.setInterval(() => {
      setLoadingStage((current) => Math.min(current + 1, loadingStages.length - 1));
    }, 1150);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (!successVisible) return;
    const timer = window.setTimeout(() => setSuccessVisible(false), 2600);
    return () => window.clearTimeout(timer);
  }, [successVisible]);

  function patch(next: Partial<ComposerForm>) {
    setForm((prev) => ({ ...prev, ...next }));
  }

  function setAttribute(id: string, value: string) {
    setForm((prev) => ({ ...prev, attributes: { ...prev.attributes, [id]: value } }));
  }

  async function generate() {
    if (!form.platformId) return setError("게시할 플랫폼을 선택해 주세요.");
    if (form.platformId === "other" && !form.otherPlatform?.trim()) return setError("기타 플랫폼명을 입력해 주세요.");
    if (!hasTopic) return setError("추천 주제를 선택하거나 자유 주제를 입력해 주세요.");

    setLoading(true);
    setLoadingStage(0);
    setSuccessVisible(false);
    setError("");
    try {
      const payload: GenerateRequest = { ...form, platformId: form.platformId };
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "생성 실패");
      setDraft(data.draft);
      setMode(data.mode);
      setEditMode(false);
      setSuccessVisible(true);
      requestAnimationFrame(() => previewScrollRef.current?.scrollTo({ top: 0 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1200);
  }

  function updateParagraph(sectionId: string, index: number, value: string) {
    setDraft((prev) => prev ? {
      ...prev,
      sections: prev.sections.map((section) => section.id === sectionId
        ? { ...section, paragraphs: section.paragraphs.map((p, i) => i === index ? value : p) }
        : section),
    } : prev);
  }

  function scrollPreview(where: "top" | "bottom") {
    const el = previewScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: where === "top" ? 0 : el.scrollHeight, behavior: "smooth" });
  }

  const platformClass = form.platformId ? `platform-${form.platformId}` : "platform-generic";

  return (
    <main className="shell appShell" aria-busy={loading}>
      <header className="topbar">
        <div>
          <div className="eyebrow">BLOTORI · MULTI-PLATFORM BLOG COMPOSER</div>
          <h1>플랫폼과 주제에 맞춰 블로그를 구성하세요.</h1>
          <p>본문, 시각 강조, 이미지 프롬프트와 삽입 위치까지 한 번에 설계합니다.</p>
        </div>
        <div className="topActions">
          <button className="ghost" onClick={() => setSettingsOpen((v) => !v)}>{settingsOpen ? "설정 접기" : "설정 열기"}</button>
          <button className="ghost" onClick={() => setGuideOpen((v) => !v)}>{guideOpen ? "가이드 접기" : "가이드 열기"}</button>
          <div className="costBadge"><span>AI 기본 호출</span><strong>1회 / 글</strong></div>
        </div>
      </header>

      <div className={`workspace workspaceApp ${settingsOpen ? "" : "settingsClosed"}`}>
        {settingsOpen && (
          <aside className="panel controls scrollPanel">
            <div className="panelHeader"><div><span className="step">01</span><h2>콘텐츠 설정</h2></div><span className="subtle">플랫폼 + 주제 필수</span></div>

            <Field label="게시 플랫폼 *">
              <select value={form.platformId} onChange={(e) => patch({ platformId: e.target.value as PlatformId | "", otherPlatform: "" })}>
                <option value="">플랫폼 선택</option>
                {PLATFORM_PROFILES.map((platform) => <option key={platform.id} value={platform.id}>{platform.label}</option>)}
              </select>
            </Field>
            {platformProfile && <p className="hint platformHint">{platformProfile.description} · {platformProfile.exportHint}</p>}
            {form.platformId === "other" && <Field label="기타 플랫폼명 *"><input value={form.otherPlatform ?? ""} onChange={(e) => patch({ otherPlatform: e.target.value })} placeholder="예: 회사 자체 블로그" /></Field>}

            <Field label="상위 카테고리">
              <select value={form.categoryId ?? ""} onChange={(e) => patch({ categoryId: e.target.value, presetId: "", attributes: {} })}>
                <option value="">선택 안 함</option>
                {CATEGORY_DEFINITIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </Field>
            {category?.presets.length ? <Field label="추천 주제"><select value={form.presetId ?? ""} onChange={(e) => patch({ presetId: e.target.value })}><option value="">직접 주제 입력</option>{category.presets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field> : null}
            <Field label="자유 주제·추가 설명"><textarea value={form.freeTopic ?? ""} onChange={(e) => patch({ freeTopic: e.target.value })} rows={3} placeholder="주제를 문장이나 단어로 자유롭게 입력" /></Field>

            {visibleFieldIds.length > 0 && <div className="panelHeader miniHeader"><div><span className="step">+</span><h2>주제별 추가 조건</h2></div><span className="subtle">선택사항</span></div>}
            {visibleFieldIds.map((fieldId) => {
              const field = FIELD_DEFINITIONS[fieldId];
              if (!field) return null;
              return <Field key={fieldId} label={field.label}>{field.type === "select" ? <select value={form.attributes[fieldId] ?? ""} onChange={(e) => setAttribute(fieldId, e.target.value)}><option value="">지정 안 함</option>{field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <input value={form.attributes[fieldId] ?? ""} onChange={(e) => setAttribute(fieldId, e.target.value)} placeholder={field.placeholder} />}</Field>;
            })}

            <Field label="기타 조건·요청"><textarea value={form.extraConditions ?? ""} onChange={(e) => patch({ extraConditions: e.target.value })} rows={3} placeholder="꼭 넣을 내용, 제외할 표현, 별도 요청" /></Field>
            <Field label="글 구성"><select value={form.structureId} onChange={(e) => patch({ structureId: e.target.value as StructureId })}><option value="auto">자동 추천</option>{recommendedStructures.length > 0 && <optgroup label="이 주제 추천">{recommendedStructures.map((id) => { const item = STRUCTURE_DEFINITIONS.find((x) => x.id === id); return item ? <option key={id} value={id}>★ {item.label}</option> : null; })}</optgroup>}<optgroup label="전체 구성">{STRUCTURE_DEFINITIONS.filter((x) => !recommendedStructures.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup><option value="custom">직접 설정</option></select></Field>
            {form.structureId === "custom" && <Field label="직접 구성"><input value={form.customStructure ?? ""} onChange={(e) => patch({ customStructure: e.target.value })} /></Field>}
            <Field label="문체"><select value={form.styleId} onChange={(e) => patch({ styleId: e.target.value as StyleId })}><option value="auto">자동 추천</option>{recommendedStyles.length > 0 && <optgroup label="이 주제 추천">{recommendedStyles.map((id) => { const item = STYLE_DEFINITIONS.find((x) => x.id === id); return item ? <option key={id} value={id}>★ {item.label}</option> : null; })}</optgroup>}<optgroup label="전체 문체">{STYLE_DEFINITIONS.filter((x) => !recommendedStyles.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup><option value="custom">직접 설정</option></select></Field>
            {form.styleId === "custom" && <Field label="직접 문체"><input value={form.customStyle ?? ""} onChange={(e) => patch({ customStyle: e.target.value })} /></Field>}
            <div className="splitRow"><Field label="글 길이"><select value={form.length} onChange={(e) => patch({ length: e.target.value as Length })}>{(Object.keys(lengthLabel) as Length[]).map((key) => <option key={key} value={key}>{lengthLabel[key]}</option>)}</select></Field><Field label="이미지 수"><select value={form.imageCount} onChange={(e) => patch({ imageCount: Number(e.target.value) })}>{[2,3,4,5].map((n) => <option key={n} value={n}>{n}장</option>)}</select></Field></div>
            <button className="primary" onClick={generate} disabled={loading || !canGenerate}>{loading ? "블로토리 작업 중…" : "✦ 블로그 콘텐츠 생성"}</button>
            {error && <div className="errorBox" role="alert"><strong>생성하지 못했어요.</strong><br />{error}</div>}
          </aside>
        )}

        <section className="panel previewPanel appPreviewPanel">
          <div className="panelHeader previewHeader">
            <div><span className="step">02</span><h2>{platformProfile ? `${platformProfile.label} 미리보기` : "플랫폼 미리보기"}</h2></div>
            <div className="headerActions">
              {mode && <span className={`mode ${mode}`}>{mode === "api" ? "API 생성" : "샘플 모드"}</span>}
              <button className={`ghost ${editMode ? "active" : ""}`} disabled={!draft} onClick={() => setEditMode((v) => !v)}>{editMode ? "미리보기 모드" : "편집 모드"}</button>
              <button className="ghost" disabled={!draft} onClick={() => draft && copyText(buildPlainText(draft), "all")}>{copied === "all" ? "복사됨 ✓" : "전체 원고 복사"}</button>
            </div>
          </div>

          {!draft ? (
            <div className="emptyState"><div className="emptyIcon">✦</div><h3>플랫폼과 주제를 선택해 주세요.</h3><p>생성 후에는 실제 컨셉에 맞는 정렬·강조·이미지 흐름까지 미리 볼 수 있습니다.</p></div>
          ) : (
            <div className={`previewLayout appPreviewLayout ${guideOpen ? "" : "guideClosed"}`}>
              <div className="blogScroller" ref={previewScrollRef}>
                <article className={`blogPaper ${platformClass} density-${draft.presentation?.density ?? "balanced"}`}>
                  {editMode ? <input className="titleEdit" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /> : <h1 className={`previewTitle align-${draft.presentation?.titleAlign ?? "left"}`}>{draft.title}</h1>}
                  <p className="summary">{draft.summary}</p>
                  {(imageMap.get(null) ?? []).map((image) => <ImageSlot key={image.id} image={image} copyText={copyText} copied={copied} />)}
                  <div className={`introBlock align-${draft.presentation?.introAlign ?? "left"}`}>{draft.intro.map((p, i) => <p key={`intro-${i}`}>{p}</p>)}</div>
                  {draft.sections.map((section) => <SectionPreview key={section.id} section={section} editMode={editMode} updateParagraph={updateParagraph}>{(imageMap.get(section.id) ?? []).map((image) => <ImageSlot key={image.id} image={image} copyText={copyText} copied={copied} />)}</SectionPreview>)}
                  <div className="closingBlock">{draft.closing.map((p, i) => <p key={`closing-${i}`}>{p}</p>)}</div>
                  <div className="tags">{draft.tags.map((tag) => <span key={tag}>#{tag.replace(/^#/, "")}</span>)}</div>
                </article>
              </div>

              {guideOpen && <aside className="guideRail scrollPanel"><div className="guideTitle"><strong>이미지 제작 가이드</strong><span>{draft.images.length}개</span></div>{draft.images.map((image) => <div key={image.id} className="promptCard"><div className="promptTop"><strong>{image.id}</strong><span>{image.ratio}</span></div><p className="promptLabel">{image.label}</p><div className="meta"><span>{image.size}</span><span>{image.placement}</span></div><p className="promptText">{image.prompt}</p><button className="copyButton" onClick={() => copyText(image.prompt, image.id)}>{copied === image.id ? "복사됨 ✓" : "프롬프트 복사"}</button></div>)}</aside>}
            </div>
          )}
        </section>
      </div>

      {draft && <div className="scrollNav" aria-label="미리보기 빠른 이동"><button onClick={() => scrollPreview("top")} title="맨 위로">TOP</button><button onClick={() => scrollPreview("bottom")} title="맨 아래로">BOTTOM</button></div>}
      {loading && <GenerationOverlay stage={loadingStage} platformLabel={platformProfile?.label} />}
      {successVisible && <SuccessToast onClose={() => setSuccessVisible(false)} />}
    </main>
  );
}

function PawLoader({ loading = false }: { loading?: boolean }) {
  return <div className={`blotoriPawLoader ${loading ? "isLoading" : ""}`} aria-hidden="true"><span className="pawToe toe1" /><span className="pawToe toe2" /><span className="pawToe toe3" /><span className="pawToe toe4" /><span className="pawPad" /><span className="pawSpark">✦</span></div>;
}

function GenerationOverlay({ stage, platformLabel }: { stage: number; platformLabel?: string }) {
  return <div className="generationOverlay" role="status" aria-live="polite" aria-label="블로그 콘텐츠 생성 중">
    <section className="blotoriStateCard">
      <div className="blotoriStateEyebrow">BLOTORI · COMPOSING</div>
      <PawLoader loading />
      <h2>블로토리가 원고를 정리하고 있어요.</h2>
      <p>{loadingStages[stage]}</p>
      <span className="generationMeta">{platformLabel ?? "선택 플랫폼"} · AI 호출 1회</span>
      <div className="blotoriProgressTrack" aria-hidden="true"><div className="blotoriProgressBar" /></div>
      <div className="blotoriStageList">
        {loadingStages.map((label, index) => <div key={label} className={`blotoriStageRow ${index < stage ? "done" : index === stage ? "active" : ""}`}><span className="stageDot">{index < stage ? "✓" : index + 1}</span><span>{label}</span></div>)}
      </div>
      <p>표시되는 단계는 기다리는 동안의 작업 안내이며 API를 추가 호출하지 않습니다.</p>
    </section>
  </div>;
}

function SuccessToast({ onClose }: { onClose: () => void }) {
  return <div className="successToast" role="status"><div className="successPaw">♡</div><div><strong>원고 구성이 끝났어요.</strong><span>미리보기와 이미지 제작 가이드를 확인해 주세요.</span></div><button onClick={onClose} aria-label="완료 알림 닫기">×</button></div>;
}

function SectionPreview({ section, editMode, updateParagraph, children }: { section: BlogSection; editMode: boolean; updateParagraph: (sectionId: string, index: number, value: string) => void; children: ReactNode }) {
  const p = section.presentation;
  return <section className={`articleSection visual-${p?.visualStyle ?? "standard"}`}>
    <h3 className={`align-${p?.headingAlign ?? "left"}`}>{section.heading}</h3>
    <div className={`sectionBody align-${p?.bodyAlign ?? "left"}`}>
      {section.paragraphs.map((paragraph, index) => editMode ? <textarea key={index} className="paragraphEdit" value={paragraph} onChange={(e) => updateParagraph(section.id, index, e.target.value)} rows={Math.max(3, Math.ceil(paragraph.length / 38))} /> : <p key={index}>{emphasizedText(paragraph, p?.emphasis)}</p>)}
    </div>
    {children}
  </section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function ImageSlot({ image, copyText, copied }: { image: ImagePlan; copyText: (text: string, key: string) => Promise<void>; copied: string }) {
  return <div className="imageSlot"><div className="slotBadge">{image.id}</div><div className="slotArt"><span>IMAGE</span><small>{image.ratio}</small></div><div className="slotInfo"><div><strong>{image.label}</strong><span>{image.size}</span></div><p>{image.placement}</p><button onClick={() => copyText(image.prompt, image.id)}>{copied === image.id ? "프롬프트 복사됨 ✓" : "이 이미지 프롬프트 복사"}</button></div></div>;
}
