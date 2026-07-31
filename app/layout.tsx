import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://icewatch-arctic.chatgpt.site";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const socialImage = `${siteUrl}/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "IceWatch · Ледовая обстановка в российской Арктике",
  description:
    "Интерактивный мониторинг морского льда по реальным радиолокационным сценам Sentinel‑1 для северных морей России.",
  openGraph: {
    title: "IceWatch · Арктическая навигационная аналитика",
    description:
      "Реальные Sentinel‑1 SAR-сцены, ледовый покров, структура льда и предварительная оценка навигационной опасности.",
    images: [{ url: socialImage, width: 1672, height: 941 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "IceWatch · Арктическая навигационная аналитика",
    description: "Ледовая обстановка северных морей России по Sentinel‑1 SAR.",
    images: [socialImage],
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
        <link href={`${basePath}/fonts.css`} rel="stylesheet" />
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
          src={`${basePath}/satellite-data.js`}
          type="module"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
