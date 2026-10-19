"use client";
import type { PlatformExport } from "../lib/domain/types";
import "./platform-export.css";

export default function PlatformExportPreview({ exported, feedback }: { exported: PlatformExport; feedback: string }) {
  return <div className="platformExportPanel">
    <p className="platformExportNotice">{exported.capabilities.notice}</p>
    <p className="platformCopyFeedback" role="status" aria-live="polite" data-copy-result>{feedback}</p>
    <details className="platformExportDetails">
      <summary>복사될 본문 확인 · {exported.html ? "서식 포함" : "텍스트"}</summary>
      <p>아래는 실제 복사 데이터의 미리보기예요. 제목·요약·내부 이미지 지시문은 포함하지 않으며, 외부 편집기 서식은 붙여넣은 뒤 확인해 주세요.</p>
      {exported.html
        ? <div className="platformExportDocument" data-export-preview dangerouslySetInnerHTML={{ __html: exported.html }} />
        : <pre className="platformExportDocument" data-export-preview>{exported.plainText}</pre>}
    </details>
    <details className="platformExportDetails imageGuideDetails">
      <summary>별도 이미지 가이드 확인</summary>
      <p>원본 이미지는 본문 복사에 자동 첨부되지 않습니다. 이 편집자용 가이드를 참고해 게시 편집기에서 직접 업로드해 주세요.</p>
      <pre className="platformExportDocument" data-image-guide-preview>{exported.imageGuideText}</pre>
    </details>
  </div>;
}
