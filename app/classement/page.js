// Page publique « Mobilisation des communes » (Ch2).
//
// Server Component : SSR + revalidation périodique. Lit la vue agrégée
// `commune_stats` (aucun PII, GRANT anon). Objectif : donner envie de mobiliser
// sa commune. Jauge de déblocage = COMMERÇANTS (l'offre) ; les curieux (habitants)
// sont comptés sans plafond. Le seuil ne met pas la commune live (flag admin
// `active`), il alimente la barre. Voir MIGRATION_CH2_MOBILISATION.sql.

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import PartageMobilisation from '../components/PartageMobilisation'

export const revalidate = 60

export const metadata = {
  title: 'Mobilise ta commune · Yoppaa',
  description: "Fais venir Yoppaa dans ta commune. Chaque commerce qui rejoint la tribu rapproche ta commune du lancement. Être présent sur Yoppaa sera toujours gratuit.",
}

const T = {
  bgTop: '#160636', deep: '#2D0F6B', ink: '#1A0840',
  main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF',
  gold: '#F5C542', silver: '#C7CDD8', bronze: '#D08A4E', green: '#10B981', greenLight: '#6EE7B7',
}

async function getData() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { communes: [], totalCommercants: 0, totalYoppers: 0 }
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await supabase
    .from('commune_stats')
    .select('commune_id, nom, province, active, seuil_preinscrits, nb_preinscrits, nb_commercants, nb_yoppers')
    .limit(500)
  if (error) {
    console.error('[classement] lecture commune_stats KO', error.message)
    return { communes: [], totalCommercants: 0, totalYoppers: 0 }
  }
  const rows = data || []
  const totalCommercants = rows.reduce((n, c) => n + (c.nb_commercants || 0), 0)
  const totalYoppers = rows.reduce((n, c) => n + (c.nb_yoppers || 0), 0)
  // Classement : commerçants d'abord (la jauge), puis curieux, puis alpha.
  const communes = rows
    .filter(c => (c.nb_preinscrits || 0) > 0 || c.active)
    .sort((a, b) =>
      (b.nb_commercants || 0) - (a.nb_commercants || 0) ||
      (b.nb_yoppers || 0) - (a.nb_yoppers || 0) ||
      a.nom.localeCompare(b.nom))
  return { communes, totalCommercants, totalYoppers }
}

const medalColor = (i) => (i === 0 ? T.gold : i === 1 ? T.silver : i === 2 ? T.bronze : null)

function CarteCommune({ c, rang }) {
  const seuil = Math.max(1, Number(c.seuil_preinscrits) || 10)
  const com = c.nb_commercants || 0
  const hab = c.nb_yoppers || 0
  const reste = Math.max(0, seuil - com)
  const pct = Math.min(100, Math.round((com / seuil) * 100))
  const prete = com >= seuil
  const medal = medalColor(rang)

  return (
    <div style={{ position: 'relative', background: 'rgba(255,255,255,0.06)', border: `1px solid ${prete ? T.green + '66' : medal ? medal + '55' : 'rgba(255,255,255,0.12)'}`, borderRadius: 18, padding: '1rem 1.1rem', boxShadow: medal ? `0 6px 26px ${medal}22` : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 12, background: medal ? `linear-gradient(135deg, ${medal}, ${medal}bb)` : 'rgba(255,255,255,0.10)', color: medal ? T.ink : '#fff', fontWeight: 900, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: medal ? `0 3px 12px ${medal}66` : 'none' }}>
          {rang + 1}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>
            {c.nom}
            {c.province && <span style={{ fontWeight: 600, fontSize: '0.76rem', color: 'rgba(255,255,255,0.72)', marginLeft: 8 }}>{c.province}</span>}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'rgba(255,255,255,0.82)', fontWeight: 600 }}>
            <strong style={{ color: '#fff' }}>{com}</strong> commerçant{com > 1 ? 's' : ''} · <strong style={{ color: '#fff' }}>{hab}</strong> curieux
          </p>
        </div>
        <span style={{ flexShrink: 0, padding: '4px 11px', borderRadius: 100, fontSize: '0.66rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', background: c.active ? T.green + '22' : prete ? T.green + '22' : 'rgba(255,255,255,0.10)', color: c.active || prete ? T.greenLight : 'rgba(255,255,255,0.9)', border: `1px solid ${c.active || prete ? T.green + '55' : 'rgba(255,255,255,0.22)'}` }}>
          {c.active ? 'Disponible' : prete ? 'Prête' : 'En cours'}
        </span>
      </div>

      {/* Barre toujours visible : pleine et verte pour une commune disponible/prête. */}
      <div style={{ marginTop: 10 }}>
        <div style={{ height: 9, borderRadius: 100, background: 'rgba(255,255,255,0.10)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${c.active ? 100 : pct}%`, borderRadius: 100, background: (c.active || prete) ? `linear-gradient(90deg, ${T.green}, ${T.greenLight})` : `linear-gradient(90deg, ${T.main}, ${T.light})`, transition: 'width 0.4s' }}/>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: '0.74rem', fontWeight: 800, color: (c.active || prete) ? T.greenLight : '#fff' }}>
          {c.active
            ? `Yoppaa est disponible à ${c.nom} !`
            : prete
              ? `Objectif atteint, ${c.nom} est prête à être lancée !`
              : reste === seuil
                ? `Sois le 1er commerçant à lancer ${c.nom}`
                : `Plus que ${reste} commerçant${reste > 1 ? 's' : ''} pour lancer ${c.nom} !`}
        </p>
      </div>
    </div>
  )
}

