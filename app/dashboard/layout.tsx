import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Yoppaa Pro — Dashboard",
  description: "Gérez vos commandes en temps réel.",
  manifest: "/manifest-dashboard.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Yoppaa Pro",
  },
  icons: {
    apple: "/icon-pro-192.png",
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <head>
        <meta name="theme-color" content="#0D0420" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Yoppaa Pro" />
        <link rel="apple-touch-icon" href="/icon-pro-192.png" />
        <link rel="manifest" href="/manifest-dashboard.json" />
      </head>
      {children}
    </>
  );
}