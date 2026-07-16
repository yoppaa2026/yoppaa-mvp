// Page publique « Classement des communes » (Ch2 Mobilisation).
//
// Server Component : SSR + revalidation périodique (pas de client, c'est de
// l'affichage). Lit la vue agrégée `commune_stats` (aucun PII, GRANT anon).
// Mécanique : chaque commune progresse vers son `seuil_preinscrits`. Le seuil ne
// met PAS la commune live (c'est le flag admin `active`), il alimente la barre
// de mobilisation. Voir MIGRATION_CH2_MOBILISATION.sql.

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 60  // ISR : la page se régénère au max toutes les 60s

export const metadata = {
  title: 'Classement des communes · Yoppaa',
  description: 'Mobilise ta commune pour faire venir Yoppaa. Plus vous êtes nombreux à vous préinscrire, plus vite Yoppaa arrive chez toi.',
}

const T = {
  bgTop: '#160636', deep: '#2D0F6B', ink: '#1A0840',
  main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF',
}

async function getClassement() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return []
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await supabase
    .from('commune_stats')
    .select('commune_id, nom, province, active, seuil_preinscrits, nb_preinscrits, nb_commercants, nb_yoppers')
    .order('nb_preinscrits', { ascending: false })
    .order('nom', { ascending: true })
    .limit(200)
  if (error) {
    console.error('[classement] lecture commune_stats KO', error.message)
    return []
  }
  // On met en avant les communes avec au moins 1 inscrit, ou déjà disponibles.
  return (data || []).filter(c => (c.nb_preinscrits || 0) > 0 || c.active)
}

function BarreProgression({ valeur, seuil }) {
  const cible = Math.max(1, Number(seuil) || 50)
  const pct = Math.min(100, Math.round((Number(valeur || 0) / cible) * 100))
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 8, borderRadius: 100, background: 'rgba(255,255,255,0.10)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 100, background: `linear-gradient(90deg, ${T.main}, ${T.light})`, transition: 'width 0.4s' }}/>
      </div>
      <p style={{ margin: '5px 0 0', fontSize: '0.72rem', fontWeight: 700, color: T.light }}>
        {valeur || 0} / {cible} préinscrits {pct >= 100 ? '· objectif atteint 🟣' : ''}
      </p>
    </div>
  )
}

export default async function ClassementPage() {
  const communes = await getClassement()
  const totalInscrits = communes.reduce((n, c) => n + (c.nb_preinscrits || 0), 0)

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${T.bgTop} 0%, ${T.deep} 55%, ${T.ink} 100%)`, fontFamily: '"DM Sans", system-ui, sans-serif', padding: '2rem 1rem 3rem' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* En-tête */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.05em', color: '#fff', lineHeight: 1, marginBottom: 14 }}>yoppaa</p>
          <h1 style={{ fontWeight: 900, fontSize: '1.6rem', color: '#fff', letterSpacing: '-0.5px', margin: '0 0 10px' }}>Mobilise ta commune</h1>
          <p style={{ fontSize: '0.92rem', color: T.light, lineHeight: 1.55, margin: 0 }}>
            Plus vous êtes nombreux à vous préinscrire, plus vite Yoppaa arrive chez toi.
            Voici où en sont les communes.
          </p>
          {totalInscrits > 0 && (
            <p style={{ marginTop: 14, display: 'inline-block', padding: '6px 14px', borderRadius: 100, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontWeight: 800, fontSize: '0.85rem' }}>
              {totalInscrits} préinscrits au total 🟣
            </p>
          )}
        </div>

        {/* Liste */}
        {communes.length === 0 ? (
          <p style={{ textAlign: 'center', color: T.light, fontSize: '0.9rem' }}>
            Sois le premier à préinscrire ta commune !
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {communes.map((c, i) => (
              <div key={c.commune_id} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '1rem 1.1rem', backdropFilter: 'blur(12px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, background: i < 3 ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : 'rgba(255,255,255,0.10)', color: '#fff', fontWeight: 900, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: '#fff' }}>
                      {c.nom}
                      {c.province && <span style={{ fontWeight: 600, fontSize: '0.78rem', color: T.light, marginLeft: 8 }}>{c.province}</span>}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: 'rgba(255,255,255,0.6)' }}>
                      {c.nb_yoppers || 0} yoppers · {c.nb_commercants || 0} commerçants
                    </p>
                  </div>
                  <span style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 100, fontSize: '0.68rem', fontWeight: 800, background: c.active ? '#10B98122' : 'rgba(255,255,255,0.08)', color: c.active ? '#6EE7B7' : T.light, border: `1px solid ${c.active ? '#10B98155' : 'rgba(255,255,255,0.15)'}` }}>
                    {c.active ? 'Disponible' : 'En mobilisation'}
                  </span>
                </div>
                {!c.active && <BarreProgression valeur={c.nb_preinscrits} seuil={c.seuil_preinscrits}/>}
              </div>
            ))}
          </div>
        )}

        {/* CTA préinscription */}
        <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.85rem 1.6rem', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.95rem', textDecoration: 'none', boxShadow: `0 8px 24px ${T.main}55` }}>
            Préinscrire ma commune
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          </Link>
        </div>
      </div>
    </div>
  )
}
