import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MedCare — Aktiv Patronaj",
    short_name: "MedCare",
    description:
      "Statsionardan chiqarilgan bemorlarni hududiy hamshira va oilaviy shifokorga avtomatik ulovchi AI platforma",
    start_url: "/login",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#0f766e",
    lang: "uz",
    icons: [
      { src: "/logo-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/logo-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/logo-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
