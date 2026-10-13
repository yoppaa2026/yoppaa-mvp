// BANC : LA RELECTURE ET LA CRÉATION DU MENU LU (13/10, sessions 2 et 3).
//
// Il EXÉCUTE la relecture (`lib/menu-relecture.js`), le plan de création et
// l'écriture (`lib/menu-creation.js`) sur une FAUSSE BASE qui note chaque
// insertion et peut refuser à la demande. Puis il vise l'écran : la fenêtre
// passe par ces modules, et le bouton n'existe qu'en alimentaire.
//
//   npm run verif:menu-creation

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { normaliserLecture, MENU_MAX } from '../lib/menu-lu.js'
import {
  pagesAcceptees, etatRelecture, prixDeSaisie, categoriesDeRelecture, articleDeQuestion,
  libelleValeur, resumeGroupe, bilanRelecture, phraseDuBilan, OU_REGLER_INFO,
} from '../lib/menu-relecture.js'
import { demandeLeStock, reglagesCommuns, planCreation, ecrireCreation, phraseDeCreation } from '../lib/menu-creation.js'

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const code = (f) => sansProse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n'))

const PIZZERIA = { id: 'c1', categorie: 'alimentaire', type: 'pizzeria', horizon_commande: 2, tva_taux_defaut: 6 }
const BOULANGERIE = { id: 'c2', categorie: 'alimentaire', type: 'boulangerie', horizon_commande: 1, tva_taux_defaut: null }

// ═══ 1) L'ENVOI ═════════════════════════════════════════════════════════════
{
  const f = (name, type) => ({ name, type })
  const r = pagesAcceptees([f('a.jpg', 'image/jpeg'), f('b.html', 'text/html'), f('c.pdf', 'application/pdf')])
  v('un type inconnu est écarté et nommé', r.pages.length === 2 && r.refus.length === 1 && /b\.html/.test(r.refus[0]))
  const plein = pagesAcceptees([f('x.jpg', 'image/jpeg'), f('y.jpg', 'image/jpeg')], MENU_MAX.pages - 1)
  v(`🔴 au plus ${MENU_MAX.pages} pages, déjà là comprises`, plein.pages.length === 1 && plein.refus.some(x => /au maximum/.test(x)))
}

// ═══ 2) LA RELECTURE ════════════════════════════════════════════════════════
const proposition = normaliserLecture({
  lisible: true,
  categories: [
    { nom: 'Pizzas', articles: [
      { nom: 'Margherita', tailles: [{ nom: 'M', prix: 9 }, { nom: 'L', prix: 12 }], options: [
        { nom: 'Suppléments', plusieurs: true, valeurs: [{ nom: 'Jambon', prix_par_taille: [{ taille: 'M', prix: 1.5 }, { taille: 'L', prix: 2.5 }] }] },
      ] },
      { nom: 'Calzone', prix: 12, options: [{ nom: 'Ingrédients compris', choix_min: 1, choix_max: 3, valeurs: [{ nom: 'Jambon' }, { nom: 'Olives' }] }] },
      { nom: 'Pizza du chef', prix: null, doute: 'prix coupé' },
    ] },
    { nom: 'boissons', articles: [{ nom: 'Coca', prix: '2,50' }] },
  ],
  supplements_communs: [{ nom: 'Charcuterie', pour: 'Pizzas', plusieurs: true, valeurs: [{ nom: 'Salami', prix_par_taille: [{ taille: 'M', prix: 1 }, { taille: 'L', prix: 2 }, { taille: 'XXL', prix: 9 }] }] }],
  questions: [{ sujet: 'Pizza du chef', question: 'Quel prix ?', propositions: ['12 €'] }],
  autres_infos: [{ sujet: 'livraison', texte: 'Livraison dès 20 €' }],
})
const etat0 = etatRelecture(proposition, ['coca '])
const art = (e, nom) => e.articles.find(a => a.nom === nom)
v('🔴 un article déjà au catalogue arrive DÉCOCHÉ et marqué', art(etat0, 'Coca')?.deja === true && art(etat0, 'Coca').garder === false)
v('les autres arrivent cochés', art(etat0, 'Margherita')?.garder === true && art(etat0, 'Calzone').garder === true)
v('un prix absent reste vide (jamais 0 €)', art(etat0, 'Pizza du chef')?.prixTexte === '')
v('le prix s’écrit à la belge', art(etat0, 'Margherita')?.prixTexte === '9,00')
v('🔴 les suppléments communs ne s’appliquent JAMAIS d’office', etat0.supplements.every(s => s.appliquerA === ''))
v('la question retrouve son article', articleDeQuestion(etat0.questions[0], etat0.articles)?.nom === 'Pizza du chef')
v('les catégories suivent le menu', categoriesDeRelecture(etat0).join('|') === 'Pizzas|boissons')
v('le prix saisi se lit à la belge et se borne',
  prixDeSaisie('12,50') === 12.5 && prixDeSaisie('0') === null && prixDeSaisie('501') === null && prixDeSaisie('abc') === null)