function StatBloc({ valeur, label }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '14px 8px', borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
      <p style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: '#fff', letterSpacing: '-1px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{valeur}</p>
      <p style={{ margin: '4px 0 0', fontSize: '0.72rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</p>
    </div>
  )
}

export default async function ClassementPage() {
  const { communes, totalCommercants, totalYoppers } = await getData()

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${T.bgTop} 0%, ${T.deep} 55%, ${T.ink} 100%)`, fontFamily: '"DM Sans", system-ui, sans-serif', padding: '2rem 1rem 3rem' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '1.6rem' }}>
          <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.05em', color: '#fff', lineHeight: 1, marginBottom: 16 }}>yoppaa</p>
          <h1 style={{ fontWeight: 900, fontSize: 'clamp(1.7rem, 5vw, 2.2rem)', color: '#fff', letterSpacing: '-1px', lineHeight: 1.1, margin: '0 0 12px' }}>
            Fais venir Yoppaa<br/>dans ta commune
          </h1>
          <p style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.88)', lineHeight: 1.55, margin: '0 auto', maxWidth: 460 }}>
            Chaque commerce qui rejoint la tribu rapproche ta commune du lancement.
            Regarde la mobilisation grimper. 🟣
          </p>
        </div>

        {/* Compteurs globaux */}
        <div style={{ display: 'flex', gap: 12, marginBottom: '1.2rem' }}>
          <StatBloc valeur={totalCommercants} label="Commerçants mobilisés"/>
          <StatBloc valeur={totalYoppers} label="Curieux dans la tribu"/>
        </div>

        {/* Teaser gratuité (promesse fondatrice, pas de grille tarifaire) */}
        <div style={{ marginBottom: '1.8rem', padding: '16px 18px', borderRadius: 16, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, boxShadow: `0 8px 26px ${T.main}55` }}>
          <p style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#fff', lineHeight: 1.25, letterSpacing: '-0.3px' }}>
            0 % de commission Yoppaa. Toujours.
          </p>
          <p style={{ margin: '6px 0 0', fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.94)', lineHeight: 1.5 }}>
            Ta présence est gratuite et Yoppaa ne prend rien sur tes ventes.
            Tu es payé directement sur ton IBAN. Ta place ne s&rsquo;achète pas. 🟣
          </p>
        </div>

        {/* Liste */}
        {communes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <p style={{ color: '#fff', fontSize: '1rem', fontWeight: 800, margin: '0 0 6px' }}>La mobilisation démarre.</p>
            <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: '0.88rem', margin: 0 }}>Sois le tout premier à lancer ta commune.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {communes.map((c, i) => <CarteCommune key={c.commune_id} c={c} rang={i}/>)}
          </div>
        )}

        {/* Partage / invitation (viralité) */}
        <PartageMobilisation/>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: '2.2rem', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.9rem 1.8rem', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.98rem', textDecoration: 'none', boxShadow: `0 8px 24px ${T.main}55` }}>
            Préinscris ton commerce
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          </Link>
          <Link href="/" style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.35)', paddingBottom: 1 }}>
            Simplement curieux ? Rejoins la tribu
          </Link>
        </div>
      </div>
    </div>
  )
}
