'use client'

import { useEffect } from "react";

// Belt-and-suspenders côté client pour l'installation PWA du dashboard Pro.
// Le manifest + le titre + le theme-color sont désormais rendus côté SERVEUR via
// l'export `metadata` du layout (indispensable pour Chrome Android, qui lit le
// manifest dans le HTML initial, pas après hydratation). Ici on ne fait que
// forcer l'apple-touch-icon vers l'icône Pro : le layout racine en pose une en
// dur (/icon-192.png) dans le <head>, on la surcharge pour iOS.
export default function DashboardPwa() {
  useEffect(() => {
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (appleIcon) {
      appleIcon.setAttribute('href', '/icon-pro-192.png');
    } else {
      const link = document.createElement('link');
      link.rel = 'apple-touch-icon';
      link.href = '/icon-pro-192.png';
      document.head.appendChild(link);
    }
  }, []);

  return null;
}
