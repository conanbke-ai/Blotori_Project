/** Browser-only clipboard foundation. Image embedding follows in a separate dependency-complete PR. */
export interface ClipboardPort {
  writePlain: (text: string) => Promise<void>;
  writeRich?: (html: string, plainText: string) => Promise<void>;
}
export type CopyResult =
  | { status: "copied"; format: "rich" | "plain"; fallback: boolean }
  | { status: "failed"; format: null; fallback: false };

export function browserClipboard(): ClipboardPort {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  return {
    writePlain: async (text) => {
      if (!clipboard?.writeText) throw new Error("Clipboard unavailable");
      await clipboard.writeText(text);
    },
    ...(clipboard?.write && typeof ClipboardItem !== "undefined" ? {
      writeRich: async (html: string, plainText: string) => {
        await clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        })]);
      },
    } : {}),
  };
}

export async function copyPlatformContent(
  content: { html?: string; plainText: string },
  mode: "rich" | "plain",
  clipboard: ClipboardPort = browserClipboard(),
): Promise<CopyResult> {
  if (mode === "rich" && content.html && clipboard.writeRich) {
    try {
      await clipboard.writeRich(content.html, content.plainText);
      return { status: "copied", format: "rich", fallback: false };
    } catch { /* Fall back to the user's existing plain-text representation. */ }
  }
  try {
    await clipboard.writePlain(content.plainText);
    return { status: "copied", format: "plain", fallback: mode === "rich" };
  } catch {
    return { status: "failed", format: null, fallback: false };
  }
}

export function copyResultMessage(result: CopyResult): string {
  if (result.status === "failed") return "복사하지 못했어요. 브라우저 권한을 확인해 주세요.";
  if (result.fallback) return "텍스트만 복사됐어요. 서식 복사를 완료하지 못했어요.";
  return result.format === "rich" ? "서식을 포함해 복사했어요. 붙여넣은 편집기에서 확인해 주세요." : "텍스트만 복사했어요.";
}
