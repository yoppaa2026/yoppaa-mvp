// Page publique d'un bon cadeau : /cadeau/<token> (lien envoyé par email).
// Le token est la clé (aucun login) : solde en temps réel, code, validité,
// et le chemin vers la fiche du commerçant. Server Component service_role
// (la table bons_cadeaux n'a aucune lecture publique).

import { createClient } from '@supabase/supabase-js'
import { euros } from '@/lib/montants'
import { libelleBon } from '@/lib/bons-cadeaux'

export const dynamic = 'force-dynamic'

// ⚠️ CE TITRE NE PEUT PAS SUIVRE LE MÉTIER, et ce n'est pas un oubli : il est
// évalué à la construction du module, avant qu'on sache de quel bon il s'agit.
// On applique donc la règle d'Alex du 31/08, celle de la liste « Mes bons » :
// quand on ne connaît pas le commerce, le possessif suffit. Mieux vaut un mot
// vrai partout qu'un mot juste une fois sur deux.
export const metadata = {
  title: 'Mon bon · Yoppaa',
  robots: { index: false, follow: false },  // page personnelle, jamais indexée
}

const T = {
  bg: '#F8F6FF', bgPanel: '#160636', ink: '#1A0840', deep: '#2D0F6B',
  main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF', muted: '#6B7280',
}

async function getBon(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || !token) return null
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data: bon } = await supabase
    .from('bons_cadeaux')
    .select('code, montant_initial, solde, statut, expires_at, beneficiaire_prenom, destinataire_mode, acheteur_prenom, commercant:commercants(nom, slug, categorie, adresse)')
    .eq('token', token)
    .maybeSingle()
  if (!bon || bon.statut !== 'actif') return null
  return bon
}

function formatDateFr(d) {
  try {
    return new Date(d).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return '' }
}

export default async function CadeauPage({ params }) {
  const { token } = await params
  const bon = await getBon(token)

  const ficheUrl = bon?.commercant
    ? (bon.commercant.categorie === 'vitrine' ? `/commander/rdv/${bon.commercant.slug}` : `/commander/${bon.commercant.slug}`)
    : '/commander'
  const expire = bon?.expires_at && new Date(bon.expires_at) < new Date()
  const epuise = bon && Number(bon.solde) <= 0

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

      {!bon ? (
        <div style={{ background: '#fff', borderRadius: 22, padding: '28px 24px', maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 18px 44px rgba(0,0,0,0.3)' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 900, fontSize: 18, color: T.ink }}>Bon introuvable</p>
          <p style={{ margin: 0, fontSize: 13.5, color: T.muted, lineHeight: 1.6 }}>
            {/* ⚠️ ON NE CONNAÎT PAS LE COMMERCE ICI, puisque le bon est
                introuvable : nommer un métier serait une devinette. */}
            Ce lien ne correspond à aucun bon actif. Vérifie le lien de ton email, ou contacte le commerçant.
          </p>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 22, maxWidth: 420, width: '100%', overflow: 'hidden', boxShadow: '0 18px 44px rgba(0,0,0,0.3)' }}>
          {/* Bande tricolore signature */}
          <div style={{ height: 5, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>

          <div style={{ padding: '24px 22px 26px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '1px' }}>{libelleBon(bon.commercant?.categorie, { majuscule: true })}</p>
            <p style={{ margin: '0 0 14px', fontWeight: 900, fontSize: 20, color: T.ink, letterSpacing: '-0.4px' }}>{bon.commercant?.nom}</p>

            <div style={{ background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, borderRadius: 16, padding: '20px 16px', marginBottom: 14 }}>
              <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '1px' }}>Solde disponible</p>
              <p style={{ margin: '0 0 12px', fontSize: 36, fontWeight: 900, color: '#fff', letterSpacing: '-1.5px' }}>
                {euros(bon.solde)}
                {Number(bon.solde) < Number(bon.montant_initial) && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.light, marginLeft: 6 }}>sur {euros(bon.montant_initial)}</span>
                )}
              </p>
              <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '1px' }}>Ton code</p>
              <p style={{ margin: 0, fontSize: 21, fontWeight: 900, color: '#fff', letterSpacing: '2px', fontFamily: 'monospace', background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 12px', display: 'inline-block' }}>{bon.code}</p>
            </div>

            {epuise ? (
              <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#DC2626' }}>Ce bon est entièrement utilisé. Merci et à bientôt 🟣</p>
            ) : expire ? (
              <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#DC2626' }}>Ce bon a expiré le {formatDateFr(bon.expires_at)}.</p>
            ) : (
              <>
                {bon.expires_at && (
                  <p style={{ margin: '0 0 12px', fontSize: 12, color: T.muted }}>Valable jusqu&rsquo;au <strong style={{ color: T.ink }}>{formatDateFr(bon.expires_at)}</strong></p>
                )}
                <div style={{ background: T.bg, borderRadius: 12, padding: '12px 14px', marginBottom: 16, textAlign: 'left' }}>
                  <p style={{ margin: '0 0 6px', fontSize: 10.5, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Comment l&rsquo;utiliser</p>
                  <p style={{ margin: '0 0 4px', fontSize: 12.5, color: T.deep, lineHeight: 1.55 }}>
                    <strong>Sur place :</strong> montre ce code au comptoir, le commerçant le déduit de ton achat.
                  </p>
                  <p style={{ margin: 0, fontSize: 12.5, color: T.deep, lineHeight: 1.55 }}>
                    <strong>En ligne :</strong> commande sur sa fiche Yoppaa et applique le code au moment de payer. En une ou plusieurs fois, le solde reste sur le bon.
                  </p>
                </div>
                {/* 🔴 LE CODE PART AVEC LE LIEN (Alex, 01/09). Son testeur est
                    arrivé ici, a cliqué, puis a dû REVENIR lire son code et le
                    retaper à la main dans le tunnel. Des allers-retours pour
                    une information qu'on avait déjà sous les yeux.

                    ⚠️ UN CODE DANS UNE URL EST UN SECRET AU PORTEUR, et on ne
                    l'y laisse pas traîner : la fiche l'applique puis NETTOIE
                    l'adresse aussitôt, comme elle le fait déjà pour la session
                    Stripe. La fenêtre se compte en millisecondes, et cette
                    adresse-ci ne quitte jamais le téléphone de son porteur,
                    qui tient déjà le lien du bon dans le même email. */}
                <a href={`${ficheUrl}?bon_code=${encodeURIComponent(bon.code)}`} style={{ display: 'block', padding: '13px 16px', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: 15, textDecoration: 'none', boxShadow: `0 6px 22px ${T.main}66` }}>
                  Découvrir {bon.commercant?.nom}
                </a>
              </>
            )}
          </div>
        </div>
      )}

      <p style={{ margin: '22px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
        Ton quartier dans ta poche 🟣
      </p>
    </div>
  )
}
