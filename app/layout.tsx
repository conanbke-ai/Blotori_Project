import type { Metadata } from "next";
import type { ReactNode } from "react";
import ComposerWorkflowEnhancer from "./ComposerWorkflowEnhancer";
import GenerationPacingEnhancer from "./GenerationPacingEnhancer";
import ImageSlotUploadEnhancer from "./ImageSlotUploadEnhancer";
import StylePreviewPortal from "./StylePreviewPortal";
import TitleCopyEnhancer from "./TitleCopyEnhancer";
import ToriPawCursor from "./ToriPawCursor";
import "./globals.css";
import "./blotori-theme.css";
import "./blotori-states.css";
import "./blotori-ui-enhancements.css";
import "./style-preview.css";
import "./glossary.css";
import "./image-slot-upload.css";
import "./composer-workflow.css";
import "./workspace-v2.css";
import "./workspace-v2-fixes.css";
import "./blotori-asset-studio.css";
import "./workspace-v2-final.css";
import "./workspace-v2-hotfix.css";
import "./workspace-v2-consistency.css";
import "./workspace-v2-character-fix.css";
import "./tori-paw-cursor.css";

export const metadata: Metadata = {
  title: "Blotori",
  description: "플랫폼별 블로그 원고·시각 강조·이미지 가이드를 구성하는 TORI Family Blog Composer",
  icons: {
    icon: "/blotori-icon-transparent.webp",
    shortcut: "/blotori-icon-transparent.webp",
    apple: "/blotori-icon-transparent.webp",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <GenerationPacingEnhancer />
        <ComposerWorkflowEnhancer />
        <ImageSlotUploadEnhancer />
        <StylePreviewPortal />
        <TitleCopyEnhancer />
        <ToriPawCursor />
      </body>
    </html>
  );
}
