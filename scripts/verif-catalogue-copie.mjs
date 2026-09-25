// BANC : copier dans le catalogue (groupes d'options, articles).
//
// 🔴 CE QU'ON PROTÈGE (Alex, 25/09). « Une liste complète de sauces, des
// garnitures de pizza ne peuvent pas être réécrites sur 40 pizzas. » Le pire
// cas de ce module n'est pas une copie ratée : c'est une copie qui ÉCRASE un
// réglage existant, ou qui arrive en ligne toute seule sur la fiche publique.
//
// ⚠️ LES RÈGLES S'EXÉCUTENT ICI, elles ne sont pas cherchées dans le texte. Le
// branchement des écrans, lui, se vérifie au source, en découpant la section.
//
//   npm run verif:copie

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  CHAMPS_COPIES, CHAMPS_VARIANTES, nomDeLaCopie, copieDArticle, ciblesDeCopie,
  conflitsDeGroupe, copiesDuGroupe, copiesDeVariantes, resumeDeCopie, repartirCibles,
  bibliothequeDeGroupes, phraseDeBibliotheque,
  axesDeLArticle, conflitsDeVariantes, resumeDeVariantes,
  CHAMPS_PRESTATION, copieDePrestation,
  aVerifierApresCopie, lignesDeFenetre, doitOuvrirFenetre, resumeCourt,
} from '../lib/catalogue-copie.js'

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}

// ═══ 1) LE NOM DE LA COPIE ════════════════════════════════════════════════
{
  v('une copie se nomme « … (copie) »',
    nomDeLaCopie('Margherita', []) === 'Margherita (copie)',
    nomDeLaCopie('Margherita', []))

  // ⚠️ DEUX ARTICLES AU MÊME NOM sont un piège pour le commerçant comme pour
  // son client : on compte plutôt que de laisser le doublon.
  v('une deuxième copie se numérote',
    nomDeLaCopie('Margherita', ['Margherita', 'Margherita (copie)']) === 'Margherita (copie 2)',
    nomDeLaCopie('Margherita', ['Margherita', 'Margherita (copie)']))

  // ⚠️ L'ŒIL NE VOIT NI LA CASSE NI LES ESPACES DE BORD.
  v('la casse et les espaces ne fabriquent pas un faux nom libre',
    nomDeLaCopie('Margherita', ['  margherita (COPIE) ']) === 'Margherita (copie 2)',
    nomDeLaCopie('Margherita', ['  margherita (COPIE) ']))

  v('un nom vide ne rend pas « (copie) » tout seul',
    nomDeLaCopie('   ', []) === 'Article (copie)',
    nomDeLaCopie('   ', []))
}

