// « TÉLÉCHARGER YOPPAA » (15/10) : le bon store pour le bon téléphone.
//
// 🔴 Ce lien répondait « page introuvable » (bouton de la confirmation d'une
// commande passée depuis un PC). La règle vit dans `lib/stores.js`
// (`cibleTelechargement`) : iPhone → App Store, Android → Google Play, sinon
// la section des habitants de la landing et ses badges.
//
// ⚠️ UN COMPOSANT SERVEUR qui redirige tout de suite : aucune page ne se
// peint avant, comme `retour-app`.

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cibleTelechargement } from '@/lib/stores'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Télécharger Yoppaa',
  robots: { index: false, follow: false },
}

export default async function Telecharger() {
  const ua = (await headers()).get('user-agent') || ''
  redirect(cibleTelechargement(ua))
}
