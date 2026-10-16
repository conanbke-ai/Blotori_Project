import type { BlogDraft, BlogSection, ImagePlan, PlatformExport, PlatformId, TextAlign, TextEmphasis } from "../domain/types";
import { getPlatformCapabilities } from "../domain/platform-capabilities";

function imageDisplayGuide(image: ImagePlan) {
  return image.display
    ? `표시 너비 ${image.display.widthPercent}% · ${image.display.align === "left" ? "왼쪽" : image.display.align === "right" ? "오른쪽" : "가운데"} 정렬`
    : "표시 너비·정렬은 게시 편집기에서 확인";
}
function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function alignStyle(align?: TextAlign) { return align === "center" ? "text-align:center;" : "text-align:left;"; }

/** Match against source text, never against already generated HTML or attributes. */
function applyHtmlEmphasis(text: string, emphasis: TextEmphasis[] = []) {
  const valid = emphasis.filter((item) => item.phrase && ["bold", "accent", "highlight"].includes(item.kind));
  let cursor = 0;
  let html = "";
  while (cursor < text.length) {
    const match = valid.map((item) => ({ item, start: text.indexOf(item.phrase, cursor) }))
      .filter(({ start }) => start >= 0)
      .sort((a, b) => a.start - b.start || b.item.phrase.length - a.item.phrase.length)[0];
    if (!match) return html + escapeHtml(text.slice(cursor));
    html += escapeHtml(text.slice(cursor, match.start));
    const style = match.item.kind === "accent" ? "font-weight:700;color:#2D8FA0;"
      : match.item.kind === "highlight" ? "background-color:#FFF0A8;font-weight:700;" : "font-weight:700;";
    html += `<span style="${style}">${escapeHtml(match.item.phrase)}</span>`;
    cursor = match.start + match.item.phrase.length;
  }
  return html;
}

type BodyPart = { kind: "paragraph"; text: string; align?: TextAlign }
  | { kind: "section"; section: BlogSection }
  | { kind: "image"; image: ImagePlan };

/** Pure projection: platform switching never rewrites the canonical draft or its metadata. */
function bodyParts(draft: BlogDraft): BodyPart[] {
  const result: BodyPart[] = [];
  const placed = new Set<string>();
  const addImages = (sectionId: string | null) => {
    for (const image of draft.images.filter((item) => item.afterSectionId === sectionId)) {
      result.push({ kind: "image", image }); placed.add(image.id);
    }
  };
  addImages(null);
  for (const text of draft.intro) result.push({ kind: "paragraph", text, align: draft.presentation?.introAlign });
  for (const section of draft.sections.filter((item) => item.presentation?.visualStyle !== "glossary")) {
    result.push({ kind: "section", section }); addImages(section.id);
  }
  for (const text of draft.closing) result.push({ kind: "paragraph", text });
  for (const section of draft.sections.filter((item) => item.presentation?.visualStyle === "glossary")) {
    result.push({ kind: "section", section }); addImages(section.id);
  }
  // Preserve a slot even if an imported draft references a section that no longer exists.
  for (const image of draft.images.filter((item) => !placed.has(item.id))) result.push({ kind: "image", image });
  return result;
}

function buildPlainBody(parts: BodyPart[], draft: BlogDraft, platformId: PlatformId) {
  const lines = parts.flatMap((part) => part.kind === "paragraph" ? [part.text]
    : part.kind === "image" ? [] : [part.section.heading, ...part.section.paragraphs]);
  if (platformId === "other") lines.push(`태그: ${draft.tags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}`);
  return lines.filter(Boolean).join("\n\n");
}

