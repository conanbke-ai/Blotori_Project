import type { BlogDraft, ImagePlan, PlatformExport, PlatformId, TextAlign, TextEmphasis } from "../domain/types";
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

function alignStyle(align?: TextAlign) {
  return align === "center" ? "text-align:center;" : "text-align:left;";
}

function applyHtmlEmphasis(text: string, emphasis: TextEmphasis[] = [], platformId: PlatformId) {
  let html = escapeHtml(text);
  const valid = emphasis
    .filter((item) => item.phrase && text.includes(item.phrase))
    .sort((a, b) => b.phrase.length - a.phrase.length);

  for (const item of valid) {
    const phrase = escapeHtml(item.phrase);
    let replacement: string;

    if (item.kind === "bold") {
      replacement = `<strong style="font-weight:700;">${phrase}</strong>`;
    } else if (item.kind === "accent") {
      replacement = `<strong style="font-weight:700;color:#2D8FA0;">${phrase}</strong>`;
    } else {
      replacement = `<span style="background-color:#FFF0A8;font-weight:600;">${phrase}</span>`;
    }

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
  const regularSections = draft.sections.filter((section) => section.presentation?.visualStyle !== "glossary");
  const glossarySections = draft.sections.filter((section) => section.presentation?.visualStyle === "glossary");
  const parts: string[] = [draft.title];

  for (const image of imageMap.get(null) ?? []) parts.push(imageMarker(image));
  parts.push(...draft.intro);

  for (const section of regularSections) {
    parts.push(section.heading, ...section.paragraphs);
    for (const image of imageMap.get(section.id) ?? []) parts.push(imageMarker(image));
  }

  parts.push(...draft.closing);

  for (const section of glossarySections) {
    parts.push(section.heading, ...section.paragraphs);
  }

  if (platformId === "other") {
    parts.push(`태그: ${draft.tags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}`);
  }

  return parts.filter(Boolean).join("\n\n");
}

function buildNaverRichHtml(draft: BlogDraft) {
  const imageMap = buildImageMap(draft.images);
  const regularSections = draft.sections.filter((section) => section.presentation?.visualStyle !== "glossary");
  const glossarySections = draft.sections.filter((section) => section.presentation?.visualStyle === "glossary");
  const body: string[] = [];
  const titleAlign = alignStyle(draft.presentation?.titleAlign);
  const introAlign = alignStyle(draft.presentation?.introAlign);

  body.push(`<div style="${titleAlign}font-size:28px;line-height:1.45;font-weight:700;margin:0 0 28px;">${escapeHtml(draft.title)}</div>`);

  for (const image of imageMap.get(null) ?? []) {
    body.push(`<div style="text-align:center;margin:26px 0;color:#6B7C86;"><strong>${escapeHtml(imageMarker(image))}</strong></div>`);
  }

  for (const paragraph of draft.intro) {
    body.push(`<div style="${introAlign}font-size:16px;line-height:1.9;margin:0 0 18px;">${escapeHtml(paragraph)}</div>`);
  }

  for (const section of regularSections) {
    const headingAlign = alignStyle(section.presentation?.headingAlign);
    const bodyAlign = alignStyle(section.presentation?.bodyAlign);
    const visualStyle = section.presentation?.visualStyle ?? "standard";
    const headingDecoration = visualStyle === "key-point"
      ? "background-color:#EEF9FA;padding:10px 12px;border-radius:8px;"
      : visualStyle === "callout"
        ? "background-color:#FFF6F1;padding:10px 12px;border-radius:8px;"
        : visualStyle === "quote"
          ? "font-style:italic;"
          : "";

    body.push(`<div style="${headingAlign}${headingDecoration}font-size:21px;line-height:1.55;font-weight:700;margin:34px 0 16px;">${escapeHtml(section.heading)}</div>`);

    for (const paragraph of section.paragraphs) {
      body.push(`<div style="${bodyAlign}font-size:16px;line-height:1.9;margin:0 0 18px;">${applyHtmlEmphasis(paragraph, section.presentation?.emphasis, "naver")}</div>`);
    }

    for (const image of imageMap.get(section.id) ?? []) {
      body.push(`<div style="text-align:center;margin:28px 0;color:#6B7C86;"><strong>${escapeHtml(imageMarker(image))}</strong></div>`);
    }
  }

  for (const paragraph of draft.closing) {
    body.push(`<div style="font-size:16px;line-height:1.9;margin:0 0 18px;">${escapeHtml(paragraph)}</div>`);
  }

  for (const section of glossarySections) {
    body.push(`<div style="border-top:1px solid #E7EAED;margin-top:34px;padding-top:14px;color:#7B8794;">`);
    body.push(`<div style="font-size:12px;font-weight:700;line-height:1.6;margin:0 0 8px;">${escapeHtml(section.heading)}</div>`);
    for (const paragraph of section.paragraphs) {
      body.push(`<div style="font-size:11px;line-height:1.7;margin:0 0 6px;">${escapeHtml(paragraph)}</div>`);
    }
    body.push(`</div>`);
  }

  return `<div style="font-family:Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#222;">${body.join("")}</div>`;
}

function sectionClass(style?: string) {
  if (!style || style === "standard") return "";
  return ` class="blotori-${style}"`;
}

function buildRichHtml(draft: BlogDraft, platformId: PlatformId) {
  if (platformId === "naver") return buildNaverRichHtml(draft);

  const imageMap = buildImageMap(draft.images);
  const regularSections = draft.sections.filter((section) => section.presentation?.visualStyle !== "glossary");
  const glossarySections = draft.sections.filter((section) => section.presentation?.visualStyle === "glossary");
  const titleAlign = alignStyle(draft.presentation?.titleAlign);
  const body: string[] = [`<h1 style="${titleAlign}">${escapeHtml(draft.title)}</h1>`];

  for (const image of imageMap.get(null) ?? []) {
    body.push(`<p data-img-slot="${escapeHtml(image.id)}" style="text-align:center;"><strong>${escapeHtml(imageMarker(image))}</strong></p>`);
  }

  for (const paragraph of draft.intro) body.push(`<p style="${alignStyle(draft.presentation?.introAlign)}">${escapeHtml(paragraph)}</p>`);

  for (const section of regularSections) {
    body.push(`<section${sectionClass(section.presentation?.visualStyle)}>`, `<h2 style="${alignStyle(section.presentation?.headingAlign)}">${escapeHtml(section.heading)}</h2>`);
    for (const paragraph of section.paragraphs) {
      body.push(`<p style="${alignStyle(section.presentation?.bodyAlign)}">${applyHtmlEmphasis(paragraph, section.presentation?.emphasis, platformId)}</p>`);
    }
    for (const image of imageMap.get(section.id) ?? []) {
      body.push(`<p data-img-slot="${escapeHtml(image.id)}" style="text-align:center;"><strong>${escapeHtml(imageMarker(image))}</strong></p>`);
    }
    body.push("</section>");
  }

  for (const paragraph of draft.closing) body.push(`<p>${escapeHtml(paragraph)}</p>`);

  for (const section of glossarySections) {
    body.push(`<section class="blotori-glossary" style="border-top:1px solid #e7eaed;margin-top:32px;padding-top:14px;color:#7b8794;">`);
    body.push(`<h2 style="font-size:12px;line-height:1.6;margin:0 0 8px;">${escapeHtml(section.heading)}</h2>`);
    for (const paragraph of section.paragraphs) body.push(`<p style="font-size:11px;line-height:1.7;margin:0 0 6px;">${escapeHtml(paragraph)}</p>`);
    body.push("</section>");
  }

  if (platformId === "other") {
    body.push(`<p>${draft.tags.map((tag) => `#${escapeHtml(tag.replace(/^#/, ""))}`).join(" ")}</p>`);
  }

  return body.join("\n");
}

export function buildPlatformExport(draft: BlogDraft, platformId: PlatformId): PlatformExport {
  const strategy = getPlatformStrategy(platformId);
  const labels: Record<PlatformId, string> = {
    naver: "네이버 서식 본문",
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
