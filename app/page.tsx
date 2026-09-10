"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { BlogDraft, GenerateRequest, ImagePlan, Length, PlatformId, StructureId, StyleId } from "../lib/domain/types";
import {
  CATEGORY_DEFINITIONS,
  FIELD_DEFINITIONS,
  PLATFORM_PROFILES,
  STRUCTURE_DEFINITIONS,
  STYLE_DEFINITIONS,
  getCategory,
  getPreset,
} from "../lib/domain/content-config";

const initialForm: GenerateRequest = {
  platformId: "naver",
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

export default function Home() {
  const [form, setForm] = useState<GenerateRequest>(initialForm);
  const [draft, setDraft] = useState<BlogDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"mock" | "api" | null>(null);
  const [copied, setCopied] = useState("");

  const category = useMemo(() => getCategory(form.categoryId), [form.categoryId]);
  const preset = useMemo(() => getPreset(form.categoryId, form.presetId), [form.categoryId, form.presetId]);
  const visibleFieldIds = useMemo(() => {
    const ids = preset?.fieldIds ?? category?.defaultFieldIds ?? [];
    return [...new Set(ids)];
  }, [category, preset]);
  const recommendedStyles = preset?.recommendedStyleIds ?? [];
  const recommendedStructures = preset?.recommendedStructureIds ?? [];

  const imageMap = useMemo(() => {
    const map = new Map<string | null, ImagePlan[]>();
    if (!draft) return map;
    for (const image of draft.images) {
      const key = image.afterSectionId;
      map.set(key, [...(map.get(key) ?? []), image]);
    }
    return map;
  }, [draft]);

  const hasTopic = Boolean(form.presetId || form.freeTopic?.trim());

  function patch(next: Partial<GenerateRequest>) {
    setForm((prev) => ({ ...prev, ...next }));
  }

  function setAttribute(id: string, value: string) {
    setForm((prev) => ({ ...prev, attributes: { ...prev.attributes, [id]: value } }));
  }

  function changeCategory(categoryId: string) {
    setForm((prev) => ({ ...prev, categoryId, presetId: "", attributes: {} }));
  }

  async function generate() {
    if (!hasTopic) {
      setError("추천 주제를 선택하거나 자유 주제를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "생성 실패");
      setDraft(data.draft);
      setMode(data.mode);
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
    setDraft((prev) => prev ? { ...prev, sections: prev.sections.map((section) => section.id === sectionId ? { ...section, paragraphs: section.paragraphs.map((p, i) => i === index ? value : p) } : section) } : prev);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">MULTI-PLATFORM BLOG COMPOSER</div>
          <h1>주제만 정하면 플랫폼에 맞게 블로그를 구성합니다.</h1>
          <p>플랫폼·주제·추가 조건·문체·구성을 선택하고, 이미지 프롬프트와 삽입 위치까지 한 번에 생성하세요.</p>
        </div>
        <div className="costBadge"><span>AI 기본 호출</span><strong>1회 / 글</strong></div>
      </header>

      <div className="workspace">
        <aside className="panel controls">
          <div className="panelHeader"><div><span className="step">01</span><h2>콘텐츠 설정</h2></div><span className="subtle">선택 + 자유입력</span></div>

          <Field label="게시 플랫폼">
            <select value={form.platformId} onChange={(e) => patch({ platformId: e.target.value as PlatformId })}>
              {PLATFORM_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          {form.platformId === "other" && <Field label="기타 플랫폼"><input value={form.otherPlatform ?? ""} onChange={(e) => patch({ otherPlatform: e.target.value })} placeholder="예: 회사 자체 블로그" /></Field>}

          <Field label="상위 카테고리">
            <select value={form.categoryId ?? ""} onChange={(e) => changeCategory(e.target.value)}>
              <option value="">선택 안 함</option>
              {CATEGORY_DEFINITIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>

          {category && category.presets.length > 0 && (
            <Field label="추천 주제">
              <select value={form.presetId ?? ""} onChange={(e) => patch({ presetId: e.target.value })}>
                <option value="">직접 주제 입력</option>
                {category.presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>
          )}

          <Field label="자유 주제·추가 설명">
            <textarea value={form.freeTopic ?? ""} onChange={(e) => patch({ freeTopic: e.target.value })} placeholder="예: 50대가 등산 후 무릎이 불편할 때 평소 관리법 / 새 키보드 한 달 사용 후기" rows={3} />
          </Field>

          {visibleFieldIds.length > 0 && <div className="panelHeader" style={{ marginTop: 22 }}><div><span className="step">+</span><h2>주제별 추가 조건</h2></div><span className="subtle">모두 선택사항</span></div>}
          {visibleFieldIds.map((fieldId) => {
            const field = FIELD_DEFINITIONS[fieldId];
            if (!field) return null;
            return (
              <Field key={fieldId} label={field.label}>
                {field.type === "select" ? (
                  <select value={form.attributes[fieldId] ?? ""} onChange={(e) => setAttribute(fieldId, e.target.value)}>
                    <option value="">지정 안 함</option>
                    {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input value={form.attributes[fieldId] ?? ""} onChange={(e) => setAttribute(fieldId, e.target.value)} placeholder={field.placeholder} />
                )}
              </Field>
            );
          })}

          <Field label="기타 조건·요청">
            <textarea value={form.extraConditions ?? ""} onChange={(e) => patch({ extraConditions: e.target.value })} placeholder="선택지에 없는 조건, 꼭 넣을 내용, 빼고 싶은 표현 등을 자유롭게 입력" rows={3} />
          </Field>

          <Field label="글 구성">
            <select value={form.structureId} onChange={(e) => patch({ structureId: e.target.value as StructureId })}>
              <option value="auto">자동 추천</option>
              {recommendedStructures.length > 0 && <optgroup label="이 주제 추천">{recommendedStructures.map((id) => { const x = STRUCTURE_DEFINITIONS.find((s) => s.id === id); return x ? <option key={id} value={id}>★ {x.label}</option> : null; })}</optgroup>}
              <optgroup label="전체 구성">{STRUCTURE_DEFINITIONS.filter((s) => !recommendedStructures.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>
              <option value="custom">직접 설정</option>
            </select>
          </Field>
          {form.structureId === "custom" && <Field label="직접 구성"><input value={form.customStructure ?? ""} onChange={(e) => patch({ customStructure: e.target.value })} placeholder="예: 문제 제기 → 사례 → 핵심 팁 → 짧은 결론" /></Field>}

          <Field label="문체">
            <select value={form.styleId} onChange={(e) => patch({ styleId: e.target.value as StyleId })}>
              <option value="auto">자동 추천</option>
              {recommendedStyles.length > 0 && <optgroup label="이 주제 추천">{recommendedStyles.map((id) => { const x = STYLE_DEFINITIONS.find((s) => s.id === id); return x ? <option key={id} value={id}>★ {x.label}</option> : null; })}</optgroup>}
              <optgroup label="전체 문체">{STYLE_DEFINITIONS.filter((s) => !recommendedStyles.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</optgroup>
              <option value="custom">직접 설정</option>
            </select>
          </Field>
          {form.styleId === "custom" && <Field label="직접 문체"><input value={form.customStyle ?? ""} onChange={(e) => patch({ customStyle: e.target.value })} placeholder="예: 너무 광고 같지 않게, 약간 유쾌하지만 과장 없이" /></Field>}

          <div className="splitRow">
            <Field label="글 길이"><select value={form.length} onChange={(e) => patch({ length: e.target.value as Length })}>{(Object.keys(lengthLabel) as Length[]).map((key) => <option key={key} value={key}>{lengthLabel[key]}</option>)}</select></Field>
            <Field label="이미지 수"><select value={form.imageCount} onChange={(e) => patch({ imageCount: Number(e.target.value) })}>{[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}장</option>)}</select></Field>
          </div>

          <button className="primary" onClick={generate} disabled={loading || !hasTopic}>{loading ? "구성 중…" : "✦ 블로그 콘텐츠 생성"}</button>
          {error && <div className="errorBox">{error}</div>}
          <p className="hint">자동 추천도 추가 AI 호출 없이 글 생성 1회 안에서 처리합니다. 비어 있는 조건은 임의로 사실처럼 만들지 않습니다.</p>
        </aside>

        <section className="panel previewPanel">
          <div className="panelHeader previewHeader">
            <div><span className="step">02</span><h2>플랫폼용 미리보기</h2></div>
            <div className="headerActions">
              {mode && <span className={`mode ${mode}`}>{mode === "api" ? "API 생성" : "샘플 모드"}</span>}
              <button className="ghost" disabled={!draft} onClick={() => draft && copyText(buildPlainText(draft), "all")}>{copied === "all" ? "복사됨 ✓" : "전체 원고 복사"}</button>
            </div>
          </div>

          {!draft ? (
            <div className="emptyState"><div className="emptyIcon">✦</div><h3>주제를 선택하거나 자유롭게 적어주세요.</h3><p>주제에 필요한 추가 조건과 추천 문체·구성이 자동으로 바뀝니다.</p><div className="flow"><span>플랫폼</span><b>→</b><span>주제/조건</span><b>→</b><span>AI 1회</span><b>→</b><span>원고 + 이미지 가이드</span></div></div>
          ) : (
            <div className="previewLayout">
              <article className="blogPaper">
                <input className="titleEdit" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="제목 수정" />
                <p className="summary">{draft.summary}</p>
                {(draft.styleUsed || draft.structureUsed) && <p className="summary">문체: {draft.styleUsed ?? "-"} · 구성: {draft.structureUsed ?? "-"}</p>}
                {(imageMap.get(null) ?? []).map((image) => <ImageSlot key={image.id} image={image} copyText={copyText} copied={copied} />)}
                {draft.intro.map((p, i) => <p key={`intro-${i}`}>{p}</p>)}
                {draft.sections.map((section) => <section key={section.id} className="articleSection"><h3>{section.heading}</h3>{section.paragraphs.map((p, i) => <textarea key={i} className="paragraphEdit" value={p} onChange={(e) => updateParagraph(section.id, i, e.target.value)} rows={Math.max(3, Math.ceil(p.length / 38))} />)}{(imageMap.get(section.id) ?? []).map((image) => <ImageSlot key={image.id} image={image} copyText={copyText} copied={copied} />)}</section>)}
                {draft.closing.map((p, i) => <p key={`closing-${i}`}>{p}</p>)}
                <div className="tags">{draft.tags.map((tag) => <span key={tag}>#{tag.replace(/^#/, "")}</span>)}</div>
              </article>

              <aside className="guideRail">
                <div className="guideTitle"><strong>이미지 제작 가이드</strong><span>{draft.images.length}개</span></div>
                {draft.images.map((image) => <div key={image.id} className="promptCard"><div className="promptTop"><strong>{image.id}</strong><span>{image.ratio}</span></div><p className="promptLabel">{image.label}</p><div className="meta"><span>{image.size}</span><span>{image.placement}</span></div><p className="promptText">{image.prompt}</p><button className="copyButton" onClick={() => copyText(image.prompt, image.id)}>{copied === image.id ? "복사됨 ✓" : "프롬프트 복사"}</button></div>)}
                {draft.warnings.length > 0 && <div className="warningBox"><strong>표현 확인</strong>{draft.warnings.map((w) => <p key={w}>{w}</p>)}</div>}
              </aside>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }

function ImageSlot({ image, copyText, copied }: { image: ImagePlan; copyText: (text: string, key: string) => Promise<void>; copied: string }) {
  return <div className="imageSlot"><div className="slotBadge">{image.id}</div><div className="slotArt"><span>IMAGE</span><small>{image.ratio}</small></div><div className="slotInfo"><div><strong>{image.label}</strong><span>{image.size}</span></div><p>{image.placement}</p><button onClick={() => copyText(image.prompt, image.id)}>{copied === image.id ? "프롬프트 복사됨 ✓" : "이 이미지 프롬프트 복사"}</button></div></div>;
}
