'use client'
// La personne qui clique sur un article partagé arrive sur la fiche, ouverte
// sur l'article. Un lien reste visible si le script ne s'exécute pas.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function OuvrirLaFiche({ cible, nom, commerce }) {
  const router = useRouter()
  useEffect(() => { router.replace(cible) }, [router, cible])
  return (
    <main style={{ minHeight: '60svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, fontFamily: '"DM Sans", sans-serif', textAlign: 'center', background: '#F8F6FF' }}>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1A0840' }}>{nom}</p>
      <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>{commerce}</p>
      <a href={cible} style={{ marginTop: 6, padding: '10px 18px', borderRadius: 12, background: '#6B21D4', color: '#fff', fontWeight: 800, textDecoration: 'none' }}>
        Voir l’article
      </a>
    </main>
  )
}
