// BANC : agir sur plusieurs articles d'un coup.
//
// 🔴 CE QU'ON PROTÈGE (Alex, 25/09). Les trois actions ne se valent pas : la
// disponibilité se défait d'un clic, la catégorie se refait de mémoire, et le
// PRIX NE SE DÉFAIT PAS — aucune colonne ne garde l'ancien. Le pire cas de ce
// module n'est pas une action ratée, c'est une action qui touche plus
// d'articles que ce que le commerçant a lu à l'écran.
//
//   npm run verif:lot

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  ACTIONS_LOT, articlesDuLot, prixAjuste, refusDAjustement,
  patchsDuLot, resumeDuLot,
} from '../lib/catalogue-lot.js'

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}

const CATALOGUE = [
  { id: 1, nom: 'Margherita', prix: 9.5, actif: true, categorie: 'Pizzas' },
  { id: 2, nom: 'Reine', prix: 11, actif: false, categorie: 'Pizzas' },
  { id: 3, nom: 'Tiramisu', prix: 5, actif: true, categorie: 'Desserts' },
  { id: 4, nom: 'Expo', prix: null, actif: true, categorie: null },
]

// ═══ 1) QUI EST VISÉ ══════════════════════════════════════════════════════
{
  v('les quatre actions sont nommées',
    ACTIONS_LOT.join(',') === 'disponible,indisponible,categorie,prix', ACTIONS_LOT.join(','))

  v('la sélection retrouve ses articles',
    articlesDuLot(CATALOGUE, [1, 3]).map(a => a.nom).join(',') === 'Margherita,Tiramisu',
    articlesDuLot(CATALOGUE, [1, 3]).map(a => a.nom).join(','))

  // 🔴 LES CASES À COCHER RENDENT DU TEXTE, la base rend des nombres. Comparer
  // sans convertir laisse une sélection vide alors que l'écran montre douze
  // articles cochés.
  v('un identifiant en texte vise le même article',
    articlesDuLot(CATALOGUE, ['1']).length === 1,
    String(articlesDuLot(CATALOGUE, ['1']).length))

  v('un identifiant inconnu ne fabrique rien',
    articlesDuLot(CATALOGUE, [99]).length === 0)
  v('une liste vide ne casse rien',
    articlesDuLot(null, null).length === 0)
}

// ═══ 2) L'AJUSTEMENT DE PRIX, AU CENTIME ══════════════════════════════════
{
  v('une hausse de 10 % se calcule', prixAjuste(10, 10) === 11, String(prixAjuste(10, 10)))
  v('une baisse de 10 % se calcule', prixAjuste(10, -10) === 9, String(prixAjuste(10, -10)))
  // ⚠️ SANS ARRONDI ICI, la base garderait 9,405 € et chaque écran
  // arrondirait à sa façon : panier, facture et ticket divergeraient.
  //
  // 🔴 ET C'EST CETTE LIGNE QUI A TROUVÉ LA DÉRIVE DU FLOTTANT : `9.5 * 0.99`
  // vaut 9,404999999999999 en binaire, donc l'arrondi rendait 9,40 € là où le
  // commerçant attend 9,41 €. Un centime par article, à chaque saison.
  v('le résultat est arrondi au centime, sans dérive binaire',
    prixAjuste(9.5, -1) === 9.41, String(prixAjuste(9.5, -1)))
  v('et la dérive ne revient pas sur une hausse',
    prixAjuste(0.29, 5) === 0.3, String(prixAjuste(0.29, 5)))
  v('un article sans prix n’en reçoit pas un', prixAjuste(null, 10) === null)
  v('un prix à zéro n’est pas ajusté', prixAjuste(0, 10) === null)
  v('un pourcentage nul ne change rien', prixAjuste(10, 0) === null)
  v('un pourcentage illisible ne change rien', prixAjuste(10, 'abc') === null)
}

