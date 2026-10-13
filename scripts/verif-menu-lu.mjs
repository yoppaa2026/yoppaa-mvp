// BANC : LE MENU LU PAR L'IA (13/10).
//
// La lecture elle-même passe par Claude (réseau, clé) : le banc ne l'appelle
// pas. Il EXÉCUTE ce qui décide de tout le reste, `normaliserLecture`, sur des
// réponses simulées comme le modèle peut en rendre (prix belges, tailles,
// formules, doublons, prix absurdes, rien du tout), puis vise la route : la
// garde, le quota, l'admin, rien de gardé.
//
//   npm run verif:menu

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  lirePrix, cleNom, normaliserLecture, documentsValides, MENU_MAX, PRIX_MAX,
  TAILLE_MAX_BASE64, OUTIL_CATALOGUE, CONSIGNE_LECTURE, bornesLues, SUJETS_INFOS,
} from '../lib/menu-lu.js'
import { IA_MENU_CONFIG, getIaMenuConfig } from '../lib/plans.js'

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const code = (f) => sansProse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n'))

// ═══ 1) LES PRIX ════════════════════════════════════════════════════════════
v('🔴 la virgule belge : « 12,50 » vaut 12,5', lirePrix('12,50') === 12.5)
v('le symbole et les espaces ne gênent pas', lirePrix('12.50 €') === 12.5 && lirePrix('€ 8') === 8 && lirePrix(' 9,9 EUR ') === 9.9)
v('un nombre reste un nombre, arrondi au centime', lirePrix(7) === 7 && lirePrix(3.456) === 3.46)
v('⚠️ « 1.250,00 » : le point est le millier', lirePrix('1.250,00') === 1250)
v('🔴 ce qui n’est pas un prix rend null', lirePrix('prix du jour') === null && lirePrix('') === null && lirePrix(null) === null && lirePrix(NaN) === null)
v('les noms se comparent sans casse ni accents', cleNom('Pâtes Carbonara ') === cleNom('pates  CARBONARA'))

// ═══ 2) LA LECTURE REMISE EN ORDRE ══════════════════════════════════════════
const brut = {
  lisible: true,
  categories: [
    { nom: 'Pizzas', articles: [
      { nom: 'Margherita', description: 'tomate, mozzarella', prix: null, tailles: [{ nom: 'Grande 33 cm', prix: 13.5 }, { nom: 'Petite 26 cm', prix: 9.5 }] },
      { nom: 'Calzone', prix: '12,50', options: [{ nom: 'Cuisson', obligatoire: false, valeurs: [{ nom: 'Bien cuite' }] }] },
      { nom: 'Pizza du chef', prix: null, doute: 'prix coupé sur la photo' },
      { nom: 'Quatre fromages', prix: 1250 },
      { nom: '   ' },
    ] },
    { nom: 'Menus', articles: [
      { nom: 'Menu burger', prix: 11, options: [
        { nom: 'Boisson', obligatoire: true, valeurs: [{ nom: 'Coca' }, { nom: 'Fanta' }, { nom: 'coca' }] },
        { nom: 'Sauce', plusieurs: true, valeurs: [{ nom: 'Andalouse', supplement: '0,50' }, { nom: 'Samouraï', supplement: -2 }] },
      ] },
    ] },
    { nom: 'Boissons', articles: [{ nom: 'Coca', prix: 2.5 }, { nom: 'Eau', tailles: [{ nom: '50 cl', prix: 2 }] }] },
    { nom: 'pizzas', articles: [{ nom: 'Hawaï', prix: 11 }] },
    { nom: 'Vide', articles: [] },
  ],
  supplements_communs: [{ nom: 'Suppléments', pour: 'Pizzas', valeurs: [{ nom: 'Fromage', supplement: 1 }, { nom: 'Jambon', supplement: 1.5 }] }],
  questions: [{ sujet: 'Pizza du chef', question: 'Quel est le prix de la Pizza du chef ?', propositions: ['12 €', '14 €'] }, { question: '' }],
}
const p = normaliserLecture(brut)
const art = (nom) => p.categories.flatMap(c => c.articles).find(a => a.nom === nom)

v('🔴 les catégories de même nom se fusionnent (« Pizzas » et « pizzas »), les vides disparaissent',
  p.categories.map(c => c.nom).join('|') === 'Pizzas|Menus|Boissons', p.categories.map(c => c.nom).join('|'))
