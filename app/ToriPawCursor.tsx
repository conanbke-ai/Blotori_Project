"use client";

import { useEffect, useState } from "react";

function isTextInteraction(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, [contenteditable='true'], [role='textbox']"));
}

export default function ToriPawCursor() {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncEnabled = () => setEnabled(finePointer.matches && !reducedMotion.matches);
    syncEnabled();
    finePointer.addEventListener("change", syncEnabled);
    reducedMotion.addEventListener("change", syncEnabled);

    const onMove = (event: PointerEvent) => {
      setPosition({ x: event.clientX, y: event.clientY });
      setTextMode(isTextInteraction(event.target));
      setVisible(true);
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") setPressed(true);
    };
    const onUp = () => setPressed(false);
    const onLeave = () => setVisible(false);
    const onEnter = () => setVisible(true);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    document.documentElement.addEventListener("mouseenter", onEnter);

    return () => {
      finePointer.removeEventListener("change", syncEnabled);
      reducedMotion.removeEventListener("change", syncEnabled);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.documentElement.removeEventListener("mouseenter", onEnter);
    };
  }, []);

  if (!enabled || !visible || textMode) return null;

  return (
    <div
      className={`toriPawCursor ${pressed ? "pressed" : ""}`}
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      aria-hidden="true"
    >
      <img
        src={pressed ? "/blotori-paw-pressed.png" : "/blotori-paw-default.png"}
        alt=""
        draggable={false}
      />
    </div>
  );
}