// ═══ 3) CE QU'ON REFUSE D'ÉCRIRE ══════════════════════════════════════════
{
  const vises = articlesDuLot(CATALOGUE, [1, 2, 3])
  v('un ajustement normal passe', refusDAjustement(vises, -10) === null,
    String(refusDAjustement(vises, -10)))

  // 🔴 UN PRIX À ZÉRO EST UN ARTICLE OFFERT, pas une promotion, et il
  // partirait sur la fiche publique sans que personne ne le voie.
  v('-100 % est refusé', /ne peut pas tomber à 0/.test(refusDAjustement(vises, -100) || ''),
    String(refusDAjustement(vises, -100)))
  v('au-delà de -100 % aussi', refusDAjustement(vises, -150) !== null)
  // ⚠️ ON REFUSE, ON NE BORNE PAS EN SILENCE : borner donnerait un prix que le
  // commerçant n'a pas demandé et qu'il croirait juste.
  v('une baisse qui passe sous le centime est refusée',
    /sous 1 centime/.test(refusDAjustement([{ id: 9, prix: 0.05 }], -90) || ''),
    String(refusDAjustement([{ id: 9, prix: 0.05 }], -90)))

  v('sans pourcentage, il le demande',
    /Indique un pourcentage/.test(refusDAjustement(vises, 0) || ''))
  v('sans article, il le demande',
    /Choisis au moins un article/.test(refusDAjustement([], 10) || ''))
  // ⚠️ UN ARTICLE SANS PRIX N'EST PAS UNE ERREUR (vitrine) : on ne bloque que
  // si AUCUN n'a de prix.
  v('un lot sans aucun prix est refusé',
    /Aucun de ces articles/.test(refusDAjustement([CATALOGUE[3]], 10) || ''))
  v('un lot mixte passe quand même',
    refusDAjustement(articlesDuLot(CATALOGUE, [1, 4]), 10) === null)
}

// ═══ 4) LES ÉCRITURES, ET CELLES QU'ON NE FAIT PAS ════════════════════════
{
  // ⚠️ UN PATCH VIDE NE PART PAS : une écriture pour rien réveille le temps
  // réel de la fiche publique et fausse le compte annoncé.
  const dispo = patchsDuLot({ action: 'disponible', articles: CATALOGUE })
  v('seuls les articles à changer sont écrits',
    dispo.length === 1 && dispo[0].id === 2, JSON.stringify(dispo))
  v('et le patch dit ce qu’il change', dispo[0]?.patch?.actif === true)

  const indispo = patchsDuLot({ action: 'indisponible', articles: CATALOGUE })
  v('dans l’autre sens aussi',
    indispo.map(p => p.id).join(',') === '1,3,4', indispo.map(p => p.id).join(','))

  const cat = patchsDuLot({ action: 'categorie', articles: CATALOGUE, valeur: 'Pizzas' })
  v('ceux qui y sont déjà ne sont pas réécrits',
    cat.map(p => p.id).join(',') === '3,4', cat.map(p => p.id).join(','))
  // ⚠️ « SANS CATÉGORIE » EST `null`, jamais une chaîne vide : une chaîne vide
  // fabriquerait une catégorie fantôme au nom invisible.
  const sansCat = patchsDuLot({ action: 'categorie', articles: [CATALOGUE[0]], valeur: '   ' })
  v('vider la catégorie écrit null', sansCat[0]?.patch?.categorie === null,
    JSON.stringify(sansCat))
  v('un article déjà sans catégorie n’est pas réécrit',
    patchsDuLot({ action: 'categorie', articles: [CATALOGUE[3]], valeur: '' }).length === 0)

  const prix = patchsDuLot({ action: 'prix', articles: CATALOGUE, valeur: 10 })
  v('le prix monte sur ceux qui en ont un',
    prix.map(p => p.id).join(',') === '1,2,3', prix.map(p => p.id).join(','))
  v('et il est arrondi', prix[0]?.patch?.prix === 10.45, String(prix[0]?.patch?.prix))
  v('l’article sans prix est laissé tranquille',
    !prix.some(p => p.id === 4))
  v('une action inconnue n’écrit rien',
    patchsDuLot({ action: 'effacer', articles: CATALOGUE }).length === 0)
}

