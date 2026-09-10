import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./blotori-theme.css";

export const metadata: Metadata = {
  title: "Blotori",
  description: "플랫폼별 블로그 원고·시각 강조·이미지 가이드를 구성하는 TORI Family Blog Composer",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