v('« trouvé aussi » dit où ça se règle', OU_REGLER_INFO.livraison === 'Paramètres, Livraison' && OU_REGLER_INFO.horaires === 'Paramètres, Profil général')

const marg = art(etat0, 'Margherita')
v('un supplément au prix par taille se lit en entier', libelleValeur(marg.groupes[1].valeurs[0]) === 'Jambon M 1,50 · L 2,50 €', libelleValeur(marg.groupes[1].valeurs[0]))
v('le résumé d’un groupe dit sa règle', /^Taille \(choisis-en un\) : M, L \+3,00 €$/.test(resumeGroupe(marg.groupes[0])), resumeGroupe(marg.groupes[0]))
v('« entre 1 et 3 » se lit', /\(entre 1 et 3\)/.test(resumeGroupe(art(etat0, 'Calzone').groupes[0])), resumeGroupe(art(etat0, 'Calzone').groupes[0]))

{
  const b = bilanRelecture(etat0)
  v('🔴 un doute non vérifié BLOQUE, un prix absent aussi', b.pret === false && b.aVerifier === 1 && b.sansPrix === 1, JSON.stringify(b))
  v('la phrase dit ce qui manque', phraseDuBilan(b) === 'Encore 1 article à vérifier, 1 prix à indiquer.', phraseDuBilan(b))
  const e2 = { ...etat0, articles: etat0.articles.map(a => a.nom === 'Pizza du chef' ? { ...a, prixTexte: '14', verifie: true } : a) }
  v('vérifié et chiffré : prêt', bilanRelecture(e2).pret === true && bilanRelecture(e2).aCreer === 3)
  // ⚠️ LE DOUTE SEUL, prix rempli : sinon le prix manquant bloquerait à sa place.
  const doute = { ...etat0, articles: etat0.articles.map(a => a.nom === 'Pizza du chef' ? { ...a, prixTexte: '14' } : a) }
  v('🔴 un doute SEUL (prix rempli) bloque encore', bilanRelecture(doute).pret === false && bilanRelecture(doute).aVerifier === 1 && bilanRelecture(doute).sansPrix === 0)
  const vide = { ...etat0, articles: etat0.articles.map(a => ({ ...a, garder: false })) }
  v('rien de coché : pas prêt, et on le dit', bilanRelecture(vide).pret === false && /au moins un article/.test(phraseDuBilan(bilanRelecture(vide))))
}

// ═══ 3) LES RÉGLAGES COMMUNS (Alex, 13/10) ══════════════════════════════════
v('la pizzeria ne doit pas répondre au stock, la boulangerie si', demandeLeStock(PIZZERIA) === false && demandeLeStock(BOULANGERIE) === true)
v('🔴 la pizzeria crée « sans limite »', JSON.stringify(reglagesCommuns(PIZZERIA, { tva: '6' }).stock) === JSON.stringify({ stock_mode: 'illimite', stock_jour: 0 }))
v('🔴 la boulangerie doit répondre', reglagesCommuns(BOULANGERIE, { tva: '6' }).ok === false)
v('🔴 « par jour » exige au moins 1, comme le formulaire',
  reglagesCommuns(BOULANGERIE, { tva: '6', stock: 'jour', quantite: '0' }).ok === false && reglagesCommuns(BOULANGERIE, { tva: '6', stock: 'jour', quantite: '' }).ok === false)