// ═══ 5) CE QUE LE COMMERÇANT LIT ══════════════════════════════════════════
{
  // 🔴 IL DOIT LIRE CE QUI VA CHANGER, PAS CE QU'IL A COCHÉ. Douze cochés dont
  // trois bougeront, c'est « 3 » qu'on annonce, sinon il croira que neuf
  // écritures ont échoué.
  const patchs = patchsDuLot({ action: 'disponible', articles: CATALOGUE })
  const phrase = resumeDuLot({ action: 'disponible', patchs, coches: 4 })
  v('le résumé annonce ce qui bouge, pas ce qui est coché',
    /1 article deviendront|1 article/.test(phrase) && !/4 articles/.test(phrase), phrase)

  v('rendre indisponible dit la conséquence visible',
    /disparaîtront de ta fiche/.test(resumeDuLot({
      action: 'indisponible', patchs: [{ id: 1 }], coches: 1,
    })))

  // 🔴 LE PRIX NE SE DÉFAIT PAS, et ça se dit au moment où ça compte.
  const prixPhrase = resumeDuLot({ action: 'prix', patchs: [{ id: 1 }, { id: 2 }], coches: 2, valeur: -15 })
  v('l’ajustement dit le sens', /baisseront/.test(prixPhrase), prixPhrase)
  v('il dit le pourcentage sans signe en double', /de 15 %/.test(prixPhrase), prixPhrase)
  v('il prévient que rien n’est conservé',
    /anciens prix ne sont pas conservés/.test(prixPhrase), prixPhrase)

  // ⚠️ « RIEN À FAIRE » DOIT SE LIRE COMME TEL, pas comme un succès à zéro.
  v('rien à changer se dit',
    /déjà disponibles/.test(resumeDuLot({ action: 'disponible', patchs: [], coches: 3 })))
  v('aucune case cochée se dit',
    /Coche des articles/.test(resumeDuLot({ action: 'disponible', patchs: [], coches: 0 })))
}

// ═══ 6) LE BRANCHEMENT, CÔTÉ ÉCRAN ════════════════════════════════════════
{
  const config = sansProse(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
  const i = config.indexOf('async function appliquerLot(')
  const bloc = i >= 0 ? config.slice(i, i + 2200) : ''
  v('l’action en lot a bien été retrouvée', bloc.length > 500, String(bloc.length))

  // 🔴 LES RÈGLES VIENNENT DU MODULE : une copie dans l'écran, et le résumé lu
  // par le commerçant finirait par ne plus décrire ce qui s'écrit.
  for (const fn of ['articlesDuLot', 'patchsDuLot']) {
    v(`l’écran appelle ${fn} au lieu de refaire la règle`, new RegExp(`${fn}\\(`).test(bloc), fn)
  }
  v('le refus d’ajustement est consulté avant d’écrire',
    /refusDAjustement\(/.test(config))
  v('le résumé affiché vient du module', /resumeDuLot\(/.test(config))

  // ⚠️ LE PRIX EXIGE UNE CONFIRMATION, les deux autres non : une action qui ne
  // se défait pas ne part pas sur un clic.
  v('l’ajustement de prix demande confirmation',
    /lotAction === 'prix'[\s\S]{0,900}confirme\(/.test(bloc), bloc.slice(0, 120))
  // ⚠️ ET LA CONFIRMATION MONTRE LE RÉSULTAT, pas un « es-tu sûr ? » : c'est la
  // dernière chose qu'il lit avant une écriture qui ne se défait pas.
  v('et elle montre ce qui va se passer',
    /confirme\(confirmationSimple\(\{[\s\S]{0,300}resumeDuLot\(/.test(bloc))
  // 🔴 ET UN REFUS ARRÊTE VRAIMENT L'ÉCRITURE. Une confirmation dont personne
  // ne lit la réponse est un décor : elle rassure et ne protège rien. Ajoutée
  // le 25/09 parce que le harnais l'a montrée manquante.
  v('un refus arrête l’écriture',
    /const okPrix = await confirme\([\s\S]{0,400}if \(!okPrix\) return/.test(bloc))
}

console.log(`\nAgir en lot sur le catalogue : ${ok} vérifications`)

if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
