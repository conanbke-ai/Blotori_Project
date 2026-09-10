import type { BlogDraft, ImagePlan, PlatformExport, PlatformId, TextEmphasis } from "../domain/types";
import { getPlatformStrategy } from "../domain/platform-strategy";

function imageMarker(image: ImagePlan) {
  return `[${image.id} 삽입 · ${image.label} · ${image.size} · ${image.ratio}]`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyHtmlEmphasis(text: string, emphasis: TextEmphasis[] = []) {
  let html = escapeHtml(text);
  const valid = emphasis
    .filter((item) => item.phrase && text.includes(item.phrase))
    .sort((a, b) => b.phrase.length - a.phrase.length);

  for (const item of valid) {
    const phrase = escapeHtml(item.phrase);
    const replacement = item.kind === "bold"
      ? `<strong>${phrase}</strong>`
      : item.kind === "accent"
        ? `<strong class="blotori-accent">${phrase}</strong>`
        : `<mark>${phrase}</mark>`;
    html = html.replace(phrase, replacement);
  }
  return html;
}

function buildImageMap(images: ImagePlan[]) {
  const map = new Map<string | null, ImagePlan[]>();
  for (const image of images) {
    map.set(image.afterSectionId, [...(map.get(image.afterSectionId) ?? []), image]);
  }
  return map;
}

function buildPlainBody(draft: BlogDraft, platformId: PlatformId) {
  const imageMap = buildImageMap(draft.images);
  const parts: string[] = [draft.title];

  for (const image of imageMap.get(null) ?? []) parts.push(imageMarker(image));
  parts.push(...draft.intro);

  for (const section of draft.sections) {
    parts.push(section.heading, ...section.paragraphs);
    for (const image of imageMap.get(section.id) ?? []) parts.push(imageMarker(image));
  }
  parts.push(...draft.closing);

  if (platformId === "other") {
    parts.push(`태그: ${draft.tags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}`);
  }

  return parts.filter(Boolean).join("\n\n");
}

function sectionClass(style?: string) {
  if (!style || style === "standard") return "";
  return ` class="blotori-${style}"`;
}

function buildRichHtml(draft: BlogDraft, platformId: PlatformId) {
  const imageMap = buildImageMap(draft.images);
  const titleTag = "h1";
  const body: string[] = [`<${titleTag}>${escapeHtml(draft.title)}</${titleTag}>`];

  for (const image of imageMap.get(null) ?? []) {
    body.push(`<p data-img-slot="${escapeHtml(image.id)}"><strong>${escapeHtml(imageMarker(image))}</strong></p>`);
  }

  for (const paragraph of draft.intro) body.push(`<p>${escapeHtml(paragraph)}</p>`);

  for (const section of draft.sections) {
    body.push(`<section${sectionClass(section.presentation?.visualStyle)}>`, `<h2>${escapeHtml(section.heading)}</h2>`);
    for (const paragraph of section.paragraphs) {
      body.push(`<p>${applyHtmlEmphasis(paragraph, section.presentation?.emphasis)}</p>`);
    }
    for (const image of imageMap.get(section.id) ?? []) {
      body.push(`<p data-img-slot="${escapeHtml(image.id)}"><strong>${escapeHtml(imageMarker(image))}</strong></p>`);
    }
    body.push("</section>");
  }

  for (const paragraph of draft.closing) body.push(`<p>${escapeHtml(paragraph)}</p>`);

  if (platformId === "other") {
    body.push(`<p>${draft.tags.map((tag) => `#${escapeHtml(tag.replace(/^#/, ""))}`).join(" ")}</p>`);
  }

  return body.join("\n");
}

export function buildPlatformExport(draft: BlogDraft, platformId: PlatformId): PlatformExport {
  const strategy = getPlatformStrategy(platformId);
  const labels: Record<PlatformId, string> = {
    naver: "네이버용 본문",
    tistory: "티스토리용 본문",
    blogger: "Blogger용 본문",
    wordpress: "WordPress용 본문",
    brunch: "브런치스토리용 본문",
    other: "범용 본문",
  };

  const plainText = buildPlainBody(draft, platformId);
  const html = strategy.clipboardMode === "rich" ? buildRichHtml(draft, platformId) : undefined;
  const tagsText = draft.tags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ");

  return {
    platformId,
    label: labels[platformId],
    plainText,
    html,
    tagsText,
    clipboardMode: strategy.clipboardMode,
  };
}
