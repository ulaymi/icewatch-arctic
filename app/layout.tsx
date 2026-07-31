import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://icewatch-arctic.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "IceWatch · Ледовая обстановка в российской Арктике",
  description:
    "Интерактивный мониторинг морского льда по реальным радиолокационным сценам Sentinel‑1 для северных морей России.",
  openGraph: {
    title: "IceWatch · Арктическая навигационная аналитика",
    description:
      "Реальные Sentinel‑1 SAR-сцены, ледовый покров, структура льда и предварительная оценка навигационной опасности.",
    images: [{ url: "/og.png", width: 1600, height: 900 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "IceWatch · Арктическая навигационная аналитика",
    description: "Ледовая обстановка северных морей России по Sentinel‑1 SAR.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        <link
          crossOrigin=""
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Script
          id="leaflet"
          src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
          strategy="beforeInteractive"
        />
        <Script
          id="satellite-data"
          src="/satellite-data.js"
          type="module"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