v('un article sans nom n’existe pas', !p.categories.flatMap(c => c.articles).some(a => !a.nom))
const marg = art('Margherita')
v('🔴 les tailles : le prix est celui de la PLUS PETITE, et un choix obligatoire « Taille » porte les suppléments',
  marg?.prix === 9.5 && marg.groupes[0]?.nom === 'Taille' && marg.groupes[0].obligatoire === true && marg.groupes[0].type === 'unique'
  && JSON.stringify(marg.groupes[0].valeurs) === JSON.stringify([{ nom: 'Petite 26 cm', supplement: 0 }, { nom: 'Grande 33 cm', supplement: 4 }]), JSON.stringify(marg))
v('une seule taille lisible n’est pas un choix : elle donne le prix', art('Eau')?.prix === 2 && art('Eau').groupes.length === 0)
v('le prix belge en texte devient un nombre', art('Calzone')?.prix === 12.5)
v('🔴 un prix introuvable reste VIDE et se signale (jamais 0 € inventé)',
  art('Pizza du chef')?.prix === null && art('Pizza du chef').doutes.some(d => /introuvable/.test(d)) && art('Pizza du chef').doutes.some(d => /coupé/.test(d)))
v(`🔴 un prix au-delà de ${PRIX_MAX} € se signale (« 1250 » pour « 12,50 »)`,
  art('Quatre fromages')?.prix === 1250 && art('Quatre fromages').doutes.some(d => /inhabituel/.test(d)))
const menu = art('Menu burger')
v('🔴 une formule est UN article avec ses choix (boisson obligatoire)',
  menu?.prix === 11 && menu.groupes[0]?.nom === 'Boisson' && menu.groupes[0].obligatoire === true && menu.groupes[0].valeurs.length === 2, JSON.stringify(menu?.groupes))
v('un choix « plusieurs » devient le type multiple, son supplément belge un nombre',
  menu?.groupes[1]?.type === 'multiple' && menu.groupes[1].valeurs[0].supplement === 0.5)
v('🔴 un supplément négatif est ramené à 0 ET signalé', menu?.groupes[1]?.valeurs[1]?.supplement === 0 && menu.doutes.some(d => /Samouraï/.test(d)))
v('le « Coca » choix du menu n’est pas un article : la boisson n’a pas de doute de doublon',
  art('Coca')?.doutes.length === 0 && p.categories.find(c => c.nom === 'Boissons').articles.length === 2)
{
  const d = normaliserLecture({ lisible: true, categories: [{ nom: 'A', articles: [{ nom: 'Frites', prix: 3 }] }, { nom: 'B', articles: [{ nom: 'frites', prix: 3.5 }] }] })
  // `?.` : une garde qui lit une case absente doit ROUGIR, pas planter.
  v('🔴 deux articles de même nom : le second porte « doublon ? », et il reste',
    d.categories[1]?.articles[0]?.doutes?.some(x => /doublon/.test(x)) === true && d.resume.articles === 2, JSON.stringify(d.resume))
}
v('les suppléments communs gardent leur cible, sans être appliqués d’office',
  p.supplements[0]?.pour === 'Pizzas' && p.supplements[0].valeurs.length === 2 && !art('Margherita').groupes.some(g => g.nom === 'Suppléments'))
v('les questions vides tombent, les propositions restent', p.questions.length === 1 && p.questions[0].propositions.length === 2)
v('🔴 chaque article porte une clé unique pour l’écran de relecture',
  new Set(p.categories.flatMap(c => c.articles.map(a => a.cle))).size === p.resume.articles)
// 5 pizzas (Hawaï rejoint « Pizzas »), 1 menu, 2 boissons ; 3 avec un doute.
v('le résumé compte les articles et ceux qui ont un doute', p.resume.articles === 8 && p.resume.doutes === 3, JSON.stringify(p.resume))