v('« par jour » 20 donne la quantité', reglagesCommuns(BOULANGERIE, { tva: '6', stock: 'jour', quantite: '20' }).stock?.stock_jour === 20)
v('« sans limite » chez la boulangerie aussi', reglagesCommuns(BOULANGERIE, { tva: '6', stock: 'illimite' }).stock?.stock_mode === 'illimite')
v('🔴 la TVA se CHOISIT : vide = refus', reglagesCommuns(PIZZERIA, { tva: '' }).ok === false)
v('« plus tard » est un choix, et écrit null', reglagesCommuns(PIZZERIA, { tva: 'plus_tard' }).ok === true && reglagesCommuns(PIZZERIA, { tva: 'plus_tard' }).tva === null)
v('le taux sur place vide = même taux (null)', reglagesCommuns(PIZZERIA, { tva: '6', tvaSurPlace: '' }).tvaSurPlace === null && reglagesCommuns(PIZZERIA, { tva: '6', tvaSurPlace: '12' }).tvaSurPlace === 12)
v('un taux absurde est refusé', reglagesCommuns(PIZZERIA, { tva: '150' }).ok === false)
v('🔴 hors alimentaire, refusé', reglagesCommuns({ categorie: 'detail' }, { tva: '21' }).ok === false)

// ═══ 4) LE PLAN ═════════════════════════════════════════════════════════════
const etatPret = {
  ...etat0,
  articles: etat0.articles.map(a => a.nom === 'Pizza du chef' ? { ...a, prixTexte: '14', verifie: true, description: '  ' } : a),
  supplements: etat0.supplements.map(s => ({ ...s, appliquerA: 'pizzas' })),
}
{
  // ⚠️ LE DOUTE SEUL, prix rempli : le plan ne croit pas l'écran.
  const doute = { ...etat0, articles: etat0.articles.map(a => a.nom === 'Pizza du chef' ? { ...a, prixTexte: '14' } : a) }
  const r = planCreation({ etat: doute, commercant: PIZZERIA, commercantId: 'c1', reglages: { tva: '6' } })
  v('🔴 le plan refuse un article dont le doute n’est pas vérifié', r.ok === false && /encore à vérifier/.test(r.error || ''), JSON.stringify(r).slice(0, 200))
}
const plan = planCreation({
  etat: etatPret, commercant: PIZZERIA, commercantId: 'c1',
  categoriesExistantes: ['Boissons', 'Pizzas'],
  articlesExistants: [{ nom: 'Coca', categorie: 'Boissons', ordre: 4 }, { nom: 'Regina', categorie: 'Pizzas', ordre: 2 }, { nom: 'X', categorie: 'Pizzas', ordre: null }],
  reglages: { tva: '6', tvaSurPlace: '12' },
})
const pa = (nom) => plan.articles?.find(a => a.nom === nom)
v('le plan est prêt', plan.ok === true && plan.articles.length === 3, JSON.stringify(plan).slice(0, 300))
const p = pa('Margherita')?.payload || {}
v('🔴 l’article porte les règles du formulaire : sans limite, actif, en ligne, TVA choisie',
  p.commercant_id === 'c1' && p.prix === 9 && p.stock_mode === 'illimite' && p.stock_jour === 0 && p.actif === true && p.est_vitrine === false
  && p.tva_taux === 6 && p.tva_taux_sur_place === 12 && p.photo_url === null && p.temps_prepa === 0, JSON.stringify(p))
v('🔴 les deux circuits d’un NOUVEL article (jour même + commande pour demain)',
  p.vente_jour === true && p.commande_active === true && p.delai_minutes === 1440, JSON.stringify(p))
