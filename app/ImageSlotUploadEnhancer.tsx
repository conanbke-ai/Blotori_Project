"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type SlotTarget = {
  id: string;
  ratio: string;
  element: HTMLElement;
};

type LocalUpload = {
  url: string;
  name: string;
  size: number;
};

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function readTargets(): SlotTarget[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".imageSlot .slotArt"))
    .map((element) => {
      const slot = element.closest<HTMLElement>(".imageSlot");
      const id = slot?.querySelector<HTMLElement>(".slotBadge")?.textContent?.trim();
      const ratio = element.querySelector<HTMLElement>("small")?.textContent?.trim() || "4:3";
      return id && slot ? { id, ratio, element } : null;
    })
    .filter((item): item is SlotTarget => Boolean(item));
}

function sameTargets(a: SlotTarget[], b: SlotTarget[]) {
  return a.length === b.length && a.every((item, index) => item.element === b[index]?.element && item.id === b[index]?.id);
}

function readableSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function ratioClass(ratio: string) {
  return `ratio-${ratio.replace(":", "-")}`;
}

export default function ImageSlotUploadEnhancer() {
  const [targets, setTargets] = useState<SlotTarget[]>([]);
  const [uploads, setUploads] = useState<Record<string, LocalUpload>>({});
  const uploadsRef = useRef<Record<string, LocalUpload>>({});
  const wasGeneratingRef = useRef(false);

  const commitUploads = useCallback((next: Record<string, LocalUpload>) => {
    uploadsRef.current = next;
    setUploads(next);
  }, []);

  const clearAll = useCallback(() => {
    Object.values(uploadsRef.current).forEach((upload) => URL.revokeObjectURL(upload.url));
    commitUploads({});
  }, [commitUploads]);

  useEffect(() => {
    const scan = () => {
      const nextTargets = readTargets();
      setTargets((current) => sameTargets(current, nextTargets) ? current : nextTargets);

      const generating = Boolean(document.querySelector(".generationOverlay"));
      if (generating && !wasGeneratingRef.current) clearAll();
      wasGeneratingRef.current = generating;
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      Object.values(uploadsRef.current).forEach((upload) => URL.revokeObjectURL(upload.url));
    };
  }, [clearAll]);

  const setFile = useCallback((slotId: string, file: File) => {
    if (!ACCEPTED_TYPES.has(file.type)) {
      window.alert("PNG, JPG 또는 WebP 이미지 파일만 넣을 수 있어요.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      window.alert("이미지 한 장은 15MB 이하로 넣어 주세요.");
      return;
    }

    const url = URL.createObjectURL(file);
    const current = uploadsRef.current[slotId];
    if (current) URL.revokeObjectURL(current.url);
    commitUploads({
      ...uploadsRef.current,
      [slotId]: { url, name: file.name, size: file.size },
    });
  }, [commitUploads]);

  const removeFile = useCallback((slotId: string) => {
    const current = uploadsRef.current[slotId];
    if (current) URL.revokeObjectURL(current.url);
    const next = { ...uploadsRef.current };
    delete next[slotId];
    commitUploads(next);
  }, [commitUploads]);

  return (
    <>
      {targets.map((target) => createPortal(
        <SlotUploadControl
          key={target.id}
          slotId={target.id}
          ratio={target.ratio}
          upload={uploads[target.id]}
          onFile={setFile}
          onRemove={removeFile}
        />,
        target.element,
        `blotori-upload-${target.id}`,
      ))}
    </>
  );
}

function SlotUploadControl({
  slotId,
  ratio,
  upload,
  onFile,
  onRemove,
}: {
  slotId: string;
  ratio: string;
  upload?: LocalUpload;
  onFile: (slotId: string, file: File) => void;
  onRemove: (slotId: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function takeFile(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(slotId, file);
  }

  return (
    <div
      className={`slotUploadShell ${upload ? `hasImage ${ratioClass(ratio)}` : ""} ${dragging ? "isDragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        takeFile(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        className="slotUploadInput"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          takeFile(event.target.files);
          event.currentTarget.value = "";
        }}
        tabIndex={-1}
        aria-hidden="true"
      />

      {upload ? (
        <>
          <img className="slotUploadedImage" src={upload.url} alt={`${slotId} 미리보기`} />
          <div className="slotUploadToolbar">
            <div className="slotUploadFileMeta" title={upload.name}>
              <strong>이미지 적용됨</strong>
              <span>{upload.name} · {readableSize(upload.size)}</span>
            </div>
            <div className="slotUploadActions">
              <button type="button" onClick={() => inputRef.current?.click()}>교체</button>
              <button type="button" className="danger" onClick={() => onRemove(slotId)}>삭제</button>
            </div>
          </div>
        </>
      ) : (
        <button type="button" className="slotDropButton" onClick={() => inputRef.current?.click()}>
          <span className="slotDropIcon" aria-hidden="true">＋</span>
          <strong>{dragging ? "여기에 놓아 주세요" : "생성한 이미지 넣기"}</strong>
          <small>클릭하거나 PNG · JPG · WebP 파일을 드래그</small>
        </button>
      )}
    </div>
  );
}
