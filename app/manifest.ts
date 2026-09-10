import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Blotori",
    short_name: "Blotori",
    description: "플랫폼별 블로그 원고와 이미지 가이드를 구성하는 TORI Family Blog Composer",
    start_url: "/",
    display: "standalone",
    background_color: "#F7FBFC",
    theme_color: "#2D8FA0",
    lang: "ko",
    icons: [
      {
        src: "/blotori-icon-transparent.webp",
        sizes: "512x512",
        type: "image/webp",
        purpose: "any",
      },
    ],
  };
}
