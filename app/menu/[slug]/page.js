// LA CARTE QU'ON LIT À TABLE : /menu/<slug> (29/09).
//
// Le QR posé sur les tables d'un restaurant mène ici (`lienCarte`). Le client
// est déjà assis : il veut lire la carte, rien d'autre. Ni panier, ni
// réservation, ni connexion, ni géolocalisation.
//
// ⚠️ RENDUE PAR LE SERVEUR, ET C'EST TOUT L'INTÉRÊT. La fiche arrive vide puis
// se remplit après une quinzaine d'appels depuis le navigateur ; ici la carte
// part déjà écrite dans la page, et s'affiche sur la 4G du fond de la salle.
// Aucun composant client : les onglets de catégories sont de simples ancres.
//
// ⚠️ LA CLÉ PUBLIQUE, JAMAIS LA CLÉ DE SERVICE. On ne lit que ce que la fiche
// publique montre déjà à tout le monde : la vue `commercants_public` (fiches
// publiées seulement) et les articles, dont la RLS ne laisse lire que ceux
// d'un commerce publié. Une carte non publiée n'existe donc pas ici non plus.
//
// ⚠️ HORS DU TUNNEL CLIENT, et c'est voulu : `app/commander/*` n'est pas touché.

import { cache } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { fichePubliee } from '@/lib/statut-commercant'
import { canDo, planEffectif } from '@/lib/plans'
import { sertAManger, nomDeLaCarte } from '@/lib/types-commerce'
import { nomDuJour } from '@/lib/heure-belge'
import { lienFiche } from '@/lib/lien-fiche'
import { carteDeLaTable } from '@/lib/carte-table'

// La carte change quand le commerçant la change, et le plat du jour change à
// minuit : jamais de page figée.
export const dynamic = 'force-dynamic'

// ⚠️ CHAQUE COLONNE EST LUE PAR QUELQUE CHOSE. `plan`, `essai_plan` et
// `created_at` décident si la formule affiche les prix (`planEffectif`) ;
// `ordre_categories` range la carte ; `photos_catalogue_actif` coupe les
// photos ; `type` dit si c'est un commerce qui sert à manger. Une colonne
// absente d'un select ne lève rien quand on lit `*` : ici on les nomme, et une
// absence fait ÉCHOUER la lecture au lieu de faire mentir la page.
const COLONNES_COMMERCE = 'id, nom, slug, type, logo_url, statut_publication, plan, essai_plan, created_at, ordre_categories, photos_catalogue_actif'
const COLONNES_ARTICLE = 'id, nom, description, prix, categorie, photo_url, est_vitrine, actif'

const lireCarte = cache(async (slug) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )
  const { data: commercant, error } = await supabase
    .from('commercants_public')
    .select(COLONNES_COMMERCE)
    .eq('slug', slug)
    .maybeSingle()
  // ⚠️ UNE ERREUR N'EST PAS UNE ABSENCE. Rendre « introuvable » sur une panne
  // dirait au client qu'un restaurant ouvert n'existe pas.
  if (error) throw new Error(`carte ${slug} : ${error.message}`)
  if (!commercant || !fichePubliee(commercant)) return null

  // ⚠️ LE JOUR BELGE, PAS CELUI DE GREENWICH : entre minuit et deux heures, le
  // serveur croirait encore être la veille et servirait le lunch d'hier.
  const jour = nomDuJour(new Date())
  const [articles, reglages] = await Promise.all([
    supabase.from('articles').select(COLONNES_ARTICLE)
      .eq('commercant_id', commercant.id).eq('actif', true)
      .order('categorie').order('nom'),
    supabase.from('article_stock_jour').select('article_id, actif')
      .eq('commercant_id', commercant.id).eq('jour_semaine', jour),
  ])
  if (articles.error) throw new Error(`carte ${slug}, articles : ${articles.error.message}`)
  if (reglages.error) throw new Error(`carte ${slug}, jours : ${reglages.error.message}`)

  return { commercant, articles: articles.data || [], reglagesDuJour: reglages.data || [] }
})

export async function generateMetadata({ params }) {
  const { slug } = await params
  const lu = await lireCarte(slug)
  if (!lu) return { title: 'Carte introuvable · Yoppaa', robots: { index: false, follow: false } }
  return {
    title: `${nomDeLaCarte(lu.commercant)} · ${lu.commercant.nom}`,
    description: `La carte de ${lu.commercant.nom}, à lire à table.`,
    // ⚠️ PAS D'INDEXATION : cette page reprend la carte de la fiche, qui est
    // celle que Google doit connaître. Deux pages pour le même contenu se
    // feraient concurrence dans les résultats.
    robots: { index: false, follow: true },
  }
}

const C = {
  fond: '#F8F6FF', carte: '#FFFFFF', encre: '#1A0840', violet: '#6B35C4',
  pale: '#EDE0FF', filet: '#E7DEF6', doux: '#6B7280',
}

const STYLE = `
  html { scroll-behavior: smooth; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  .menu-onglets { display: flex; gap: 8px; overflow-x: auto; padding: 10px 16px; scrollbar-width: none; }
  .menu-onglets::-webkit-scrollbar { display: none; }
  .menu-onglet { flex-shrink: 0; padding: 7px 14px; border-radius: 100px; background: ${C.pale}; color: ${C.violet}; font-weight: 700; font-size: 0.82rem; text-decoration: none; white-space: nowrap; }
  .menu-onglet:focus-visible, .menu-lien:focus-visible { outline: 2px solid ${C.violet}; outline-offset: 2px; }
  .menu-section { scroll-margin-top: 64px; }
`

