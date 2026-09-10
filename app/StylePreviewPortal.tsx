"use client";

import { useEffect, useState } from "react";
import { getStylePreviewFixture } from "../lib/domain/style-preview-fixtures";
import type { StyleId, StyleIntensity } from "../lib/domain/types";

const intensityLabel: Record<StyleIntensity, string> = {
  1: "절제됨",
  2: "부드러움",
  3: "자연스러움",
  4: "적극적",
  5: "개성 강함",
};

type AnchorRect = {
  left: number;
  top: number;
  width: number;
};

function findField(label: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>("label.field"))
    .find((field) => field.querySelector(":scope > span")?.textContent?.trim() === label) ?? null;
}

function getAnchorRect(field: HTMLElement): AnchorRect {
  const rect = field.getBoundingClientRect();
  const viewportPadding = 12;
  const preferredWidth = Math.min(Math.max(rect.width, 260), 340);
  const left = Math.min(
    Math.max(viewportPadding, rect.left),
    Math.max(viewportPadding, window.innerWidth - preferredWidth - viewportPadding),
  );

  return {
    left,
    top: Math.min(rect.bottom + 8, Math.max(viewportPadding, window.innerHeight - 330)),
    width: preferredWidth,
  };
}

export default function StylePreviewPortal() {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [styleId, setStyleId] = useState<StyleId>("auto");
  const [intensity, setIntensity] = useState<StyleIntensity>(3);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let observer: MutationObserver | undefined;

    const bind = () => {
      const styleField = findField("문체");
      const intensityField = findField("문체 강도");
      const styleSelect = styleField?.querySelector("select") as HTMLSelectElement | null;
      const intensitySelect = intensityField?.querySelector("select") as HTMLSelectElement | null;

      if (!styleField || !intensityField || !styleSelect || !intensitySelect) return false;

      const sync = () => {
        setStyleId(styleSelect.value as StyleId);
        setIntensity(Number(intensitySelect.value || 3) as StyleIntensity);
        setAnchor(getAnchorRect(intensityField));
      };

      const show = () => {
        sync();
        setVisible(true);
      };
      const hide = (event: FocusEvent | MouseEvent) => {
        const next = event.relatedTarget;
        if (next instanceof Node && (styleField.contains(next) || intensityField.contains(next))) return;
        setVisible(false);
      };
      const reposition = () => setAnchor(getAnchorRect(intensityField));

      sync();
      styleSelect.addEventListener("change", sync);
      intensitySelect.addEventListener("change", sync);
      styleField.addEventListener("focusin", show);
      intensityField.addEventListener("focusin", show);
      styleField.addEventListener("mouseenter", show);
      intensityField.addEventListener("mouseenter", show);
      styleField.addEventListener("focusout", hide);
      intensityField.addEventListener("focusout", hide);
      styleField.addEventListener("mouseleave", hide);
      intensityField.addEventListener("mouseleave", hide);
      window.addEventListener("resize", reposition);
      window.addEventListener("scroll", reposition, true);

      cleanup = () => {
        styleSelect.removeEventListener("change", sync);
        intensitySelect.removeEventListener("change", sync);
        styleField.removeEventListener("focusin", show);
        intensityField.removeEventListener("focusin", show);
        styleField.removeEventListener("mouseenter", show);
        intensityField.removeEventListener("mouseenter", show);
        styleField.removeEventListener("focusout", hide);
        intensityField.removeEventListener("focusout", hide);
        styleField.removeEventListener("mouseleave", hide);
        intensityField.removeEventListener("mouseleave", hide);
        window.removeEventListener("resize", reposition);
        window.removeEventListener("scroll", reposition, true);
      };
      return true;
    };

    if (!bind()) {
      observer = new MutationObserver(() => {
        if (bind()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      cleanup?.();
    };
  }, []);

  if (!anchor || !visible) return null;

  const fixture = getStylePreviewFixture(styleId, intensity);
  const sample = fixture?.samples[intensity];
  const content = sample ? (
    <div className="stylePreviewCard" aria-live="polite">
      <div className="stylePreviewHeader">
        <strong>문체 미리보기</strong>
        <span>강도 {intensity} · {intensityLabel[intensity]}</span>
      </div>
      <div className="stylePreviewBody">
        <p className="stylePreviewTitle">{sample.title}</p>
        <p className="stylePreviewIntro">{sample.intro}</p>
        <p className="stylePreviewHeading">{sample.heading}</p>
        <p className="stylePreviewText">{sample.body}</p>
      </div>
    </div>
  ) : styleId === "auto" ? (
    <p className="stylePreviewEmpty">자동 추천은 실제 주제와 목적에 따라 문체가 결정되므로 고정 예시를 사용하지 않아요.</p>
  ) : styleId === "custom" ? (
    <p className="stylePreviewEmpty">직접 설정 문체는 입력한 요청을 실제 생성 프롬프트에서 해석해 적용해요.</p>
  ) : null;

  if (!content) return null;

  return (
    <div
      className="stylePreviewFloating"
      style={{ left: anchor.left, top: anchor.top, width: anchor.width }}
      aria-hidden={!visible}
    >
      {content}
    </div>
  );
}