v('la catégorie s’écrit comme celle qui existe', p.categorie === 'Pizzas')
v('🔴 l’ordre du menu reprend après le dernier article classé', pa('Margherita').payload.ordre === 3 && pa('Calzone').payload.ordre === 4 && pa('Pizza du chef').payload.ordre === 5)
v('une description vide s’écrit null', pa('Pizza du chef').payload.description === null)
v('aucune catégorie nouvelle : la liste ne bouge pas', plan.categories === null)
const gm = pa('Margherita').groupes
v('🔴 la Margherita reçoit Taille, Suppléments ET Charcuterie (choisie pour « pizzas »)',
  gm.map(g => g.groupe.nom).join('|') === 'Taille|Suppléments|Charcuterie', gm.map(g => g.groupe.nom).join('|'))
v('les prix par taille du supplément sont rattachés aux tailles',
  JSON.stringify(gm[1].prixTaille) === JSON.stringify([{ valeur: 'Jambon', taille: 'M', prix: 1.5 }, { valeur: 'Jambon', taille: 'L', prix: 2.5 }]))
v('🔴 une taille du supplément commun absente de l’article est écartée ET comptée',
  gm[2].prixTaille.length === 2 && plan.avertissements.some(x => /1 prix par taille sans taille/.test(x)), JSON.stringify(plan.avertissements))
v('sans supplément écrit, le supplément commun prend le plus bas', gm[2].groupe.valeurs[0].prix_supplement === 1)
v('le nombre de choix passe par la règle du formulaire',
  pa('Calzone').groupes[0].groupe.choix_min === 1 && pa('Calzone').groupes[0].groupe.choix_max === 3 && pa('Calzone').groupes[0].groupe.type === 'multiple')
v('un article sans tailles reçoit le supplément commun sans prix par taille',
  pa('Calzone').groupes.some(g => g.groupe.nom === 'Charcuterie' && g.prixTaille.length === 0))
{
  const avecRetrait = { ...etatPret, articles: etatPret.articles.map(a => a.nom === 'Margherita' ? { ...a, groupes: a.groupes.map(g => g.nom === 'Suppléments' ? { ...g, garder: false } : g) } : a) }
  const pr = planCreation({ etat: avecRetrait, commercant: PIZZERIA, commercantId: 'c1', reglages: { tva: '6' } })
  v('un groupe retiré à la relecture n’est pas créé', !pr.articles.find(a => a.nom === 'Margherita').groupes.some(g => g.groupe.nom === 'Suppléments'))
  v('une catégorie nouvelle s’ajoute à la liste', JSON.stringify(pr.categories) === JSON.stringify(['Pizzas']), JSON.stringify(pr.categories))
  // « boissons » lu sur le menu, « Boissons » déjà au catalogue : la même.
  const coca = { ...etatPret, articles: etatPret.articles.map(a => a.nom === 'Coca' ? { ...a, garder: true } : a) }
  const pc = planCreation({ etat: coca, commercant: PIZZERIA, commercantId: 'c1', categoriesExistantes: ['Boissons', 'Pizzas'], reglages: { tva: '6' } })
  v('⚠️ « boissons » rejoint « Boissons » au lieu d’en créer une seconde',
    pc.articles?.find(a => a.nom === 'Coca')?.payload.categorie === 'Boissons' && pc.categories === null, JSON.stringify(pc.categories))
  // 🔴 LE MENU DIT « pour les pizzas », LE COMMERÇANT N'A RIEN CHOISI : rien.
  const sansChoix = planCreation({ etat: { ...etatPret, supplements: etat0.supplements }, commercant: PIZZERIA, commercantId: 'c1', reglages: { tva: '6' } })
  v('🔴 un supplément commun non choisi n’est créé nulle part, même si le menu nomme sa catégorie',
    sansChoix.ok && !sansChoix.articles.some(a => a.groupes.some(g => g.groupe.nom === 'Charcuterie')))
}
{
  const boul = planCreation({ etat: etatPret, commercant: BOULANGERIE, commercantId: 'c2', reglages: { tva: '6', stock: 'jour', quantite: '15' } })
  v('🔴 la boulangerie crée « par jour » avec sa quantité, sans commande pour demain (horizon 1)',
    boul.ok && boul.articles[0].payload.stock_mode === 'jour' && boul.articles[0].payload.stock_jour === 15 && boul.articles[0].payload.commande_active === false, JSON.stringify(boul.articles?.[0]?.payload))
}

