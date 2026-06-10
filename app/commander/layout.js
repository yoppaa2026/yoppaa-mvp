// Layout pour toutes les pages /commander/*
// Applique automatiquement le MobileFrame sur écran desktop (>=1024px),
// passthrough sur mobile/tablette.
//
// Concerne : /commander, /commander/[slug], /commander/services/[slug],
// /commander/rdv/[slug], /commander/morning, /commander/auth/*

import MobileFrame from '@/app/components/MobileFrame'

export default function CommanderLayout({ children }) {
  return <MobileFrame>{children}</MobileFrame>
}
