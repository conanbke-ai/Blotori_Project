"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getStylePreviewFixture } from "../lib/domain/style-preview-fixtures";
import type { StyleId, StyleIntensity } from "../lib/domain/types";

const intensityLabel: Record<StyleIntensity, string> = {
  1: "절제됨",
  2: "부드러움",
  3: "자연스러움",
  4: "적극적",
  5: "개성 강함",
};

function findField(label: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>("label.field"))
    .find((field) => field.querySelector(":scope > span")?.textContent?.trim() === label) ?? null;
}

export default function StylePreviewPortal() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [styleId, setStyleId] = useState<StyleId>("auto");
  const [intensity, setIntensity] = useState<StyleIntensity>(3);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const bind = () => {
      const styleField = findField("문체");
      const intensityField = findField("문체 강도");
      const styleSelect = styleField?.querySelector("select") as HTMLSelectElement | null;
      const intensitySelect = intensityField?.querySelector("select") as HTMLSelectElement | null;

      if (!styleField || !intensityField || !styleSelect || !intensitySelect) return false;

      setTarget(intensityField);
      const sync = () => {
        setStyleId(styleSelect.value as StyleId);
        setIntensity(Number(intensitySelect.value || 3) as StyleIntensity);
      };
      sync();
      styleSelect.addEventListener("change", sync);
      intensitySelect.addEventListener("change", sync);
      cleanup = () => {
        styleSelect.removeEventListener("change", sync);
        intensitySelect.removeEventListener("change", sync);
      };
      return true;
    };

    if (bind()) return () => cleanup?.();

    const observer = new MutationObserver(() => {
      if (bind()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cleanup?.();
    };
  }, []);

  if (!target) return null;

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
  return createPortal(<div className="stylePreviewPortalMount">{content}</div>, target);
}
