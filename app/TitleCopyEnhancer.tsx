"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function TitleCopyEnhancer() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [title, setTitle] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const sync = () => {
      const nextMount = document.querySelector<HTMLElement>(".previewHeader .headerActions");
      const titleNode = document.querySelector<HTMLElement>(".blogPaper .previewTitle");
      const titleInput = document.querySelector<HTMLInputElement>(".blogPaper .titleEdit");
      setMount(nextMount);
      setTitle((titleInput?.value || titleNode?.textContent || "").trim());
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("input", sync, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("input", sync, true);
    };
  }, []);

  if (!mount || !title) return null;

  return createPortal(
    <button
      type="button"
      className="ghost"
      onClick={async () => {
        await navigator.clipboard.writeText(title);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? "제목 복사됨 ✓" : "제목 복사"}
    </button>,
    mount,
  );
}
