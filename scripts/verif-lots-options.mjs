// BANC — LE STOCK RÉEL DES LOTS ET LES OPTIONS OBLIGATOIRES (11/10)
//
// Deux défauts trouvés à l'audit des articles au poids, déjà en prod :
//   1. un lot « 3+1 » enregistrait `quantite` = 1 : après les 5 minutes de la
//      réservation, le stock ne baissait que d'une unité ; le second article
//      d'un duo, jamais ;
//   2. AUCUN serveur ne vérifiait les options obligatoires, et la fiche
//      détaillée ajoutait l'article sans les demander.
// Décision d'Alex (tableau, 11/10) : chantier à part, avant le poids.
//
// ⚠️ LE BANC EXÉCUTE LA RÈGLE (construireLignesCommande) ET LIT LE CODE QUI
// L'APPELLE : une règle juste qu'aucune route ne branche ne protège rien.
//
//   npm run verif:lots-options

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { construireLignesCommande, SELECT_OPTIONS_VALEURS, SELECT_GROUPES_OPTIONS, SELECT_PRIX_TAILLE, bornesChoix } from '../lib/lignes-commande.js'
import * as OC from '../lib/options-choix.js'

const RACINE = new URL('../', import.meta.url)
const lire = (f) => readFileSync(new URL(f, RACINE), 'utf8')
const code = (f) => sansProse(lire(f))

