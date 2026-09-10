"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { BlogDraft, GenerateRequest, ImagePlan, Tone, Length } from "../lib/domain/types";

const initialForm: GenerateRequest = {
  topic: "",
  category: "",
  ageGroup: "",
  bodyPart: "",
  treatmentMethod: "",
  posture: "",
  tone: "friendly",
  length: "medium",
  imageCount: 4,
  clinicNote: "",
};

const toneLabel: Record<Tone, string> = {
  friendly: "친절한 설명형",
  professional: "전문 정보형",
  warm: "부드러운 상담형",
};

const lengthLabel: Record<Length, string> = {
  short: "짧게",
  medium: "보통",
  long: "길게",
};

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

  const imageMap = useMemo(() => {
    const map = new Map<string | null, ImagePlan[]>();
    if (!draft) return map;
    for (const image of draft.images) {
      const key = image.afterSectionId;
      map.set(key, [...(map.get(key) ?? []), image]);
    }
    return map;
  }, [draft]);

  async function generate() {
    if (!form.topic.trim()) {
      setError("핵심 주제를 입력해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
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

  async function copyWholeDraft() {
    if (!draft) return;
    await copyText(buildPlainText(draft), "all");
  }

  function updateTitle(value: string) {
    setDraft((prev) => (prev ? { ...prev, title: value } : prev));
  }

  function updateParagraph(sectionId: string, index: number, value: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((section) =>
          section.id === sectionId
            ? { ...section, paragraphs: section.paragraphs.map((p, i) => (i === index ? value : p)) }
            : section,
        ),
      };
    });
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">NAVER BLOG CONTENT COMPOSER</div>
          <h1>건강정보 블로그를 한 번에 구성하세요.</h1>
          <p>핵심 주제만 정하고, 필요한 조건만 선택적으로 더해 본문·이미지 프롬프트·삽입 위치를 함께 구성합니다.</p>
        </div>
        <div className="costBadge"><span>AI 기본 호출</span><strong>1회 / 글</strong></div>
      </header>

      <div className="workspace">
        <aside className="panel controls">
          <div className="panelHeader">
            <div><span className="step">01</span><h2>콘텐츠 설정</h2></div>
            <span className="subtle">주제만 필수</span>
          </div>

          <Field label="핵심 주제 *">
            <input
              value={form.topic}
              onChange={(e) => setForm({ ...form, topic: e.target.value })}
              placeholder="예: 거북목이 생기는 이유, 허리 통증과 생활습관"
            />
          </Field>

          <Field label="카테고리 (선택)">
            <input
              value={form.category ?? ""}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="아직 미정이면 비워두세요"
            />
          </Field>

          <Field label="대상 연령대 (선택)">
            <select value={form.ageGroup ?? ""} onChange={(e) => setForm({ ...form, ageGroup: e.target.value })}>
              <option value="">지정 안 함</option>
              {["10대", "20대", "30대", "40대", "50대", "60대 이상"].map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>

          <Field label="치료·관심 부위 (선택)">
            <input
              value={form.bodyPart ?? ""}
              onChange={(e) => setForm({ ...form, bodyPart: e.target.value })}
              placeholder="예: 목·어깨, 허리 / 필요 없으면 비움"
            />
          </Field>

          <Field label="치료·관리 방법 (선택)">
            <input
              value={form.treatmentMethod ?? ""}
              onChange={(e) => setForm({ ...form, treatmentMethod: e.target.value })}
              placeholder="예: 도수치료 / 정하지 않았으면 비움"
            />
          </Field>

          <Field label="자세·생활 상황 (선택)">
            <input
              value={form.posture ?? ""}
              onChange={(e) => setForm({ ...form, posture: e.target.value })}
              placeholder="예: 장시간 컴퓨터 사용 / 필요 없으면 비움"
            />
          </Field>

          <div className="splitRow">
            <Field label="문체">
              <select value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value as Tone })}>
                {(Object.keys(toneLabel) as Tone[]).map((key) => <option key={key} value={key}>{toneLabel[key]}</option>)}
              </select>
            </Field>
            <Field label="글 길이">
              <select value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value as Length })}>
                {(Object.keys(lengthLabel) as Length[]).map((key) => <option key={key} value={key}>{lengthLabel[key]}</option>)}
              </select>
            </Field>
          </div>

          <Field label={`이미지 가이드 ${form.imageCount}개`}>
            <input type="range" min="2" max="5" value={form.imageCount} onChange={(e) => setForm({ ...form, imageCount: Number(e.target.value) })} />
            <div className="rangeLegend"><span>2</span><span>3</span><span>4</span><span>5</span></div>
          </Field>

          <Field label="추가 메모 (선택)">
            <textarea
              value={form.clinicNote ?? ""}
              onChange={(e) => setForm({ ...form, clinicNote: e.target.value })}
              placeholder="예: 너무 광고처럼 쓰지 말 것, 생활관리 팁 강조"
              rows={3}
            />
          </Field>

          <button className="primary" onClick={generate} disabled={loading || !form.topic.trim()}>
            {loading ? "구성 중…" : "✦ 블로그 콘텐츠 생성"}
          </button>
          {error && <div className="errorBox">{error}</div>}
          <p className="hint">비어 있는 선택 조건은 AI가 임의로 추측하지 않습니다. API 키가 없으면 샘플 모드로 동작하며 실제 이미지 생성 API는 호출하지 않습니다.</p>
        </aside>

        <section className="panel previewPanel">
          <div className="panelHeader previewHeader">
            <div><span className="step">02</span><h2>네이버용 미리보기</h2></div>
            <div className="headerActions">
              {mode && <span className={`mode ${mode}`}>{mode === "api" ? "API 생성" : "샘플 모드"}</span>}
              <button className="ghost" disabled={!draft} onClick={copyWholeDraft}>{copied === "all" ? "복사됨 ✓" : "전체 원고 복사"}</button>
            </div>
          </div>

          {!draft ? (
            <div className="emptyState">
              <div className="emptyIcon">✦</div>
              <h3>먼저 쓰고 싶은 주제를 입력해 주세요.</h3>
              <p>카테고리나 치료방법이 아직 정해지지 않았다면 비워둔 채 시작해도 됩니다.</p>
              <div className="flow"><span>주제 입력</span><b>→</b><span>AI 1회</span><b>→</b><span>원고 + 이미지 가이드</span></div>
            </div>
          ) : (
            <div className="previewLayout">
              <article className="blogPaper">
                <input className="titleEdit" value={draft.title} onChange={(e) => updateTitle(e.target.value)} aria-label="제목 수정" />
                <p className="summary">{draft.summary}</p>
                {(imageMap.get(null) ?? []).map((image) => <ImageSlot key={image.id} image={image} copyText={copyText} copied={copied} />)}
                {draft.intro.map((p, i) => <p key={`intro-${i}`}>{p}</p>)}
                {draft.sections.map((section) => (
                  <section key={section.id} className="articleSection">
                    <h3>{section.heading}</h3>
                    {section.paragraphs.map((p, i) => (
                      <textarea key={i} className="paragraphEdit" value={p} onChange={(e) => updateParagraph(section.id, i, e.target.value)} rows={Math.max(3, Math.ceil(p.length / 38))} />
                    ))}
                    {(imageMap.get(section.id) ?? []).map((image) => <ImageSlot key={image.id} image={image} copyText={copyText} copied={copied} />)}
                  </section>
                ))}
                {draft.closing.map((p, i) => <p key={`closing-${i}`}>{p}</p>)}
                <div className="tags">{draft.tags.map((tag) => <span key={tag}>#{tag.replace(/^#/, "")}</span>)}</div>
              </article>

              <aside className="guideRail">
                <div className="guideTitle"><strong>이미지 제작 가이드</strong><span>{draft.images.length}개</span></div>
                {draft.images.map((image) => (
                  <div key={image.id} className="promptCard">
                    <div className="promptTop"><strong>{image.id}</strong><span>{image.ratio}</span></div>
                    <p className="promptLabel">{image.label}</p>
                    <div className="meta"><span>{image.size}</span><span>{image.placement}</span></div>
                    <p className="promptText">{image.prompt}</p>
                    <button className="copyButton" onClick={() => copyText(image.prompt, image.id)}>{copied === image.id ? "복사됨 ✓" : "프롬프트 복사"}</button>
                  </div>
                ))}
                {draft.warnings.length > 0 && (
                  <div className="warningBox"><strong>표현 확인</strong>{draft.warnings.map((w) => <p key={w}>{w}</p>)}</div>
                )}
              </aside>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function ImageSlot({ image, copyText, copied }: { image: ImagePlan; copyText: (text: string, key: string) => Promise<void>; copied: string }) {
  return (
    <div className="imageSlot">
      <div className="slotBadge">{image.id}</div>
      <div className="slotArt"><span>IMAGE</span><small>{image.ratio}</small></div>
      <div className="slotInfo">
        <div><strong>{image.label}</strong><span>{image.size}</span></div>
        <p>{image.placement}</p>
        <button onClick={() => copyText(image.prompt, image.id)}>{copied === image.id ? "프롬프트 복사됨 ✓" : "이 이미지 프롬프트 복사"}</button>
      </div>
    </div>
  );
}
