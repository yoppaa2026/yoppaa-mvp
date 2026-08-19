import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { SPLASH_IOS } from "@/lib/splash-ios";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Plus Jakarta Sans — police canonique du logo Yoppaa (wordmark 800 + slogan 600)
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
});

// Interrupteur global d'indexation Google. Tant que NEXT_PUBLIC_SEO_INDEX != 'true'
// (défaut = pré-lancement, données de test), TOUTES les pages sont en noindex/nofollow.
// Le jour du lancement SEO : mettre NEXT_PUBLIC_SEO_INDEX=true dans Vercel + redéployer.
const SEO_INDEX = process.env.NEXT_PUBLIC_SEO_INDEX === 'true'

// Jeton de validation Google Search Console (méthode « balise HTML »). Il se
// renseigne dans Vercel, sans commit : NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION =
// la valeur du champ content fourni par Search Console. Absent, aucune balise
// n'est émise.
const GOOGLE_VERIF = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION

export const metadata: Metadata = {
  // Base absolue pour que les images OG (partages) et URLs relatives soient résolues.
  metadataBase: new URL("https://www.yoppaa.app"),
  title: "Yoppaa, ton quartier dans ta poche",
  description: "Ton quartier dans ta poche. Commande avant d'arriver, récupère sans attendre.",
  manifest: "/manifest.json",
  ...(SEO_INDEX ? {} : { robots: { index: false, follow: false } }),
  ...(GOOGLE_VERIF ? { verification: { google: GOOGLE_VERIF } } : {}),
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Yoppaa",
  },
  // Favicon + icône : on force l'icône Yoppaa (sinon fallback favicon.ico = triangle Vercel).
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  // Aperçu de partage (iMessage, WhatsApp, FB...) : icône carrée Yoppaa, pas de
  // grande vignette. Remplace le triangle Vercel par défaut.
  openGraph: {
    title: "Yoppaa, ton quartier dans ta poche",
    description: "Ton quartier dans ta poche.",
    type: "website",
    locale: "fr_BE",
    images: [{ url: "/og-share.png", width: 640, height: 640, alt: "Yoppaa" }],
  },
  twitter: {
    card: "summary",
    images: ["/og-share.png"],
  },
};

// Viewport mobile : empêche le zoom auto Safari iOS sur les inputs (cause des
// décentrages au clic) + cadre l'app à la largeur de l'écran (évite le scroll
// horizontal involontaire). PAS de viewportFit=cover pour ne pas passer sous la
// barre de statut (notch) ni laisser un bandeau blanc sous la home bar.
export const viewport: Viewport = {
  themeColor: "#6B35C4",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} h-full antialiased`}
    >
      <head>
        {/* theme-color, viewport, apple-web-app sont gérés par les exports metadata + viewport de Next.js */}
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Écrans de lancement iOS. Safari IGNORE le manifeste : sans ces
            images, la PWA installée sur l'écran d'accueil s'ouvre sur un flash
            BLANC avant que la page n'ait peint. Elles ne portent que le dégradé
            du SplashScreen, dont l'animation prend le relais sans couture.
            Table générée par scripts/generer-splash-ios.mjs. */}
        {SPLASH_IOS.map((s) => (
          <link key={s.href} rel="apple-touch-startup-image" media={s.media} href={s.href} />
        ))}
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}