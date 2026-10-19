import type { ImagePlan, PlatformExport, PlatformId } from "../domain/types";
import type { EmbeddedImage, EmbeddedImageMime } from "../application/platform-exporter";
import type { DraftImageAsset } from "../infrastructure/draft-workspace-storage";

export const MAX_CLIPBOARD_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_CLIPBOARD_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

export type ClipboardImageOmissionReason = "not-uploaded" | "unsupported-type" | "empty" | "too-large" | "total-limit" | "read-failed";
export interface ClipboardImageReport {
  planned: number;
  uploaded: number;
  included: number;
  includedBytes: number;
  omitted: Array<{ imageId: string; reason: ClipboardImageOmissionReason }>;
}
export interface PreparedClipboardImages {
  embeddedImages: EmbeddedImage[];
  report: ClipboardImageReport;
}
export interface RichCopyPreparation {
  html: string;
  images: ClipboardImageReport;
}

type RichHtml = string | Promise<string>;

export interface ClipboardPort {
  writePlain: (text: string) => Promise<void>;
  writeRich?: (html: RichHtml, plainText: string) => Promise<void>;
}
export type CopyResult =
  | { status: "copied"; format: "rich" | "plain"; fallback: boolean; images?: ClipboardImageReport; richFailure?: "preparation" | "clipboard" }
  | { status: "failed"; format: null; fallback: false; images?: ClipboardImageReport; richFailure?: "preparation" | "clipboard" };

const supportedImageTypes = new Set<EmbeddedImageMime>(["image/png", "image/jpeg", "image/webp"]);

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function prepareClipboardImages(
  plans: readonly ImagePlan[],
  assets: readonly DraftImageAsset[],
  limits: { perImageBytes?: number; totalBytes?: number } = {},
): Promise<PreparedClipboardImages> {
  const perImageBytes = limits.perImageBytes ?? MAX_CLIPBOARD_IMAGE_BYTES;
  const totalBytes = limits.totalBytes ?? MAX_CLIPBOARD_TOTAL_IMAGE_BYTES;
  const byImageId = new Map(assets.map((asset) => [asset.imageId, asset]));
  const embeddedImages: EmbeddedImage[] = [];
  const omitted: ClipboardImageReport["omitted"] = [];
  let includedBytes = 0;
  let uploaded = 0;

  for (const plan of plans) {
    const asset = byImageId.get(plan.id);
    if (!asset) { omitted.push({ imageId: plan.id, reason: "not-uploaded" }); continue; }
    uploaded += 1;
    const mimeType = asset.blob.type.toLowerCase() as EmbeddedImageMime;
    if (!supportedImageTypes.has(mimeType)) { omitted.push({ imageId: plan.id, reason: "unsupported-type" }); continue; }
    if (asset.blob.size === 0) { omitted.push({ imageId: plan.id, reason: "empty" }); continue; }
    if (asset.blob.size > perImageBytes) { omitted.push({ imageId: plan.id, reason: "too-large" }); continue; }
    if (includedBytes + asset.blob.size > totalBytes) { omitted.push({ imageId: plan.id, reason: "total-limit" }); continue; }
    try {
      const bytes = new Uint8Array(await asset.blob.arrayBuffer());
      embeddedImages.push({
        imageId: plan.id,
        src: `data:${mimeType};base64,${bytesToBase64(bytes)}`,
        mimeType,
        byteLength: bytes.byteLength,
      });
      includedBytes += bytes.byteLength;
    } catch {
      omitted.push({ imageId: plan.id, reason: "read-failed" });
    }
  }

  return {
    embeddedImages,
    report: { planned: plans.length, uploaded, included: embeddedImages.length, includedBytes, omitted },
  };
}

export function browserClipboard(): ClipboardPort {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  return {
    writePlain: async (text) => {
      if (!clipboard?.writeText) throw new Error("Clipboard unavailable");
      await clipboard.writeText(text);
    },
    ...(clipboard?.write && typeof ClipboardItem !== "undefined" ? {
      writeRich: async (html: RichHtml, plainText: string) => {
        // ClipboardItem is created synchronously in the click task. Its promised
        // HTML may finish reading IndexedDB afterwards without losing activation.
        await clipboard.write([new ClipboardItem({
          "text/html": Promise.resolve(html).then((value) => new Blob([value], { type: "text/html" })),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        })]);
      },
    } : {}),
  };
}