// ═══ 2) LA COPIE D'UN ARTICLE ═════════════════════════════════════════════
{
  const source = {
    id: 'a1', commercant_id: 'c1', created_at: '2026-01-01', nom: 'Margherita',
    description: 'Tomate, mozza', prix: 9.5, stock_jour: 20, actif: true,
    categorie: 'Pizzas', temps_prepa: 8, delai_minutes: 0,
    photo_url: 'https://x/y.jpg', est_vitrine: false,
    tva_taux: 6, tva_taux_sur_place: 12,
  }
  const copie = copieDArticle(source, { commercantId: 'c1', nomsExistants: ['Margherita'] })

  // 🔴 L'IDENTIFIANT NE SE COPIE PAS. Un `{ ...article }` emporterait `id` et
  // `created_at` : l'insertion écraserait l'original ou serait refusée.
  v('la copie n’emporte ni l’identifiant ni la date de création',
    copie && copie.id === undefined && copie.created_at === undefined,
    Object.keys(copie || {}).join(','))

  // 🔴 ELLE NAÎT INDISPONIBLE : dupliquer sert à préparer, pas à publier.
  v('la copie naît indisponible', copie?.actif === false, String(copie?.actif))

  v('elle garde le prix', copie?.prix === 9.5, String(copie?.prix))
  v('elle garde la catégorie', copie?.categorie === 'Pizzas', copie?.categorie)
  v('elle garde les deux taux de TVA',
    copie?.tva_taux === 6 && copie?.tva_taux_sur_place === 12,
    `${copie?.tva_taux}/${copie?.tva_taux_sur_place}`)
  // ⚠️ UN DÉLAI OUBLIÉ PROMETTRAIT UNE TARTE DE 48 H POUR LE JOUR MÊME.
  v('elle garde le délai de préparation par article',
    Object.prototype.hasOwnProperty.call(copie || {}, 'delai_minutes'))
  v('elle partage la photo sans recopier le fichier',
    copie?.photo_url === 'https://x/y.jpg', copie?.photo_url)
  v('elle prend un nom libre', copie?.nom === 'Margherita (copie)', copie?.nom)
  v('elle appartient au même commerce', copie?.commercant_id === 'c1', copie?.commercant_id)

  v('un article illisible ne fabrique pas une ligne vide',
    copieDArticle(null) === null && copieDArticle('x') === null)

  // ⚠️ LA LISTE DES CHAMPS COPIÉS DOIT SUIVRE LE FORMULAIRE. Une colonne
  // ajoutée à l'enregistrement et oubliée ici donnerait une copie muette sur ce
  // réglage, sans que personne ne le voie. On compare les deux listes.
  const config = sansProse(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
  const i = config.indexOf('async function saveArticle()')
  const bloc = i >= 0 ? config.slice(i, config.indexOf('const { error } = editId', i)) : ''
  v('le formulaire d’enregistrement a bien été retrouvé', bloc.length > 200, String(bloc.length))
  const champsPayload = [...bloc.matchAll(/^\s{6}([a-z_]+):/gm)].map(m => m[1])
    .filter(c => c !== 'commercant_id')
  const manquants = champsPayload.filter(c => !CHAMPS_COPIES.includes(c))
  v('aucun champ du formulaire n’est oublié par la copie',
    manquants.length === 0, manquants.join(', '))
  const enTrop = CHAMPS_COPIES.filter(c => !champsPayload.includes(c))
  v('et la copie n’invente aucun champ que le formulaire ignore',
    enTrop.length === 0, enTrop.join(', '))

  // 🔴 ET LES AXES DE VARIANTES ONT UNE AUTRE SOURCE, C'EST TOUT LE DÉFAUT DU
  // 25/09. Ces colonnes vivent sur `articles` mais ne passent pas par le
  // formulaire : l'écran des variantes les écrit à part. La garde ci-dessus
  // était donc verte sur un article à moitié copié. On mesure la parité contre
  // le `select` de cet écran-là, sa vraie source.
  const iVar = config.indexOf("supabase.from('articles').select('gere_variantes")
  const ligneVar = iVar >= 0 ? config.slice(iVar, config.indexOf(')', config.indexOf('select(', iVar) + 8)) : ''
  v('le select des axes a bien été retrouvé', ligneVar.length > 40, String(ligneVar.length))
  const champsAxes = (ligneVar.match(/[a-z0-9_]+/g) || [])
    .filter(x => x.startsWith('axe') || x === 'gere_variantes')
  const axesOublies = champsAxes.filter(c => !CHAMPS_VARIANTES.includes(c))
  v('aucun axe de variante n’est oublié par la copie',
    axesOublies.length === 0 && champsAxes.length === 5,
    `oubliés: ${axesOublies.join(', ') || 'aucun'} · trouvés: ${champsAxes.length}`)

  // ⚠️ ET ILS SONT VRAIMENT DANS LA COPIE, pas seulement dans une constante.
  const tshirt = {
    id: 'a2', nom: 'T-shirt', prix: 19.9, actif: true,
    gere_variantes: true, axe1_nom: 'Taille', axe1_valeurs: ['S', 'M'],
    axe2_nom: 'Couleur', axe2_valeurs: ['Noir'],
  }
  const copieVar = copieDArticle(tshirt, { commercantId: 'c1' })
  v('la copie d’un article à variantes garde ses axes',
    copieVar?.gere_variantes === true && copieVar?.axe1_nom === 'Taille'
      && Array.isArray(copieVar?.axe1_valeurs) && copieVar.axe1_valeurs.join(',') === 'S,M',
    JSON.stringify(copieVar))
  // ⚠️ UN ARTICLE SANS VARIANTES NE GAGNE PAS DES COLONNES VIDES : écrire
  // `gere_variantes: null` sur une pizza ferait porter à l'alimentaire un
  // réglage qui n'est pas le sien.
  const copiePizza = copieDArticle({ id: 'a3', nom: 'Margherita', prix: 9 }, {})
  v('un article sans variantes n’hérite pas de colonnes d’axes',
    !('gere_variantes' in copiePizza) && !('axe1_nom' in copiePizza),
    Object.keys(copiePizza).join(','))
}

// ═══ 2 bis) LES COMBINAISONS DE VARIANTES ═════════════════════════════════
{
  const variantes = [
    { id: 'v1', article_id: 'a2', axe1_valeur: 'S', axe2_valeur: 'Noir', stock: 12, prix: 21.9, photo_url: 'https://x/s.jpg', actif: true, ordre: 0 },
    { id: 'v2', article_id: 'a2', axe1_valeur: 'M', axe2_valeur: 'Noir', stock: 4, prix: null, photo_url: null, actif: false, ordre: 1 },
  ]
  const copies = copiesDeVariantes(variantes, 'a9')

  v('chaque combinaison est recréée', copies.length === 2, String(copies.length))
  v('elles visent le nouvel article', copies.every(c => c.article_id === 'a9'))
  v('les valeurs d’axes suivent',
    copies[0].axe1_valeur === 'S' && copies[0].axe2_valeur === 'Noir')
  v('le prix de la variante suit', copies[0].prix === 21.9, String(copies[0].prix))
  v('la photo de la variante suit', copies[0].photo_url === 'https://x/s.jpg')
  // ⚠️ LE COMMERÇANT A DÉCIDÉ QUE LE 3XL NE SE VEND PLUS : il n'a pas envie de
  // le redécider.
  v('une combinaison désactivée le reste', copies[1].actif === false)
  v('l’ordre d’affichage suit', copies[1].ordre === 1, String(copies[1].ordre))
  v('aucune copie n’emporte l’identifiant de la variante source',
    copies.every(c => c.id === undefined))

  // 🔴 LE STOCK EST LE SEUL CHAMP QUI NE SE COPIE PAS : « 12 en taille M » est
  // une quantité, pas un réglage. La recopier vendrait douze t-shirts qui
  // n'existent pas.
  v('le stock repart de zéro',
    copies.every(c => c.stock === 0), copies.map(c => c.stock).join(','))

  v('sans article cible, rien n’est produit', copiesDeVariantes(variantes, null).length === 0)
  v('sans variante, rien n’est produit', copiesDeVariantes([], 'a9').length === 0)
}

// ═══ 3) VERS QUELS ARTICLES PEUT-ON COPIER ? ══════════════════════════════
{
  const articles = [
    { id: 1, nom: 'Margherita' },
    { id: 2, nom: 'Reine' },
    { id: 3, nom: 'Tableau expo', est_vitrine: true },
  ]
  const cibles = ciblesDeCopie(articles, 1)
  v('la source ne se propose pas à elle-même',
    !cibles.some(a => a.id === 1), cibles.map(a => a.id).join(','))
  // ⚠️ UN BOUTON MORT FAIT DOUTER DE TOUT L'ÉCRAN : un article de vitrine ne se
  // commande pas, ses options ne seraient jamais proposées à personne.
  v('un article de vitrine n’est pas proposé',
    !cibles.some(a => a.id === 3), cibles.map(a => a.id).join(','))
  v('les autres articles restent proposés',
    cibles.length === 1 && cibles[0].id === 2, cibles.map(a => a.id).join(','))
  v('un catalogue vide ne casse rien', ciblesDeCopie(null, 1).length === 0)
}

// ═══ 4) CE QUI EXISTE DÉJÀ N'EST JAMAIS ÉCRASÉ ════════════════════════════
{
  const groupesParArticle = {
    2: [{ nom: 'Sauces' }],
    3: [{ nom: ' sauces ' }],
    4: [{ nom: 'Cuisson' }],
  }
  const conflits = conflitsDeGroupe('Sauces', [2, 3, 4, 5], groupesParArticle)
  v('un article qui a déjà ce groupe est repéré', conflits.includes(2))
  v('la comparaison ignore casse et espaces', conflits.includes(3), conflits.join(','))
  v('un autre groupe ne fait pas conflit', !conflits.includes(4), conflits.join(','))
  v('un article sans groupe ne fait pas conflit', !conflits.includes(5), conflits.join(','))
  v('un nom de groupe vide ne bloque pas tout',
    conflitsDeGroupe('   ', [2, 3], groupesParArticle).length === 0)

  const { aCopier, ignores } = repartirCibles([2, 3, 4, 5], conflits)
  v('les articles en conflit sont écartés, pas écrasés',
    aCopier.join(',') === '4,5' && ignores.join(',') === '2,3',
    `copier=${aCopier.join(',')} ignorés=${ignores.join(',')}`)
  // ⚠️ LES IDENTIFIANTS ARRIVENT PARFOIS EN TEXTE depuis un <input value>.
  v('un identifiant en texte est reconnu comme le même',
    repartirCibles(['2', 4], [2]).aCopier.join(',') === '4',
    repartirCibles(['2', 4], [2]).aCopier.join(','))
}

// ═══ 5) CE QUE LA COPIE D'UN GROUPE EMPORTE ═══════════════════════════════
{
  const groupe = {
    id: 'g1', article_id: 1, nom: 'Sauces', type: 'multiple', obligatoire: true,
    valeurs: [
      { id: 'v1', groupe_id: 'g1', nom: 'Ketchup', prix_supplement: 0 },
      { id: 'v2', groupe_id: 'g1', nom: 'Truffe', prix_supplement: 1.5 },
    ],
  }
  const { groupes, valeurs } = copiesDuGroupe(groupe, [2, 3])

  v('un groupe par article visé', groupes.length === 2, String(groupes.length))
  v('chaque copie vise son article', groupes[0].article_id === 2 && groupes[1].article_id === 3)
  // 🔴 LE TYPE FAIT PARTIE DU GROUPE : « un seul choix » devenu « plusieurs »
  // laisserait un client prendre trois tailles de pizza.
  //
  // ⚠️ ET ON MESURE LES DEUX SENS. Trouvé par le harnais le 25/09 : la garde
  // ne connaissait que le cas « multiple », donc forcer `type: 'multiple'` dans
  // le module la laissait verte. Une garde qui ne connaît qu'une valeur ne
  // mesure pas un choix, elle mesure une coïncidence.
  v('le type de choix suit', groupes.every(g => g.type === 'multiple'))
  v('et « un seul choix » ne devient pas « plusieurs »',
    copiesDuGroupe({ nom: 'Taille', type: 'unique', valeurs: [] }, [2]).groupes[0].type === 'unique',
    copiesDuGroupe({ nom: 'Taille', type: 'unique', valeurs: [] }, [2]).groupes[0].type)
  // ⚠️ UN TYPE ILLISIBLE RETOMBE SUR LE CHOIX UNIQUE, le moins permissif.
  v('un type inconnu retombe sur le choix unique',
    copiesDuGroupe({ nom: 'X', type: 'nawak', valeurs: [] }, [2]).groupes[0].type === 'unique')
  v('l’obligation suit', groupes.every(g => g.obligatoire === true))
  v('aucune copie n’emporte l’identifiant du groupe source',
    groupes.every(g => g.id === undefined))

  v('les valeurs voyagent avec le groupe',
    valeurs.length === 2 && valeurs[0].length === 2, JSON.stringify(valeurs))
  // 🔴 UN SUPPLÉMENT PERDU SE VEND GRATUITEMENT SUR TRENTE-NEUF PIZZAS.
  v('le supplément de prix suit la valeur',
    valeurs[0][1].prix_supplement === 1.5, String(valeurs[0][1]?.prix_supplement))
  v('les valeurs copiées n’emportent ni leur identifiant ni leur groupe',
    valeurs[0].every(x => x.id === undefined && x.groupe_id === undefined))

  // ⚠️ UN GROUPE SANS VALEUR SE COPIE QUAND MÊME : le commerçant l'a peut-être
  // créé avant de le remplir, et refuser ici l'obligerait à tout refaire.
  const vide = copiesDuGroupe({ nom: 'Cuisson', type: 'unique' }, [2])
  v('un groupe sans valeur se copie sans casser',
    vide.groupes.length === 1 && vide.valeurs[0].length === 0)
  v('aucune cible ne produit aucune écriture',
    copiesDuGroupe(groupe, []).groupes.length === 0)
}

// ═══ 5 quinquies) CE QU'IL RESTE À VÉRIFIER SUR UNE COPIE ═════════════════
//
// 🔴 DÉCISION D'ALEX (25/09) : « il faut juste une fenêtre qui explique ce qui
// n'est pas copié et la vérification nécessaire. S'il est informé, c'est très
// bien. » Le pire cas ici n'est pas une ligne oubliée : c'est une liste
// GÉNÉRIQUE dont la moitié ne s'applique pas, qu'on cesse de lire.
{
  const nu = aVerifierApresCopie({ nom: 'Margherita (copie)' })
  // ⚠️ LES DEUX SEULS POINTS TOUJOURS VRAIS.
  v('une copie sans rien d’autre ne dit que deux choses', nu.length === 2, String(nu.length))
  v('le nom est dit en premier', /\(copie\)/.test(nu[0].quoi), nu[0].quoi)
  v('et le geste est nommé', /Renomme/.test(nu[0].faire), nu[0].faire)
  v('l’indisponibilité est dite', /indisponible/.test(nu[1].quoi), nu[1].quoi)
  // ⚠️ ELLE DIT CE QUE ÇA IMPLIQUE, pas seulement l'état : « personne ne le
  // voit » est ce qui fait agir, « inactif » ne fait rien.
  v('avec ce que ça implique', /Personne ne le voit/.test(nu[1].faire), nu[1].faire)

  // 🔴 RIEN SUR LES PHOTOS CHEZ QUI N'EN A PAS : une alarme qui sonne pour
  // rien cesse d'être lue, et le jour où elle compte elle ne sert plus.
  v('aucune ligne sur les photos quand il n’y en a pas',
    !nu.some(p => /photo/i.test(p.quoi)))
  v('aucune ligne sur le stock quand il n’y en a pas',
    !nu.some(p => /stock/i.test(p.quoi)))

  const complet = aVerifierApresCopie({
    nom: 'T-shirt (copie)', galerie: 3, stocksJour: 7, variantes: 6, options: 2,
  })
  v('les photos supplémentaires sont annoncées',
    complet.some(p => /3 photos supplémentaires/.test(p.quoi)),
    complet.map(p => p.quoi).join(' | '))
  // 🔴 LE PIÈGE LE PLUS CHER : un article activé avec des tailles à zéro ne se
  // vend pas, et le commerçant cherche pourquoi.
  const varLigne = complet.find(p => /variantes/.test(p.quoi))
  v('les variantes à zéro sont annoncées', /à stock zéro/.test(varLigne?.quoi || ''), varLigne?.quoi)
  v('avec la conséquence : rien ne se vend',
    /rien ne se vend/.test(varLigne?.faire || ''), varLigne?.faire)
  v('les stocks par jour sont annoncés',
    complet.some(p => /stocks par jour/.test(p.quoi)))
  // ⚠️ CE QUI A BIEN SUIVI SE DIT AUSSI : sinon le commerçant recrée ses
  // groupes à la main sans avoir vérifié qu'ils y sont déjà.
  v('ce qui a bien suivi est dit aussi',
    complet.some(p => /groupes d’options ont bien suivi/.test(p.quoi)),
    complet.map(p => p.quoi).join(' | '))

  // ⚠️ UNE PRESTATION N'A NI PHOTO SECONDAIRE NI STOCK : sa liste est plus
  // courte, et elle parle d'elle au féminin.
  const presta = aVerifierApresCopie({ nom: 'Coupe (copie)', prestation: true })
  v('une prestation parle de réservation, pas de fiche',
    /réserver/.test(presta[1].faire), presta[1].faire)
  v('et elle s’accorde au féminin', /Elle est/.test(presta[1].quoi), presta[1].quoi)

  // 🔴 UN TABLEAU, PAS UNE CHAÎNE. La modale rend déjà une ligne par entrée ;
  // lui passer un texte collé donnait le pavé illisible qu'Alex a montré en
  // capture le 25/09. La puce est là pour l'œil qui balaie.
  const lignes = lignesDeFenetre(complet)
  v('la fenêtre reçoit une ligne par point',
    Array.isArray(lignes) && lignes.length === complet.length, String(lignes.length))
  v('chaque ligne porte sa puce', lignes.every(l => l.startsWith('• ')), lignes[0])
  v('et elle dit l’état ET le geste', /Renomme-la/.test(lignes[0]), lignes[0])
  v('une liste vide ne casse rien', lignesDeFenetre(null).length === 0)

  // ═══ QUINZE FOIS LA MÊME FENÊTRE N'EST PAS UNE INFORMATION ═══════════════
  //
  // 🔴 ALEX, 25/09 : « pas 15 fois la même chose s'il fait la manip sur 15
  // articles ». C'est la règle des confirmations du 08/09 vue d'un autre
  // côté : douze fenêtres par jour deviennent un réflexe, et le jour où elle
  // compte vraiment, plus personne ne la lit.
  //
  // ⚠️ ELLE NE SE LÈVE QUE POUR CE QUI NE SE VOIT NULLE PART. Le nom
  // « (copie) » se lit dans la liste, la pastille « Inactif » aussi, une photo
  // manquante se voit en ouvrant. Des variantes à stock zéro, non : l'article
  // a l'air prêt, il s'active, et rien ne se vend.
  const ordinaire = aVerifierApresCopie({ nom: 'Margherita (copie)', galerie: 2, options: 3 })
  v('une copie ordinaire n’arrête pas le commerçant',
    doitOuvrirFenetre(ordinaire, false) === false,
    JSON.stringify(ordinaire.map(p => p.grave)))
  v('des variantes à stock zéro, si',
    doitOuvrirFenetre(complet, false) === true)
  // ⚠️ ET UNE SEULE FOIS PAR SESSION : la deuxième duplication n'apprend rien
  // de plus que la première.
  v('et une seule fois par session',
    doitOuvrirFenetre(complet, true) === false)
  v('une liste vide n’ouvre rien', doitOuvrirFenetre(null, false) === false)

  // ─── LE MESSAGE QUI NE BLOQUE PAS ───────────────────────────────────────
  //
  // ⚠️ IL NE REPREND QUE CE QUI SE RETIENT. Recopier les six lignes de la
  // fenêtre dans un message qui dure trois secondes ne servirait personne.
  const court = resumeCourt('T-shirt (copie)', complet)
  v('le message court nomme la copie', /T-shirt \(copie\)/.test(court), court)
  v('il dit qu’elle est indisponible', /en indisponible/.test(court), court)
  v('il dit le piège invisible', /variantes à stock zéro/.test(court), court)
  v('il dit les photos non reprises', /3 photos non reprises/.test(court), court)
  // ⚠️ UN MESSAGE COURT N'EST PAS L'ENDROIT POUR RASSURER : ce qui a bien
  // suivi n'a pas de version brève, et n'encombre pas la ligne.
  v('il ne répète pas ce qui a bien suivi', !/ont bien suivi/.test(court), court)
  v('sans rien à signaler, il reste une phrase',
    resumeCourt('X', []) === '« X » créé.', resumeCourt('X', []))
}

// ═══ 5 quater) LES PRESTATIONS, POUR LES MÉTIERS À RENDEZ-VOUS ════════════
{
  const coupe = {
    id: 'p1', commercant_id: 'c1', created_at: 'x', nom: 'Coupe femme',
    description: 'Shampoing compris', duree_minutes: 45, prix: 38,
    acompte_pourcent: 20, actif: true, tva_taux: 21, capacite: 1,
    par_couverts: false, couverts_min: null, couverts_max: null,
    duree_paliers: null, quantite: null,
  }
  const copie = copieDePrestation(coupe, { commercantId: 'c1', nomsExistants: ['Coupe femme'] })

  v('la prestation se copie', !!copie)
  v('elle prend un nom libre', copie?.nom === 'Coupe femme (copie)', copie?.nom)
  v('elle naît indisponible', copie?.actif === false, String(copie?.actif))
  // 🔴 DEUX CHAMPS QUI N'EXISTENT NULLE PART AILLEURS : la durée, et l'acompte
  // qui touche à l'argent pris d'avance.
  v('la durée suit', copie?.duree_minutes === 45, String(copie?.duree_minutes))
  v('l’acompte suit', copie?.acompte_pourcent === 20, String(copie?.acompte_pourcent))
  v('le prix et la TVA suivent', copie?.prix === 38 && copie?.tva_taux === 21)
  v('elle n’emporte ni identifiant ni date de création',
    copie?.id === undefined && copie?.created_at === undefined,
    Object.keys(copie || {}).join(','))

  // 🔴 UNE JOINTURE DE TABLES NE SE DUPLIQUE PAS : deux jointures sur les mêmes
  // tables feraient compter deux fois le même inventaire.
  v('une jointure de tables est refusée',
    copieDePrestation({ ...coupe, jointure_de: 'p9' }, {}) === null)
  v('une prestation illisible ne fabrique pas de ligne',
    copieDePrestation(null) === null && copieDePrestation(42) === null)

  // ⚠️ LA LISTE DES CHAMPS DOIT SUIVRE LE FORMULAIRE, comme pour les articles.
  // ⚠️ ON DÉCOUPE L'ONGLET AVANT DE CHERCHER LE FORMULAIRE. Les articles et
  // les prestations ont deux `payload` qui commencent par les mêmes lignes :
  // une recherche sur tout le fichier trouve le premier des deux, et la garde
  // mesure alors un écran qu'elle ne surveille pas. Défaut vu ici même le
  // 25/09, la garde annonçant « stock_jour » manquant à une prestation.
  const config2 = sansProse(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
  const iTab = config2.indexOf('function TabRdvPrestations(')
  const tab = iTab >= 0 ? config2.slice(iTab) : ''
  v('l’onglet des prestations a bien été retrouvé', tab.length > 1000, String(tab.length))
  const iP = tab.indexOf('const payload = {')
  const blocP = iP >= 0 ? tab.slice(iP, tab.indexOf('setSaving(true)', iP)) : ''
  v('le formulaire de prestation a bien été retrouvé', blocP.length > 300, String(blocP.length))
  const champsP = [...blocP.matchAll(/^\s{6}([a-z_]+):/gm)].map(m => m[1])
    .filter(c => c !== 'commercant_id')
  const oublies = champsP.filter(c => !CHAMPS_PRESTATION.includes(c))
  v('aucun champ de prestation n’est oublié par la copie',
    oublies.length === 0, oublies.join(', '))
}

// ═══ 5 ter) LE MÊME GESTE POUR LES VARIANTES ══════════════════════════════
{
  const tshirt = {
    id: 1, nom: 'T-shirt', gere_variantes: true,
    axe1_nom: 'Taille', axe1_valeurs: ['S', 'M', 'L'],
    axe2_nom: 'Couleur', axe2_valeurs: ['Noir'],
  }
  const axes = axesDeLArticle(tshirt)
  v('les axes se recopient', axes?.axe1_nom === 'Taille' && axes?.axe1_valeurs.join(',') === 'S,M,L',
    JSON.stringify(axes))
  // ⚠️ SANS LE DRAPEAU, l'écran de l'article cible n'afficherait même pas les
  // tailles qu'on vient de lui poser.
  v('le drapeau de gestion est allumé', axes?.gere_variantes === true)
  v('un article illisible ne fabrique pas de patch', axesDeLArticle(null) === null)

  // 🔴 UNE MATRICE REMPLACE CELLE QUI EST LÀ : copier vers un article déjà
  // équipé détruirait ses tailles, ses prix et ses stocks.
  const catalogue = [
    { id: 1, nom: 'T-shirt', gere_variantes: true, axe1_valeurs: ['S'] },
    { id: 2, nom: 'Pull', gere_variantes: true, axe1_valeurs: ['M', 'L'] },
    { id: 3, nom: 'Casquette' },
    { id: 4, nom: 'Écharpe', gere_variantes: true, axe1_valeurs: [] },
  ]
  const conflits = conflitsDeVariantes([2, 3, 4], catalogue)
  v('un article déjà équipé est écarté', conflits.includes(2), conflits.join(','))
  v('un article sans variantes est une cible valable', !conflits.includes(3), conflits.join(','))
  // ⚠️ UN DRAPEAU RESTÉ VRAI SUR UNE MATRICE VIDE n'a rien à perdre : le
  // priver de la copie serait un refus incompréhensible.
  v('un drapeau vrai sur une matrice vide ne bloque pas',
    !conflits.includes(4), conflits.join(','))
  v('un identifiant inconnu ne bloque pas', conflitsDeVariantes([99], catalogue).length === 0)

  const phrase = resumeDeVariantes({ cibles: 5, conflits: 2 })
  v('le résumé dit ce qui sera créé', /sur 3 articles/.test(phrase), phrase)
  // ⚠️ LE STOCK REPART DE ZÉRO, et il faut le lire avant de cliquer.
  v('et qu’on repart à stock zéro', /à stock zéro/.test(phrase), phrase)
  v('il promet de ne rien écraser', /rien n’y sera écrasé/.test(phrase), phrase)
  v('tout en conflit se lit comme un refus',
    /Rien à copier/.test(resumeDeVariantes({ cibles: 2, conflits: 2 })),
    resumeDeVariantes({ cibles: 2, conflits: 2 }))
  v('aucune cible : il demande d’en choisir une',
    /Choisis au moins un article/.test(resumeDeVariantes({ cibles: 0 })))
}

// ═══ 5 bis) LA BIBLIOTHÈQUE : PARTIR DU GROUPE, PAS DE L'ARTICLE ══════════
{
  const G = (id, article_id, nom, valeurs, extra = {}) => ({
    id, article_id, nom, type: 'multiple', obligatoire: false,
    valeurs: valeurs.map((n, i) => ({ id: `${id}v${i}`, nom: n, prix_supplement: 0 })),
    ...extra,
  })
  // ⚠️ « CUISSON » EST VOLONTAIREMENT EN PREMIER dans les données, et posé sur
  // un seul article : sans tri, c'est lui qui sortirait en tête. Une garde de
  // tri mesurée sur des données déjà triées ne mesure rien, et le harnais l'a
  // dit le 25/09 en laissant passer la suppression du `sort`.
  const tous = [
    G('g4', 1, 'Cuisson', ['Bien cuite'], { type: 'unique', obligatoire: true }),
    G('g1', 1, 'Sauces', ['Ketchup', 'Mayo']),
    G('g2', 2, 'Sauces', ['Ketchup', 'Mayo']),
    G('g3', 3, 'Sauces', ['Ketchup', 'Mayo', 'Truffe']),   // une version plus complète
  ]
  const biblio = bibliothequeDeGroupes(tous)

  v('les groupes se regroupent par nom', biblio.length === 2, String(biblio.length))
  // ⚠️ LE PLUS UTILISÉ EN PREMIER : c'est celui qu'il cherche.
  v('le plus utilisé arrive en tête, quel que soit l’ordre reçu',
    biblio[0].nom === 'Sauces', biblio.map(b => b.nom).join(','))
  v('il compte ses articles', biblio[0].articles.length === 3, String(biblio[0].articles.length))

  // 🔴 LA PLUS COMPLÈTE SERT DE MODÈLE : ajouter une valeur oubliée ne coûte
  // rien, retrouver une valeur silencieusement retirée coûte quarante
  // relectures.
  v('le modèle est la version la plus complète',
    biblio[0].valeurs.length === 3, String(biblio[0].valeurs.length))
  v('et les versions différentes sont comptées',
    biblio[0].versions === 2, String(biblio[0].versions))

  // ⚠️ L'ORDRE DES VALEURS NE FAIT PAS UNE VERSION DIFFÉRENTE.
  const memeContenu = bibliothequeDeGroupes([
    G('h1', 1, 'Sauces', ['Mayo', 'Ketchup']),
    G('h2', 2, 'Sauces', ['Ketchup', 'Mayo']),
  ])
  v('deux mêmes listes dans un autre ordre sont une seule version',
    memeContenu[0].versions === 1, String(memeContenu[0].versions))

  // ⚠️ LA CASSE NON PLUS : le commerçant lit un seul groupe.
  v('la casse ne fabrique pas deux groupes',
    bibliothequeDeGroupes([G('i1', 1, 'Sauces', ['x']), G('i2', 2, 'sauces', ['x'])]).length === 1)

  // ⚠️ ON RETROUVE « Cuisson » PAR SON NOM, pas par son rang : le rang dépend
  // du tri qu'on vient justement de mesurer, et une garde qui s'appuie sur ce
  // qu'elle mesure ne mesure plus rien.
  const cuisson = biblio.find(b => b.nom === 'Cuisson')
  v('le type et l’obligation viennent du modèle',
    cuisson?.type === 'unique' && cuisson?.obligatoire === true,
    `${cuisson?.type}/${cuisson?.obligatoire}`)
  v('un groupe sans nom est ignoré',
    bibliothequeDeGroupes([G('j1', 1, '   ', ['x'])]).length === 0)
  v('une liste vide ne casse rien', bibliothequeDeGroupes(null).length === 0)

  // ⚠️ ET LE MODÈLE EST UN VRAI GROUPE, réutilisable tel quel par la copie.
  const { groupes: copiees } = copiesDuGroupe(biblio[0].modele, [9])
  v('le modèle se copie comme n’importe quel groupe',
    copiees.length === 1 && copiees[0].nom === 'Sauces', JSON.stringify(copiees))

  // ─── LA PHRASE LUE SOUS CHAQUE GROUPE ───────────────────────────────────
  const ligne = phraseDeBibliotheque(biblio[0])
  v('la phrase dit sur combien d’articles il est posé', /sur 3 articles/.test(ligne), ligne)
  v('et combien d’options il porte', /3 options/.test(ligne), ligne)
  // 🔴 SANS CETTE MENTION, on applique une version que le commerçant n'a pas
  // choisie, sans qu'il le sache.
  v('elle prévient quand plusieurs versions existent',
    /2 versions différentes/.test(ligne), ligne)
  v('et elle se tait quand il n’y en a qu’une',
    !/versions différentes/.test(phraseDeBibliotheque(memeContenu[0])),
    phraseDeBibliotheque(memeContenu[0]))
  v('le singulier est respecté',
    /sur 1 article ·  ?1 option/.test(phraseDeBibliotheque({ articles: [1], valeurs: [{}] }))
      || /sur 1 article · 1 option/.test(phraseDeBibliotheque({ articles: [1], valeurs: [{}] })),
    phraseDeBibliotheque({ articles: [1], valeurs: [{}] }))
}

// ═══ 6) CE QUE LE COMMERÇANT LIT AVANT DE CLIQUER ═════════════════════════
{
  // ⚠️ IL DOIT LIRE COMBIEN D'ARTICLES IL TOUCHE. « Copier ? » ne dit rien.
  const simple = resumeDeCopie({ nomGroupe: 'Sauces', cibles: 3, conflits: 0 })
  v('le résumé dit le nombre d’articles', /3 articles/.test(simple), simple)
  v('et il nomme le groupe', /Sauces/.test(simple), simple)

  const avecConflit = resumeDeCopie({ nomGroupe: 'Sauces', cibles: 5, conflits: 2 })
  v('il annonce ce qui sera vraiment écrit', /3 articles/.test(avecConflit), avecConflit)
  v('il annonce ce qui est ignoré', /2 autres sont ignorés/.test(avecConflit), avecConflit)
  v('il promet de ne rien écraser', /rien n’y sera écrasé/.test(avecConflit), avecConflit)

  // ⚠️ RIEN À FAIRE DOIT SE LIRE COMME UN REFUS, pas comme un succès à zéro.
  const rien = resumeDeCopie({ nomGroupe: 'Sauces', cibles: 2, conflits: 2 })
  v('quand il ne reste rien, il le dit', /Rien à copier/.test(rien), rien)
  v('aucune cible : il demande d’en choisir une',
    /Choisis au moins un article/.test(resumeDeCopie({ nomGroupe: 'Sauces', cibles: 0 })))
  v('un article seul se dit au singulier',
    /1 article\b/.test(resumeDeCopie({ nomGroupe: 'Sauces', cibles: 1 })),
    resumeDeCopie({ nomGroupe: 'Sauces', cibles: 1 }))
}

// ═══ 7) LE BRANCHEMENT, CÔTÉ ÉCRAN ════════════════════════════════════════
//
// ⚠️ UNE RÈGLE JUSTE QUE PERSONNE N'APPELLE NE PROTÈGE RIEN. On découpe la
// section concernée plutôt que de chercher un mot dans tout le fichier : le
// tableau de bord fait quinze mille lignes, et un mot s'y trouve toujours
// quelque part.
{
  const config = sansProse(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))

  const iOpt = config.indexOf('function OptionsArticle(')
  const optionsArticle = iOpt >= 0 ? config.slice(iOpt, config.indexOf('function VariantesArticle(', iOpt)) : ''
  v('le panneau d’options a bien été retrouvé', optionsArticle.length > 1000, String(optionsArticle.length))

  // ⚠️ SANS LA LISTE DES ARTICLES, il n'a nulle part où copier.
  v('le panneau d’options reçoit le catalogue',
    /function OptionsArticle\(\{ articleId, toast, articles = \[\]/.test(optionsArticle))
  v('et les deux endroits qui l’affichent la lui passent',
    (config.match(/<OptionsArticle articleId=\{a\.id\} articles=\{articles\}/g) || []).length === 2,
    String((config.match(/<OptionsArticle articleId=\{a\.id\} articles=\{articles\}/g) || []).length))

  // 🔴 LES RÈGLES VIENNENT DU MODULE, ELLES NE SONT PAS RÉÉCRITES ICI. Une
  // copie de la règle dans l'écran, et le résumé lu par le commerçant finirait
  // par ne plus décrire ce qui s'écrit vraiment.
  for (const fn of ['ciblesDeCopie', 'conflitsDeGroupe', 'repartirCibles', 'resumeDeCopie']) {
    v(`l’écran appelle ${fn} au lieu de refaire la règle`,
      new RegExp(`${fn}\\(`).test(optionsArticle), fn)
  }

  // ─── L'ÉCRITURE EST PARTAGÉE, ET C'EST LA GARDE QUI COMPTE ───────────────
  //
  // 🔴 DEUX ÉCRANS ÉCRIVENT LA MÊME CHOSE : le panneau d'un article et la
  // bibliothèque. Recopiée, cette écriture finirait par écrire deux choses
  // différentes — exactement le défaut que tout ce chantier essaie d'éviter.
  const iEcr = config.indexOf('async function ecrireCopiesDeGroupe(')
  const ecriture = iEcr >= 0 ? config.slice(iEcr, config.indexOf('function BibliothequeGroupes(', iEcr)) : ''
  v('l’écriture des copies a bien été retrouvée', ecriture.length > 400, String(ecriture.length))
  v('elle vient du module', /copiesDuGroupe\(/.test(ecriture))

  // 🔴 LES VALEURS SE RATTACHENT PAR `article_id`, jamais par l'ordre de retour
  // de l'insertion : un jour où cet ordre change, les sauces de la margherita
  // atterrissent sur la quatre-fromages.
  v('les options copiées se rattachent par l’article, pas par l’ordre',
    /idParArticle\.get\(String\(g\.article_id\)\)/.test(ecriture))

  // ⚠️ UN ÉCHEC SUR LES VALEURS SE DIT : des groupes vides sont corrigeables,
  // un silence ne l'est pas.
  v('un échec sur les options copiées est annoncé',
    /n'ont pas pu être écrites/.test(ecriture))

  // ⚠️ ET LES DEUX ÉCRANS PASSENT VRAIMENT PAR ELLE. Compter les appels : si
  // l'un des deux se remettait à écrire pour son compte, cette garde le dirait.
  v('les deux écrans passent par l’écriture partagée',
    (config.match(/await ecrireCopiesDeGroupe\(/g) || []).length === 2,
    String((config.match(/await ecrireCopiesDeGroupe\(/g) || []).length))

  // ─── LA BIBLIOTHÈQUE ─────────────────────────────────────────────────────
  const iBib = config.indexOf('function BibliothequeGroupes(')
  const biblioEcran = iBib >= 0 ? config.slice(iBib, config.indexOf('function OptionsArticle(', iBib)) : ''
  v('la bibliothèque a bien été retrouvée', biblioEcran.length > 1000, String(biblioEcran.length))
  v('elle regroupe par nom avec le module', /bibliothequeDeGroupes\(/.test(biblioEcran))
  v('et elle dit ce que chaque groupe couvre', /phraseDeBibliotheque\(/.test(biblioEcran))
  // ⚠️ ELLE AUSSI ÉCARTE LES CONFLITS PAR LA RÈGLE, et pas à sa façon. Manque
  // vu par le harnais le 25/09 : la garde ne surveillait que le panneau d'un
  // article, donc muter le tri de la bibliothèque ne faisait rougir personne.
  for (const fn of ['conflitsDeGroupe', 'repartirCibles', 'resumeDeCopie']) {
    v(`la bibliothèque appelle ${fn} au lieu de refaire la règle`,
      new RegExp(`${fn}\\(`).test(biblioEcran), fn)
  }
  // 🔴 ELLE APPLIQUE LE MODÈLE, pas le premier groupe venu : sur douze
  // « Sauces » dont une plus complète, c'est la plus complète qui se pose.
  v('elle applique le modèle retenu par la règle',
    /ecrireCopiesDeGroupe\(entree\.modele,/.test(biblioEcran))
  // ⚠️ ELLE FAIT RELIRE APRÈS AVOIR ÉCRIT : sinon réappliquer le même groupe ne
  // verrait pas les conflits qu'on vient de créer, et doublerait les groupes.
  // Depuis le 25/09 c'est le PARENT qui relit — ses groupes servent aussi aux
  // vignettes — et elle se contente de lui nommer les articles touchés.
  v('elle fait relire le catalogue après avoir écrit',
    /onApplique\?\.\(aCopier\)/.test(biblioEcran))
  // ⚠️ ELLE NE S'AFFICHE QUE LÀ OÙ LES GROUPES EXISTENT : le détail et la
  // vitrine ont des variantes, un autre modèle entièrement.
  v('elle ne s’affiche pas chez qui n’a pas de groupes',
    /!variantesCategorie && articles\.length > 0 && \([\s\S]{0,120}<BibliothequeGroupes/.test(config))
  // ⚠️ RIEN À MONTRER, RIEN À DIRE : un bloc vide ferait douter de l'écran.
  v('elle se tait quand aucun groupe n’existe encore',
    /if \(biblio\.length === 0\) return null/.test(biblioEcran))

  // ⚠️ LE BOUTON NE S'AFFICHE PAS QUAND IL N'Y A NULLE PART OÙ COPIER.
  v('le bouton se tait quand le catalogue n’a pas d’autre article',
    /ciblesDeCopie\(articles, articleId\)\.length > 0 && \(/.test(optionsArticle))

  // ─── CE QUI EST ÉCRIT DOIT SE VOIR, SANS RECHARGER LA PAGE ───────────────
  //
  // 🔴 DÉFAUT TROUVÉ PAR ALEX (25/09) : « il faut rafraîchir la page pour voir
  // les groupes ajoutés, le message dit que c'est fait mais on ne le voit pas,
  // on pense que ça n'a pas fonctionné ». Les panneaux sont tous montés dès
  // l'affichage — le contenu d'un `<details>` vit même fermé — et chacun avait
  // chargé ses groupes une fois pour toutes. Un succès invisible fait recopier,
  // et le groupe se retrouve en double.
  v('un panneau relit ses groupes quand on a écrit chez lui',
    /useEffect\(\(\) => \{ fetchGroupes\(\) \}, \[articleId, version\]\)/.test(optionsArticle))
  v('et la copie nomme les articles touchés',
    /onCopie\?\.\(aCopier\)/.test(optionsArticle))
  // ⚠️ UN COMPTEUR PAR ARTICLE, PAS UN COMPTEUR GLOBAL : quarante panneaux qui
  // relisent pour trois articles touchés, ce sont trente-sept requêtes de trop.
  v('le compteur est tenu par article',
    /suite\[cle\] = \(suite\[cle\] \|\| 0\) \+ 1/.test(config))
  v('les deux endroits qui affichent un panneau lui passent son compteur',
    (config.match(/version=\{optionsTouchees\[String\(a\.id\)\] \|\| 0\}|versionOptions=\{optionsTouchees\[String\(a\.id\)\] \|\| 0\}/g) || []).length === 2,
    String((config.match(/version=\{optionsTouchees\[String\(a\.id\)\] \|\| 0\}|versionOptions=\{optionsTouchees\[String\(a\.id\)\] \|\| 0\}/g) || []).length))
  // 🔴 ET LE FRÈRE, DANS L'AUTRE SENS : copier depuis une pizza laissait la
  // bibliothèque annoncer « sur 3 articles » alors qu'il y en avait quinze.
  //
  // ⚠️ LA LECTURE A DÉMÉNAGÉ CHEZ LE PARENT (25/09) : elle sert maintenant aux
  // vignettes ET à la bibliothèque, et c'est le total des écritures qui la
  // relance. La garde suit la règle là où elle vit, elle ne reste pas sur son
  // ancienne adresse.
  v('les groupes du catalogue sont relus après chaque écriture',
    /\}, \[cleArticles, totalTouches\]\)/.test(config))

  // ─── LA DUPLICATION D'ARTICLE ────────────────────────────────────────────
  const iDup = config.indexOf('async function dupliquerArticle(')
  const dup = iDup >= 0 ? config.slice(iDup, iDup + 2600) : ''
  v('la duplication d’article a bien été retrouvée', dup.length > 800, String(dup.length))
  v('elle compose sa copie avec le module',
    /copieDArticle\(a, \{/.test(dup))
  // 🔴 SANS LES OPTIONS, DUPLIQUER NE SERT À RIEN : c'est la liste des
  // garnitures qu'on ne veut plus réécrire.
  v('elle emporte les groupes d’options de l’original',
    /from\('article_options_groupes'\)[\s\S]{0,200}eq\('article_id', a\.id\)/.test(dup))
  v('et leurs valeurs',
    /from\('article_options_valeurs'\)[\s\S]{0,120}insert\(/.test(dup))
  // ⚠️ UN ÉCHEC PARTIEL SE DIT : une pizza sans garnitures se vendrait nue.
  v('un échec partiel sur les options est annoncé',
    /optionsRatees/.test(dup) && /n'a pas pu être copiée/.test(dup))
  // ─── LA FENÊTRE DE VÉRIFICATION (Alex, 25/09) ────────────────────────────
  //
  // 🔴 « S'il est informé, c'est très bien. » Un toast de trois secondes ne
  // l'informe pas : il disparaît pendant qu'il regarde sa liste.
  const dupInfo = iDup >= 0 ? config.slice(iDup, iDup + 5000) : ''
  v('une fenêtre annonce ce qu’il reste à vérifier',
    /confirme\(confirmationInfo\(\{/.test(dupInfo))
  // ⚠️ ELLE DIT QUE LA COPIE EST INDISPONIBLE, sinon le commerçant la cherche
  // sur sa fiche publique et ne la trouve pas. C'était dans un toast avant la
  // fenêtre du 25/09 : la garde visait le toast, elle vise maintenant l'écran
  // qui porte vraiment l'information.
  v('la fenêtre dit que la copie est indisponible',
    /est créé, en indisponible/.test(dupInfo), dupInfo.slice(-200))
  // ⚠️ ET LE NOMBRE DE VARIANTES CRÉÉES ALIMENTE LA LISTE : c'est lui qui
  // déclenche la ligne « à stock zéro », le piège le plus cher de la copie.
  v('le compte des variantes alimente la liste',
    /variantes: nbVariantes \|\| 0,/.test(dupInfo))
  v('et sa liste vient de la règle',
    /aVerifierApresCopie\(\{/.test(dupInfo) && /lignesDeFenetre\(points\)/.test(dupInfo))
  // 🔴 ET ELLE NE SE LÈVE PAS QUINZE FOIS (Alex, 25/09). Sans ce garde, un
  // commerçant qui duplique quinze articles ferme quinze fenêtres identiques,
  // et la seizième — celle qui compte — se ferme au réflexe.
  v('la fenêtre ne s’ouvre que si elle a quelque chose d’invisible à dire',
    /if \(!doitOuvrirFenetre\(points, rappelCopieVu\(\)\)\) \{/.test(dupInfo))
  v('sinon un message court suffit',
    /toast\(resumeCourt\(payload\.nom, points\)\)/.test(dupInfo))
  v('et la fenêtre vue se retient',
    /marquerRappelCopieVu\(\)/.test(dupInfo))
  // ⚠️ PAR SESSION, PAS POUR TOUJOURS : six mois plus tard, la règle des
  // stocks à zéro aura été oubliée.
  v('elle se retient pour la session, pas pour toujours',
    /sessionStorage\.setItem\(CLE_RAPPEL_COPIE/.test(config)
      && !/localStorage\.setItem\(CLE_RAPPEL_COPIE/.test(config))
  // ⚠️ LIRE LE STOCKAGE PEUT LEVER en navigation privée : un rappel qu'on ne
  // peut pas mémoriser doit s'afficher, jamais casser l'écran.
  v('et son stockage ne peut pas casser l’écran',
    /try \{ return sessionStorage\.getItem\(CLE_RAPPEL_COPIE\) === '1' \} catch \{ return false \}/.test(config))
  // 🔴 ON COMPTE AVANT D'ANNONCER : une ligne sur les photos chez quelqu'un
  // qui n'en a pas est une alarme qui sonne pour rien.
  v('les photos sont comptées avant d’être annoncées',
    /from\('article_photos'\)[\s\S]{0,140}count: 'exact'/.test(dupInfo))
  v('les stocks par jour aussi',
    /from\('article_stock_jour'\)[\s\S]{0,140}count: 'exact'/.test(dupInfo))
  // ⚠️ LES VARIANTES SE COMPTENT SUR LA COPIE, pas sur l'original : c'est ce
  // qui a vraiment été créé qu'on annonce.
  v('et les variantes se comptent sur la copie',
    /article_variantes'\)[\s\S]{0,160}eq\('article_id', cree\.id\)/.test(dupInfo))

  // 🔴 ET LES VARIANTES SUIVENT, SINON UNE BOUTIQUE DUPLIQUE UNE FICHE NUE.
  // C'est le trou du 25/09 : le détail et la vitrine n'ont pas de groupes
  // d'options, ils ont une matrice taille/couleur.
  const dupLong = iDup >= 0 ? config.slice(iDup, iDup + 4000) : ''
  v('la duplication emporte les combinaisons de variantes',
    /gere_variantes[\s\S]{0,300}from\('article_variantes'\)[\s\S]{0,200}copiesDeVariantes\(/.test(dupLong),
    'un article a variantes serait duplique sans ses tailles')

  v('le bouton de duplication est sur la carte d’article',
    /onDupliquer\(a\)/.test(config) && /onDupliquer=\{dupliquerArticle\}/.test(config))

  // ─── LES VARIANTES, CHEZ QUI N'A PAS DE GROUPES ──────────────────────────
  //
  // 🔴 « Faciliter la création des catalogues s'adresse à TOUS les
  // commerçants » (Alex, 25/09). Le détail et la vitrine n'ont pas de groupes
  // d'options : sans ce geste-là, la moitié des métiers restait à la main.
  const iVarC = config.indexOf('async function copierVariantes(')
  const copVar = iVarC >= 0 ? config.slice(iVarC, iVarC + 2000) : ''
  v('la copie de variantes a bien été retrouvée', copVar.length > 500, String(copVar.length))
  v('elle écarte les articles déjà équipés', /conflitsDeVariantes\(ciblesVar, articles\)/.test(copVar))
  v('elle compose ses axes avec le module', /axesDeLArticle\(/.test(copVar))
  v('et ses combinaisons aussi', /copiesDeVariantes\(variantes, id\)/.test(copVar))
  // ⚠️ UN ÉCHEC PARTIEL SE DIT : des axes posés sans combinaisons laissent un
  // article à moitié équipé, et le commerçant doit le savoir.
  v('un échec partiel est annoncé', /n'ont pas pu être créées/.test(copVar))
  // ⚠️ LE STOCK À ZÉRO SE DIT AUSSI, sinon il vend des tailles qui n'existent pas.
  v('le message annonce le stock à zéro', /à stock zéro/.test(copVar))
  v('l’écran des variantes reçoit le catalogue',
    /function VariantesArticle\(\{ article, toast, articles = \[\] \}\)/.test(config))

  // ─── LA DUPLICATION D'UNE PRESTATION ─────────────────────────────────────
  const iDupP = config.indexOf('async function dupliquerPrestation(')
  const dupP = iDupP >= 0 ? config.slice(iDupP, iDupP + 2000) : ''
  v('la duplication de prestation a bien été retrouvée', dupP.length > 400, String(dupP.length))
  v('elle compose sa copie avec le module', /copieDePrestation\(p, \{/.test(dupP))
  // 🔴 SANS LES PRATICIENS, LA COPIE EST PROPOSÉE PAR TOUT LE MONDE : aucun
  // praticien coché veut dire « tous », et la cliente atterrit chez quelqu'un
  // qui ne fait pas cette coupe.
  v('les praticiens suivent la copie',
    /junctionMap\[p\.id\][\s\S]{0,400}rdv_prestation_praticiens[\s\S]{0,60}insert\(/.test(dupP))
  v('un échec sur les praticiens est annoncé',
    /n'ont pas suivi/.test(dupP))
  // ⚠️ ELLE NAÎT INDISPONIBLE, et le message le dit.
  v('le message dit qu’elle est indisponible', /en indisponible/.test(dupP))
  // ⚠️ ET LE BOUTON NE S'AFFICHE PAS SUR UNE JOINTURE DE TABLES.
  v('le bouton se tait sur une jointure de tables',
    /!estJointure\(p\) && \([\s\S]{0,200}dupliquerPrestation\(p\)/.test(config))
  v('et les deux endroits qui l’affichent le lui passent',
    (config.match(/<VariantesArticle article=\{a\} articles=\{articles\}/g) || []).length === 2,
    String((config.match(/<VariantesArticle article=\{a\} articles=\{articles\}/g) || []).length))
}

console.log(`\nCopier dans le catalogue : ${ok} vérifications`)

if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
