"use client";
import type { PlatformExport } from "../lib/domain/types";
import "./platform-export.css";

export default function PlatformExportPreview({ exported, feedback }: { exported: PlatformExport; feedback: string }) {
  return <div className="platformExportPanel">
    <p className="platformExportNotice">{exported.capabilities.notice}</p>
    <p className="platformCopyFeedback" role="status" aria-live="polite" data-copy-result>{feedback}</p>
    <details className="platformExportDetails">
      <summary>복사될 본문 확인 · {exported.html ? "서식 포함" : "텍스트"}</summary>
      <p>아래는 실제 복사 데이터의 미리보기예요. 외부 편집기에서는 달라질 수 있어요. 제목·요약은 포함하지 않으며, 이미지는 IMG 표식 위치에 따로 업로드해 주세요.</p>
      {exported.html
        ? <div className="platformExportDocument" data-export-preview dangerouslySetInnerHTML={{ __html: exported.html }} />
        : <pre className="platformExportDocument" data-export-preview>{exported.plainText}</pre>}
    </details>
  </div>;
}