/** The canonical draft never enters the browser clipboard adapter. */
export async function copyPlatformContent(
  content: Pick<PlatformExport, "html" | "plainText">,
  mode: "rich" | "plain",
  clipboard: ClipboardPort = browserClipboard(),
  prepareRich?: () => Promise<RichCopyPreparation>,
): Promise<CopyResult> {
  let preparedValue: RichCopyPreparation | undefined;
  let richFailure: "preparation" | "clipboard" | undefined;
  if (mode === "rich" && content.html && clipboard.writeRich) {
    let preparation: Promise<RichCopyPreparation> | undefined;
    if (prepareRich) {
      try { preparation = prepareRich(); }
      catch (error) { preparation = Promise.reject(error); }
    }
    const html: RichHtml = preparation
      ? preparation.then((value) => { preparedValue = value; return value.html; })
      : content.html;
    try {
      await clipboard.writeRich(html, content.plainText);
      if (preparation) preparedValue = await preparation;
      return { status: "copied", format: "rich", fallback: false, ...(preparedValue ? { images: preparedValue.images } : {}) };
    } catch {
      if (preparation) {
        try { preparedValue = await preparation; richFailure = "clipboard"; }
        catch { richFailure = "preparation"; }
      } else richFailure = "clipboard";
      // Retry only with the already requested plain-text representation.
    }
  }
  try {
    await clipboard.writePlain(content.plainText);
    return {
      status: "copied", format: "plain", fallback: mode === "rich",
      ...(preparedValue ? { images: preparedValue.images } : {}),
      ...(richFailure ? { richFailure } : {}),
    };
  } catch {
    return {
      status: "failed", format: null, fallback: false,
      ...(preparedValue ? { images: preparedValue.images } : {}),
      ...(richFailure ? { richFailure } : {}),
    };
  }
}

function imageCompatibilityNotice(platformId?: PlatformId) {
  return platformId === "naver"
    ? " 네이버 스마트에디터의 Base64/인라인 HTML 이미지 수용 여부는 아직 확인되지 않았어요. 붙여넣은 뒤 보이지 않으면 원본을 직접 업로드해 주세요."
    : " 붙여넣는 편집기가 Base64/인라인 HTML 이미지를 지원하는지는 확인이 필요해요.";
}

export function copyResultMessage(result: CopyResult, platformId?: PlatformId): string {
  if (result.status === "failed") return "복사하지 못했어요. 브라우저 권한을 확인하거나 복사 미리보기에서 직접 선택해 복사해 주세요.";
  if (result.fallback) {
    return result.richFailure === "preparation"
      ? "저장된 이미지를 읽지 못해 이미지 포함 복사를 완료하지 못했어요. 본문은 텍스트만 복사됐으며 기존 이미지는 변경하지 않았어요."
      : "텍스트만 복사됐어요. 이 환경에서는 서식·이미지 복사를 완료하지 못했어요.";
  }
  if (result.format === "plain") return "텍스트만 복사했어요.";
  const images = result.images;
  if (!images || images.planned === 0) return "서식을 포함해 복사했어요. 붙여넣은 편집기에서 최종 서식을 확인해 주세요.";
  const notice = imageCompatibilityNotice(platformId);
  if (images.included === images.planned) return `서식과 업로드 이미지 ${images.included}개를 클립보드에 포함했어요.${notice}`;
  const missing = images.omitted.filter((item) => item.reason === "not-uploaded").length;
  const limited = images.omitted.length - missing;
  const details = [missing ? `파일 없음 ${missing}개` : "", limited ? `형식·크기·읽기 제한 ${limited}개` : ""].filter(Boolean).join(", ");
  return `본문 서식은 복사했지만 이미지 ${images.included}/${images.planned}개만 포함됐어요${details ? ` (${details})` : ""}. 누락된 슬롯은 실제 이미지로 표시하지 않았어요.${notice}`;
}
