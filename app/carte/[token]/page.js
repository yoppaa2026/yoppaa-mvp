// Page publique d'une carte de fidélité : /carte/<token> (lien du SMS).
// Le token est la clé (aucun login) : jauge en temps réel, récompense,
// et le chemin vers la fiche du commerçant. Server Component service_role
// (fidelite_cartes n'a AUCUNE lecture publique : le téléphone est une
// donnée personnelle, on ne l'affiche jamais en entier ici).

import { createClient } from '@supabase/supabase-js'
import { libelleRecompense } from '@/lib/fidelite'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Ma carte de fidélité · Yoppaa',
  robots: { index: false, follow: false },  // page personnelle, jamais indexée
}

const T = {
  bg: '#F8F6FF', bgPanel: '#160636', ink: '#1A0840', deep: '#2D0F6B',
  main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF', muted: '#6B7280',
}

async function getCarte(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || !token) return null
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data } = await supabase
    .from('fidelite_cartes')
    .select('passages, cagnotte, recompenses_disponibles, commercant:commercants(nom, slug, categorie, adresse, fidelite_actif, fidelite_mecanique, fidelite_seuil_passages, fidelite_taux_cagnotte, fidelite_seuil_cagnotte, fidelite_recompense_type, fidelite_recompense_valeur, fidelite_recompense_libelle)')
    .eq('token', token)
    .maybeSingle()
  if (!data?.commercant) return null
  return data
}

// Les euros s'écrivent avec une virgule en français : « 0.55 € » sur la carte
// d'Alex faisait tache sur l'écran le plus regardé du programme (05/08).
function euros(n) {
  return `${Number(n || 0).toFixed(2).replace('.', ',')} €`
}

