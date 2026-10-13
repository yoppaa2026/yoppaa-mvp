// HARNAIS DE MUTATION — LE MENU LU : RELECTURE ET CREATION (13/10)
//
// 🔴 CE QU ON MESURE : rien n est cree sans relecture, un doute bloque, la TVA
// se choisit, le stock suit le metier, l ecriture ne melange pas les articles
// et ne tait aucun echec. Chaque mutation casse UNE regle, et le banc nomme
// doit rougir.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   npm run mutations:menu-creation

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:menu-creation'
const LU = 'verif:menu'

const CREATION = 'lib/menu-creation.js'
const RELECTURE = 'lib/menu-relecture.js'
const LECTURE = 'lib/menu-lu.js'
const ECRAN = 'app/dashboard/LectureMenu.js'
const DASH = 'app/dashboard/ConfigDashboard.js'

const MUTATIONS = [
  // ─── LE PLAN ─────────────────────────────────────────────────────────────
  { nom: '🔴 le plan cree un article encore a verifier',
    fichier: CREATION, de: '    if (a.doutes?.length > 0 && !a.verifie) return', vers: '    if (false) return' },
  { nom: '🔴 la TVA vide passe pour un choix',
    fichier: CREATION, de: "  if (reglages.tva === '' || reglages.tva === undefined || reglages.tva === null) {", vers: '  if (false) {' },
  { nom: '🔴 la quantite par jour n est plus controlee',
    fichier: CREATION, de: '    const refus = refusQuantite(mode, reglages.quantite)', vers: '    const refus = null' },
  { nom: '🔴 la pizzeria cree en « par jour » sans quantite',
    fichier: CREATION, de: "    stock = champsStock({ mode: 'illimite', saisie: '' })", vers: "    stock = champsStock({ mode: 'jour', saisie: '' })" },
  { nom: '🔴 les deux circuits d un nouvel article sont oublies',
    fichier: CREATION, de: '    circuits = champsCircuits(form)', vers: '    circuits = null' },
  { nom: '⚠️ l ordre du menu repart a 1 dans chaque categorie',
    fichier: CREATION, de: '    const ordre = (dernierOrdre.get(cleCat) || 0) + 1', vers: '    const ordre = 1' },
  { nom: '⚠️ « pizzas » cree une categorie a cote de « Pizzas »',
    fichier: CREATION, de: '  return existantes.find(c => cleNom(c) === cleNom(n)) || n', vers: '  return n' },
  { nom: '🔴 le supplement commun s applique d office a la categorie du menu',
    fichier: CREATION, de: '      if (!s.appliquerA || cleNom(s.appliquerA) !== cleCat) continue', vers: "      if (cleNom(s.appliquerA || s.pour || '') !== cleCat) continue" },
  { nom: '⚠️ une taille inconnue n est plus comptee',
    fichier: CREATION, de: '      if (!t) { compteur.inconnues++; continue }', vers: '      if (!t) { continue }' },
  { nom: '⚠️ un article sans tailles est compte comme une anomalie',
    fichier: CREATION, de: '  if (valeursTaille.length === 0) return lignes', vers: '' },
  { nom: '⚠️ le taux sur place est ignore',
    fichier: CREATION, de: '      tva_taux_sur_place: communs.tvaSurPlace,', vers: '      tva_taux_sur_place: null,' },

  // ─── L ECRITURE ──────────────────────────────────────────────────────────
  { nom: '🔴 les groupes vont tous au premier article',
    fichier: CREATION, de: '      .insert(art.groupes.map(({ groupe: g }) => ({ article_id: ligne.id,', vers: '      .insert(art.groupes.map(({ groupe: g }) => ({ article_id: crees[0].id,' },
  { nom: '🔴 un article refuse disparait sans un mot',
    fichier: CREATION, de: "    if (error || !ligne?.id) { echecs.push({ cle: art.cle, nom: art.nom, erreur: error?.message || 'création refusée' }); continue }", vers: '    if (error || !ligne?.id) { continue }' },
  { nom: '🔴 des options refusees passent pour creees',
    fichier: CREATION, de: "    if (errV || !Array.isArray(vs)) { manque('options non créées', errV); continue }", vers: '    if (errV || !Array.isArray(vs)) { continue }' },
  { nom: '⚠️ la liste des categories s ecrit sans aucun article cree',
    fichier: CREATION, de: '  if (plan.categories && crees.length > 0) {', vers: '  if (plan.categories) {' },

  // ─── LA RELECTURE ────────────────────────────────────────────────────────
  { nom: '🔴 un article deja au catalogue arrive coche',
    fichier: RELECTURE, de: '        garder: !deja,', vers: '        garder: true,' },
  { nom: '🔴 les supplements communs arrivent appliques',
    fichier: RELECTURE, de: "    supplements: (proposition?.supplements || []).map((s, i) => ({ ...s, cle: `s${i}`, appliquerA: '' })),", vers: "    supplements: (proposition?.supplements || []).map((s, i) => ({ ...s, cle: `s${i}`, appliquerA: s.pour || '' }))," },
  { nom: '🔴 un doute non verifie ne bloque plus',
    fichier: RELECTURE, de: '    pret: coches.length > 0 && sansPrix === 0 && sansNom === 0 && aVerifier === 0,', vers: '    pret: coches.length > 0 && sansPrix === 0 && sansNom === 0,' },
  { nom: '⚠️ un prix de 0 € est accepte',
    fichier: RELECTURE, de: '  return n !== null && n > 0 && n <= PRIX_MAX ? n : null', vers: '  return n !== null && n >= 0 && n <= PRIX_MAX ? n : null' },

  // ─── L ECRAN ─────────────────────────────────────────────────────────────
  { nom: '🔴 le bouton Creer ignore les reglages communs',
    fichier: ECRAN, de: '  const pret = !!bilan?.pret && verdictReglages.ok', vers: '  const pret = !!bilan?.pret' },
  { nom: '🔴 ce qui est cree reste coche (double au second clic)',
    fichier: ECRAN, de: '{ ...a, garder: false, deja: true }', vers: '{ ...a, deja: true }' },
  { nom: '⚠️ le poids n est plus verifie avant l envoi',
    fichier: ECRAN, de: '      if (documents.reduce((n, d) => n + d.data.length, 0) > TAILLE_MAX_BASE64) {', vers: '      if (false) {' },
  { nom: '🔴 la creation saute le plan',
    fichier: ECRAN, de: '    if (!plan.ok) { setErreur(plan.error); return }', vers: '' },
  { nom: '🔴 le bouton Lire mon menu s ouvre hors alimentaire',
    fichier: DASH, de: "          {estAlimentaire && subTab === 'articles' && (", vers: "          {subTab === 'articles' && (" },

  // ─── LA LECTURE (13/10, session 2) ───────────────────────────────────────
  { nom: '🔴 des bornes impossibles sont devinees', banc: LU,
    fichier: LECTURE, de: '  if (min !== null && max !== null && min > max) return null', vers: '' },
  { nom: '🔴 un prix par taille sans tailles reste muet', banc: LU,
    fichier: LECTURE, de: "        doutes.push(`« ${v.nom} » a un prix par taille, mais l'article n'a pas de tailles : vérifie-le.`)", vers: '' },
  { nom: '⚠️ un choix unique garde des bornes', banc: LU,
    fichier: LECTURE, de: '    choix_max: multiple ? max : null,', vers: '    choix_max: max,' },
  { nom: '⚠️ un sujet inconnu passe tel quel', banc: LU,
    fichier: LECTURE, de: "    infos.push({ sujet: SUJETS_INFOS.includes(i?.sujet) ? i.sujet : 'autre', texte: t })", vers: "    infos.push({ sujet: i?.sujet || 'autre', texte: t })" },
  { nom: '🔴 la consigne laisse recopier un numero de telephone', banc: LU,
    fichier: LECTURE, de: 'Ne recopie jamais un numéro de téléphone ou une adresse e-mail.', vers: '' },
  { nom: '⚠️ une taille inconnue est retiree sans un mot', banc: LU,
    fichier: LECTURE, de: '        if (!connues.includes(p)) doutes.push(`Taille « ${p.taille} » inconnue pour « ${v.nom} » : vérifie-la.`)', vers: '' },
]

const lancer = (banc = BANC) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const BANCS = [...new Set(MUTATIONS.map((m) => m.banc || BANC))]
for (const banc of BANCS) {
  const depart = lancer(banc)
  if (depart.rouge) {
    console.log(`🔴 ${banc} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
    console.log(depart.extrait)
    process.exit(1)
  }
}
console.log(`Bancs verts au départ : ${BANCS.join(', ')}.\n`)

let attrapees = 0
const manquees = []
for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer(m.banc)
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }
  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }
const finalRouge = BANCS.some((banc) => lancer(banc).rouge)
if (finalRouge) console.log(`🔴 UN BANC EST ROUGE APRÈS RESTAURATION (${BANCS.join(', ')}).`)
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