// ═══ 5) L'ÉCRITURE, SUR UNE FAUSSE BASE ═════════════════════════════════════
function fausseBase({ refuser = () => null } = {}) {
  const journal = []
  let n = 0
  const client = {
    journal,
    from(table) {
      return {
        insert(lignes) {
          const liste = Array.isArray(lignes) ? lignes : [lignes]
          const refus = refuser(table, liste)
          journal.push({ table, lignes: liste, refus: !!refus })
          const rendues = refus ? null : liste.map(l => ({ ...l, id: `${table}-${++n}` }))
          const res = { data: rendues, error: refus ? { message: refus } : null }
          return {
            select() { return { ...res, single() { return { data: rendues?.[0] || null, error: res.error } } } },
            then(r) { return Promise.resolve(res).then(r) },
          }
        },
        update(champs) {
          return { eq(col, val) { journal.push({ table, update: champs, ou: [col, val] }); return Promise.resolve({ error: null }) } }
        },
      }
    },
  }
  return client
}

{
  const base = fausseBase()
  const res = await ecrireCreation(base, plan, { commercantId: 'c1' })
  const ins = (t) => base.journal.filter(j => j.table === t && j.lignes)
  v('trois articles créés, un par un', res.crees.length === 3 && ins('articles').length === 3 && ins('articles').every(j => j.lignes.length === 1))
  // Chaque envoi de groupes appartient à un seul article, dans l'ordre de création.
  v('🔴 chaque groupe pointe vers SON article',
    ins('article_options_groupes').length === 3
    && ins('article_options_groupes').every((j, i) => j.lignes.every(l => l.article_id === res.crees[i].id)))
  const prixT = ins('article_options_prix_taille')
  v('🔴 les prix par taille relient une valeur et une taille du MÊME article',
    prixT.length === 1 && prixT[0].lignes.length === 4 && prixT[0].lignes.every(l => l.valeur_id && l.taille_valeur_id && l.valeur_id !== l.taille_valeur_id), JSON.stringify(prixT.map(x => x.lignes)))
  v('aucune liste de catégories écrite quand rien ne change', !base.journal.some(j => j.table === 'commercants') && res.listeCategories === null)
  v('le compte rendu le dit', phraseDeCreation(res) === '3 articles créés.')
  v('les colonnes du groupe sont celles de la base',
    Object.keys(ins('article_options_groupes')[0].lignes[0]).sort().join(',') === 'article_id,choix_max,choix_min,nom,obligatoire,type')
}
{
  const base = fausseBase({ refuser: (t, l) => (t === 'articles' && l[0].nom === 'Calzone' ? 'refusé par la base' : null) })
  const res = await ecrireCreation(base, plan, { commercantId: 'c1' })
  v('🔴 un article refusé est NOMMÉ, les autres se créent', res.echecs.length === 1 && res.echecs[0].nom === 'Calzone' && res.crees.length === 2)
  v('et le compte rendu le dit', /1 non créé \(Calzone\)/.test(phraseDeCreation(res)))
}
{
  const base = fausseBase({ refuser: (t) => (t === 'article_options_valeurs' ? 'refusé' : null) })
  const res = await ecrireCreation(base, plan, { commercantId: 'c1' })
  v('🔴 des choix refusés : l’article est créé mais signalé « sans tous ses choix »',
    res.crees.length === 3 && res.partiels.length === 3 && /options non créées/.test(res.partiels[0].erreur) && /sans tous leurs choix/.test(phraseDeCreation(res)), JSON.stringify(res.partiels))
}
{
  const pr = planCreation({ etat: etatPret, commercant: PIZZERIA, commercantId: 'c1', reglages: { tva: '6' } })
  const base = fausseBase()
  const res = await ecrireCreation(base, pr, { commercantId: 'c1' })
  const maj = base.journal.find(j => j.table === 'commercants')
  v('une catégorie nouvelle se range dans la liste du commerce', JSON.stringify(maj?.update) === JSON.stringify({ ordre_categories: ['Pizzas'] }) && maj.ou[1] === 'c1' && JSON.stringify(res.listeCategories) === '["Pizzas"]')
  const rien = fausseBase({ refuser: (t) => (t === 'articles' ? 'non' : null) })
  const r2 = await ecrireCreation(rien, pr, { commercantId: 'c1' })
  v('🔴 aucun article né : la liste des catégories ne bouge pas', !rien.journal.some(j => j.table === 'commercants') && r2.crees.length === 0)
}

