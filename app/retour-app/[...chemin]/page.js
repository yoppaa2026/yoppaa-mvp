// LE RETOUR DE STRIPE QUAND LE PAIEMENT EST PARTI DE L'APP (02/10).
//
// Voir `lib/retour-vers-app.js` pour le défaut et la règle. En deux mots :
//   • dans l'app, on renvoie aussitôt vers la page habituelle ;
//   • dans le navigateur (la banque y a fini le paiement), on propose de
//     revenir dans l'app, sur la même page, par `yoppaa://`.
//
// ⚠️ UN COMPOSANT SERVEUR, SANS JAVASCRIPT CÔTÉ PAGE. Le bouton est un simple
// lien : il marche même si le navigateur n'a pas encore chargé le reste, et le
// Yopper revient ici juste après avoir quitté sa banque, souvent sur un réseau
// mobile lent.

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { estUaApp, cheminDepuisRetour, lienVersApp, etatRetour } from '@/lib/retour-vers-app'

export const metadata = {
  title: 'Revenir dans Yoppaa',
  robots: { index: false, follow: false },
}

const T = { main: '#6B35C4', light: '#C4A0F4', mid: '#9660E0', deep: '#2D0F6B' }

const TEXTES = {
  // ⚠️ « C'EST FAIT », PAS « PAIEMENT REÇU » : le même écran sert à
  // l'empreinte d'une carte, qui n'est pas un paiement.
  ok: {
    titre: 'C’est fait',
    texte: 'Ta banque t’a ouvert le navigateur pour terminer. Reviens dans l’app Yoppaa pour voir ta confirmation.',
  },
  annule: {
    titre: 'Paiement interrompu',
    texte: 'Ta banque t’a ouvert le navigateur, et le paiement s’est arrêté là. Reviens dans l’app Yoppaa pour reprendre là où tu en étais.',
  },
  inconnu: {
    titre: 'Presque fini',
    texte: 'Reviens dans l’app Yoppaa pour continuer.',
  },
}

export default async function RetourApp({ params, searchParams }) {
  const { chemin } = await params
  const recherche = await searchParams
  const cible = cheminDepuisRetour(chemin, recherche)
  // ⚠️ `redirect` JETTE : jamais dans un `try`, sinon on l'avale.
  if (!cible) redirect('/commander')

  // 🔴 DANS L'APP, RIEN NE DOIT CHANGER : une carte payée dans la WebView
  // revient ici, et on la renvoie aussitôt sur la page habituelle.
  const ua = (await headers()).get('user-agent')
  if (estUaApp(ua)) redirect(cible)

  const textes = TEXTES[etatRetour(recherche) || 'inconnu']
  const lien = lienVersApp(cible)

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, #160636 0%, ${T.deep} 50%, #1A0840 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 18 }} aria-hidden="true">
          {[{ c: '#fff', o: 0.45 }, { c: T.light, o: 1 }, { c: T.mid, o: 1 }].map((d, i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: d.c, opacity: d.o }} />
          ))}
        </div>
        <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2rem', color: '#fff', letterSpacing: '-0.05em', margin: '0 0 26px', lineHeight: 1 }}>yoppaa</p>

        <h1 style={{ color: '#fff', fontSize: '1.35rem', fontWeight: 800, margin: '0 0 10px' }}>{textes.titre}</h1>
        <p style={{ color: T.light, fontSize: '0.95rem', lineHeight: 1.55, margin: '0 0 28px' }}>{textes.texte}</p>

        {/* ⚠️ UN LIEN, PAS UN BOUTON QUI POUSSE `location`. Safari ne laisse
            ouvrir une app que sur un geste du Yopper, et Chrome bloque une
            redirection vers `yoppaa://` qui n'en vient pas. */}
        <a href={lien} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', boxSizing: 'border-box', padding: '15px 18px', borderRadius: 14, background: '#fff', color: T.deep, fontWeight: 800, fontSize: '1rem', textDecoration: 'none' }}>
          Revenir dans Yoppaa
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
        </a>

        {/* ⚠️ LA SORTIE DE SECOURS. Si l'app n'est plus installée, le lien
            ci-dessus ne mène nulle part : la même page reste lisible ici. */}
        <a href={cible} style={{ display: 'inline-block', marginTop: 18, color: T.light, fontSize: '0.85rem', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Rester dans le navigateur
        </a>
      </div>
    </div>
  )
}