// ═══ 2 bis) LE FLYER DE LA PIZZERIA (13/10) : CHOIX, TAILLES, COMPRIS ══════
{
  const f = normaliserLecture({
    lisible: true,
    categories: [{ nom: 'Pizzas', articles: [
      { nom: 'Margherita', tailles: [{ nom: 'M', prix: 9 }, { nom: 'L', prix: 12 }, { nom: 'XL', prix: 15 }], options: [
        { nom: 'Suppléments', plusieurs: true, valeurs: [
          { nom: 'Jambon', prix_par_taille: [{ taille: 'm', prix: 1.5 }, { taille: 'L', prix: '2,50' }, { taille: 'XL', prix: 3.5 }] },
          { nom: 'Olives', supplement: 1, prix_par_taille: [{ taille: 'XXL', prix: 9 }] },
        ] },
      ] },
      { nom: 'Calzone', prix: 12, options: [
        { nom: 'Ingrédients compris', choix_min: 1, choix_max: 3, valeurs: [{ nom: 'Jambon' }, { nom: 'Champignons' }, { nom: 'Olives' }, { nom: 'Oignons' }] },
        { nom: 'Ingrédients en plus', plusieurs: true, valeurs: [{ nom: 'Jambon', supplement: 1 }] },
        { nom: 'Boisson', obligatoire: true, choix_max: 1, valeurs: [{ nom: 'Coca' }, { nom: 'Eau' }] },
        { nom: 'Sauce', choix_min: 4, choix_max: 2, valeurs: [{ nom: 'Ail' }] },
      ] },
      { nom: 'Focaccia', prix: 6, options: [{ nom: 'Garniture', valeurs: [{ nom: 'Romarin', prix_par_taille: [{ taille: 'L', prix: 1 }] }] }] },
    ] }],
    supplements_communs: [{ nom: 'Charcuterie', pour: 'Pizzas', plusieurs: true, valeurs: [{ nom: 'Salami', prix_par_taille: [{ taille: 'M', prix: 1.5 }, { taille: 'L', prix: 2 }] }] }],
    autres_infos: [{ sujet: 'livraison', texte: 'Livraison gratuite dès 25 €' }, { sujet: 'n_importe_quoi', texte: 'Fermé le lundi' }, { sujet: 'promotion', texte: '   ' }],
  })
  const a = (nom) => f.categories[0]?.articles.find(x => x.nom === nom)
  const supp = a('Margherita')?.groupes.find(g => g.nom === 'Suppléments')
  const jambon = supp?.valeurs.find(x => x.nom === 'Jambon')
  v('🔴 un supplément au prix par taille se rattache aux tailles de l’article (nom écrit comme la taille)',
    JSON.stringify(jambon?.parTaille) === JSON.stringify([{ taille: 'M', prix: 1.5 }, { taille: 'L', prix: 2.5 }, { taille: 'XL', prix: 3.5 }]), JSON.stringify(jambon))
  v('sans supplément écrit, le prix de la plus petite taille sert de repli', jambon?.supplement === 1.5)
  const olives = supp?.valeurs.find(x => x.nom === 'Olives')
  v('🔴 une taille inconnue de l’article est retirée ET signalée',
    olives && !('parTaille' in olives) && olives.supplement === 1 && a('Margherita').doutes.some(d => /XXL/.test(d)), JSON.stringify(olives))
  v('🔴 un prix par taille sur un article SANS tailles est retiré et signalé',
    !('parTaille' in (a('Focaccia')?.groupes[0]?.valeurs[0] || {})) && a('Focaccia').doutes.some(d => /pas de tailles/.test(d)))
  v('la marque de travail des tailles ne sort pas', !a('Margherita').groupes.some(g => 'estTaille' in g))

  const cal = a('Calzone')
  const compris = cal?.groupes.find(g => g.nom === 'Ingrédients compris')
  v('🔴 « entre 1 et 3 » : un choix multiple borné, obligatoire (au moins 1)',
    compris?.type === 'multiple' && compris.choix_min === 1 && compris.choix_max === 3 && compris.obligatoire === true, JSON.stringify(compris))
  v('« compris + en plus » : deux groupes distincts gardés',
    cal?.groupes.some(g => g.nom === 'Ingrédients en plus' && g.type === 'multiple' && g.valeurs[0].supplement === 1))
  const boisson = cal?.groupes.find(g => g.nom === 'Boisson')
  v('au plus 1 = un choix unique, sans bornes écrites (comme le formulaire)',
    boisson?.type === 'unique' && boisson.choix_min === null && boisson.choix_max === null && boisson.obligatoire === true)
  const sauce = cal?.groupes.find(g => g.nom === 'Sauce')
  v('🔴 des bornes impossibles (au moins 4, au plus 2) ne sont pas devinées : sans limite, et signalé',
    sauce?.choix_min === null && sauce.choix_max === null && cal.doutes.some(d => /Nombre de choix illisible pour « Sauce »/.test(d)), JSON.stringify(sauce))
  v('les bornes se lisent comme la base les accepte',
    JSON.stringify(bornesLues(0, 3)) === JSON.stringify({ min: null, max: 3 }) && bornesLues(1, 31) === null && bornesLues(2.5, 3) === null && bornesLues('x', 2) === null
    && JSON.stringify(bornesLues(undefined, undefined)) === JSON.stringify({ min: null, max: null }))

  v('les suppléments communs gardent leurs prix par taille, par NOM (rattachés à la création)',
    JSON.stringify(f.supplements[0]?.valeurs[0]?.parTaille) === JSON.stringify([{ taille: 'M', prix: 1.5 }, { taille: 'L', prix: 2 }]) && f.supplements[0].type === 'multiple')
  v('« trouvé aussi sur ton menu » : recopié, sujet inconnu = autre, vide écarté',
    f.infos.length === 2 && f.infos[0].sujet === 'livraison' && f.infos[1].sujet === 'autre' && SUJETS_INFOS.includes('fidelite'), JSON.stringify(f.infos))
  v('la consigne dit les deux groupes, le nombre de choix et les prix par taille',
    /DEUX options, « Ingrédients compris »/.test(CONSIGNE_LECTURE) && /choix_min = 3 et choix_max = 3/.test(CONSIGNE_LECTURE) && /prix_par_taille/.test(CONSIGNE_LECTURE))
  v('🔴 la consigne interdit de recopier un numéro de téléphone', /Ne recopie jamais un numéro de téléphone/.test(CONSIGNE_LECTURE))
  const props = OUTIL_CATALOGUE.input_schema.properties
  const groupeOutil = props.categories.items.properties.articles.items.properties.options.items
  v('l’outil demande le nombre de choix et les prix par taille',
    groupeOutil.properties.choix_max?.type === 'integer' && !!groupeOutil.properties.valeurs.items.properties.prix_par_taille
    && !!props.supplements_communs.items.properties.prix_par_taille === false && !!props.supplements_communs.items.properties.valeurs && !!props.autres_infos)
}

