"use client";

import { useEffect } from "react";

const MIN_VISIBLE_MS = 900;

export default function GenerationPacingEnhancer() {
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/generate") || init?.method !== "POST") return nativeFetch(input, init);
      const startedAt = performance.now();
      const response = await nativeFetch(input, init);
      const remaining = MIN_VISIBLE_MS - (performance.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining));
      return response;
    };
    return () => { window.fetch = nativeFetch; };
  }, []);
  return null;
}
