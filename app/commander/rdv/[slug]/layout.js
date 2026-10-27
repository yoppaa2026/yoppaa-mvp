// Layout serveur de la fiche rendez-vous : le SEO de l'agenda d'un commerce
// (page.js reste 'use client').
//
// 🔴 15/10 : CETTE PAGE N'AVAIT AUCUN LAYOUT. C'est la fiche de tous les salons,
// esthéticiennes et commerces de services, et Google la voyait sous le titre
// générique du site, sans description ni balisage. Elle dit maintenant
// « Prendre rendez-vous chez X à Mettet » (« Réserver une table » chez un
// restaurant), par la même règle que la fiche boutique : `lib/fiche-seo.js`.
//
// ✅ ALEX, 15/10 (tableau) : pour un salon, Google retient CETTE page ; pour un
// restaurant, la réservation de table renvoie Google vers sa fiche.

//
// ✅ 27/10 (Alex, tableau) : la fiche arrive COMPLÈTE chez Google, prestations
// et produits compris. Même mécanique que la fiche boutique
// (app/commander/[slug]/layout.js).

import { echapperJsonLd } from '@/lib/seo-landing'
import { metadataFiche, jsonLdFiche, PAGE_RDV } from '@/lib/fiche-seo'
import { catalogueDeFiche } from '@/lib/fiche-contenu-seo'
import { communeDuCommerce } from '@/lib/commerces-commune'
import { fonctionReservation } from '@/lib/reservation-metier'
import { getCommercantPublic, getAvisAgregat, getCommandeRealisable, getLieux, getArticles, getPrestations, getFormules, getGroupesCommunes } from '@/lib/fiche-seo-server'
import { FournisseurFicheServeur } from '../../FicheServeurContexte'
import FicheServeur from '../../FicheServeur'
import LiensCommune from '../../LiensCommune'

export async function generateMetadata({ params }) {
  const { slug } = await params
  const c = await getCommercantPublic(slug)
  const commandeRealisable = c ? await getCommandeRealisable(c) : false
  // La ville du titre vient du LIEU déclaré, jamais du siège (27/10).
  const lieux = c ? await getLieux(c.id) : []
  return metadataFiche(c, PAGE_RDV, { commandeRealisable, lieux })
}

export default async function FicheRdvLayout({ children, params }) {
  const { slug } = await params
  const c = await getCommercantPublic(slug)
  const [avis, commandeRealisable, lieux, articles, prestations, formules, groupes] = c
    ? await Promise.all([
      getAvisAgregat(c.id), getCommandeRealisable(c), getLieux(c.id), getArticles(c.id),
      // ⚠️ Comme la fiche : un agenda éteint ne montre aucune prestation.
      c.rdv_actif ? getPrestations(c.id) : [], c.rdv_actif ? getFormules(c.id) : [],
      getGroupesCommunes(),
    ])
    : [null, false, [], [], [], [], []]
  // ⚠️ Comme la fiche (`resaDeTable`) : la page de table d'un restaurant ne
  // montre pas ses produits, sa carte vit sur sa fiche boutique.
  const resaDeTable = !!c && fonctionReservation(c) === 'reservation_table'
  const catalogue = catalogueDeFiche({ page: 'rdv', articles: resaDeTable ? [] : articles, prestations, formules })
  // `null` chez un restaurant : son balisage vit sur sa fiche boutique.
  const jsonLd = jsonLdFiche(c, PAGE_RDV, avis, { commandeRealisable, lieux, catalogue })
  return (
    <>
      <FournisseurFicheServeur
        resume={c ? <FicheServeur commercant={c} lieux={lieux} sections={catalogue}/> : null}
        liens={c ? <LiensCommune commune={communeDuCommerce(c.id, groupes)} commercantId={c.id}/> : null}>
        {children}
      </FournisseurFicheServeur>
      {/* ⚠️ `echapperJsonLd`, JAMAIS `JSON.stringify` NU : le nom et la
          description viennent du commerçant, et un « </script> » fermerait ce
          bloc (voir app/commander/[slug]/layout.js). */}
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: echapperJsonLd(jsonLd) }} />
      )}
    </>
  )
}
