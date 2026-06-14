import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Revora",
    short_name: "Revora",
    description: "Built on Trust. Powered by Operations.",
    start_url: "/",
    display: "standalone",
    background_color: "#14171C",
    theme_color: "#0B7A3F",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        type: "image/png",
        sizes: "180x180",
      },
    ],
  };
}
