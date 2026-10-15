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

import { echapperJsonLd } from '@/lib/seo-landing'
import { metadataFiche, jsonLdFiche, PAGE_BOUTIQUE } from '@/lib/fiche-seo'
import { getCommercantPublic, getAvisAgregat } from '@/lib/fiche-seo-server'

export async function generateMetadata({ params }) {
  const { slug } = await params
  return metadataFiche(await getCommercantPublic(slug), PAGE_BOUTIQUE)
}

export default async function CommercantLayout({ children, params }) {
  const { slug } = await params
  const c = await getCommercantPublic(slug)
  const avis = c ? await getAvisAgregat(c.id) : null
  // `null` aussi quand Google doit retenir l'agenda (un salon) : le balisage
  // vit alors sur la fiche rendez-vous.
  const jsonLd = jsonLdFiche(c, PAGE_BOUTIQUE, avis)
  return (
    <>
      {children}
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
