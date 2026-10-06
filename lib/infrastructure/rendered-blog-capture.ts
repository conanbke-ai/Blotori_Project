import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { chromium, type Browser, type Page } from "playwright";

export type RenderedBlock = {
  order: number;
  tag: string;
  text: string;
  align: string;
  fontSize: string;
  fontWeight: string;
  color: string;
  backgroundColor: string;
  marginTop: string;
  marginBottom: string;
  width: number;
  height: number;
};

export type RenderedImage = {
  order: number;
  srcHost: string;
  alt: string;
  width: number;
  height: number;
  top: number;
  nearestTextBefore: string;
  nearestTextAfter: string;
};

export type RenderedPageEvidence = {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  documentHeight: number;
  blocks: RenderedBlock[];
  images: RenderedImage[];
  headings: string[];
  textPreview: string;
  screenshotDataUrl?: string;
  candidateLinks: string[];
  frameCount: number;
};

export type RenderedBlogEvidence = {
  requestedUrl: string;
  capturedAt: string;
  pages: RenderedPageEvidence[];
  limitation?: string;
};

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0) >>> 0;
}

function ipv4InCidr(ip: string, base: string, prefix: number) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

function isBlockedIp(address: string) {
  if (isIP(address) === 4) {
    return [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ].some(([base, prefix]) => ipv4InCidr(address, String(base), Number(prefix)));
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8");
  }
  return true;
}

async function assertPublicHttpUrl(value: string, dnsCache: Map<string, boolean>) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("http/https 주소만 분석할 수 있습니다.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || BLOCKED_HOSTS.has(hostname) || hostname.endsWith(".localhost")) {
    throw new Error("로컬/내부 네트워크 주소는 분석할 수 없습니다.");
  }

  const cached = dnsCache.get(hostname);
  if (cached === true) return url;
  if (cached === false) throw new Error("내부 네트워크로 해석되는 주소는 분석할 수 없습니다.");

  if (isIP(hostname)) {
    const allowed = !isBlockedIp(hostname);
    dnsCache.set(hostname, allowed);
    if (!allowed) throw new Error("사설/특수 IP 주소는 분석할 수 없습니다.");
    return url;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isBlockedIp(record.address))) {
    dnsCache.set(hostname, false);
    throw new Error("내부 네트워크로 해석되는 주소는 분석할 수 없습니다.");
  }
  dnsCache.set(hostname, true);
  return url;
}

function canonicalUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

async function installNetworkGuard(page: Page, dnsCache: Map<string, boolean>) {
  await page.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (requestUrl.startsWith("data:") || requestUrl.startsWith("blob:")) {
      await route.continue();
      return;
    }
    try {
      await assertPublicHttpUrl(requestUrl, dnsCache);
      await route.continue();
    } catch {
      await route.abort("blockedbyclient");
    }
  });
}