// ═══ 6) L'ÉCRAN ═════════════════════════════════════════════════════════════
{
  const ecran = code('app/dashboard/LectureMenu.js')
  v('🔴 la fenêtre lit par la route, avec le jeton', /await postPro\('\/api\/ia\/menu', \{ commercant_id: commercantId, documents \}\)/.test(ecran))
  v('les photos sont réduites avant l’envoi', /canvas\.toDataURL\('image\/jpeg', QUALITE_JPEG\)/.test(ecran) && /COTE_MAX_PHOTO \/ Math\.max\(/.test(ecran))
  v('🔴 le poids est vérifié avant d’envoyer', /> TAILLE_MAX_BASE64\)/.test(ecran))
  v('🔴 la création passe par le plan, puis l’écriture (navigateur, sous les règles d’accès)',
    /const plan = planCreation\(\{ etat, commercant, commercantId, categoriesExistantes, articlesExistants, reglages \}\)/.test(ecran)
    && /if \(!plan\.ok\) \{ setErreur\(plan\.error\); return \}/.test(ecran) && /await ecrireCreation\(supabase, plan,/.test(ecran))
  v('🔴 le bouton suit le bilan ET les réglages', /const pret = !!bilan\?\.pret && verdictReglages\.ok/.test(ecran) && /disabled=\{!pret \|\| occupe\}/.test(ecran))
  v('🔴 ce qui est créé se décoche (pas de double au second clic)', /creees\.has\(a\.cle\) \? \{ \.\.\.a, garder: false, deja: true \}/.test(ecran))
  v('la question du stock n’apparaît qu’au commerce qui compte par jour', /\{avecStock && \(/.test(ecran) && /const avecStock = demandeLeStock\(commercant\)/.test(ecran))
  v('la TVA propose les taux du métier et « plus tard »', /optionsTaux\(tvaRefs, commercant\?\.categorie\)/.test(ecran) && /value="plus_tard"/.test(ecran))
  v('la phrase dit que tout se change ensuite, par groupe ou un par un', /actions groupées du catalogue\) ou article par article/.test(readFileSync(new URL('../app/dashboard/LectureMenu.js', import.meta.url), 'utf8')))
  v('🔴 aucune page n’est gardée : ni stockage, ni écriture de fichier', !/\.storage\b/.test(ecran))

  const dash = code('app/dashboard/ConfigDashboard.js')
  v('🔴 le bouton « Lire mon menu » n’existe qu’en alimentaire', /\{estAlimentaire && subTab === 'articles' && \(/.test(dash) && /setLectureMenu\(true\)/.test(dash))
  v('après la création, la liste, les catégories et les choix se relisent',
    /if \(res\.listeCategories\) setListeCats\(res\.listeCategories\)/.test(dash) && /noterOptionsTouchees\(res\.crees\.map\(c => c\.id\)\)/.test(dash))
}

console.log(`\nRelecture et création du menu lu : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
