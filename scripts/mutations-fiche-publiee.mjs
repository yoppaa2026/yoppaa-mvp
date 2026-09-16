// HARNAIS DE MUTATION — LA FICHE ACCUEILLE-T-ELLE DES CLIENTS ? (16/09)
//
// 🔴 CE QU'ON MESURE : que les gardes de `verif:acces` TIENNENT sur la seconde
// porte, celle de la fiche. Le defaut d'origine etait qu'une reservation se
// posait chez un commerce en preparation, invisible pour tout le monde, parce
// que `rdv_actif` etait le seul verrou du serveur.
//
// ⚠️ ET LE DEFAUT SYMETRIQUE, CELUI QU'ON CRAINT LE PLUS : la colonne absente
// d'un select. La regle rend alors `false` pour TOUT LE MONDE et le commerce
// publie se voit refuser ses propres clients, sans un mot. Deux mutations le
// visent directement.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, verifie par npm run verif:ancres.
//
//   node scripts/mutations-fiche-publiee.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:acces'
const MODULE = 'lib/statut-commercant.js'

const MUTATIONS = [
  // ─── LA REGLE ELLE-MEME ─────────────────────────────────────────────────
  { nom: '🔴 la liste blanche devient une liste noire : un etat invente demain entre',
    de: "  return commercant?.[COLONNE_PUBLICATION] === PUBLICATION_OUVERTE",
    vers: "  return commercant?.[COLONNE_PUBLICATION] !== 'rejete'" },

  { nom: '🔴 LE PIEGE DE LA COLONNE ABSENTE : une fiche sans la colonne est declaree ouverte',
    de: "  return commercant?.[COLONNE_PUBLICATION] === PUBLICATION_OUVERTE",
    vers: "  return commercant?.[COLONNE_PUBLICATION] !== 'suspendu'" },

  // ─── LA ROUTE QUI POSAIT LE RENDEZ-VOUS ─────────────────────────────────
  { nom: '🔴 le rendez-vous se repose chez un commerce en preparation',
    fichier: 'app/api/rdv/reserver/route.js',
    de: '    if (!fichePubliee(commercant)) {',
    vers: '    if (false) {' },

  { nom: '🔴 LE SYMETRIQUE : la colonne quitte le select et la route refuse TOUS ses clients',
    fichier: 'app/api/rdv/reserver/route.js',
    de: "'id, nom, slug, categorie, statut_publication, rdv_actif,",
    vers: "'id, nom, slug, categorie, rdv_actif," },

  { nom: '⚠️ le refus apprend au client qu un commerce se prepare',
    fichier: 'app/api/rdv/reserver/route.js',
    de: "code: 'fiche_non_publiee' },",
    vers: "code: 'commerce_en_preparation' }," },

  // ─── LES DEUX SOEURS DU COEUR TRANSACTIONNEL ────────────────────────────
  { nom: '🔴 la commande passe chez un commerce non publie',
    fichier: 'app/api/stripe/checkout/create-commande/route.js',
    de: '    if (!fichePubliee(commercant)) {',
    vers: '    if (false) {' },

  { nom: '🔴 le bon cadeau se vend chez un commerce non publie',
    fichier: 'app/api/bons-cadeaux/checkout/route.js',
    de: '    if (!fichePubliee(commercant)) {',
    vers: '    if (false) {' },

  // ─── LA LISTE D'ATTENTE ─────────────────────────────────────────────────
  { nom: '🔴 la file accepte un commerce dont la page n existe pour personne',
    fichier: 'lib/attente-rdv-server.js',
    de: "  if (!fichePubliee(commerce)) return { ok: false, error: 'commerce_ferme' }",
    vers: "  if (false) return { ok: false, error: 'commerce_ferme' }" },

  { nom: '🔴 une panne de lecture est annoncee comme un commerce ferme',
    fichier: 'lib/attente-rdv-server.js',
    de: "  if (errC) return { ok: false, error: 'lecture_ko' }",
    vers: "  if (false) return { ok: false, error: 'lecture_ko' }" },

  // ⚠️ L'ORDRE SE MESURE PAR L'EXECUTION, pas par une mutation : le banc note
  // les tables que `inscrire` ouvre, et la file ne doit jamais l'etre quand la
  // fiche est fermee. La mutation « le refus passe apres » referencait une
  // variable pas encore nee : elle changeait la TERMINAISON, pas le RESULTAT,
  // et faisait donc planter le banc au lieu de le faire rougir.

  // ─── LA REGLE RECOPIEE A LA MAIN, CELLE QUI A TOUT CAUSE ────────────────
  { nom: '🔴 une copie de la regle repart vivre ailleurs',
    fichier: 'lib/morning-eligibilite.js',
    de: '  if (!fichePubliee(c)) return false',
    vers: "  if (c.statut_publication !== 'publie') return false" },

  { nom: '🔴 le Good Morning juge sans la colonne : plus aucun commercant eligible',
    fichier: 'app/api/cron/morning-yoppers/route.js',
    de: 'commercant:commercants (id, nom, adresse, plan, essai_plan, created_at, statut_publication)',
    vers: 'commercant:commercants (id, nom, adresse, plan, essai_plan, created_at)' },

  // ─── CE QUE L'ADMIN MONTRE DE CES ETATS (16/09, trouve par Alex) ────────
  { nom: '🔴 la modale reinvente « publie » sur un etat qu elle ignore',
    fichier: 'app/admin/ModalEditCommercant.js',
    de: "      statut_publication: commercant.statut_publication || '',",
    vers: "      statut_publication: commercant.statut_publication || 'publie'," },

  { nom: '🔴 « Enregistrer » reecrit un statut que la modale n a jamais compris',
    fichier: 'app/admin/ModalEditCommercant.js',
    de: '      if (STATUTS_PUB.some(s => s.valeur === form.statut_publication)) {',
    vers: '      if (true) {' },

  { nom: '🔴 un etat inconnu se deguise a nouveau en « Suspendu »',
    fichier: 'app/admin/SectionTousCommercants.js',
    de: '            const badgeS = BADGE_STATUT[c.statut_publication] || BADGE_INCONNU',
    vers: '            const badgeS = BADGE_STATUT[c.statut_publication] || BADGE_STATUT.suspendu' },

  { nom: '🔴 « brouillon » disparait des badges : l inscription abandonnee redevient invisible',
    fichier: 'app/admin/SectionTousCommercants.js',
    de: "  brouillon:  { bg: '#EFF6FF', color: '#1D4ED8', label: 'Inscription non terminée' },",
    vers: "  brouillon_inconnu: { bg: '#EFF6FF', color: '#1D4ED8', label: 'Inscription non terminée' }," },

  // ─── DEPUIS COMBIEN DE TEMPS CELUI-LA ATTEND-IL ? ───────────────────────
  { nom: '🔴 le week-end compte : depose vendredi soir, « en retard » lundi matin',
    de: '    if (jour !== 0 && jour !== 6) n++',
    vers: '    n++' },

  { nom: '🔴 l alerte se declenche un jour trop tot, et sonne donc tout le temps',
    de: '  return { jours, ouvres, texte, enRetard: ouvres > JOURS_OUVRES_PROMIS }',
    vers: '  return { jours, ouvres, texte, enRetard: ouvres >= JOURS_OUVRES_PROMIS }' },

  { nom: '🔴 une date absente accuse un retard qu on ne peut pas connaitre',
    de: "    return { jours: null, ouvres: null, texte: 'date inconnue', enRetard: false }",
    vers: "    return { jours: null, ouvres: null, texte: 'date inconnue', enRetard: true }" },

  { nom: '🔴 l ecran de validation redonne une date sans dire l attente',
    fichier: 'app/admin/page.js',
    de: '              {attente.texte}',
    vers: '              {null}' },

  // ─── CEUX QUI SE SONT ARRETES EN ROUTE ──────────────────────────────────
  { nom: '🔴 la section des inscriptions non terminees n est plus montee',
    fichier: 'app/admin/page.js',
    de: '        <SectionInscriptionsEnCours />',
    vers: '        {null}' },

  { nom: '🔴 elle montre les fiches soumises au lieu des abandons',
    fichier: 'app/admin/SectionInscriptionsEnCours.js',
    de: "const ETAT_NON_TERMINEE = 'brouillon'",
    vers: "const ETAT_NON_TERMINEE = 'en_attente'" },

  { nom: '🔴 une lecture en echec se lit « personne n attend »',
    fichier: 'app/admin/SectionInscriptionsEnCours.js',
    de: '    if (error) { setErr(error.message); setLoading(false); return }',
    vers: '    if (false) { setErr(error.message); setLoading(false); return }' },

  { nom: '🔴 la colonne quitte le select : la section reste vide pour toujours',
    fichier: 'app/admin/SectionInscriptionsEnCours.js',
    de: '        id, nom, type, categorie, telephone, email, adresse, created_at, statut_publication,',
    vers: '        id, nom, type, categorie, telephone, email, adresse, created_at,' },

  { nom: '🔴 la section redonne une date brute au lieu de l attente',
    fichier: 'app/admin/SectionInscriptionsEnCours.js',
    de: '        const depuis = attenteDepuis(c.created_at)',
    vers: '        const depuis = { texte: c.created_at }' },

  // ─── ET LA DECISION QU'ON NE DOIT PAS « CORRIGER » ──────────────────────
  { nom: '✅ des seances deja payees se font refuser parce que la fiche est depubliee',
    fichier: 'app/api/rdv/reserver-abonnement/route.js',
    de: '  if (!prestation || String(prestation.commercant_id) !== String(contrat.commercant_id)) {',
    vers: "  const regle = 'fichePubliee'; if (!prestation || String(prestation.commercant_id) !== String(contrat.commercant_id)) {" },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTE ». Un banc qui explose au lieu de
    // rougir n est pas une mesure, c est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Banc vert au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier || MODULE)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier || MODULE}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