// ═══ 3) RIEN, OU TROP ═══════════════════════════════════════════════════════
v('🔴 « lisible » sans un seul article : ce n’est pas lisible', normaliserLecture({ lisible: true, categories: [] }).lisible === false)
v('une réponse vide ou absurde ne plante pas', normaliserLecture(null).lisible === false && normaliserLecture({ categories: 'x' }).resume.articles === 0)
v('le modèle qui dit « illisible » est cru', normaliserLecture({ lisible: false, categories: [{ nom: 'A', articles: [{ nom: 'B', prix: 1 }] }] }).lisible === false)
{
  const enorme = { lisible: true, categories: Array.from({ length: 50 }, (_, i) => ({ nom: `C${i}`, articles: Array.from({ length: 20 }, (_, j) => ({ nom: `A${i}-${j}`, prix: 2 })) })) }
  const r = normaliserLecture(enorme)
  v(`🔴 au plus ${MENU_MAX.articles} articles et ${MENU_MAX.categories} catégories, et on dit que c’est coupé`,
    r.resume.articles === MENU_MAX.articles && r.categories.length <= MENU_MAX.categories && r.resume.tronque === true, JSON.stringify(r.resume))
}
v('les textes trop longs sont coupés', normaliserLecture({ lisible: true, categories: [{ nom: 'A', articles: [{ nom: 'x'.repeat(500), prix: 1 }] }] }).categories[0].articles[0].nom.length === MENU_MAX.nom)

