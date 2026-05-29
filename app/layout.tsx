import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Yoppaa — Skip the wait",
  description: "Commande avant d'arriver, récupère sans attendre.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Yoppaa",
  },
  icons: {
    apple: "/icon-192.png",
  },
};

// Viewport mobile : empêche le zoom auto Safari iOS sur les inputs (cause des
// décentrages au clic) + cadre l'app à la largeur de l'écran (évite le scroll
// horizontal involontaire). Garde le zoom utilisateur manuel possible (a11y).
export const viewport: Viewport = {
  themeColor: "#6B35C4",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* theme-color, viewport, apple-web-app sont gérés par les exports metadata + viewport de Next.js */}
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}