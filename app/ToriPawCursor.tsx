"use client";

import { useEffect, useState } from "react";

const PAW_IMAGE = "/blotori-paw.webp";

function isTextTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(
    target.closest(
      "input:not([type='checkbox']):not([type='radio']):not([type='range']), textarea, [contenteditable='true'], [role='textbox']"
    )
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(
    target.closest("button, a, select, [role='button'], [role='link'], input[type='checkbox'], input[type='radio'], input[type='range']")
  );
}

export default function ToriPawCursor() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      if (!cancelled) setLoaded(image.naturalWidth > 0);
    };
    image.onerror = () => {
      if (!cancelled) setLoaded(false);
    };
    image.src = PAW_IMAGE;

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    const sync = () => setEnabled(fine.matches && !reduce.matches);
    sync();

    fine.addEventListener("change", sync);
    reduce.addEventListener("change", sync);

    return () => {
      fine.removeEventListener("change", sync);
      reduce.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;

      setPosition({ x: event.clientX, y: event.clientY });
      setTextMode(isTextTarget(event.target));
      setHovering(isInteractiveTarget(event.target));
      setVisible(true);
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") setPressed(true);
    };

    const onUp = () => setPressed(false);
    const onLeave = () => {
      setVisible(false);
      setPressed(false);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onLeave);
    document.documentElement.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onLeave);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  const active = enabled && loaded && visible && !textMode;

  useEffect(() => {
    document.documentElement.classList.toggle("blotori-paw-active", active);
    return () => {
      document.documentElement.classList.remove("blotori-paw-active");
    };
  }, [active]);

  if (!active) return null;

  return (
    <div
      className={`toriPawCursor${hovering ? " hovering" : ""}${pressed ? " pressed" : ""}`}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`
      }}
      aria-hidden="true"
    >
      <img src={PAW_IMAGE} alt="" draggable={false} />
    </div>
  );
}
