import type { BlogDraft, ImagePlan, PlatformExport, PlatformId, TextAlign, TextEmphasis } from "../domain/types";
import { getPlatformStrategy } from "../domain/platform-strategy";

function imageMarker(image: ImagePlan) {
  return `[${image.id} 삽입 · ${image.label} · ${image.size} · ${image.ratio}]`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function alignStyle(align?: TextAlign) {
  return align === "center" ? "text-align:center;" : "text-align:left;";
}

function applyHtmlEmphasis(text: string, emphasis: TextEmphasis[] = []) {
  let html = escapeHtml(text);
  const valid = emphasis.filter((item) => item.phrase && text.includes(item.phrase)).sort((a, b) => b.phrase.length - a.phrase.length);
  for (const item of valid) {
    const phrase = escapeHtml(item.phrase);
    const replacement = item.kind === "bold"
      ? `<strong style="font-weight:700;">${phrase}</strong>`
      : item.kind === "accent"
        ? `<strong style="font-weight:700;color:#2D8FA0;">${phrase}</strong>`
        : `<span style="background-color:#FFF0A8;font-weight:600;">${phrase}</span>`;
    html = html.replace(phrase, replacement);
  }
  return html;
}

function buildImageMap(images: ImagePlan[]) {
  const map = new Map<string | null, ImagePlan[]>();
  for (const image of images) map.set(image.afterSectionId, [...(map.get(image.afterSectionId) ?? []), image]);
  return map;
}

function buildPlainBody(draft: BlogDraft, platformId: PlatformId) {
  const imageMap = buildImageMap(draft.images);
  const regularSections = draft.sections.filter((section) => section.presentation?.visualStyle !== "glossary");
  const glossarySections = draft.sections.filter((section) => section.presentation?.visualStyle === "glossary");
  const parts: string[] = [];

  for (const image of imageMap.get(null) ?? []) parts.push(imageMarker(image));
  parts.push(...draft.intro);
  for (const section of regularSections) {
    parts.push(section.heading, ...section.paragraphs);
    for (const image of imageMap.get(section.id) ?? []) parts.push(imageMarker(image));
  }
  parts.push(...draft.closing);
  for (const section of glossarySections) parts.push(section.heading, ...section.paragraphs);
  if (platformId === "other") parts.push(`태그: ${draft.tags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}`);
  return parts.filter(Boolean).join("\n\n");
}

function sectionClass(style?: string) {
  if (!style || style === "standard") return "";
  return ` class="blotori-${style}"`;
}

function buildRichHtml(draft: BlogDraft, platformId: PlatformId) {
  const imageMap = buildImageMap(draft.images);
  const regularSections = draft.sections.filter((section) => section.presentation?.visualStyle !== "glossary");
  const glossarySections = draft.sections.filter((section) => section.presentation?.visualStyle === "glossary");
  const body: string[] = [];

  for (const image of imageMap.get(null) ?? []) body.push(`<p data-img-slot="${escapeHtml(image.id)}" style="text-align:center;"><strong>${escapeHtml(imageMarker(image))}</strong></p>`);
  for (const paragraph of draft.intro) body.push(`<p style="${alignStyle(draft.presentation?.introAlign)}">${escapeHtml(paragraph)}</p>`);
  for (const section of regularSections) {
    body.push(`<section${sectionClass(section.presentation?.visualStyle)}>`, `<h2 style="${alignStyle(section.presentation?.headingAlign)}">${escapeHtml(section.heading)}</h2>`);
    for (const paragraph of section.paragraphs) body.push(`<p style="${alignStyle(section.presentation?.bodyAlign)}">${applyHtmlEmphasis(paragraph, section.presentation?.emphasis)}</p>`);
    for (const image of imageMap.get(section.id) ?? []) body.push(`<p data-img-slot="${escapeHtml(image.id)}" style="text-align:center;"><strong>${escapeHtml(imageMarker(image))}</strong></p>`);
    body.push("</section>");
  }
  for (const paragraph of draft.closing) body.push(`<p>${escapeHtml(paragraph)}</p>`);
  for (const section of glossarySections) {
    body.push(`<section class="blotori-glossary" style="border-top:1px solid #e7eaed;margin-top:32px;padding-top:14px;color:#7b8794;">`);
    body.push(`<h2 style="font-size:12px;line-height:1.6;margin:0 0 8px;">${escapeHtml(section.heading)}</h2>`);
    for (const paragraph of section.paragraphs) body.push(`<p style="font-size:11px;line-height:1.7;margin:0 0 6px;">${escapeHtml(paragraph)}</p>`);
    body.push("</section>");
  }
  if (platformId === "other") body.push(`<p>${draft.tags.map((tag) => `#${escapeHtml(tag.replace(/^#/, ""))}`).join(" ")}</p>`);
  return body.join("\n");
}

function naverFormattingGuide(draft: BlogDraft) {
  const lines: string[] = [];
  lines.push(`제목: ${draft.presentation?.titleAlign === "center" ? "가운데 정렬 권장" : "기본 정렬 권장"}`);
  if (draft.presentation?.introAlign === "center") lines.push("도입부: 짧은 도입 문단은 가운데 정렬 권장");

  for (const section of draft.sections.filter((item) => item.presentation?.visualStyle !== "glossary")) {
    const presentation = section.presentation;
    const treatments: string[] = [];
    if (presentation?.headingAlign === "center") treatments.push("소제목 가운데 정렬");
    if (presentation?.visualStyle === "key-point") treatments.push("핵심 포인트 카드/강조 배경 권장");
    if (presentation?.visualStyle === "callout") treatments.push("안내 박스형 강조 권장");
    if (presentation?.visualStyle === "quote") treatments.push("인용/구분 스타일 권장");
    for (const emphasis of presentation?.emphasis ?? []) {
      treatments.push(`${emphasis.kind === "bold" ? "굵게" : emphasis.kind === "accent" ? "포인트색" : "하이라이트"}: “${emphasis.phrase}”`);
    }
    if (treatments.length) lines.push(`${section.heading}: ${treatments.join(" · ")}`);
  }

  for (const image of draft.images) lines.push(`${image.id}: ${image.placement} / ${image.size} / ${image.ratio}`);
  return lines.join("\n");
}

export function buildPlatformExport(draft: BlogDraft, platformId: PlatformId): PlatformExport {
  const strategy = getPlatformStrategy(platformId);
  const labels: Record<PlatformId, string> = {
    naver: "네이버 본문",
    tistory: "티스토리용 본문",
    blogger: "Blogger용 본문",
    wordpress: "WordPress용 본문",
    brunch: "브런치스토리용 본문",
    other: "범용 본문",
  };
  const plainText = buildPlainBody(draft, platformId);
  const html = strategy.clipboardMode === "rich" ? buildRichHtml(draft, platformId) : undefined;
  return {
    platformId,
    label: labels[platformId],
    titleText: draft.title,
    plainText,
    html,
    tagsText: draft.tags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" "),
    formattingGuide: platformId === "naver" ? naverFormattingGuide(draft) : undefined,
    clipboardMode: strategy.clipboardMode,
  };
}
