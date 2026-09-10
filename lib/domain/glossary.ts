import type { BlogDraft, BlogSection } from "./types";

export const GLOSSARY_SECTION_ID = "glossary";
export const GLOSSARY_HEADING = "용어해설";
export const GLOSSARY_MAX_TERMS = 5;

export const GLOSSARY_GENERATION_INSTRUCTION = `
[일반 독자용 전문용어·용어해설]
- 기본 독자는 일반 블로그 이용자다. 전문용어를 과시적으로 나열하지 않는다.
- 일반적인 표현만으로 정확하게 설명할 수 있으면 전문용어를 굳이 쓰지 않는다.
- 전문용어가 정확성이나 이해에 실제로 도움이 될 때만 최대 ${GLOSSARY_MAX_TERMS}개 사용한다.
- 선택한 전문용어는 title, summary, heading, tag가 아니라 intro/본문 paragraph/closing의 최초 등장 1회에만 용어 바로 뒤에 *를 붙인다. 예: 전방머리자세*
- 같은 용어에 별표를 반복하지 않는다.
- 전문용어를 사용했다면 sections의 마지막에 id="${GLOSSARY_SECTION_ID}", heading="${GLOSSARY_HEADING}" 섹션을 추가한다.
- 현재 JSON schema와 호환되도록 해당 섹션의 presentation.visualStyle은 "quote"로 출력한다. 서버가 이후 glossary 스타일로 정규화한다.
- 용어해설 paragraphs는 정확히 "* 용어: 쉬운 설명" 형식으로 작성한다.
- 각 설명은 일반인이 바로 이해할 수 있는 짧은 1문장으로 쓰고, 설명 속에 또 다른 어려운 전문용어를 연쇄적으로 넣지 않는다.
- 의료·건강 주제에서는 자세나 특정 구조 하나를 통증의 확정 원인처럼 단정하지 않는다.
- 실제 본문에 쓰지 않은 용어를 용어해설에 추가하지 않는다.
- 전문용어가 필요하지 않은 글이라면 용어해설 섹션을 만들지 않는다.
`;

type GlossaryEntry = {
  term: string;
  definition: string;
};

function isGlossarySection(section: BlogSection) {
  return section.id === GLOSSARY_SECTION_ID || section.heading.trim() === GLOSSARY_HEADING || section.presentation?.visualStyle === "glossary";
}

function parseGlossaryParagraph(paragraph: string): GlossaryEntry | null {
  const cleaned = paragraph.trim().replace(/^[-•]\s*/, "");
  const match = cleaned.match(/^\*?\s*([^:：]{1,60})\s*[:：]\s*(.+)$/);
  if (!match) return null;

  const term = match[1].replace(/\*+$/g, "").trim();
  const rawDefinition = match[2].replace(/\s+/g, " ").trim();
  if (!term || !rawDefinition) return null;

  const definition = rawDefinition.length <= 120
    ? rawDefinition
    : `${rawDefinition.slice(0, 117).trim()}…`;

  return { term, definition };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripMarker(text: string, term: string) {
  return text.replace(new RegExp(`${escapeRegExp(term)}\\s*\\*`, "g"), term);
}

function markFirst(text: string, term: string) {
  const index = text.indexOf(term);
  if (index < 0) return { text, marked: false };
  return {
    text: `${text.slice(0, index)}${term}*${text.slice(index + term.length)}`,
    marked: true,
  };
}

function normalizeEntryList(entries: GlossaryEntry[], documentText: string) {
  const deduped = entries.filter((entry, index, all) =>
    all.findIndex((candidate) => candidate.term === entry.term) === index,
  );

  const nonNested = deduped.filter((entry) =>
    !deduped.some((other) => other.term !== entry.term && other.term.length > entry.term.length && other.term.includes(entry.term)),
  );

  return nonNested
    .map((entry) => ({ ...entry, firstIndex: documentText.indexOf(entry.term) }))
    .filter((entry) => entry.firstIndex >= 0)
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .slice(0, GLOSSARY_MAX_TERMS)
    .map(({ firstIndex: _firstIndex, ...entry }) => entry);
}

export function normalizeGlossaryFootnotes(draft: BlogDraft): BlogDraft {
  const glossarySections = draft.sections.filter(isGlossarySection);
  if (!glossarySections.length) return draft;

  const regularSections = draft.sections.filter((section) => !isGlossarySection(section));
  const parsedEntries = glossarySections.flatMap((section) => section.paragraphs.map(parseGlossaryParagraph)).filter((entry): entry is GlossaryEntry => Boolean(entry));

  const rawDocumentText = [
    ...draft.intro,
    ...regularSections.flatMap((section) => section.paragraphs),
    ...draft.closing,
  ].join("\n");

  const entries = normalizeEntryList(parsedEntries, rawDocumentText.replace(/\*/g, ""));
  if (!entries.length) {
    return { ...draft, sections: regularSections };
  }

  let intro = [...draft.intro];
  let sections = regularSections.map((section) => ({ ...section, paragraphs: [...section.paragraphs] }));
  let closing = [...draft.closing];

  for (const { term } of entries) {
    intro = intro.map((paragraph) => stripMarker(paragraph, term));
    sections = sections.map((section) => ({ ...section, paragraphs: section.paragraphs.map((paragraph) => stripMarker(paragraph, term)) }));
    closing = closing.map((paragraph) => stripMarker(paragraph, term));
  }

  for (const { term } of entries) {
    let marked = false;

    intro = intro.map((paragraph) => {
      if (marked) return paragraph;
      const result = markFirst(paragraph, term);
      marked = result.marked;
      return result.text;
    });

    sections = sections.map((section) => ({
      ...section,
      paragraphs: section.paragraphs.map((paragraph) => {
        if (marked) return paragraph;
        const result = markFirst(paragraph, term);
        marked = result.marked;
        return result.text;
      }),
    }));

    closing = closing.map((paragraph) => {
      if (marked) return paragraph;
      const result = markFirst(paragraph, term);
      marked = result.marked;
      return result.text;
    });
  }

  const glossarySection: BlogSection = {
    id: GLOSSARY_SECTION_ID,
    heading: GLOSSARY_HEADING,
    paragraphs: entries.map(({ term, definition }) => `* ${term}: ${definition}`),
    presentation: {
      headingAlign: "left",
      bodyAlign: "left",
      visualStyle: "glossary",
      emphasis: [],
    },
  };

  return {
    ...draft,
    intro,
    sections: [...sections, glossarySection],
    closing,
  };
}
