import type { PlatformId } from "./types";

/** Export capabilities describe our serializer, never a guarantee about an external editor. */
export interface PlatformCapabilities {
  richText: "portable-html" | "unsupported";
  defaultCopyMode: "plain" | "rich";
  serializer: "naver" | "portable" | "plain";
  images: "manual-upload";
  externalPaste: "unverified";
  notice: string;
}

const portable: PlatformCapabilities = {
  richText: "portable-html", defaultCopyMode: "rich", serializer: "portable",
  images: "manual-upload", externalPaste: "unverified",
  notice: "외부 편집기의 서식 유지 여부는 아직 검증하지 않았어요. 붙여넣은 뒤 서식과 이미지 위치를 확인해 주세요.",
};
const capabilities: Readonly<Record<PlatformId, PlatformCapabilities>> = {
  naver: { ...portable, serializer: "naver", notice: "네이버 붙여넣기 서식은 아직 미검증이에요. 이미지는 원본 파일을 따로 올려 주세요." },
  tistory: { ...portable },
  blogger: { ...portable },
  wordpress: { ...portable },
  brunch: { ...portable, richText: "unsupported", defaultCopyMode: "plain", serializer: "plain", notice: "브런치스토리는 텍스트 복사를 제공해요. 서식과 이미지는 해당 편집기에서 적용해 주세요." },
  other: { ...portable, notice: "기타 플랫폼에는 범용 HTML을 제공해요. 특정 편집기 호환성은 검증하지 않았으며, 지원되지 않으면 텍스트만 복사할 수 있어요." },
};

export function getPlatformCapabilities(platformId: PlatformId): PlatformCapabilities {
  return { ...(capabilities[platformId] ?? capabilities.other) };
}
