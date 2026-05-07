'use client'

import { useEffect } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Surcharge le manifest et l'icône PWA pour le dashboard Pro
    const manifest = document.querySelector('link[rel="manifest"]');
    if (manifest) {
      manifest.setAttribute('href', '/manifest-dashboard.json');
    } else {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/manifest-dashboard.json';
      document.head.appendChild(link);
    }

    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (appleIcon) {
      appleIcon.setAttribute('href', '/icon-pro-192.png');
    } else {
      const link = document.createElement('link');
      link.rel = 'apple-touch-icon';
      link.href = '/icon-pro-192.png';
      document.head.appendChild(link);
    }

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', '#0D0420');

    const appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appTitle) appTitle.setAttribute('content', 'Yoppaa Pro');
  }, []);

  return <>{children}</>;
}