import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { UBotLauncher } from "@/components/ubot/UBotLauncher";
import "./globals.css";
import "./web.css";

// Two front-ends share this layout: the Thai app (/, /app, /terminal, /report) and the English
// app (/en, /login, /method, /assistant, /dashboard), whose pages sit in `.ug-web` wrappers.
export const metadata: Metadata = {
  title: { default: "U-Guard", template: "%s · U-Guard" },
  description: "Know before your money moves: an agent in U-Bot that checks token-unlock risk before you buy or hold.",
  applicationName: "U-Guard",
  icons: { icon: "/brand/icon.png", apple: "/icons/apple-touch-icon.png" },
  // Installable app: the manifest is src/app/manifest.ts; this adds iPhone "Add to Home Screen".
  appleWebApp: { capable: true, title: "U-Guard", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070b14",
  colorScheme: "dark",
};

// Geist + IBM Plex Sans Thai (Thai app), Inter (English app), Geist Mono (both).
const FONTS =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=IBM+Plex+Sans+Thai:wght@400;500;600&family=Inter:wght@400..700&display=swap";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        {children}
        {/* The floating U-Bot (English app pages only; it hides itself elsewhere). */}
        <div className="ug-web" lang="en" style={{ display: "contents" }}>
          <UBotLauncher />
        </div>
      </body>
    </html>
  );
}
