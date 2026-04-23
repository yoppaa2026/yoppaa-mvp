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
  return <>{children}</>;
}