let ok = 0
const echecs = []
function v(nom, condition, detail = '') {
  if (condition) ok++
  else echecs.push(detail ? `${nom} — ${detail}` : nom)
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. LA RÈGLE, EXÉCUTÉE
// ═══════════════════════════════════════════════════════════════════════════
const JOUR = '2026-10-12'
const commercant = { id: 'c1', tva_taux_defaut: 6 }
const pizza = { id: 'p1', nom: 'Margherita', prix: 10, categorie: 'Pizzas', actif: true, commercant_id: 'c1', tva_taux: 6, temps_prepa: 5 }
const croissant = { id: 'k1', nom: 'Croissant', prix: 1.2, categorie: 'Viennoiseries', actif: true, commercant_id: 'c1', tva_taux: 6, temps_prepa: 1 }
const cafe = { id: 'f1', nom: 'Café', prix: 2, categorie: 'Boissons', actif: true, commercant_id: 'c1', tva_taux: 6, temps_prepa: 1 }
const articlesData = [pizza, croissant, cafe]
const groupes = [
  { id: 'gBase', article_id: 'p1', nom: 'Base', obligatoire: true },
  { id: 'gSupp', article_id: 'p1', nom: 'Suppléments', obligatoire: false },
  { id: 'gAutre', article_id: 'k1', nom: 'Garniture', obligatoire: true },
]
const valeur = (id, groupe_id, nom, prix_supplement = 0) => {
  const g = groupes.find(x => x.id === groupe_id)
  return { id, nom, prix_supplement, groupe_id, article_options_groupes: { article_id: g.article_id, nom: g.nom } }
}
const optionsValeurs = [
  valeur('vTomate', 'gBase', 'Tomate'),
  valeur('vOlive', 'gSupp', 'Olives', 1),
  valeur('vBeurre', 'gAutre', 'Beurre'),
]
const lot = { id: 'dLot', deal_type: 'lot', titre: '3 + 1 croissants', prix_deal: 3.6, unites_par_deal: 4, article_id: 'k1', date_deal: JOUR, actif: true }
const duo = { id: 'dDuo', deal_type: 'bundle', titre: 'Croissant + café', prix_deal: 2.8, article_id: 'k1', article2_id: 'f1', date_deal: JOUR, actif: true }
const calc = (panier, extra = {}) => construireLignesCommande({
  panier, articlesData, optionsValeurs, variantesData: [], dealsData: [lot, duo],
  commercant, regime: 'emporter', dateCommande: JOUR, groupesOptions: groupes, ...extra,
})

// ─── Le stock réel des lots ────────────────────────────────────────────────
{
  const r = calc([{ id: 'k1', quantite: 2, deal_id: 'dLot' }])
  v('🔴 deux lots de 4 : la ligne retire 8 unités (quantite_stock), elle en compte 2 (quantite)',
    r.ok && r.lignes[0].quantite === 2 && r.lignes[0].quantite_stock === 8, JSON.stringify(r.lignes?.[0]))
  const d = calc([{ id: 'k1', quantite: 3, deal_id: 'dDuo' }])
  v('🔴 trois duos : le second article est porté par la ligne (il en retire 3)',
    d.ok && d.lignes[0].deal_article2_id === 'f1' && d.lignes[0].quantite === 3 && d.lignes[0].quantite_stock === 3, JSON.stringify(d.lignes?.[0]))
  const u = calc([{ id: 'k1', quantite: 5, options: [{ valeur_ids: ['vBeurre'] }] }])
  v('une unité simple : quantite_stock = quantite, aucun second article',
    u.ok && u.lignes[0].quantite_stock === 5 && u.lignes[0].deal_article2_id === null, JSON.stringify(u))
}

// ─── Les options obligatoires ──────────────────────────────────────────────
{
  const sans = calc([{ id: 'p1', quantite: 1 }])
  v('🔴 une pizza sans sa base obligatoire est REFUSÉE, avec le nom du choix et de l’article',
    !sans.ok && sans.error === 'Choisis « Base » pour « Margherita ».' && sans.option_manquante === true, JSON.stringify(sans))
  const optionnelSeul = calc([{ id: 'p1', quantite: 1, options: [{ valeur_ids: ['vOlive'] }] }])
  v('🔴 un choix FACULTATIF ne remplace pas l’obligatoire', !optionnelSeul.ok, JSON.stringify(optionnelSeul))
  const autreArticle = calc([{ id: 'p1', quantite: 1, options: [{ valeur_ids: ['vBeurre'] }] }])
  v('🔴 la valeur d’un AUTRE article ne compte pas', !autreArticle.ok, JSON.stringify(autreArticle))
  // (13/10) Glissée à côté d'un choix valable, elle ne doit ni apparaître sur
  // la ligne ni compter : sinon un client choisirait ses options ailleurs.
  const glissee = calc([{ id: 'p1', quantite: 1, options: [{ valeur_ids: ['vTomate', 'vBeurre'] }] }])
  v('🔴 une valeur d’un autre article glissée à côté est ignorée (ni sur la ligne, ni comptée)',
    glissee.ok && !glissee.lignes[0].options.some(o => o.valeur_nom === 'Beurre') && glissee.lignes[0].options.length === 1, JSON.stringify(glissee.lignes?.[0]))
  const avec = calc([{ id: 'p1', quantite: 2, options: [{ valeur_ids: ['vTomate', 'vOlive'] }] }])
  v('avec sa base : acceptée, supplément compté (10 + 1) × 2 = 22 €',
    avec.ok && avec.totalCents === 2200, JSON.stringify(avec))
  const baseSeule = calc([{ id: 'p1', quantite: 1, options: [{ valeur_ids: ['vTomate'] }] }])
  v('🔴 la base seule suffit : un groupe FACULTATIF n’est jamais exigé', baseSeule.ok && baseSeule.totalCents === 1000, JSON.stringify(baseSeule))
  const offre = calc([{ id: 'k1', quantite: 1, deal_id: 'dLot' }])
  v('🔴 une OFFRE (lot, duo, invendu) passe sans options : le commerçant la publie composée', offre.ok, JSON.stringify(offre))
  const sansGroupes = calc([{ id: 'p1', quantite: 1 }], { groupesOptions: null })
  v('sans liste de groupes (calcul du total à l’écran) : aucun contrôle', sansGroupes.ok)
}
v('les listes de colonnes : valeurs avec leur groupe, groupes avec obligatoire, type et nombre de choix, prix par taille',
  SELECT_OPTIONS_VALEURS === 'id, nom, prix_supplement, groupe_id, article_options_groupes!article_options_valeurs_groupe_id_fkey!inner(article_id, nom)'
  && SELECT_GROUPES_OPTIONS === 'id, article_id, nom, obligatoire, type, choix_min, choix_max, depend_de_valeur_id'
  && SELECT_PRIX_TAILLE === 'valeur_id, taille_valeur_id, prix')

// ─── (13/10) LE PRIX SELON LA TAILLE ET LE NOMBRE DE CHOIX ─────────────────
// Le menu d'une pizzeria : « charcuterie 1,50 € en M, 2 € en L, 3 € en XL » ;
// « Calzone : base + 3 ingrédients au choix ».
{
  const pz = { id: 'pz', nom: 'Reine', prix: 9, actif: true, commercant_id: 'c1', tva_taux: 6, temps_prepa: 5 }
  const gTaille = { id: 'gT', article_id: 'pz', nom: 'Taille', obligatoire: true, type: 'unique' }
  const gSupp = { id: 'gS', article_id: 'pz', nom: 'Suppléments', obligatoire: false, type: 'multiple' }
  const gIngr = { id: 'gI', article_id: 'pz', nom: 'Ingrédients', obligatoire: false, type: 'multiple', choix_min: 3, choix_max: 3 }
  const gs = [gTaille, gSupp, gIngr]
  const val = (id, g, nom, prix_supplement = 0) => ({ id, nom, prix_supplement, groupe_id: g.id, article_options_groupes: { article_id: 'pz', nom: g.nom } })
  const ov = [
    val('tM', gTaille, 'M'), val('tL', gTaille, 'L', 3), val('tXL', gTaille, 'XL', 6),
    val('sJambon', gSupp, 'Jambon', 1.5), val('sOeuf', gSupp, 'Œuf', 1),
    val('i1', gIngr, 'Champignons'), val('i2', gIngr, 'Oignons'), val('i3', gIngr, 'Olives'), val('i4', gIngr, 'Poivrons'),
  ]
  const pt = [{ valeur_id: 'sJambon', taille_valeur_id: 'tL', prix: 2 }, { valeur_id: 'sJambon', taille_valeur_id: 'tXL', prix: 3 }]
  const c = (options, extra = {}) => construireLignesCommande({
    panier: [{ id: 'pz', quantite: 1, options: [{ valeur_ids: options }] }], articlesData: [pz], optionsValeurs: ov,
    variantesData: [], dealsData: [], commercant, regime: 'emporter', dateCommande: JOUR, groupesOptions: gs, prixTaille: pt, ...extra,
  })
  const trois = ['i1', 'i2', 'i3']
  const enM = c(['tM', 'sJambon', ...trois])
  v('🔴 en M, le jambon garde son prix unique (1,50 €) : 9 + 0 + 1,50 = 10,50 €', enM.ok && enM.totalCents === 1050, JSON.stringify(enM))
  const enL = c(['tL', 'sJambon', ...trois])
  v('🔴 en L, le jambon coûte 2 € : 9 + 3 + 2 = 14 €, et la ligne le dit', enL.ok && enL.totalCents === 1400
    && enL.lignes[0].options.find(o => o.valeur_nom === 'Jambon')?.prix_supplement === 2, JSON.stringify(enL))
  const enXL = c(['tXL', 'sJambon', 'sOeuf', ...trois])
  v('🔴 en XL, 3 € ; l’œuf sans prix par taille garde le sien : 9 + 6 + 3 + 1 = 19 €', enXL.ok && enXL.totalCents === 1900, JSON.stringify(enXL))
  const ordre = c(['sJambon', 'tL', ...trois])
  v('⚠️ l’ordre des choix ne change rien (la taille peut arriver après le supplément)', ordre.ok && ordre.totalCents === 1400, JSON.stringify(ordre))
  const deuxFois = c(['tM', 'sJambon', 'sJambon', ...trois])
  v('🔴 une valeur envoyée deux fois ne compte qu’une fois', deuxFois.ok && deuxFois.totalCents === 1050, JSON.stringify(deuxFois))
  const deux = c(['tM', 'i1', 'i2'])
  v('🔴 « 3 ingrédients au choix » : deux, c’est refusé, et le message le dit',
    !deux.ok && deux.option_manquante === true && /Choisis 3 « Ingrédients »/.test(deux.error), JSON.stringify(deux))
  const quatre = c(['tM', 'i1', 'i2', 'i3', 'i4'])
  v('🔴 quatre aussi : refusé (3 au maximum)', !quatre.ok && quatre.option_en_trop === true && /3 choix au maximum/.test(quatre.error), JSON.stringify(quatre))
  const deuxTailles = c(['tM', 'tL', ...trois])
  v('🔴 un choix « unique » ne se prend qu’une fois (deux tailles : refusé)', !deuxTailles.ok && deuxTailles.option_en_trop === true, JSON.stringify(deuxTailles))
  const sansTaille = c([...trois])
  v('la taille obligatoire reste exigée', !sansTaille.ok && /Choisis « Taille »/.test(sansTaille.error), JSON.stringify(sansTaille))
  const sansPrixTaille = c(['tL', 'sJambon', ...trois], { prixTaille: [] })
  v('sans prix par taille en base : le prix unique, comme avant (9 + 3 + 1,50)', sansPrixTaille.ok && sansPrixTaille.totalCents === 1350)
  // ─── L'ÉCRAN : mêmes prix, mêmes bornes que le serveur ─────────────────
  const avecPT = ov.map(x => ({ ...x, prix_taille: pt.filter(p => p.valeur_id === x.id).map(p => ({ taille_valeur_id: p.taille_valeur_id, prix: p.prix })) }))
  const V = Object.fromEntries(avecPT.map(x => [x.id, x]))
  v('🔴 l’écran affiche le prix selon la taille déjà choisie (2 € en L, 1,50 € sans taille)',
    OC.prixDeValeur(V.sJambon, ['tL']) === 2 && OC.prixDeValeur(V.sJambon, ['tXL']) === 3 && OC.prixDeValeur(V.sJambon, []) === 1.5 && OC.prixDeValeur(V.sOeuf, ['tL']) === 1)
  v('🔴 le supplément affiché = celui du serveur (L : 3 + 2 = 5 €)',
    OC.supplementDeSelection({ gT: [V.tL], gS: [V.sJambon] }) === 5)
  v('les prix par taille se remettent à plat depuis les groupes lus',
    OC.prixTailleDesGroupes([{ valeurs: avecPT }]).length === 2 && OC.prixTailleDesGroupes([{ valeurs: avecPT }])[0].valeur_id === 'sJambon')
  v('🔴 la pastille dit la règle', OC.libelleBornes(gTaille) === 'Choisis-en un' && OC.libelleBornes(gIngr) === 'Choisis-en 3'
    && OC.libelleBornes(gSupp) === 'Cumulables' && OC.libelleBornes({ choix_max: 2 }) === 'Jusqu’à 2' && OC.libelleBornes({ choix_min: 1, choix_max: 3 }) === 'Entre 1 et 3')
  v('🔴 le refus de l’écran = celui du serveur', OC.refusDuGroupe(gIngr, 2) === 'Choisis-en 3 (2 pour l’instant)'
    && OC.refusDuGroupe(gIngr, 3) === null && OC.refusDuGroupe(gTaille, 0) === 'Choix obligatoire' && OC.refusDuGroupe(gIngr, 4) === '3 au maximum')
  let sel = {}
  for (const id of ['i1', 'i2', 'i3']) sel = OC.basculerValeur(sel, gIngr, V[id]).selections
  const quatrieme = OC.basculerValeur(sel, gIngr, V.i4)
  v('🔴 un groupe plein refuse un choix de plus, et le dit', quatrieme.plein === true && quatrieme.selections.gI.length === 3)
  v('un choix unique remplace le précédent', OC.basculerValeur({ gT: [V.tM] }, gTaille, V.tL).selections.gT.map(x => x.id).join() === 'tL')
  v('décocher libère la place', OC.basculerValeur(sel, gIngr, V.i1).selections.gI.length === 2)

  // ─── LE RÉGLAGE DU COMMERÇANT : mêmes bornes que la base ───────────────
  const b = OC.bornesDepuisSaisie
  v('« exactement 3 » : 3 et 3', JSON.stringify(b('3', '3')) === JSON.stringify({ ok: true, choix_min: 3, choix_max: 3 }))
  v('vide = sans limite ; 0 au minimum = pas de minimum', JSON.stringify(b('', '')) === JSON.stringify({ ok: true, choix_min: null, choix_max: null })
    && b('0', '2').choix_min === null && b('0', '2').choix_max === 2)
  v('🔴 refusés comme la base les refuserait : min > max, max à 0, au-delà de 30, pas un entier',
    !b('4', '3').ok && !b('', '0').ok && !b('31', '').ok && !b('', '31').ok && !b('2,5', '').ok && !b('-1', '').ok)
  const tailleDe = OC.groupeDesTailles(avecPT.length ? [
    { ...gTaille, valeurs: avecPT.filter(x => x.groupe_id === 'gT') },
    { ...gSupp, valeurs: avecPT.filter(x => x.groupe_id === 'gS') },
    { id: 'gSauce', nom: 'Sauce', type: 'unique', valeurs: [{ id: 'a' }, { id: 'b' }] },
  ] : [], 'gS')
  v('🔴 le groupe des tailles est trouvé (un seul choix, nommé « Taille »), pas la sauce', tailleDe?.id === 'gT', JSON.stringify(tailleDe?.id))
  v('un groupe ne se règle pas sur lui-même ; sans tailles, rien', OC.groupeDesTailles([{ ...gTaille, valeurs: [{}, {}] }], 'gT') === null)
  // (13/10, Alex) La taille d'abord, les autres dans leur ordre.
  const ordreGroupes = OC.ordonnerGroupes([{ id: 'gI', nom: 'Ingrédients', type: 'multiple', valeurs: [{}, {}] }, { id: 'gS', nom: 'Sauce', type: 'multiple', valeurs: [{}, {}] }, { id: 'gT', nom: 'Taille', type: 'unique', valeurs: [{}, {}, {}] }])
  v('🔴 le groupe des tailles passe en premier, les autres gardent leur ordre', ordreGroupes.map(g => g.id).join() === 'gT,gI,gS', ordreGroupes.map(g => g.id).join())
  v('sans groupe de tailles, l’ordre ne bouge pas', OC.ordonnerGroupes([{ id: 'a', type: 'multiple' }, { id: 'b', type: 'multiple' }]).map(g => g.id).join() === 'a,b')

  // (13/10, Alex) Les OBLIGATOIRES au-dessus, les facultatifs en dessous.
  const ordre2 = OC.ordonnerGroupes([
    { id: 'fro', nom: 'Fromage', type: 'unique', valeurs: [{}] },
    { id: 'cha', nom: 'Charcuterie', type: 'multiple', valeurs: [{}, {}] },
    { id: 'boi', nom: 'Boisson', type: 'unique', obligatoire: true, valeurs: [{}, {}] },
    { id: 'tai', nom: 'Taille', type: 'unique', obligatoire: true, valeurs: [{}, {}] },
    { id: 'ing', nom: 'Ingrédients', type: 'multiple', choix_min: 1, choix_max: 3, valeurs: [{}, {}] },
  ])
  v('🔴 la taille, puis les obligatoires, puis les facultatifs (chacun dans son ordre)',
    ordre2.map(g => g.id).join() === 'tai,boi,ing,fro,cha', ordre2.map(g => g.id).join())
  const cuisson = OC.ordonnerGroupes([{ id: 'boi', nom: 'Boisson', type: 'multiple', obligatoire: true, valeurs: [{}, {}] }, { id: 'cui', nom: 'Cuisson', type: 'unique', valeurs: [{}, {}] }])
  v('⚠️ une « Cuisson » facultative (taille de repli) ne passe pas devant la boisson imposée', cuisson.map(g => g.id).join() === 'boi,cui', cuisson.map(g => g.id).join())

  // ─── (13/10, Alex) LES PRIX PAR TAILLE DEPUIS LA BIBLIOTHÈQUE ─────────────
  // « Trop de perte de temps sur 45 articles. » Chaque pizza a SES tailles :
  // le lien se fait par le NOM de la taille.
  {
    const tA = { id: 'tA', article_id: 'A', nom: 'Taille', type: 'unique', obligatoire: true, valeurs: [{ id: 'aM', nom: 'M' }, { id: 'aL', nom: 'L' }, { id: 'aXL', nom: 'XL' }] }
    const tB = { id: 'tB', article_id: 'B', nom: 'Taille', type: 'unique', obligatoire: true, valeurs: [{ id: 'bM', nom: 'm' }, { id: 'bL', nom: 'L' }] }
    const chA = { id: 'cA', article_id: 'A', nom: 'Charcuterie', type: 'multiple', valeurs: [
      { id: 'jA', nom: 'Jambon', prix_supplement: 1.5, prix_taille: [{ taille_valeur_id: 'aM', prix: 1.5 }, { taille_valeur_id: 'aL', prix: 2 }, { taille_valeur_id: 'aXL', prix: 3 }] },
      { id: 'sA', nom: 'Salami', prix_supplement: 1.5, prix_taille: [] },
    ] }
    const chB = { id: 'cB', article_id: 'B', nom: 'Charcuterie', type: 'multiple', valeurs: [{ id: 'jB', nom: 'Jambon' }, { id: 'sB', nom: 'Salami' }] }
    const chC = { id: 'cC', article_id: 'C', nom: 'Charcuterie', type: 'multiple', valeurs: [{ id: 'jC', nom: 'Jambon' }] }
    const parArticle = { A: [tA, chA], B: [tB, chB], C: [chC] }
    v('les tailles de tous les articles du groupe, réunies sans doublon (« m » = « M »)',
      OC.taillesDesCopies([chA, chB, chC], parArticle).join('|') === 'M|L|XL', OC.taillesDesCopies([chA, chB, chC], parArticle).join('|'))
    const pn = OC.prixTailleParNom(chA, parArticle.A)
    v('🔴 les prix actuels se lisent par NOM (pour remplir le formulaire)',
      OC.prixParNomDe(pn, 'jambon', 'L') === 2 && OC.prixParNomDe(pn, 'Jambon', 'xl') === 3 && OC.prixParNomDe(pn, 'Salami', 'M') === undefined)
    const s = OC.prixTailleDeSaisie([{ nom: 'Jambon', parTaille: { M: '1,50', L: '2', XL: '' } }, { nom: 'Salami', parTaille: { M: '', L: '' } }])
    v('la saisie se lit à la belge, une case vide ne compte pas', s.ok && OC.prixParNomDe(s.prixParNom, 'Jambon', 'M') === 1.5 && OC.prixParNomDe(s.prixParNom, 'Jambon', 'XL') === undefined && !s.prixParNom.salami)
    v('🔴 une saisie illisible ou absurde est refusée', OC.prixTailleDeSaisie([{ nom: 'Jambon', parTaille: { M: 'abc' } }]).ok === false && OC.prixTailleDeSaisie([{ nom: 'Jambon', parTaille: { M: '600' } }]).ok === false)
    const r = OC.lignesPrixTailleDesCopies({ copies: [chA, chB, chC], groupesParArticle: parArticle, prixParNom: s.prixParNom })
    v('🔴 chaque prix relie l’option et la taille du MÊME article',
      JSON.stringify(r.lignes) === JSON.stringify([
        { valeur_id: 'jA', taille_valeur_id: 'aM', prix: 1.5 }, { valeur_id: 'jA', taille_valeur_id: 'aL', prix: 2 },
        { valeur_id: 'jB', taille_valeur_id: 'bM', prix: 1.5 }, { valeur_id: 'jB', taille_valeur_id: 'bL', prix: 2 },
      ]), JSON.stringify(r.lignes))
    v('🔴 toutes les options des copies sont remplacées (une case vidée redevient le prix unique)', r.valeurIds.join() === 'jA,sA,jB,sB,jC')
    v('un article sans tailles est compté (il garde le prix unique)', r.articlesSansTaille === 1)
    v('⚠️ le groupe réglé n’est jamais pris pour les tailles', OC.taillesDesCopies([tA], { A: [tA] }).length === 0)

    const dash = code('app/dashboard/ConfigDashboard.js')
    v('🔴 le chargement commun lit le nombre de choix et les prix par taille, par pages, dans un ordre total',
      /await toutesLesLignes\(\(\) => supabase\s*\.from\('article_options_groupes'\)\s*\.select\(SELECT_GROUPES_AVEC_VALEURS\)\s*\.in\('article_id', ids\)\s*\.order\('created_at'\)\s*\.order\('id'\)\)/.test(dash))
    v('🔴 une lecture ratée garde les groupes et le dit', /if \(error\) \{ setErreurGroupes\(true\); setGroupesCharges\(true\); return \}/.test(dash))
    v('🔴 plus de requête par panneau d’article (45 lectures à chaque affichage)',
      /const groupes = groupesParArticle\[String\(articleId\)\] \|\| \[\]/.test(dash) && !/async function fetchGroupes\(\)/.test(dash))
    v('🔴 la bibliothèque ouvre les prix par taille, l’article garde son propre réglage',
      /groupesParArticle=\{groupesParArticle\} toast=\{toast\} avecPrixTaille/.test(dash) && (dash.match(/avecPrixTaille\b/g) || []).length >= 3)
    v('🔴 les prix par taille ne s’écrivent que si on les a touchés, contrôlés avant toute écriture',
      /const saisieTaille = prixTailleTouche \? prixTailleDeSaisie\(form\.options\)/.test(dash) && /if \(!saisieTaille\.ok\) \{ toast\(saisieTaille\.error, 'error'\); return \}/.test(dash)
      && dash.indexOf('if (!saisieTaille.ok)') < dash.indexOf('await ecrireModificationGroupe(plan)'))
    v('🔴 l’écriture relit les copies (les options ajoutées ont un identifiant) puis remplace',
      /\.select\('id, article_id, valeurs:article_options_valeurs!article_options_valeurs_groupe_id_fkey\(id, nom\)'\)\.in\('id', copies\.map\(g => g\.id\)\)/.test(dash) && /await ecrirePrixTailleDesCopies\(relus, groupesParArticle, saisieTaille\.prixParNom\)/.test(dash))
    v('🔴 « Appliquer à… » et « Copier vers… » emportent les prix par taille',
      /await ecrireCopiesDeGroupe\(entree\.modele, aCopier, groupesParArticle\)/.test(dash) && /await ecrireCopiesDeGroupe\(copieDe, aCopier, groupesParArticle\)/.test(dash)
      && /ecrirePrixTailleDesCopies\(copies, groupesParArticle, prixParNom, \{ remplacer: false \}\)/.test(dash))
    v('les suppressions partent par paquets (adresse bornée)', /for \(const ids of paquets\(valeurIds, 100\)\)/.test(dash))
  }

  // (13/10, Alex : « pas de choisis-en un, il se sent obligé »)
  v('🔴 aucune pastille pour un choix unique ni pour des cumulables',
    OC.pastilleBornes(gTaille) === null && OC.pastilleBornes(gSupp) === null && OC.pastilleBornes({ type: 'multiple', obligatoire: true }) === null)
  v('🔴 une vraie limite garde sa pastille',
    OC.pastilleBornes(gIngr) === 'Choisis-en 3' && OC.pastilleBornes({ type: 'multiple', choix_max: 2 }) === 'Jusqu’à 2'
    && OC.pastilleBornes({ type: 'multiple', choix_min: 1, choix_max: 3 }) === 'Entre 1 et 3' && OC.pastilleBornes({ type: 'multiple', choix_min: 2 }) === 'Au moins 2')
  v('🔴 une option seule et facultative prend une case, pas un rond',
    OC.afficheEnRond({ type: 'unique', valeurs: [{}] }) === false && OC.afficheEnRond({ type: 'unique', valeurs: [{}, {}] }) === true
    && OC.afficheEnRond({ type: 'unique', obligatoire: true, valeurs: [{}] }) === true && OC.afficheEnRond({ type: 'multiple', valeurs: [{}, {}] }) === false)
  {
    const fiche = code('app/commander/[slug]/page.js')
    const encodage = code('app/dashboard/ModalNouvelleCommande.js')
    v('🔴 la fiche passe par ces deux règles, plus par « Choisis-en un »',
      /const isUnique = afficheEnRond\(g\)/.test(fiche) && /const pastille = pastilleBornes\(g\)/.test(fiche) && /\{pastille && \(/.test(fiche) && !/\{libelleBornes\(g\)\}/.test(fiche))
    v('l’encodage n’annonce plus « choisis-en un »', /pastilleBornes\(g\)\?\.toLowerCase\(\)/.test(encodage) && !/libelleBornes/.test(encodage))
    v('🔴 le réglage du commerçant dit ce que la fiche affiche vraiment',
      /\{pastilleBornes\(g\) \? <>Le client lit : « \{pastilleBornes\(g\)\} »<\/> : 'Pas de limite : aucune pastille pour le client'\}/.test(code('app/dashboard/ConfigDashboard.js')))
  }
  // ⚠️ REPOINTÉE LE 21/10, PAS DÉSARMÉE : même ordre, et seuls les groupes
  // ACTIFS s'affichent (un groupe dépendant n'apparaît qu'avec son option).
  v('🔴 la fiche et l’encodage affichent les groupes dans cet ordre, sans les groupes dépendants dont l’option n’est pas cochée',
    code('app/commander/[slug]/page.js').includes('{ordonnerGroupes(groupes).filter(g => groupeActif(g, selections)).map(g => {')
    && code('app/dashboard/ModalNouvelleCommande.js').includes('{ordonnerGroupes(groupes[enOptions.id] || []).filter(g => groupeActif(g, selections)).map(g => {'))
  v('🔴 un groupe à PLUSIEURS choix n’est jamais le groupe des tailles, même nommé « Taille »',
    OC.groupeDesTailles([{ id: 'gM', nom: 'Tailles', type: 'multiple', valeurs: [{}, {}] }, { id: 'gU', nom: 'Format', type: 'unique', valeurs: [{}, {}] }])?.id === 'gU')
  const lp = OC.lignesPrixTaille('sJambon', { tL: '2', tXL: '3,00', tM: '' })
  v('🔴 les prix saisis deviennent des lignes ; une case vide = prix unique pour cette taille',
    lp.ok && JSON.stringify(lp.lignes) === JSON.stringify([{ valeur_id: 'sJambon', taille_valeur_id: 'tL', prix: 2 }, { valeur_id: 'sJambon', taille_valeur_id: 'tXL', prix: 3 }]), JSON.stringify(lp))
  v('🔴 un prix illisible ou absurde est refusé', !OC.lignesPrixTaille('x', { t: 'deux' }).ok && !OC.lignesPrixTaille('x', { t: '600' }).ok && !OC.lignesPrixTaille('x', { t: '1,505' }).ok)
  v('le résumé dit les prix par taille (le prix unique là où rien n’est réglé)',
    OC.resumePrixTaille(V.sJambon, [{ id: 'tM', nom: 'M' }, { id: 'tL', nom: 'L' }, { id: 'tXL', nom: 'XL' }]) === 'M 1,50 · L 2,00 · XL 3,00 €'
    && OC.resumePrixTaille(V.sOeuf, [{ id: 'tM', nom: 'M' }]) === null)
  v('les bornes sans réglage gardent la règle d’avant',
    JSON.stringify(bornesChoix({ obligatoire: true, type: 'multiple' })) === JSON.stringify({ min: 1, max: Infinity })
    && JSON.stringify(bornesChoix({ obligatoire: false, type: 'unique' })) === JSON.stringify({ min: 0, max: 1 })
    && JSON.stringify(bornesChoix({ choix_min: 2, choix_max: 4 })) === JSON.stringify({ min: 2, max: 4 }))
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LES ROUTES L'APPELLENT ET ENREGISTRENT LA CONSOMMATION
// ═══════════════════════════════════════════════════════════════════════════
const ROUTES = {
  'en ligne': 'app/api/stripe/checkout/create-commande/route.js',
  'rendez-vous': 'app/api/stripe/checkout/create-rdv-commande/route.js',
  'encodée': 'app/api/equipe/commande/creer/route.js',
}
for (const [nom, f] of Object.entries(ROUTES)) {
  const c = code(f)
  const client = nom === 'encodée' ? 'admin' : 'supabase'
  v(`🔴 route ${nom} : les options des SEULS articles du panier (plus de lecture de toute la plateforme)`,
    c.includes(`${client}.from('article_options_valeurs').select(SELECT_OPTIONS_VALEURS).in('article_options_groupes.article_id', articleIds)`)
    && !c.includes("from('article_options_valeurs').select('id, nom, prix_supplement, groupe_id, article_options_groupes!inner(article_id, nom)')"))
  v(`🔴 route ${nom} : elle lit les groupes et les passe à la règle`,
    c.includes(`${client}.from('article_options_groupes').select(SELECT_GROUPES_OPTIONS).in('article_id', articleIds)`)
    && c.includes('groupesOptions: groupesOptions || [],'))
  // (13/10) Les prix par taille : lus par la fonction partagée, passés à la
  // règle, et une lecture ratée refuse.
  v(`🔴 route ${nom} : elle lit les prix par taille, les passe à la règle, et refuse si la lecture échoue`,
    c.includes(`await lirePrixTaille(${client}, optionsValeurs)`) && c.includes('prixTaille: prixTaille || [],')
    && (nom === 'encodée' ? /if \(eP\) return non\(/.test(c)
      : /if \(errPrixTaille\) \{\s*console\.error\([^)]*\)\s*return NextResponse\.json\(\{[^}]*\}, \{ status: 500 \}\)/.test(c)))
  v(`🔴 route ${nom} : une lecture d’options en échec REFUSE (jamais « aucune option »)`,
    nom === 'encodée'
      ? /if \(eA \|\| eO \|\| eV \|\| eD \|\| eG\) return non\(/.test(c)
      : /if \(errOptions \|\| errGroupes\) \{[^}]*\}, \{ status: 500 \}\)\s*\}/.test(c))
  v(`🔴 route ${nom} : la ligne enregistre ce qu’elle retire vraiment du stock`,
    c.includes('quantite_stock: l.quantite_stock,') && c.includes('duo_article_id: l.deal_article2_id || null,'))
  // (12/10) La route des rendez-vous jetait le nom, la version et l'offre.
  v(`🔴 route ${nom} : la ligne fige le nom vendu`, c.includes('article_nom: l.article_nom,'))
  if (nom !== 'encodée') {
    v(`🔴 route ${nom} : la ligne garde sa version et son offre`,
      c.includes('variante_id: l.variante_id || null,') && c.includes('deal_id: l.deal_id || null,'))
    v(`🔴 route ${nom} : le plafond des offres est vérifié AVANT de créer la commande`,
      /const verifOffres = await verifierQuantiteOffres\(\{[\s\S]*?\}\)\s*if \(!verifOffres\.ok\)/.test(c)
      && c.search(/\.from\('commandes'\)\s*\.insert\(/) > c.indexOf('await verifierQuantiteOffres({')
      && c.indexOf('await verifierQuantiteOffres({') > 0)
  }
}
v('🔴 le tableau de bord compte le « déjà commandé » par la même vue que le serveur',
  /\.from\('consommation_stock'\)\s*\.select\('article_id, quantite, commande_id'\)/.test(code('app/dashboard/ConfigDashboard.js')))

// ═══════════════════════════════════════════════════════════════════════════
// 3. LES ÉCRANS NE CONTOURNENT PLUS LE CHOIX
// ═══════════════════════════════════════════════════════════════════════════
{
  const fiche = code('app/commander/[slug]/page.js')
  v('🔴 fiche détaillée : un article à options passe par le choix (OptionsSelector), plus par « Ajouter » direct',
    /\(!hasVar && onAjouter && !article\.est_vitrine && groupes\.length > 0\) \? \(\s*<OptionsSelector article=\{article\} groupes=\{groupes\}\s*onAjouter=\{\(a, opts\) => \{ onAjouter\(a, opts\); onClose\(\) \}\}\/>/.test(fiche)
    && fiche.includes('groupes={optionsParArticle[articleDetail.id] || []}')
    && fiche.includes('onAjouter={peutCommander ? (a, opts = null) => ajouterAuPanier(a, opts) : null}'))
  v('le titre du choix ne présume pas du genre de l’article (« Ta personnalisation : … », choisi par Alex ; jamais « Personnalise ton »)',
    fiche.includes('>Ta personnalisation : {article.nom}</p>') && !/Personnalise (ton|ta) \{article\.nom\}/.test(fiche))
  // ⚠️ RÉORIENTÉES LE 13/10 : « obligatoire » passe par `bornesChoix` (un
  // nombre de choix minimum compte aussi). Même but, même garde.
  // ⚠️ REPOINTÉE LE 21/10 : seuls les groupes TOUJOURS affichés comptent
  // (`groupesActifs` sur une sélection vide) ; un groupe dépendant obligatoire
  // n'est exigé qu'avec son option.
  v('🔴 panier venu du rendez-vous : un article à choix obligatoire (ou à nombre minimum) reste derrière, et le client est prévenu',
    fiche.includes('if (groupesActifs(optionsParArticle[article.id] || [], {}).some(g => bornesChoix(g).min > 0)) { ignores.push(article.nom); continue }')
    && fiche.includes('setPanierRepris({ repris, ignores })'))
  // (13/10) La fiche : groupes lus AVEC les prix par taille (lien nommé), le
  // choix passe par le module partagé, le total aussi.
  v('🔴 fiche : groupes lus avec leurs prix par taille, par la constante partagée (lien nommé)',
    (fiche.match(/\.select\(SELECT_GROUPES_AVEC_VALEURS\)/g) || []).length === 2 && !fiche.includes("'*, valeurs:article_options_valeurs(*)'")
    && OC.SELECT_GROUPES_AVEC_VALEURS.includes('!article_options_prix_taille_valeur_id_fkey(')
    && OC.SELECT_GROUPES_AVEC_VALEURS.includes('valeurs:article_options_valeurs!article_options_valeurs_groupe_id_fkey('))
  // ⚠️ REPOINTÉE LE 21/10 : la bascule reçoit tous les groupes (purge des
  // groupes dépendants), seuls les groupes actifs sont exigés, et ce qui part
  // au panier est purgé ; le total ne compte que les groupes actifs.
  v('🔴 fiche : le choix suit les bornes du serveur et le prix selon la taille',
    /const r = basculerValeur\(selections, groupe, valeur, groupes\)/.test(fiche)
    && /groupesActifs\(groupes, selections\)\.forEach\(g => \{\s*const refus = refusDuGroupe\(g, \(selections\[g\.id\] \|\| \[\]\)\.length\)\s*if \(refus\) \{ errs\[g\.id\] = refus; ok = false \}/.test(fiche)
    && /setErreurs\(errs\)\s*if \(!ok\) return\s*const choix = purgerInactifs\(selections, groupes\)\s*onAjouter\(article, Object\.keys\(choix\)\.length > 0 \? choix : null\)/.test(fiche)
    && /const supplement = supplementDeSelection\(selections, groupes\)/.test(fiche) && /prixDeValeur\(v, idsChoisis\)/.test(fiche))
  v('🔴 fiche : le total à l’écran reçoit les prix par taille, et plus aucun prix unique additionné à la main',
    /prixTaille: prixTailleDesGroupes\(Object\.values\(optionsParArticle \|\| \{\}\)\.flat\(\)\),/.test(fiche)
    && !/prix_supplement\s*\|\|\s*0\), 0\)/.test(fiche) && (fiche.match(/supplementDeSelection\(/g) || []).length >= 4)
  const modale = code('app/dashboard/ModalNouvelleCommande.js')
  v('🔴 encodage manuel : mêmes bornes, même prix selon la taille, même total que le serveur',
    /prixTaille: prixTailleDesGroupes\(Object\.values\(groupes\)\.flat\(\)\),/.test(modale)
    // ⚠️ REPOINTÉE LE 21/10 : mêmes règles du groupe dépendant que la fiche.
    && /basculerValeur\(s, g, v, groupes\[enOptions\.id\] \|\| \[\]\)\.selections/.test(modale) && /const prix = prixDeValeur\(v, idsChoisis\)/.test(modale)
    && /disabled=\{groupesActifs\(groupes\[enOptions\.id\] \|\| \[\], selections\)\.some\(g => refusDuGroupe\(g, \(selections\[g\.id\] \|\| \[\]\)\.length\)\)\}/.test(modale)
    && /Object\.entries\(purgerInactifs\(selections, groupes\[enOptions\.id\] \|\| \[\]\)\)/.test(modale))
  const catalogue = code('app/api/equipe/commande/catalogue/route.js')
  v('🔴 le catalogue de l’encodage lit le nombre de choix et les prix par taille (lien nommé)',
    catalogue.includes('obligatoire, choix_min, choix_max,')
    && catalogue.includes('valeurs:article_options_valeurs!article_options_valeurs_groupe_id_fkey(id, nom, prix_supplement, groupe_id,')
    && catalogue.includes('prix_taille:article_options_prix_taille!article_options_prix_taille_valeur_id_fkey(taille_valeur_id, prix)'))

  // (13/10) LE RÉGLAGE DU COMMERÇANT
  const config = code('app/dashboard/ConfigDashboard.js')
  const iOA = config.indexOf('function OptionsArticle(')
  const oa = iOA === -1 ? '' : config.slice(iOA, config.indexOf('\nfunction ', iOA + 10))
  // ⚠️ REPOINTÉE LE 13/10, PAS DÉSARMÉE : le panneau ne lit plus lui-même
  // (45 requêtes), il prend ce que lit le parent, avec la MÊME constante.
  v('🔴 l’écran des options lit les prix par taille (constante partagée, lien nommé)',
    /\.from\('article_options_groupes'\)\s*\.select\(SELECT_GROUPES_AVEC_VALEURS\)\s*\.in\('article_id', ids\)/.test(code('app/dashboard/ConfigDashboard.js'))
    && /const groupes = groupesParArticle\[String\(articleId\)\] \|\| \[\]/.test(oa))
  v('🔴 le nombre de choix passe par le contrôle partagé avant d’être écrit',
    /const r = bornesDepuisSaisie\(/.test(oa) && /if \(!r\.ok\) \{ toast\(r\.error, 'error'\); return \}\s*setReglageEnCours\(true\)\s*const \{ error \} = await supabase\.from\('article_options_groupes'\)\.update\(\{ choix_min: r\.choix_min, choix_max: r\.choix_max \}\)/.test(oa))
  v('🔴 les prix par taille : contrôlés, puis ceux de CETTE option remplacés, et l’erreur se dit',
    /const r = lignesPrixTaille\(v\.id, prixTailleForm\)/.test(oa)
    && /\.from\('article_options_prix_taille'\)\.delete\(\)\.eq\('valeur_id', v\.id\)/.test(oa)
    && /\.from\('article_options_prix_taille'\)\.insert\(r\.lignes\)/.test(oa)
    && /if \(errDel \|\| errIns\) \{ toast\(/.test(oa))
  v('le prix par taille ne se propose que s’il existe un groupe de tailles', /const tailles = groupeDesTailles\(groupes, g\.id\)/.test(oa) && /const reglable = !!tailles && g\.type !== 'unique'/.test(oa))
  v('les boutons d’enregistrement travaillent (points) et ne partent pas deux fois',
    (oa.match(/disabled=\{reglageEnCours\}/g) || []).length >= 2 && /if \(reglageEnCours\) return/.test(oa))

  const rdv = code('app/commander/rdv/[slug]/page.js')
  v('🔴 tunnel rendez-vous : les choix obligatoires (et les nombres minimum) sont lus, et une lecture en échec ferme l’achat de tout',
    // ⚠️ REPOINTÉE LE 21/10 : un groupe dépendant ne rend pas l'article « à
    // choix obligatoire » à lui seul.
    rdv.includes(".from('article_options_groupes').select('article_id, obligatoire, type, choix_min, choix_max, depend_de_valeur_id').in('article_id', ids)")
    && rdv.includes('obligatoires = errGrp ? new Set(ids) : new Set((grp || []).filter(g => !g.depend_de_valeur_id && bornesChoix(g).min > 0).map(g => g.article_id))'))
  v('🔴 tunnel rendez-vous : pas d’achat d’un article à choix obligatoire (tuile, ajout, reprise)',
    rdv.includes('const achetable = produitsAchetables && !p.est_vitrine && Number(p.prix) > 0 && !p.choix_obligatoire')
    && rdv.includes('if (article?.choix_obligatoire) return')
    && rdv.includes('|| article.choix_obligatoire) continue')
    && rdv.includes('À composer en boutique'))
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LA MIGRATION
// ═══════════════════════════════════════════════════════════════════════════
{
  const sql = lire('migrations/MIGRATION_LOTS_STOCK_REEL.sql')
  v('🔴 migration : les deux colonnes, la vue qui ajoute le second article du duo',
    sql.includes('ADD COLUMN IF NOT EXISTS quantite_stock integer')
    // 🔴 SANS CLÉ ÉTRANGÈRE (11/10) : un second lien vers `articles` rendait
    // ambiguë toute lecture `article:articles(…)` depuis les lignes, et
    // l'essai entier refusait ses commandes (vu par Alex).
    && /ADD COLUMN IF NOT EXISTS duo_article_id uuid;/.test(sql)
    && !/duo_article_id uuid REFERENCES/.test(sql)
    && sql.includes('DROP CONSTRAINT IF EXISTS commande_articles_duo_article_id_fkey;')
    && sql.includes("'1'\n) t ORDER BY n;".replace('\n', sql.includes('\r\n') ? '\r\n' : '\n'))
    && /SELECT ca\.commande_id, ca\.article_id, COALESCE\(ca\.quantite_stock, ca\.quantite\) AS quantite\s+FROM public\.commande_articles ca\s+UNION ALL\s+SELECT ca\.commande_id, ca\.duo_article_id AS article_id, ca\.quantite\s+FROM public\.commande_articles ca\s+WHERE ca\.duo_article_id IS NOT NULL;/.test(sql))
  v('🔴 migration : la vue applique la RLS (security_invoker) et reste fermée aux visiteurs',
    sql.includes('CREATE OR REPLACE VIEW public.consommation_stock WITH (security_invoker = true) AS')
    && sql.includes('REVOKE ALL ON public.consommation_stock FROM PUBLIC, anon, authenticated;')
    && sql.includes('GRANT SELECT ON public.consommation_stock TO authenticated, service_role;'))
  v('🔴 migration : les fonctions sont RELUES EN BASE, avec le nombre exact de lectures attendu, sinon rien ne change',
    sql.includes('avant := pg_get_functiondef(r.oid);')
    && sql.includes("CASE p.proname WHEN 'reserver_stock_atomique' THEN 3 ELSE 1 END AS attendu")
    && /IF n <> r\.attendu THEN\s+RAISE EXCEPTION/.test(sql)
    && sql.includes("apres := replace(avant, motif, 'FROM public.consommation_stock ca');"))
  // Vise le BLOC qui réécrit, pas une ligne : ajouter la fonction à la liste
  // gardait le début de la ligne intact (mutation restée verte, 11/10).
  const reecriture = sql.slice(sql.indexOf('DO $$'), sql.indexOf('END $$;'))
  v('🔴 migration : `vendu_par_offre` n’est PAS touchée (le plafond d’une offre compte des lots)',
    reecriture.length > 0 && !reecriture.includes('vendu_par_offre')
    && /AND p\.proname IN \('reserver_stock_atomique', 'stock_commande_par_article', 'ventes_stock_magasin'\)\r?\n/.test(reecriture)
    && sql.includes("'30f9a6390691143e65b54ac84c8c5491'"))
}

// ═══ 5. LE LIEN NOMMÉ (12/10) ════════════════════════════════════════════════
// 🔴 « Could not embed because more than one relationship was found for
// 'commande_articles' and 'articles' » : le tableau de bord de Chez Momo
// n'affichait plus aucune commande (Alex, 12/10). Un second chemin entre les
// lignes et les articles rend AMBIGUË toute lecture `article:articles(…)`
// depuis les lignes, et Supabase refuse la requête ENTIÈRE. Le lien est donc
// TOUJOURS nommé : un chemin ajouté demain ne cassera plus rien.
{
  const { readdirSync, statSync } = await import('node:fs')
  const { join } = await import('node:path')
  const tous = []
  const parcourir = (d) => {
    for (const n of readdirSync(new URL(d, RACINE))) {
      const rel = join(d, n).replace(/\\/g, '/')
      if (statSync(new URL(rel, RACINE)).isDirectory()) { if (n !== 'node_modules') parcourir(rel + '/') }
      else if (/\.(js|jsx|ts|tsx)$/.test(n)) tous.push(rel)
    }
  }
  parcourir('app/'); parcourir('lib/')
  const nus = tous.filter(f => /article:articles\(/.test(code(f)))
  v('🔴 aucune lecture `article:articles(…)` sans le lien nommé (`!commande_articles_article_id_fkey`)', nus.length === 0, nus.join(', '))
  v('le tableau de bord nomme le lien dans ses deux lectures de commandes',
    (code('app/dashboard/page.js').match(/article:articles!commande_articles_article_id_fkey\(/g) || []).length === 2)

  // (21/10) LE GROUPE DÉPENDANT : `article_options_groupes.depend_de_valeur_id`
  // est un SECOND chemin entre groupes et valeurs. Toute lecture jointe entre
  // les deux nomme `article_options_valeurs_groupe_id_fkey`, AVANT la migration :
  // sinon la fiche, le paiement et le tableau de bord tombent ensemble.
  const anonymes = tous.filter(f => /article_options_valeurs\(|article_options_groupes\(|article_options_groupes!inner/.test(code(f)))
  v('🔴 aucune lecture jointe groupes ↔ valeurs d’options sans le lien nommé', anonymes.length === 0, anonymes.join(', '))
  const nommes = tous.reduce((n, f) => n + (code(f).match(/article_options_(valeurs|groupes)!article_options_valeurs_groupe_id_fkey/g) || []).length, 0)
  v('les 5 lectures jointes nomment le lien (fiche et tableau de bord, paiement, duplication, relecture des copies, encodage)',
    nommes === 5, `${nommes} trouvées`)
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. LE GROUPE DÉPENDANT (21/10, Alex, 7 Abbayes) : « Choix de crudités »
//    n'apparaît, et n'est exigé, que si « Avec crudités +0,50 € » est cochée.
// ═══════════════════════════════════════════════════════════════════════════
{
  const sw = { id: 's1', nom: 'Jambon-fromage', prix: 4, actif: true, commercant_id: 'c1', tva_taux: 6, temps_prepa: 2 }
  const gC = { id: 'gC', article_id: 's1', nom: 'Crudités', obligatoire: true, type: 'unique', depend_de_valeur_id: null }
  const gL = { id: 'gL', article_id: 's1', nom: 'Choix de crudités', obligatoire: true, type: 'multiple', depend_de_valeur_id: 'vAvec' }
  // Sur le croissant vendu en LOT : un groupe dépendant aussi.
  const gK = { id: 'gK', article_id: 'k1', nom: 'Extra', obligatoire: false, type: 'unique', depend_de_valeur_id: null }
  const gKd = { id: 'gKd', article_id: 'k1', nom: 'Choix extra', obligatoire: false, type: 'multiple', depend_de_valeur_id: 'vKAvec' }
  const gs = [gC, gL, gK, gKd]
  const val = (id, g, nom, prix = 0) => ({ id, nom, prix_supplement: prix, groupe_id: g.id, article_options_groupes: { article_id: g.article_id, nom: g.nom } })
  const vals = [val('vAvec', gC, 'Avec crudités', 0.5), val('vSans', gC, 'Sans crudités'), val('vSalade', gL, 'Salade'), val('vTomates', gL, 'Tomates'),
    val('vKAvec', gK, 'Avec extra', 0.3), val('vKChoco', gKd, 'Chocolat', 0.4)]
  const c2 = (panier, extra = {}) => construireLignesCommande({
    panier, articlesData: [sw, croissant], optionsValeurs: vals, variantesData: [], dealsData: [lot],
    commercant, regime: 'emporter', dateCommande: JOUR, groupesOptions: gs, ...extra,
  })
  const ok1 = c2([{ id: 's1', quantite: 1, options: [{ valeur_ids: ['vTomates', 'vAvec', 'vSalade'] }] }])
  v('🔴 avec crudités + salade + tomates : 4 + 0,50 = 4,50 €, une seule fois quel que soit le nombre',
    ok1.ok && ok1.totalCents === 450, JSON.stringify(ok1))
  v('🔴 le ticket met l’option parente AVANT ses crudités, jamais l’ordre des clics',
    ok1.ok && ok1.lignes[0].options.map(o => o.valeur_nom).join(',') === 'Avec crudités,Tomates,Salade', JSON.stringify(ok1.lignes?.[0]?.options))
  const gratuit = c2([{ id: 's1', quantite: 1, options: [{ valeur_ids: ['vSans', 'vTomates'] }] }])
  v('🔴 « Sans crudités » + tomates : REFUSÉ (plus de crudités gratuites)',
    !gratuit.ok && gratuit.option_en_trop === true && /Tomates/.test(gratuit.error), JSON.stringify(gratuit))
  const seul = c2([{ id: 's1', quantite: 1, options: [{ valeur_ids: ['vTomates'] }] }])
  v('🔴 des crudités sans aucune option parente : REFUSÉ', !seul.ok && seul.option_en_trop === true, JSON.stringify(seul))
  const sans = c2([{ id: 's1', quantite: 1, options: [{ valeur_ids: ['vSans'] }] }])
  v('🔴 « Sans crudités » seul : accepté, le groupe dépendant obligatoire n’est PAS exigé', sans.ok && sans.totalCents === 400, JSON.stringify(sans))
  const avecRien = c2([{ id: 's1', quantite: 1, options: [{ valeur_ids: ['vAvec'] }] }])
  v('🔴 « Avec crudités » sans en choisir : le groupe dépendant obligatoire EST exigé',
    !avecRien.ok && avecRien.option_manquante === true && /Choix de crudités/.test(avecRien.error), JSON.stringify(avecRien))
  const lotGlisse = c2([{ id: 'k1', quantite: 1, deal_id: 'dLot', options: [{ valeur_ids: ['vKChoco'] }] }])
  v('🔴 sur une OFFRE aussi : un choix dépendant sans son option est refusé (les suppléments y sont comptés)',
    !lotGlisse.ok && lotGlisse.option_en_trop === true, JSON.stringify(lotGlisse))
  const ecran = c2([{ id: 's1', quantite: 1, options: [{ valeur_ids: ['vSans', 'vTomates'] }] }], { groupesOptions: null })
  v('sans liste de groupes (total à l’écran) : aucun contrôle, l’écran purge lui-même', ecran.ok)

  // L'écran : mêmes règles, par le module partagé.
  const gsArticle = [{ ...gC, valeurs: vals.filter(x => x.groupe_id === 'gC') }, { ...gL, valeurs: vals.filter(x => x.groupe_id === 'gL') }]
  const [GC, GL] = gsArticle
  const avecSel = { gC: [GC.valeurs[0]], gL: [GL.valeurs[0], GL.valeurs[1]] }
  v('🔴 groupe actif seulement si son option est cochée',
    OC.groupeActif(GL, avecSel) && !OC.groupeActif(GL, { gC: [GC.valeurs[1]] }) && OC.groupeActif(GC, {}))
  const bascule = OC.basculerValeur(avecSel, GC, GC.valeurs[1], gsArticle)
  v('🔴 passer à « Sans crudités » VIDE les crudités cochées',
    !bascule.selections.gL && bascule.selections.gC[0].id === 'vSans', JSON.stringify(bascule.selections))
  const decoche = OC.basculerValeur({ gC: [GC.valeurs[0]], gL: [GL.valeurs[0]] }, { ...GC, type: 'multiple', obligatoire: false }, GC.valeurs[0], gsArticle)
  v('🔴 décocher l’option parente vide aussi le groupe dépendant', !decoche.selections.gL, JSON.stringify(decoche.selections))
  v('🔴 le total à l’écran ne compte pas les choix d’un groupe caché',
    OC.supplementDeSelection({ gC: [GC.valeurs[1]], gL: [{ id: 'vX', prix_supplement: 2 }] }, gsArticle) === 0
    && OC.supplementDeSelection(avecSel, gsArticle) === 0.5)
  v('🔴 un groupe caché n’est jamais exigé (seuls les groupes actifs le sont)',
    OC.groupesActifs(gsArticle, { gC: [GC.valeurs[1]] }).map(g => g.id).join() === 'gC')
  // « Menu +3 € » facultatif, « Boisson du menu » obligatoire qui en dépend.
  const gMenu = { id: 'gM', nom: 'Menu', type: 'unique', obligatoire: false, valeurs: [{ id: 'vMenu' }] }
  const gBoisson = { id: 'gB', nom: 'Boisson du menu', type: 'unique', obligatoire: true, depend_de_valeur_id: 'vMenu', valeurs: [{ id: 'b1' }, { id: 'b2' }] }
  const gSauce = { id: 'gS', nom: 'Sauce', type: 'unique', obligatoire: true, valeurs: [{ id: 's1' }, { id: 's2' }] }
  v('🔴 l’ordre : chaque groupe dépendant juste sous son parent, même obligatoire sous un parent facultatif',
    OC.ordonnerGroupes([gBoisson, gMenu, gSauce]).map(g => g.id).join() === 'gS,gM,gB', OC.ordonnerGroupes([gBoisson, gMenu, gSauce]).map(g => g.id).join())
  v('🔴 un groupe dépendant à choix unique n’est JAMAIS pris pour le groupe des tailles',
    OC.groupeDesTailles([gMenu, gBoisson]) === null)
  v('la liste du commerçant : ordre de création, chaque enfant sous son parent',
    OC.parentsPuisEnfants([gBoisson, gSauce, gMenu]).map(g => g.id).join() === 'gS,gM,gB')
  v('l’option qui fait apparaître un groupe se retrouve (pour « avec « Menu » »)',
    OC.optionParente(gBoisson, [gMenu, gBoisson])?.valeur?.id === 'vMenu' && OC.optionParente(gMenu, [gMenu]) === null)

  // Les écrans branchent ces règles.
  const fiche = code('app/commander/[slug]/page.js')
  v('🔴 fiche : un groupe dépendant s’affiche en retrait, la carte à lire dit « avec … »',
    /const sousGroupe = estDependant\(g\)/.test(fiche) && /optionParente\(g, groupes\) && <span/.test(fiche))
  v('🔴 le catalogue de l’encodage lit la condition d’affichage',
    code('app/api/equipe/commande/catalogue/route.js').includes('choix_max, depend_de_valeur_id, created_at'))
}

console.log(`\nLots et options : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
