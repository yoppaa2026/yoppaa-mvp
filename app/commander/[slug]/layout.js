// Layout serveur de la fiche commerçant : ajoute le SEO (metadata dynamiques +
// JSON-LD) SANS toucher à page.js (qui reste 'use client').
//
// Dans ce Next v16 : generateMetadata est Server-only et `params` est une Promise
// (await obligatoire).
//
// ⚠️ 15/10 : le titre, la description, l'adresse canonique et le balisage
// vivent dans `lib/fiche-seo.js`, partagé avec la fiche rendez-vous
// (`app/commander/rdv/[slug]/layout.js`). Ils n'étaient écrits qu'ici, et la
// fiche d'un salon partait chez Google sans titre ni balisage.

//
// ✅ 27/10 (Alex, tableau) : la fiche arrive COMPLÈTE chez Google. Le layout
// écrit la fiche en version simple (`FicheServeur`, à la place des blocs gris
// du chargement) et les liens de la commune (`LiensCommune`, en bas), et les
// passe à la page par `FournisseurFicheServeur`.

import { echapperJsonLd } from '@/lib/seo-landing'
import { metadataFiche, jsonLdFiche, PAGE_BOUTIQUE } from '@/lib/fiche-seo'
import { catalogueDeFiche } from '@/lib/fiche-contenu-seo'
import { communeDuCommerce } from '@/lib/commerces-commune'
import { getCommercantPublic, getAvisAgregat, getCommandeRealisable, getLieux, getArticles, getGroupesCommunes } from '@/lib/fiche-seo-server'
import { FournisseurFicheServeur } from '../FicheServeurContexte'
import FicheServeur from '../FicheServeur'
import LiensCommune from '../LiensCommune'

export async function generateMetadata({ params }) {
  const { slug } = await params
  const c = await getCommercantPublic(slug)
  // Le titre ne dit « Commander » que si une commande peut aller au bout.
  const commandeRealisable = c ? await getCommandeRealisable(c) : false
  // La ville du titre vient du LIEU déclaré, jamais du siège (27/10).
  const lieux = c ? await getLieux(c.id) : []
  return metadataFiche(c, PAGE_BOUTIQUE, { commandeRealisable, lieux })
}

export default async function CommercantLayout({ children, params }) {
  const { slug } = await params
  const c = await getCommercantPublic(slug)
  const [avis, commandeRealisable, lieux, articles, groupes] = c
    ? await Promise.all([getAvisAgregat(c.id), getCommandeRealisable(c), getLieux(c.id), getArticles(c.id), getGroupesCommunes()])
    : [null, false, [], [], []]
  const catalogue = catalogueDeFiche({ page: 'boutique', articles, ordreCategories: c?.ordre_categories })
  // `null` aussi quand Google doit retenir l'agenda (un salon) : le balisage
  // vit alors sur la fiche rendez-vous.
  const jsonLd = jsonLdFiche(c, PAGE_BOUTIQUE, avis, { commandeRealisable, lieux, catalogue })
  return (
    <>
      <FournisseurFicheServeur
        resume={c ? <FicheServeur commercant={c} lieux={lieux} sections={catalogue}/> : null}
        liens={c ? <LiensCommune commune={communeDuCommerce(c.id, groupes)} commercantId={c.id}/> : null}>
        {children}
      </FournisseurFicheServeur>
      {/* ⚠️ `echapperJsonLd`, JAMAIS `JSON.stringify` NU, ET C'EST UNE FAILLE
          RÉELLE QUI DORMAIT ICI. `JSON.stringify` n'échappe pas le « < » : un
          commerçant qui écrit « </script><script>… » dans le NOM ou la
          DESCRIPTION de sa fiche ferme ce bloc et exécute son script sur
          l'origine yoppaa.app, chez CHAQUE visiteur de sa page. La CSP autorise
          `unsafe-inline`, le jeton Supabase et l'identité Yopper vivent dans le
          localStorage de cette origine.

          Le remède existait DÉJÀ dans le dépôt, avec sa garde au banc, et il
          n'était posé que sur la landing, dont le graphe ne contient aucun texte
          saisi par qui que ce soit. La seule page réellement exposée était la
          seule à ne pas l'avoir. Voir feedback_appliquer_partout.

          ⚠️ Et la validation admin n'est PAS une barrière : elle porte sur le
          dossier, une seule fois, alors que le nom et la description restent
          librement modifiables ensuite depuis le tableau de bord. Le déclencheur
          `commercants_colonnes_reservees` ne protège ni l'un ni l'autre. */}
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: echapperJsonLd(jsonLd) }} />
      )}
    </>
  )
}