async function extractPageEvidence(page: Page): Promise<Omit<RenderedPageEvidence, "screenshotDataUrl">> {
  const framePayloads = await Promise.all(page.frames().map(async (frame) => {
    try {
      return await frame.evaluate(() => {
        const visible = (element: Element) => {
          const rect = (element as HTMLElement).getBoundingClientRect();
          const style = getComputedStyle(element as HTMLElement);
          return rect.width > 8 && rect.height > 8 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0;
        };
        const clean = (value: string | null | undefined, max = 500) => (value || "").replace(/\s+/g, " ").trim().slice(0, max);
        const blockSelectors = "h1,h2,h3,h4,p,blockquote,li,figcaption,pre";
        const preferredSelectors = [
          ".se-main-container",
          ".se-viewer",
          "#postViewArea",
          ".post-view",
          ".post_ct",
          "article",
          "main",
          "[role=main]",
        ];
        const scoreRoot = (root: Element) => {
          const text = clean((root as HTMLElement).innerText || root.textContent, 50000);
          const images = Array.from(root.querySelectorAll("img")).filter(visible).length;
          const blocks = root.querySelectorAll(blockSelectors).length;
          return text.length + images * 110 + Math.min(blocks, 120) * 12;
        };
        const preferredRoots = preferredSelectors
          .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
          .filter(visible)
          .map((root) => ({ root, score: scoreRoot(root) }))
          .filter((item) => item.score > 700)
          .sort((a, b) => b.score - a.score);
        const contentRoot = preferredRoots[0]?.root ?? document.body;
        const blockNodes = Array.from(contentRoot.querySelectorAll(blockSelectors)).filter(visible).slice(0, 240);
        const blocks = blockNodes.map((node, index) => {
          const element = node as HTMLElement;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            order: index,
            tag: element.tagName.toLowerCase(),
            text: clean(element.innerText || element.textContent, 650),
            align: style.textAlign,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            color: style.color,
            backgroundColor: style.backgroundColor,
            marginTop: style.marginTop,
            marginBottom: style.marginBottom,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        }).filter((item) => item.text.length > 0);

        const textNodes = blocks.map((item) => item.text);
        const imageNodes = Array.from(contentRoot.querySelectorAll("img")).filter(visible).slice(0, 120);
        const images = imageNodes.map((image, index) => {
          const rect = image.getBoundingClientRect();
          const centerY = rect.top + window.scrollY + rect.height / 2;
          let before = "";
          let after = "";
          let beforeDistance = Number.POSITIVE_INFINITY;
          let afterDistance = Number.POSITIVE_INFINITY;
          for (const node of blockNodes) {
            const element = node as HTMLElement;
            const blockRect = element.getBoundingClientRect();
            const blockCenter = blockRect.top + window.scrollY + blockRect.height / 2;
            const distance = Math.abs(centerY - blockCenter);
            const text = clean(element.innerText || element.textContent, 180);
            if (!text) continue;
            if (blockCenter <= centerY && distance < beforeDistance) {
              beforeDistance = distance;
              before = text;
            }
            if (blockCenter > centerY && distance < afterDistance) {
              afterDistance = distance;
              after = text;
            }
          }
          let srcHost = "";
          try { srcHost = new URL(image.currentSrc || image.src, location.href).hostname; } catch {}
          return {
            order: index,
            srcHost,
            alt: clean(image.alt, 160),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            top: Math.round(rect.top + window.scrollY),
            nearestTextBefore: before,
            nearestTextAfter: after,
          };
        });

        const anchors = Array.from(document.querySelectorAll("a[href]"))
          .filter(visible)
          .map((anchor) => {
            const element = anchor as HTMLAnchorElement;
            const href = element.href;
            const text = clean(element.innerText || element.textContent, 160);
            let score = 0;
            const path = (() => { try { return new URL(href).pathname.toLowerCase(); } catch { return ""; } })();
            if (/post|entry|article|archives|blog|logno|document|story/.test(path)) score += 4;
            if (/\d{4,}/.test(path)) score += 2;
            if (text.length >= 8 && text.length <= 100) score += 2;
            if (element.querySelector("img")) score += 1;
            if (/login|signup|privacy|terms|category|tag|search|about|notice/i.test(path + " " + text)) score -= 5;
            return { href, score };
          })
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 40);

        return {
          title: document.title,
          url: location.href,
          contentRoot: contentRoot === document.body ? "body" : (contentRoot.id ? `#${contentRoot.id}` : `.${Array.from(contentRoot.classList).slice(0,3).join(".")}`),
          blocks,
          images,
          headings: blocks.filter((item) => /^h[1-4]$/.test(item.tag)).map((item) => item.text).slice(0, 40),
          textPreview: textNodes.join("\n").slice(0, 18000),
          candidateLinks: anchors.map((item) => item.href),
          documentHeight: Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0),
        };
      });
    } catch {
      return null;
    }
  }));

  const valid = framePayloads.filter((item): item is NonNullable<typeof item> => Boolean(item));
  const ranked = valid.sort((a, b) => (b.textPreview.length + b.images.length * 160) - (a.textPreview.length + a.images.length * 160));
  const primary = ranked[0] ?? {
    title: await page.title(),
    url: page.url(),
    blocks: [],
    images: [],
    headings: [],
    textPreview: "",
    candidateLinks: [],
    documentHeight: 0,
  };

  const candidateLinks = [...new Set(ranked.flatMap((item) => item.candidateLinks))].slice(0, 60);
  const viewport = page.viewportSize() ?? { width: 1280, height: 1400 };
  return {
    url: primary.url || page.url(),
    title: primary.title || await page.title(),
    viewport,
    documentHeight: primary.documentHeight,
    blocks: primary.blocks,
    images: primary.images,
    headings: primary.headings,
    textPreview: primary.textPreview,
    candidateLinks,
    frameCount: page.frames().length,
    contentRoot: primary.contentRoot,
  };
}