const paragraphStyle = "font-size:16px;line-height:1.9;color:#3d4653;margin:0 0 18px;";
function richSection(section: BlogSection, naver: boolean) {
  const presentation = section.presentation;
  const glossary = presentation?.visualStyle === "glossary";
  const headingStyle = `${alignStyle(presentation?.headingAlign)}font-size:${glossary ? 12 : 20}px;font-weight:700;line-height:1.6;margin:0 0 16px;color:${glossary ? "#7b8794" : "#29313b"};`;
  // Naver receives simple paragraph/span styles. It does not receive app-specific card CSS.
  const heading = naver ? `<p style="${headingStyle}"><strong>${escapeHtml(section.heading)}</strong></p>`
    : `<h2 style="${headingStyle}">${escapeHtml(section.heading)}</h2>`;
  const paragraphs = section.paragraphs.map((text) => `<p style="${paragraphStyle}${alignStyle(presentation?.bodyAlign)}${glossary ? "font-size:11px;color:#7b8794;" : ""}">${applyHtmlEmphasis(text, presentation?.emphasis)}</p>`).join("\n");
  if (naver) {
    // Conservative inline formatting: no app CSS dependency. Actual SmartEditor
    // paste fidelity still requires real-editor acceptance testing.
    const treatments: Record<string, string> = {
      "key-point": "background-color:#edf8f7;border-left:3px solid #62aab0;padding:14px 16px;",
      callout: "background-color:#fff7ed;border-left:3px solid #c29b65;padding:14px 16px;",
      quote: "border-top:1px solid #d8e0e2;border-bottom:1px solid #d8e0e2;padding:14px 10px;",
    };
    const decoration = treatments[presentation?.visualStyle ?? ""];
    if (!decoration) return `${heading}\n${paragraphs}`;
    // Keep heading and text as editable paragraphs instead of a nonportable div/card.
    const accentedHeading = `<p style="${headingStyle}${decoration}"><strong>${escapeHtml(section.heading)}</strong></p>`;
    return `${accentedHeading}\n${paragraphs}`;
  }
  const styles: Record<string, string> = {
    "key-point": "padding:20px;background-color:#f0fafb;border:1px solid #cfe8ec;",
    callout: "padding:20px;background-color:#fff7f3;border-left:4px solid #c9ad7d;",
    quote: "padding:20px;border-top:1px solid #e7eaed;border-bottom:1px solid #e7eaed;",
    glossary: "border-top:1px solid #e7eaed;padding-top:14px;",
  };
  return `<section style="margin:28px 0;${styles[presentation?.visualStyle ?? ""] ?? ""}">${heading}\n${paragraphs}</section>`;
}
function buildRichHtml(parts: BodyPart[], draft: BlogDraft, platformId: PlatformId, naver: boolean) {
  const body = parts.map((part) => {
    if (part.kind === "section") return richSection(part.section, naver);
    if (part.kind === "image") return "";
    return `<p style="${paragraphStyle}${alignStyle(part.align)}">${escapeHtml(part.text)}</p>`;
  }).filter(Boolean);
  if (platformId === "other") body.push(`<p style="${paragraphStyle}">${draft.tags.map((tag) => `#${escapeHtml(tag.replace(/^#/, ""))}`).join(" ")}</p>`);
  return body.join("\n");
}

function naverFormattingGuide(draft: BlogDraft) {
  const lines = [
    "기본 색상·강조·정렬은 서식 포함 복사로 전달합니다. 네이버에서 유지되는지는 붙여넣은 뒤 확인해 주세요.",
    "이미지 위치·규격은 별도 이미지 가이드에서 확인하며 게시용 본문에는 포함되지 않습니다.",
  ];
  if (draft.presentation?.titleAlign === "center") lines.push("제목 입력란: 가운데 정렬 권장");
  for (const section of draft.sections) {
    const treatments: string[] = [];
    const p = section.presentation;
    if (p?.headingAlign === "center") treatments.push("소제목 가운데 정렬");
    if (p?.visualStyle && !["standard", "glossary"].includes(p.visualStyle)) treatments.push(`${p.visualStyle === "key-point" ? "핵심 포인트" : p.visualStyle === "callout" ? "안내" : "인용"} 강조는 인라인 서식으로 복사됨; 네이버 편집기에 붙인 후 보존 여부 확인`);
    for (const emphasis of p?.emphasis ?? []) {
      if (section.paragraphs.some((text) => text.includes(emphasis.phrase))) treatments.push(`${emphasis.kind === "bold" ? "굵게" : emphasis.kind === "accent" ? "포인트색" : "하이라이트"}: “${emphasis.phrase}”`);
    }
    if (treatments.length) lines.push(`${section.heading}: ${treatments.join(" · ")}`);
  }
  return lines.join("\n");
}

function buildImageGuide(draft: BlogDraft) {
  const sectionNames = new Map(draft.sections.map((section) => [section.id, section.heading]));
  const lines = [
    "이미지 가이드 (게시용 본문과 별도)",
    "이 가이드는 편집자용이며 본문 복사에는 포함되지 않습니다.",
    "원본 이미지 첨부 여부는 자동 판정하지 않습니다. 게시 편집기에서 직접 확인하고 업로드해 주세요.",
  ];
  if (!draft.images.length) return [...lines, "계획된 이미지 슬롯이 없습니다."].join("\n");
  for (const [index, image] of draft.images.entries()) {
    const anchor = image.afterSectionId === null
      ? "도입 전(대표 이미지)"
      : sectionNames.get(image.afterSectionId) ? `‘${sectionNames.get(image.afterSectionId)}’ 섹션 뒤` : `삭제되거나 찾을 수 없는 섹션(${image.afterSectionId}) 뒤`;
    lines.push(
      "",
      `${index + 1}. ${image.label} · ${image.role}`,
      `- 내부 슬롯: ${image.id}`,
      `- 배치: ${image.placement} / 앵커: ${anchor}`,
      `- 권장 규격: ${image.size} / 비율 ${image.ratio}`,
      `- 표시: ${imageDisplayGuide(image)}`,
      `- 이미지 제작 프롬프트: ${image.prompt}`,
    );
  }
  return lines.join("\n");
}

export function buildPlatformExport(draft: BlogDraft, platformId: PlatformId): PlatformExport {
  const capabilities = getPlatformCapabilities(platformId);
  const labels: Record<PlatformId, string> = { naver: "네이버 본문", tistory: "티스토리용 본문", blogger: "Blogger용 본문", wordpress: "WordPress용 본문", brunch: "브런치스토리용 본문", other: "범용 본문" };
  const parts = bodyParts(draft);
  return {
    platformId, label: labels[platformId], titleText: draft.title,
    plainText: buildPlainBody(parts, draft, platformId),
    html: capabilities.richText === "unsupported" ? undefined : buildRichHtml(parts, draft, platformId, capabilities.serializer === "naver"),
    tagsText: draft.tags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" "),
    imageGuideText: buildImageGuide(draft),
    formattingGuide: platformId === "naver" ? naverFormattingGuide(draft) : undefined,
    clipboardMode: capabilities.defaultCopyMode,
    capabilities,
  };
}
