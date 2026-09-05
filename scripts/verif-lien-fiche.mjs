// Banc de L'ADRESSE PUBLIQUE, ET DU LIEN QUI RAMÈNE.
//
// 🔴 CE QU'IL GARDE : qu'un post généré par Yoppaa et publié sur Facebook
// RAMÈNE chez Yoppaa. Avant le 05/09 il ne ramenait nulle part : Yoppaa payait
// les jetons Anthropic, le commerçant collait le texte sur sa page, ses abonnés
// lisaient, et personne n'arrivait. L'outil travaillait pour un autre.
//
// ⚠️ ET LE LIEN NE DOIT JAMAIS ÊTRE ÉCRIT PAR LE MODÈLE. Une consigne de prompt
// est une SUGGESTION ; une concaténation est une GARANTIE. Un modèle qui écrit
// une adresse peut en déformer un caractère, et un lien mort dans une
// publication ne se corrige plus une fois qu'elle est en ligne.
//
// ⚠️ TOUT S'EXÉCUTE. Les gardes de code ne servent qu'à vérifier que les écrans
// appellent bien le module plutôt que de recomposer l'adresse dans leur coin.

import { lienFiche, signatureYoppaa, postAvecSignature, BASE_YOPPAA } from '../lib/lien-fiche.js'
import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b),
  `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

// ═══════════════════════════════════════════════════════════════════════════
// 1. L'ADRESSE
// ═══════════════════════════════════════════════════════════════════════════
{
  egal('l’adresse est absolue et publique', lienFiche('boulangerie-dupont'),
    'https://www.yoppaa.app/commander/boulangerie-dupont')
  egal('le domaine vient du module', BASE_YOPPAA, 'https://www.yoppaa.app')

  // ⚠️ UN `href` EST UNE CHAÎNE. Un slug non encodé fabrique un lien mort à la
  // première apostrophe ou au premier espace, et un lien mort dans un post
  // publié ne se rattrape pas.
  verifier('🔴 les espaces sont encodés', lienFiche('chez l ami').includes('chez%20l%20ami'))
  verifier('et les accents aussi', lienFiche('boulangerie-café').includes('caf%C3%A9'))
  // ⚠️ MA PREMIÈRE GARDE AFFIRMAIT UNE CHOSE FAUSSE, et le banc l'a dit tout de
  // suite : elle exigeait que l'apostrophe soit encodée. `encodeURIComponent` la
  // laisse DÉLIBÉRÉMENT, parce que c'est un caractère légal dans une adresse.
  // Une garde qui se trompe sur ce qu'elle mesure est pire qu'une garde absente :
  // elle aurait fait « corriger » un code juste.
  verifier('l’apostrophe reste, elle est légale dans une adresse',
    lienFiche("chez-l'ami").includes("l'ami"))

  // ⚠️ SANS SLUG, PAS D'ADRESSE INVENTÉE. Rendre `/commander/undefined` aurait
  // envoyé les lecteurs du post sur une page qui n'existe pas.
  egal('🔴 sans slug, aucune adresse', lienFiche(null), null)
  egal('un slug vide ne fabrique rien', lienFiche('   '), null)
  verifier('et jamais « undefined » dans l’adresse',
    !/undefined|null/.test(String(lienFiche('x'))))

  // 🔴 AUCUN BRANCHEMENT PAR CATÉGORIE, ET C'EST VÉRIFIÉ DANS LE CODE : la fiche
  // boutique REDIRIGE elle-même un commerce vitrine sans produits vers sa fiche
  // rendez-vous. `/commander/<slug>` est donc la seule adresse universelle.
  const FICHE = sansProse(readFileSync(new URL('../app/commander/[slug]/page.js', import.meta.url), 'utf8'))
  verifier('🔴 la fiche boutique redirige bien un commerce vitrine sans produits',
    /categorie === 'vitrine'[\s\S]{0,200}router\.replace\(`\/commander\/rdv\//.test(FICHE))
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LA SIGNATURE QUI RAMÈNE
// ═══════════════════════════════════════════════════════════════════════════
{
  const lien = lienFiche('boulangerie-dupont')
  const s = signatureYoppaa(lien, 'Boulangerie Dupont')
  verifier('la signature nomme le commerce', s.includes('Boulangerie Dupont'))
  verifier('🔴 et elle porte l’adresse', s.includes(lien))
  verifier('elle nomme Yoppaa', s.includes('Yoppaa'))

  // ⚠️ SANS NOM, ELLE RESTE LISIBLE : « Retrouve nous » plutôt que « Retrouve
  // undefined ». Un commerçant dont le nom manque en base ne doit pas publier
  // une phrase cassée.
  verifier('🔴 sans nom de commerce, aucune phrase cassée',
    !/undefined|null/.test(signatureYoppaa(lien, null)))
  verifier('et elle porte quand même l’adresse', signatureYoppaa(lien, null).includes(lien))

  // ⚠️ SANS ADRESSE, PAS DE SIGNATURE DU TOUT. Une phrase « Retrouve-nous sur
  // Yoppaa » sans lien ne ramène personne et occupe le post pour rien.
  egal('🔴 sans adresse, aucune signature', signatureYoppaa(null, 'Chez Nous'), '')
  egal('une adresse vide ne signe pas non plus', signatureYoppaa('  ', 'Chez Nous'), '')
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LE POST COMPLET
// ═══════════════════════════════════════════════════════════════════════════
{
  const lien = lienFiche('le-fournil')
  const texte = 'Nouveau chez nous : des pains au levain. #Pain #Mettet'
  const complet = postAvecSignature(texte, lien, 'Le Fournil')

  verifier('le corps du post est conservé', complet.includes(texte))
  verifier('🔴 et le lien est ajouté', complet.includes(lien))
  verifier('la signature est séparée du corps', complet.includes('\n\n'))

  // 🔴 JAMAIS DEUX FOIS LE MÊME LIEN. Le modèle a pour consigne de ne pas écrire
  // d'adresse, mais une consigne n'est pas une garantie : si elle est déjà là,
  // on ne la remet pas.
  const dejaSigne = `Nouveau chez nous. Retrouve Le Fournil sur Yoppaa : ${lien}`
  egal('🔴 un post qui porte déjà le lien n’en reçoit pas un second',
    (postAvecSignature(dejaSigne, lien, 'Le Fournil').match(new RegExp(lien.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1)

  // ⚠️ SANS ADRESSE, LE POST SORT INTACT. Un commerçant sans slug ne doit pas
  // voir son texte amputé ni suivi d'une ligne vide.
  egal('sans adresse, le texte sort tel quel', postAvecSignature(texte, null, 'Le Fournil'), texte)
  // ⚠️ ET UN TEXTE VIDE NE FABRIQUE PAS DEUX SAUTS DE LIGNE EN TÊTE.
  verifier('un texte vide ne commence pas par des sauts de ligne',
    !/^\n/.test(postAvecSignature('', lien, 'Le Fournil')))
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LA ROUTE ET L'ÉCRAN
// ═══════════════════════════════════════════════════════════════════════════
{
  const ROUTE = sansProse(readFileSync(new URL('../app/api/ia/generer-post/route.js', import.meta.url), 'utf8'))
  const ECRAN = sansProse(readFileSync(new URL('../app/dashboard/TabGenerateur.js', import.meta.url), 'utf8'))

  // 🔴 LE LIEN EST CALCULÉ PAR LE SERVEUR, jamais recomposé dans le navigateur.
  verifier('🔴 la route rend le lien de la fiche',
    /lien: estFichePourLien \? null : lienFiche\(com\.slug\)/.test(ROUTE))
  verifier('et elle charge le slug pour ça', /auth_user_id, slug'\)/.test(ROUTE))
  // ⚠️ UNE DESCRIPTION D'ARTICLE S'AFFICHE DANS YOPPAA : y coller un lien vers
  // Yoppaa n'aurait aucun sens.
  verifier('🔴 une description de fiche ne reçoit PAS de lien',
    /const estFichePourLien = surface === 'article' \|\| surface === 'prestation'/.test(ROUTE))

  // 🔴 LE MODÈLE A INTERDICTION D'ÉCRIRE UNE ADRESSE. Deux fois la même, ou une
  // adresse déformée, sont les deux façons de rater ce lien.
  verifier('🔴 le prompt interdit au modèle d’écrire une adresse',
    /N'écris JAMAIS d'adresse web, de lien, de "yoppaa\.app"/.test(ROUTE))

  // ⚠️ L'ÉCRAN AFFICHE CE QU'IL VA COPIER. Un texte copié qui contient une ligne
  // que le commerçant n'a pas vue, il la découvre publiée.
  verifier('🔴 l’écran montre la signature avant de la copier',
    /\{signatureYoppaa\(lien, nomCommerce\)\}/.test(ECRAN))
  // 🔴 GARDE FAUSSE, TROUVÉE PAR LE HARNAIS LE 05/09. Elle cherchait
  // l'EXISTENCE d'un `copier(postAvecSignature(` : casser celui de la version
  // standard la laissait VERTE, parce que celui de la version courte restait.
  // C'est le piège du JUMEAU, troisième fois en deux jours.
  //
  // ⚠️ ON COMPTE, ON NE CHERCHE PLUS. Il y a DEUX boutons de copie, et la
  // version courte porte la signature elle aussi : rien n'empêche de la coller
  // sur Facebook, et sans lien ce post-là ne ramènerait personne.
  egal('🔴 et les DEUX boutons copient le post AVEC le lien',
    (ECRAN.match(/copier\(postAvecSignature\(/g) || []).length, 2)
  // ⚠️ IL NE RECOMPOSE PAS L'ADRESSE : elle vient du serveur, telle quelle.
  verifier('🔴 l’écran ne fabrique aucune adresse lui-même',
    !/yoppaa\.app\/commander/.test(ECRAN) && /setLien\(j\.lien \|\| null\)/.test(ECRAN))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Adresse publique et lien de retour verts.')
