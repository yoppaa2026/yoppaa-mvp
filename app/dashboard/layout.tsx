import type { Metadata, Viewport } from "next";
import DashboardPwa from "./DashboardPwa";

// Le dashboard commerçant est une PWA distincte de l'app cliente. On surcharge le
// manifest + le titre + le theme-color AU NIVEAU SERVEUR (export metadata) : c'est
// indispensable pour Chrome Android, qui capture le manifest dans le HTML initial.
// L'ancienne version échangeait le manifest en useEffect -> trop tard sur Android
// (l'install proposait "Yoppaa" client au lieu de "Yoppaa Pro"). iOS reste géré en
// plus via DashboardPwa (apple-touch-icon).
export const metadata: Metadata = {
  manifest: "/manifest-dashboard.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Yoppaa Pro",
  },
};

export const viewport: Viewport = {
  themeColor: "#0D0420",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DashboardPwa />
      {children}
    </>
  );
}