async function captureOne(browser: Browser, targetUrl: string, dnsCache: Map<string, boolean>): Promise<RenderedPageEvidence> {
  await assertPublicHttpUrl(targetUrl, dnsCache);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1400 },
    locale: "ko-KR",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  await installNetworkGuard(page, dnsCache);
  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (!response) throw new Error("페이지 응답을 받지 못했습니다.");
    await assertPublicHttpUrl(page.url(), dnsCache);
    await page.waitForTimeout(1800);
    await page.evaluate(() => window.scrollTo(0, Math.min(document.documentElement.scrollHeight, 2400))).catch(() => undefined);
    await page.waitForTimeout(450);
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);

    const evidence = await extractPageEvidence(page);
    let screenshotDataUrl: string | undefined;
    try {
      const screenshot = await page.screenshot({ fullPage: true, type: "jpeg", quality: 42 });
      if (screenshot.byteLength <= 5 * 1024 * 1024) {
        screenshotDataUrl = `data:image/jpeg;base64,${screenshot.toString("base64")}`;
      }
    } catch {
      screenshotDataUrl = undefined;
    }
    return { ...evidence, screenshotDataUrl };
  } finally {
    await context.close();
  }
}

function sameSite(candidate: string, seed: string) {
  try {
    const a = new URL(candidate);
    const b = new URL(seed);
    if (a.hostname === b.hostname) return true;
    const normalize = (host: string) => host.replace(/^www\./, "").replace(/^m\./, "");
    return normalize(a.hostname) === normalize(b.hostname);
  } catch {
    return false;
  }
}

export async function captureRenderedBlogEvidence(sourceUrl: string, mode: "blog" | "post"): Promise<RenderedBlogEvidence> {
  const dnsCache = new Map<string, boolean>();
  await assertPublicHttpUrl(sourceUrl, dnsCache);

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const first = await captureOne(browser, sourceUrl, dnsCache);
    const pages: RenderedPageEvidence[] = [first];

    if (mode === "blog") {
      const candidates = [...new Set(first.candidateLinks)]
        .filter((url) => sameSite(url, first.url))
        .map(canonicalUrl)
        .filter((url) => url !== canonicalUrl(first.url))
        .slice(0, 8);

      for (const candidate of candidates) {
        if (pages.length >= 4) break;
        try {
          const captured = await captureOne(browser, candidate, dnsCache);
          const contentScore = captured.textPreview.length + captured.images.length * 120;
          if (contentScore < 1400) continue;
          pages.push(captured);
        } catch {
          // Candidate discovery is best-effort. Continue with other public posts.
        }
      }
    }

    return {
      requestedUrl: sourceUrl,
      capturedAt: new Date().toISOString(),
      pages,
      limitation: pages.length === 1 && mode === "blog"
        ? "블로그 전체에서 추가 포스팅을 안정적으로 식별하지 못해 첫 렌더링 화면 중심으로 분석했습니다."
        : undefined,
    };
  } finally {
    await browser?.close();
  }
}