// ═══ 4) LES FICHIERS REÇUS ══════════════════════════════════════════════════
v('aucun fichier : refusé', documentsValides([]).ok === false)
v(`plus de ${MENU_MAX.pages} pages : refusé`, documentsValides(Array.from({ length: MENU_MAX.pages + 1 }, () => ({ type: 'image/jpeg', data: 'QQ==' }))).ok === false)
v('🔴 un type inconnu (ex. HTML) : refusé', documentsValides([{ type: 'text/html', data: 'QQ==' }]).ok === false)
v('🔴 un contenu qui n’est pas du base64 : refusé', documentsValides([{ type: 'image/png', data: 'pas du base64 !' }]).ok === false)
v('🔴 trop lourd au total : refusé au serveur', documentsValides([{ type: 'application/pdf', data: 'A'.repeat(TAILLE_MAX_BASE64 + 4) }]).ok === false)
v('une photo et un PDF valables passent', documentsValides([{ type: 'image/jpeg', data: 'QUJD' }, { type: 'application/pdf', data: 'QUJD' }]).ok === true)

// ═══ 5) CE QU'ON DEMANDE AU MODÈLE ══════════════════════════════════════════
v('le modèle remplit un outil typé, pas du texte libre', OUTIL_CATALOGUE.name === 'proposer_catalogue' && OUTIL_CATALOGUE.input_schema.required.includes('categories'))
v('🔴 la consigne interdit d’inventer, et dit la virgule belge',
  /N'invente jamais/.test(CONSIGNE_LECTURE) && /virgule est le séparateur décimal/.test(CONSIGNE_LECTURE) && /formule ou un menu/.test(CONSIGNE_LECTURE))
v('le quota par formule existe et monte avec la formule',
  getIaMenuConfig('exister').quota_mois === IA_MENU_CONFIG.exister.quota_mois
  && IA_MENU_CONFIG.exister.quota_mois < IA_MENU_CONFIG.communiquer.quota_mois && IA_MENU_CONFIG.communiquer.quota_mois < IA_MENU_CONFIG.vendre.quota_mois
  && getIaMenuConfig('inconnu').quota_mois === IA_MENU_CONFIG.exister.quota_mois)

// ═══ 6) LA ROUTE ════════════════════════════════════════════════════════════
{
  const route = code('app/api/ia/menu/route.js')
  v('🔴 le commerçant OU l’admin vérifié, personne d’autre (garde commune)',
    /const garde = await gardeCommercant\(request, admin, commercantId\)/.test(route) && /if \(refusGarde\) return refusGarde/.test(route)
    && route.indexOf('gardeCommercant(request') < route.indexOf('lireDocuments('))
  v('🔴 l’admin se reconnaît APRÈS la garde, par la fiche', /const parAdmin = com\.auth_user_id !== garde\.user\.id/.test(route))
  v('🔴 l’admin ne vide pas le quota du commerçant, et le sien se journalise à part',
    /if \(!parAdmin && \(count \|\| 0\) >= quotaMois\)/.test(route) && /type: parAdmin \? 'menu_admin' : 'menu'/.test(route)
    && /\.eq\('type', 'menu'\)/.test(route))
  v('🔴 un compte de quota illisible REFUSE (il ne vaut pas zéro)', /if \(errCount\) return NextResponse\.json\(/.test(route))
  v('l’alimentaire d’abord', /if \(!isAlimentaire\(com\)\)/.test(route))
  v('🔴 les fichiers sont contrôlés au serveur avant toute lecture',
    /const docs = documentsValides\(body\?\.documents\)\s*if \(!docs\.ok\) return NextResponse\.json\(\{ ok: false, error: docs\.error \}, \{ status: 400 \}\)/.test(route)
    && route.indexOf('documentsValides(') < route.indexOf('lireDocuments(') && /documents: docs\.documents,/.test(route))
  v('le rate-limit et le cap global restent', /checkLimit\(aiLimiter, `ia-menu:\$\{commercantId\}`\)/.test(route) && /IA_QUOTA_GLOBAL_MOIS/.test(route))
  v('🔴 RIEN N’EST GARDÉ : aucun envoi vers le stockage, aucune écriture hors du journal',
    !/\.storage\b/.test(route) && (route.match(/\.insert\(/g) || []).length === 1 && /from\('ia_generations'\)\.insert\(/.test(route))
  v('🔴 la route ne crée aucun article : elle propose', !/from\('articles'\)/.test(route) && /proposition/.test(route))
  v('la réponse passe par la remise en ordre', /const proposition = normaliserLecture\(out\.entree\)/.test(route))
}

console.log(`\nMenu lu par l'IA : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