export default async function CartePage({ params }) {
  const { token } = await params
  const carte = await getCarte(token)
  const com = carte?.commercant

  const ficheUrl = com
    ? (com.categorie === 'vitrine' ? `/commander/rdv/${com.slug}` : `/commander/${com.slug}`)
    : '/commander'

  const cagnotte = com?.fidelite_mecanique === 'cagnotte'
  const seuil = cagnotte ? Number(com?.fidelite_seuil_cagnotte || 0) : Number(com?.fidelite_seuil_passages || 0)
  const valeur = cagnotte ? Number(carte?.cagnotte || 0) : Number(carte?.passages || 0)
  const restant = Math.max(0, Math.round((seuil - valeur) * 100) / 100)
  const pct = seuil > 0 ? Math.min(100, Math.round((valeur / seuil) * 100)) : 0
  const dispo = Number(carte?.recompenses_disponibles || 0)

  return (
    <div style={{ minHeight: '100svh', background: `linear-gradient(180deg, ${T.bgPanel} 0%, ${T.deep} 55%, ${T.main} 130%)`, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px 48px' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&family=Plus+Jakarta+Sans:wght@800&display=swap" rel="stylesheet"/>

      {/* Wordmark tricolore fond foncé : blanc + light + mid */}
      <p style={{ margin: '8px 0 4px', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: 30, letterSpacing: '-0.05em', lineHeight: 1 }}>
        <span style={{ color: '#fff' }}>yo</span><span style={{ color: T.light }}>pp</span><span style={{ color: T.mid }}>aa</span>
      </p>
      <div style={{ display: 'flex', gap: 5, marginBottom: 28 }}>
        {['#fff', T.light, T.mid].map((c, i) => (
          <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: c, opacity: i === 0 ? 0.55 : 1 }}/>
        ))}
      </div>

      {!carte ? (
        <div style={{ background: '#fff', borderRadius: 22, padding: '28px 24px', maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 18px 44px rgba(0,0,0,0.3)' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 900, fontSize: 18, color: T.ink }}>Carte introuvable</p>
          <p style={{ margin: 0, fontSize: 13.5, color: T.muted, lineHeight: 1.6 }}>
            Ce lien ne correspond à aucune carte active. Vérifie le lien de ton SMS, ou demande au commerçant.
          </p>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 22, maxWidth: 420, width: '100%', overflow: 'hidden', boxShadow: '0 18px 44px rgba(0,0,0,0.3)' }}>
          <div style={{ height: 5, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>

          <div style={{ padding: '24px 22px 26px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '1px' }}>Ma carte de fidélité</p>
            <p style={{ margin: '0 0 18px', fontWeight: 900, fontSize: 20, color: T.ink, letterSpacing: '-0.4px' }}>{com.nom}</p>

            {dispo > 0 ? (
              <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 16, padding: '18px 16px', marginBottom: 14 }}>
                <p style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 900, color: '#059669', letterSpacing: '-0.5px' }}>
                  {dispo > 1 ? `${dispo} récompenses !` : 'Récompense débloquée !'}
                </p>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#065F46', lineHeight: 1.5 }}>
                  {libelleRecompense(com)}
                </p>
                {/* ⚠️ CE TEXTE MENTAIT, ET IL A COÛTÉ SA QUESTION À ALEX :
                    « je fais quoi avec ça ? ». Il disait « montre cet écran »,
                    alors que le commerçant n'a AUCUN moyen de s'en servir : sa
                    seule porte d'entrée, au comptoir, est le NUMÉRO DE GSM. Un
                    écran montré ne se cherche pas dans son tableau de bord.
                    On dit donc le geste réel, et le second depuis le 24/08 :
                    la récompense se dépense aussi en ligne. */}
                <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#047857', lineHeight: 1.55 }}>
                  <strong>Au comptoir</strong>, donne ton numéro de GSM : c’est avec lui que {com.nom} retrouve ta carte.
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#047857', lineHeight: 1.55 }}>
                  <strong>En ligne</strong>, connecte-toi et elle te sera proposée au moment de payer.
                </p>
              </div>
            ) : (
              <div style={{ background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, borderRadius: 16, padding: '20px 16px', marginBottom: 14 }}>
                <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {cagnotte ? 'Ma cagnotte' : 'Mes passages'}
                </p>
                <p style={{ margin: '0 0 14px', fontSize: 34, fontWeight: 900, color: '#fff', letterSpacing: '-1.5px' }}>
                  {cagnotte ? euros(valeur) : valeur}
                  <span style={{ fontSize: 15, fontWeight: 700, color: T.light, marginLeft: 6 }}>
                    / {cagnotte ? euros(seuil) : seuil}
                  </span>
                </p>
                {/* Jauge */}
                <div style={{ height: 10, borderRadius: 100, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 100, background: `linear-gradient(90deg, ${T.light}, #fff)` }}/>
                </div>
                <p style={{ margin: '12px 0 0', fontSize: 12.5, color: T.light, lineHeight: 1.5 }}>
                  {seuil > 0
                    ? <>Encore <strong style={{ color: '#fff' }}>{cagnotte ? euros(restant) : `${restant} passage${restant > 1 ? 's' : ''}`}</strong> et tu débloques : {libelleRecompense(com)}</>
                    : 'Ta carte se remplit à chaque passage.'}
                </p>
              </div>
            )}

            {!com.fidelite_actif && (
              <p style={{ margin: '0 0 12px', fontSize: 12, color: '#B45309', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '8px 12px', lineHeight: 1.5 }}>
                Ce commerce a mis son programme de fidélité en pause. Tes points sont conservés.
              </p>
            )}

            <a href={ficheUrl} style={{ display: 'block', padding: '13px 16px', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: 15, textDecoration: 'none', boxShadow: `0 6px 22px ${T.main}66` }}>
              Voir {com.nom}
            </a>
            <p style={{ margin: '12px 0 0', fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
              Garde ce lien : c&rsquo;est ta carte. Elle se met à jour toute seule à chaque passage 🟣
            </p>
          </div>
        </div>
      )}

      <p style={{ margin: '22px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
        Ton quartier dans ta poche 🟣
      </p>
    </div>
  )
}
