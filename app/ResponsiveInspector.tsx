"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/** Measure the space the panels actually share, including collapsed settings.
 * CSS owns the minimums: 300px settings, 560px readable preview, 292px inspector.
 * Padding and gaps are measured, so a narrower host or browser zoom works too. */
export function useWorkspaceLayout(gridRef: RefObject<HTMLDivElement | null>, settingsOpen: boolean) {
  const [layout, setLayout] = useState({ compact: true, single: false });
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const css = getComputedStyle(grid);
      const value = (name: string) => parseFloat(css.getPropertyValue(name));
      const width = grid.clientWidth - value("padding-left") - value("padding-right");
      const settings = value("--workspace-settings-min");
      const preview = value("--workspace-preview-min");
      const inspector = value("--workspace-inspector-min");
      const gap = value("column-gap");
      const single = width < settings + preview + gap;
      const compact = single || width < preview + inspector + gap + (settingsOpen ? settings + gap : 0);
      setLayout((current) => current.single === single && current.compact === compact ? current : { single, compact });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [gridRef, settingsOpen]);
  return layout;
}

type Props = {
  compact: boolean;
  open: boolean;
  onDismiss: () => void;
  children: ReactNode;
  tabs: ReactNode;
};

export default function ResponsiveInspector({ compact, open, onDismiss, children, tabs }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef(0);
  const wasModal = useRef(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusedInside = dialog.contains(previousFocus);
    const modal = compact && open;
    if (dialog.open && bodyRef.current) scrollRef.current = bodyRef.current.scrollTop;
    if (modal) {
      if (!dialog.matches(":modal")) {
        openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (dialog.open) dialog.close();
        dialog.showModal();
        closeRef.current?.focus({ preventScroll: true });
      }
    } else {
      if (dialog.open) dialog.close();
      if (!compact && open) {
        dialog.show();
        if (!wasModal.current) previousFocus?.focus({ preventScroll: true });
      }
      if (wasModal.current) {
        if (!compact) {
          // Resizing removes modality without duplicating or remounting content.
          dialog.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
        } else {
          openerRef.current?.focus({ preventScroll: true });
        }
      } else if (focusedInside && compact) {
        Array.from(document.querySelectorAll<HTMLElement>(".reviewLauncher, .mobileReviewLauncher"))
          .find((button) => button.getClientRects().length > 0)?.focus({ preventScroll: true });
      }
    }
    wasModal.current = modal;
    if (open && bodyRef.current) bodyRef.current.scrollTop = scrollRef.current;
  }, [compact, open]);

  useEffect(() => {
    if (!compact || !open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [compact, open]);

  return <dialog
    id="image-review-panel"
    ref={dialogRef}
    className={`panel inspectorRail ${compact ? "inspectorDialog" : "inspectorDocked"}`}
    role={compact ? "dialog" : "complementary"}
    aria-modal={compact && open ? true : undefined}
    aria-labelledby="image-review-heading"
    onCancel={(event) => { event.preventDefault(); dismissRef.current(); }}
    onKeyDown={(event) => {
      if (!compact || !open || event.key !== "Tab") return;
      // Native modality makes the page inert, but Chromium can otherwise move
      // Tab focus into browser chrome at the boundary. Keep the review loop local.
      const stops = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button, input, textarea, select, a[href], [tabindex]"))
        .filter((node) => node.tabIndex >= 0 && !node.matches(":disabled") && node.getClientRects().length > 0);
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }}
  >
    <div className="railHeading inspectorHeading">
      <div><span className="step">03</span><div><h2 id="image-review-heading">이미지 · 검수</h2><p>게시 전 마지막 완성도를 확인해요.</p></div></div>
      {compact && <button ref={closeRef} className="ghost inspectorClose" onClick={onDismiss} aria-label="이미지·검수 닫기">닫기</button>}
    </div>
    {tabs}
    <div className="inspectorBody" ref={bodyRef} onScroll={(event) => { if (dialogRef.current?.open) scrollRef.current = event.currentTarget.scrollTop; }}>{children}</div>
  </dialog>;
}