export default async function MenuPage({ params }) {
  const { slug } = await params
  const lu = await lireCarte(slug)
  if (!lu) notFound()

  const { commercant } = lu
  const { sections, total } = carteDeLaTable({
    commercant,
    articles: lu.articles,
    reglagesDuJour: lu.reglagesDuJour,
    prixAffiches: canDo(planEffectif(commercant), 'prix_affiches'),
  })
  const fiche = lienFiche(commercant.slug)
  const titreCarte = nomDeLaCarte(commercant)

  return (
    <main style={{ minHeight: '100vh', background: C.fond, color: C.encre, fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      <style>{STYLE}</style>

      <header style={{ background: C.carte, borderBottom: `1px solid ${C.filet}`, padding: '20px 16px 14px', display: 'flex', alignItems: 'center', gap: 12, maxWidth: 720, margin: '0 auto' }}>
        {commercant.logo_url && (
          <img src={commercant.logo_url} alt="" width={52} height={52} decoding="async" loading="eager"
            style={{ width: 52, height: 52, borderRadius: 14, objectFit: 'cover', flexShrink: 0, border: `1px solid ${C.filet}` }}/>
        )}
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: C.violet, textTransform: 'uppercase', letterSpacing: '1.2px' }}>{titreCarte}</p>
          <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-jakarta), system-ui, sans-serif', fontWeight: 800, fontSize: '1.35rem', letterSpacing: '-0.4px', lineHeight: 1.2, textWrap: 'balance' }}>{commercant.nom}</h1>
        </div>
      </header>

      {sections.length > 1 && (
        <nav aria-label="Catégories" style={{ position: 'sticky', top: 0, zIndex: 2, background: C.carte, borderBottom: `1px solid ${C.filet}` }}>
          <div className="menu-onglets" style={{ maxWidth: 720, margin: '0 auto' }}>
            {sections.map(s => <a key={s.ancre} href={`#${s.ancre}`} className="menu-onglet">{s.titre}</a>)}
          </div>
        </nav>
      )}

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '8px 16px 32px' }}>
        {total === 0 ? (
          <p style={{ margin: '32px 0', textAlign: 'center', color: C.doux, lineHeight: 1.6 }}>
            La carte n&rsquo;est pas encore en ligne. Demande-la à l&rsquo;équipe, elle te la donnera.
          </p>
        ) : sections.map(s => (
          <section key={s.ancre} id={s.ancre} className="menu-section" aria-labelledby={`${s.ancre}-titre`}>
            {s.parent && (
              <p style={{ margin: '22px 0 0', fontSize: '0.7rem', fontWeight: 800, color: C.violet, textTransform: 'uppercase', letterSpacing: '1.5px' }}>{s.parent}</p>
            )}
            <h2 id={`${s.ancre}-titre`} style={{ margin: s.parent ? '6px 0 10px' : '22px 0 10px', fontFamily: 'var(--font-jakarta), system-ui, sans-serif', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.3px' }}>{s.titre}</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, background: C.carte, borderRadius: 16, border: `1px solid ${C.filet}` }}>
              {s.articles.map((a, i) => (
                <li key={a.id} style={{ display: 'flex', gap: 12, padding: '14px 14px', borderTop: i === 0 ? 'none' : `1px solid ${C.filet}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                      <p style={{ margin: 0, flex: 1, fontWeight: 700, fontSize: '0.98rem', lineHeight: 1.3 }}>{a.nom}</p>
                      {a.prix && (
                        <p style={{ margin: 0, flexShrink: 0, fontWeight: 800, color: C.violet, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{a.prix}</p>
                      )}
                    </div>
                    {a.description && (
                      <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: C.doux, lineHeight: 1.45 }}>{a.description}</p>
                    )}
                  </div>
                  {a.photo && (
                    <img src={a.photo} alt="" width={68} height={68} loading="lazy" decoding="async"
                      style={{ width: 68, height: 68, borderRadius: 12, objectFit: 'cover', flexShrink: 0, background: C.pale }}/>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* ⚠️ LES ALLERGÈNES NE SONT PAS ENCORE DANS LA BASE. Tant qu'ils n'y
            sont pas, la carte dit où les demander : un client allergique ne
            doit jamais conclure de son silence qu'un plat est sans risque. */}
        {total > 0 && sertAManger(commercant.type) && (
          <p style={{ margin: '24px 0 0', padding: '12px 14px', borderRadius: 12, background: C.pale, fontSize: '0.85rem', lineHeight: 1.5 }}>
            <strong>Allergies ou intolérances ?</strong> Demande à l&rsquo;équipe, elle te dira ce que contient chaque plat.
          </p>
        )}

        {fiche && (
          <p style={{ margin: '24px 0 0', textAlign: 'center', fontSize: '0.88rem' }}>
            <a href={fiche} className="menu-lien" style={{ color: C.violet, fontWeight: 700 }}>Voir la page de {commercant.nom}</a>
          </p>
        )}
        <p style={{ margin: '18px 0 0', textAlign: 'center', fontSize: '0.75rem', color: C.doux }}>yoppaa.app</p>
      </div>
    </main>
  )
}
