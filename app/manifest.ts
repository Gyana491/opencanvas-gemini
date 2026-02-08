import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OpenCanvas",
    short_name: "OpenCanvas",
    description: "Node-based AI workflow orchestration platform",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      { src: "/pwa/icon-72x72.png", sizes: "72x72", type: "image/png" },
      { src: "/pwa/icon-96x96.png", sizes: "96x96", type: "image/png" },
      { src: "/pwa/icon-128x128.png", sizes: "128x128", type: "image/png" },
      { src: "/pwa/icon-144x144.png", sizes: "144x144", type: "image/png" },
      { src: "/pwa/icon-152x152.png", sizes: "152x152", type: "image/png" },
      { src: "/pwa/icon-167x167.png", sizes: "167x167", type: "image/png" },
      { src: "/pwa/icon-180x180.png", sizes: "180x180", type: "image/png" },
      { src: "/pwa/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa/icon-384x384.png", sizes: "384x384", type: "image/png" },
      { src: "/pwa/icon-512x512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/pwa/icon-maskable-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/pwa/icon-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
