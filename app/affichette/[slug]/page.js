// Affichette comptoir « carte de fidélité » : /affichette/<slug>.
// Le commerçant l'imprime (A5) et la pose près de sa caisse. Elle explique au
// client, en trois lignes, ce qu'il doit faire : donner son numéro de GSM.
//
// Aucune donnée sensible : nom du commerce, règle du programme et QR vers la
// fiche publique. Pas d'authentification (le commerçant l'ouvre depuis son
// téléphone ou son ordinateur, en boutique) mais jamais indexée.

import QRCode from 'qrcode'
import { createClient } from '@supabase/supabase-js'
import { libelleRecompense } from '@/lib/fidelite'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Affichette fidélité · Yoppaa',
  robots: { index: false, follow: false },
}

const T = {
  bg: '#F8F6FF', bgPanel: '#160636', ink: '#1A0840', deep: '#2D0F6B',
  main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF', muted: '#6B7280',
}

async function getCommerce(slug) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || !slug) return null
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data } = await supabase
    .from('commercants')
    .select('nom, slug, categorie, logo_url, statut_publication, fidelite_actif, fidelite_mecanique, fidelite_seuil_passages, fidelite_taux_cagnotte, fidelite_seuil_cagnotte, fidelite_recompense_type, fidelite_recompense_valeur, fidelite_recompense_libelle')
    .eq('slug', slug)
    .maybeSingle()
  if (!data || data.statut_publication !== 'publie') return null
  return data
}

export default async function AffichettePage({ params }) {
  const { slug } = await params
  const com = await getCommerce(slug)

  const ficheUrl = com
    ? `https://www.yoppaa.app${com.categorie === 'vitrine' ? '/commander/rdv/' : '/commander/'}${com.slug}`
    : 'https://www.yoppaa.app/commander'

  let qr = null
  try {
    qr = await QRCode.toDataURL(ficheUrl, { margin: 1, width: 420, color: { dark: '#1A0840', light: '#FFFFFF' } })
  } catch { qr = null }

  if (!com) {
    return (
      <div style={{ padding: 40, fontFamily: '"DM Sans", system-ui, sans-serif', textAlign: 'center' }}>
        <p style={{ fontWeight: 900, fontSize: 18, color: T.ink }}>Commerce introuvable</p>
        <p style={{ fontSize: 14, color: T.muted }}>Vérifie le lien de ton affichette.</p>
      </div>
    )
  }

  const cagnotte = com.fidelite_mecanique === 'cagnotte'
  // Règle affichée au client, dans SES mots à lui (pas de jargon interne)
  const regle = cagnotte
    ? `${Number(com.fidelite_taux_cagnotte || 0)}% de chaque achat va dans ta cagnotte. Dès ${Number(com.fidelite_seuil_cagnotte || 0).toFixed(2)} €, tu reçois ta récompense.`
    : `${com.fidelite_seuil_passages || 10} passages, et ta récompense est à toi.`

  return (
    <div style={{ background: '#fff', fontFamily: '"DM Sans", system-ui, sans-serif', minHeight: '100svh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&family=Plus+Jakarta+Sans:wght@800&display=swap" rel="stylesheet"/>
      <style>{`
        @page { size: A5; margin: 10mm; }
        @media print {
          .no-print { display: none !important; }
          .feuille { box-shadow: none !important; border: none !important; margin: 0 !important; }
        }
      `}</style>

      {/* Barre d'action (jamais imprimée) */}
      <div className="no-print" style={{ background: T.bg, borderBottom: `1px solid ${T.pale}`, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: T.deep, fontWeight: 700 }}>
          Imprime cette page en A5 et pose-la près de ta caisse.
        </p>
        <a href={ficheUrl} style={{ fontSize: 12.5, color: T.main, fontWeight: 800, textDecoration: 'none' }}>Voir ma fiche →</a>
      </div>

      {/* L'affichette */}
      <div className="feuille" style={{ maxWidth: 560, margin: '24px auto', padding: '34px 30px 30px', border: `1px solid ${T.pale}`, borderRadius: 20, boxShadow: '0 10px 30px rgba(22,6,54,0.08)', textAlign: 'center' }}>

        {/* Bande tricolore signature */}
        <div style={{ height: 6, borderRadius: 100, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)`, marginBottom: 26 }}/>

        {com.logo_url && (
          <img src={com.logo_url} alt={com.nom} style={{ width: 76, height: 76, borderRadius: 18, objectFit: 'cover', marginBottom: 14 }}/>
        )}

        <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '1.6px' }}>
          Carte de fidélité
        </p>
        <h1 style={{ margin: '0 0 22px', fontSize: 30, fontWeight: 900, color: T.ink, letterSpacing: '-1px', lineHeight: 1.15 }}>
          {com.nom}
        </h1>

        {/* Le geste, en gros : c'est TOUT ce que le client doit retenir */}
        <div style={{ background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, borderRadius: 18, padding: '24px 20px', marginBottom: 20 }}>
          <p style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1.3, letterSpacing: '-0.5px' }}>
            Donne ton numéro de GSM
          </p>
          <p style={{ margin: 0, fontSize: 14, color: T.light, fontWeight: 600, lineHeight: 1.55 }}>
            C&rsquo;est tout. Pas de carte en carton à perdre, pas d&rsquo;appli à installer :
            ta carte se crée toute seule et te suit.
          </p>
        </div>

        <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: T.deep, lineHeight: 1.5 }}>{regle}</p>
        <p style={{ margin: '0 0 24px', fontSize: 15, fontWeight: 700, color: T.main, lineHeight: 1.5 }}>
          {libelleRecompense(com)}
        </p>

        {qr && (
          <div style={{ borderTop: `1px solid ${T.pale}`, paddingTop: 20 }}>
            <img src={qr} alt="QR code" style={{ width: 128, height: 128 }}/>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: T.muted, fontWeight: 600 }}>
              Scanne pour découvrir {com.nom} sur Yoppaa
            </p>
          </div>
        )}

        {/* Wordmark tricolore fond clair : ink + main + mid */}
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <p style={{ margin: 0, fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: 22, letterSpacing: '-0.05em', lineHeight: 1 }}>
            <span style={{ color: T.ink }}>yo</span><span style={{ color: T.main }}>pp</span><span style={{ color: T.mid }}>aa</span>
          </p>
          <div style={{ display: 'flex', gap: 4 }}>
            {[T.ink, T.main, T.mid].map((c, i) => (
              <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: c }}/>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
