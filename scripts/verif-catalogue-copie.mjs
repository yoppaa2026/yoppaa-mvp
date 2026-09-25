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
  CHAMPS_COPIES, nomDeLaCopie, copieDArticle, ciblesDeCopie,
  conflitsDeGroupe, copiesDuGroupe, resumeDeCopie, repartirCibles,
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
    /function OptionsArticle\(\{ articleId, toast, articles = \[\] \}\)/.test(optionsArticle))
  v('et les deux endroits qui l’affichent la lui passent',
    (config.match(/<OptionsArticle articleId=\{a\.id\} articles=\{articles\}/g) || []).length === 2,
    String((config.match(/<OptionsArticle articleId=\{a\.id\} articles=\{articles\}/g) || []).length))

  // 🔴 LES RÈGLES VIENNENT DU MODULE, ELLES NE SONT PAS RÉÉCRITES ICI. Une
  // copie de la règle dans l'écran, et le résumé lu par le commerçant finirait
  // par ne plus décrire ce qui s'écrit vraiment.
  for (const fn of ['ciblesDeCopie', 'conflitsDeGroupe', 'copiesDuGroupe', 'repartirCibles', 'resumeDeCopie']) {
    v(`l’écran appelle ${fn} au lieu de refaire la règle`,
      new RegExp(`${fn}\\(`).test(optionsArticle), fn)
  }

  // 🔴 LES VALEURS SE RATTACHENT PAR `article_id`, jamais par l'ordre de retour
  // de l'insertion : un jour où cet ordre change, les sauces de la margherita
  // atterrissent sur la quatre-fromages.
  v('les options copiées se rattachent par l’article, pas par l’ordre',
    /idParArticle\.get\(String\(g\.article_id\)\)/.test(optionsArticle))

  // ⚠️ UN ÉCHEC SUR LES VALEURS SE DIT : des groupes vides sont corrigeables,
  // un silence ne l'est pas.
  v('un échec sur les options copiées est annoncé',
    /n'ont pas pu être écrites/.test(optionsArticle))

  // ⚠️ LE BOUTON NE S'AFFICHE PAS QUAND IL N'Y A NULLE PART OÙ COPIER.
  v('le bouton se tait quand le catalogue n’a pas d’autre article',
    /ciblesDeCopie\(articles, articleId\)\.length > 0 && \(/.test(optionsArticle))

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
  // ⚠️ LE MESSAGE DIT QU'ELLE EST INDISPONIBLE, sinon le commerçant la cherche
  // sur sa fiche publique et ne la trouve pas.
  v('le message dit que la copie est indisponible',
    /en indisponible/.test(dup), dup.slice(-160))

  v('le bouton de duplication est sur la carte d’article',
    /onDupliquer\(a\)/.test(config) && /onDupliquer=\{dupliquerArticle\}/.test(config))
}

console.log(`\nCopier dans le catalogue : ${ok} vérifications`)

if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
