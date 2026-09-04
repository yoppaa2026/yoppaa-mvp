// HARNAIS DE MUTATION — LE DÉLAI DE COMMANDE (04/09).
//
// 🔴 CE QU'ON MESURE : qu'un Yopper ne se voie jamais promettre un retrait que
// le commerçant ne peut pas tenir, et qu'un article lent ne bloque jamais tout
// le catalogue.
//
// Les deux erreurs coûtent, et elles sont symétriques. Trop permissif, la tarte
// de 48 h part pour ce midi et le boulanger découvre une commande impossible.
// Trop strict, le sandwich hérite des 48 h de la tarte et plus personne ne
// commande à 11 h. Aucune des deux ne lève d'erreur.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES : le dépôt est en CRLF.
//
//   node scripts/mutations-delai-commande.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:delai'
const MODULE = 'lib/delai-commande.js'
const FICHE = 'app/commander/[slug]/page.js'
const BORD = 'app/dashboard/ConfigDashboard.js'
const LIGNES = 'lib/lignes-commande.js'
const ROUTE = 'app/api/stripe/checkout/create-commande/route.js'

const MUTATIONS = [
  // ─── LE DÉLAI D'UNE LIGNE ───────────────────────────────────────────────
  //
  // 🔴 LE CAS QU'ALEX A CONSTRUIT EN AVOCAT DU DIABLE. La tarte qui reste à
  // 17 h est déjà faite ; lui réappliquer les 48 h de production rendrait
  // l'anti-gaspi inutilisable exactement là où il sert le plus.
  { nom: '🔴 l’invendu reprend le delai de production de son article',
    de: '  if (porteUneFenetre(ligne.offre)) return 0',
    vers: '  if (false) return 0' },

  // ⚠️ Une demi-fenêtre ne doit jamais servir de laissez-passer.
  { nom: '🔴 une demi-fenetre suffit a annuler un delai reel',
    de: '  if (porteUneFenetre(ligne.offre)) return 0',
    vers: '  if (ligne.offre) return 0' },

  { nom: '🔴 un delai NEGATIF fait remonter le retrait dans le passe',
    de: '  if (!Number.isFinite(brut) || brut <= 0) return 0',
    vers: '  if (!Number.isFinite(brut)) return 0' },

  // ─── LE PLUS CONTRAIGNANT GAGNE ─────────────────────────────────────────
  { nom: '🔴 le panier ne retient plus le delai le plus long',
    de: '    if (d > minutes) {',
    vers: '    if (d < minutes) {' },

  // ⚠️ « Cette commande demande 48 h » laisse le Yopper chercher lequel de ses
  // six articles bloque tout. Il ne cherchera pas, il partira.
  // ⚠️ ANCRE REFAITE LE 04/09 : le module lit maintenant `article_nom` en plus
  // de `nom`, parce que la ligne construite par le serveur n'a pas la même
  // forme que celle du panier. Le harnais l'a dit en « TEXTE INTROUVABLE ».
  // Septième fois qu'un point d'ancrage périme après un déplacement de code, et
  // septième fois que le harnais le rattrape au lieu de verdir en silence.
  { nom: '🔴 le coupable n’est plus nomme',
    de: '      nom = ligne?.nom || ligne?.article_nom || null',
    vers: '      nom = null' },

  // 🔴 ET LA FORME SERVEUR EN PARTICULIER. Ne lire que `nom` laisserait le
  // message du serveur dire « un article de ta commande », sans jamais nommer
  // la tarte : la ligne de commande, elle, s'appelle `article_nom`.
  { nom: '🔴 le serveur ne sait plus lire le nom de SA propre ligne',
    de: '      nom = ligne?.nom || ligne?.article_nom || null',
    vers: '      nom = ligne?.nom || null' },

  // ─── L'INVENDU NE SE REPORTE PAS ────────────────────────────────────────
  { nom: '🔴 le melange invendu + article lent n’est plus refuse',
    de: '  if (invendus.length === 0) return null',
    vers: '  if (true) return null' },

  { nom: '🔴 une fenetre DEJA FERMEE passe au paiement',
    de: '    if (reste === null) {',
    vers: '    if (false) {' },

  { nom: '🔴 un panier sans moment de retrait possible part quand meme',
    de: '    if (minutes > reste) {',
    vers: '    if (false) {' },

  // ─── QUAND LA PRÉPARATION EST FINIE ─────────────────────────────────────
  { nom: '🔴 un delai illisible fabrique une date invalide',
    de: '  return new Date(base.getTime() + (Number.isFinite(m) && m > 0 ? m : 0) * 60000)',
    vers: '  return new Date(base.getTime() + m * 60000)' },

  // ─── LE PREMIER CRÉNEAU POSSIBLE ────────────────────────────────────────
  { nom: '🔴 le delai n’ecarte plus les creneaux trop proches',
    de: '      if (debut.getTime() < pret.getTime()) continue',
    vers: '      if (false) continue' },

  // 🔴 LA CLÔTURE DU CRÉNEAU EST UNE BORNE INDÉPENDANTE, et c'est la fonction
  // du SERVEUR qui la lit. Deux calculs auraient divergé, et le Yopper se
  // serait fait refuser au paiement après avoir choisi son créneau.
  { nom: '🔴 la cloture du creneau n’est plus lue (l’ecran ment au serveur)',
    de: '      if (!creneauCommandable(cr, { dateStr: j.jour, maintenant, instantDebut }).ok) continue',
    vers: '      if (false) continue' },

  { nom: '🔴 les jours ne sont plus tries (« le premier » devient le hasard)',
    de: '    .sort((a, b) => String(a.jour).localeCompare(String(b.jour)))',
    vers: '    .filter(() => true)' },

  { nom: '🔴 les creneaux d’un jour ne sont plus tries',
    de: "      .sort((a, b) => String(a?.heure_debut || '').localeCompare(String(b?.heure_debut || '')))",
    vers: '      .filter(() => true)' },

  { nom: '🔴 le creneau plein ou ferme est propose quand meme',
    de: '      if (typeof utilisable === \'function\' && !utilisable(cr, j.jour)) continue',
    vers: '      if (false) continue' },

  // ─── LE PREMIER JOUR EN BOUTIQUE ────────────────────────────────────────
  //
  // 🔴 Une tarte prête à 19 h dans une boutique qui ferme à 18 h ne se retire
  // pas ce jour-là. Sans cette borne, l'écran promet un retrait le soir même.
  { nom: '🔴 la preparation qui finit apres la fermeture passe quand meme',
    de: '    if (limite === null || arrivee === null || arrivee <= limite) return jour',
    vers: '    return jour' },

  { nom: '🔴 un jour de fermeture n’est plus saute',
    de: '  if (ouvertLe({ horairesDetail, fermetures, dateStr: jour })) {',
    vers: '  if (true) {' },

  { nom: '🔴 la recherche du jour suivant repart du jour lui-meme',
    de: '  const lendemain = jourPlus(jour, 1)',
    vers: '  const lendemain = jourPlus(jour, 0)' },

  // ─── CE QUE L'ÉCRAN ÉCRIT ───────────────────────────────────────────────
  { nom: '🔴 une demi-heure s’ecrit « 0 h 30 »',
    de: '  if (m < 60) return `${Math.round(m)} min`',
    vers: '  if (m < 30) return `${Math.round(m)} min`' },

  // ⚠️ 48 H SE DIT « 2 JOURS ». C'est le mot du boulanger, pas celui de la base.
  { nom: '🔴 48 h ne se disent plus « 2 jours »',
    de: '  if (m % 1440 === 0) {',
    vers: '  if (false) {' },

  { nom: '🔴 le pluriel des jours disparait',
    de: '    return `${j} jour${j > 1 ? \'s\' : \'\'}`',
    vers: '    return `${j} jour`' },

  // ⚠️ « Commande 0 min à l'avance » sur chaque baguette transformerait
  // l'information en décor, et plus personne ne la verrait où elle compte.
  { nom: '🔴 la mention s’affiche meme sans delai',
    de: '  return duree ? `Commande ${duree} à l\'avance` : null',
    vers: '  return `Commande ${duree} à l\'avance`' },

  { nom: '🔴 « aujourd’hui » se met a nommer le jour de la semaine',
    de: '  if (aujourdhui && jour === aujourdhui) return h ? `à ${h}` : \'\'',
    vers: '  if (false) return h ? `à ${h}` : \'\'' },

  { nom: '🔴 « demain » disparait au profit du nom du jour',
    de: '  if (aujourdhui && jour === jourPlus(aujourdhui, 1)) return `demain${suffixe}`',
    vers: '  if (false) return `demain${suffixe}`' },

  { nom: '🔴 l’avertissement s’affiche sur une commande sans delai',
    de: '  if (!duree) return null',
    vers: '  if (false) return null' },

  { nom: '🔴 on n’avoue plus qu’aucun creneau ne convient',
    de: '  if (!moment) return `${quoi}, et aucun créneau ne le permet dans les jours proposés.`',
    vers: '  if (false) return `${quoi}, et aucun créneau ne le permet dans les jours proposés.`' },

  // ─── CE QUE LE COMMERÇANT CHOISIT ───────────────────────────────────────
  //
  // 🔴 Un article réglé à 36 h, ouvert dans le formulaire, verrait la liste
  // retomber sur le premier choix : le commerçant enregistrerait son prix et
  // perdrait son délai sans qu'aucun écran ne le lui dise.
  { nom: '🔴 un delai hors liste disparait en silence a l’ouverture du formulaire',
    de: '  if (Number.isFinite(m) && m > 0 && !liste.includes(m)) liste.push(m)',
    vers: '  if (false) liste.push(m)' },

  // 🔴 ARBITRAGE D'ALEX, 04/09 : les courtes durees sont le travail de la
  // CLOTURE DU CRENEAU, en production depuis le 09/08. Les remettre sur
  // l article recreerait deux reglages voisins dont un seul agit.
  { nom: '🔴 les courtes durees reviennent concurrencer la cloture du creneau',
    de: 'export const DELAIS_PROPOSES = [0, 1440, 2880, 4320]',
    vers: 'export const DELAIS_PROPOSES = [0, 30, 60, 120, 240, 1440, 2880, 4320]' },

  { nom: '🔴 la liste des delais n’est plus triee',
    de: '  return liste.sort((a, b) => a - b)',
    vers: '  return liste' },

  { nom: '🔴 « aucun delai » s’affiche comme un delai',
    de: "  return duree ? `Commande ${duree} à l'avance` : 'Aucun délai, disponible tout de suite'",
    vers: "  return `Commande ${duree} à l'avance`" },

  { nom: '🔴 l’avertissement cesse de nommer l’article',
    de: '  const quoi = nom ? `${nom} demande ${duree} de préparation` : `Cette commande demande ${duree} de préparation`',
    vers: '  const quoi = `Cette commande demande ${duree} de préparation`' },

  // ═══════════════════════════════════════════════════════════════════════
  // LE CÂBLAGE DES ÉCRANS
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⚠️ CES GARDES-LÀ LISENT DU CODE, faute de pouvoir monter un rendu. Elles
  // valent donc EXACTEMENT ce que cette section mesure : une garde textuelle
  // que personne ne fait rougir ne prouve rien du tout. Chaque mutation est
  // écrite comme une régression plausible, pas comme un changement de texte.

  // ─── LA FICHE CLIENT ────────────────────────────────────────────────────
  { nom: '🔴 la carte produit n’affiche plus la mention du delai',
    fichier: FICHE,
    de: '                {mentionArticle(article.delai_minutes)}',
    vers: '                {article.delai_minutes}' },

  // ⚠️ Rien ne se commande en vitrine : un delai y serait du decor.
  { nom: '🔴 la vitrine se met a afficher un delai de commande',
    fichier: FICHE,
    de: '            {!article.est_vitrine && !modeVitrine && mentionArticle(article.delai_minutes) && (',
    vers: '            {mentionArticle(article.delai_minutes) && (' },

  // 🔴 L'ecran mentait au serveur : l'un lisait l'heure machine, l'autre
  // l'heure belge. Sans effet a Namur, faux des que le Yopper voyage.
  { nom: '🔴 le selecteur cesse d’appliquer la cloture du creneau',
    fichier: FICHE,
    de: '      if (!creneauCommandable(cr, { dateStr, instantDebut: brusselsInstant }).ok) return false',
    vers: '      if (!creneauCommandable(cr, { dateStr }).ok) return false' },

  { nom: '🔴 l’instant du creneau se refabrique a la main, en heure MACHINE',
    fichier: FICHE,
    de: '      const debut = brusselsInstant(dateStr, cr.heure_debut)',
    vers: '      const debut = (() => { const x = new Date(dateStr); const [hh, mm] = String(cr.heure_debut || \'\').split(\':\').map(Number); x.setHours(hh, mm || 0, 0, 0); return x })()' },

  { nom: '🔴 le delai du panier n’ecarte plus aucun creneau a l’ecran',
    fichier: FICHE,
    de: '      return !!debut && !isNaN(debut.getTime()) && debut.getTime() >= pret.getTime()',
    vers: '      return !!debut && !isNaN(debut.getTime())' },

  { nom: '🔴 l’avertissement du selecteur ne nomme plus l’article coupable',
    fichier: FICHE,
    de: '                      nom: delaiPanier.nom,',
    vers: '                      nom: null,' },

  { nom: '🔴 le refus de melange ne s’affiche plus',
    fichier: FICHE,
    de: '                {refusMelange && (',
    vers: '                {false && (' },

  // 🔴 Un lot « 3 tartes + 1 » partait pour le jour meme pendant que la tarte
  // a l unite demandait ses 48 h.
  { nom: '🔴 le lot reperd le delai de son article',
    fichier: FICHE,
    de: '      delai_minutes: article?.delai_minutes ?? 0,',
    vers: '      delai_minutes: 0,' },

  { nom: '🔴 la fenetre de l’offre ne voyage plus avec la ligne de panier',
    fichier: FICHE,
    de: '      offre: { heure_debut: deal.heure_debut, heure_fin: deal.heure_fin },',
    vers: '      offre: null,' },

  // ─── LE TABLEAU DE BORD ─────────────────────────────────────────────────
  { nom: '🔴 un delai hors liste disparait du formulaire commercant',
    fichier: BORD,
    de: '                {choixDeDelai(form.delai_minutes).map(m => (',
    vers: '                {choixDeDelai(0).map(m => (' },

  { nom: '🔴 le delai s’enregistre en CHAINE au lieu d’un nombre',
    fichier: BORD,
    de: '      delai_minutes: estVitrine ? 0 : (parseInt(form.delai_minutes, 10) || 0),',
    vers: '      delai_minutes: form.delai_minutes,' },

  { nom: '🔴 le delai enregistre n’est plus relu a l’ouverture de l’article',
    fichier: BORD,
    de: "categorie: a.categorie || '', temps_prepa: String(a.temps_prepa ?? ''), delai_minutes: a.delai_minutes ?? 0,",
    vers: "categorie: a.categorie || '', temps_prepa: String(a.temps_prepa ?? ''), delai_minutes: 0," },

  // 🔴 Il ecrivait `delta_minutes` a cinq endroits et AUCUNE ligne ne le
  // lisait : le commercant reglait un temps sans le moindre effet.
  { nom: '🔴 le reglage mort « Delai » revient dans les creneaux',
    fichier: BORD,
    de: '      max_commandes: parseInt(form.max_commandes) || 5,',
    vers: '      max_commandes: parseInt(form.max_commandes) || 5,\n      delta_minutes: 0,' },

  // ═══════════════════════════════════════════════════════════════════════
  // LE SERVEUR, C'EST-À-DIRE LA SEULE PROTECTION RÉELLE
  // ═══════════════════════════════════════════════════════════════════════
  //
  // 🔴 TOUT CE QUI PRÉCÈDE EXPLIQUE, RIEN NE DÉFEND. Un onglet ouvert depuis ce
  // matin, un panier restauré au retour de Stripe ou une requête fabriquée ne
  // passent par aucune ligne d'écran. Ces mutations-ci sont donc les seules
  // dont l'échec se paierait en argent.

  // ─── LA LIGNE DE COMMANDE ───────────────────────────────────────────────
  //
  // 🔴 Sans le délai sur la ligne, la garde du serveur lit zéro partout et
  // laisse tout passer, en silence. Aucune erreur, aucun symptôme.
  { nom: '🔴 la ligne de commande perd le delai de son article',
    fichier: LIGNES,
    de: '      delai_minutes: article.delai_minutes ?? 0,',
    vers: '      delai_minutes: 0,' },

  { nom: '🔴 la fenetre de l’invendu n’arrive plus jusqu’a la ligne',
    fichier: LIGNES,
    de: '      offre: deal ? { heure_debut: deal.heure_debut, heure_fin: deal.heure_fin } : null,',
    vers: '      offre: null,' },

  // ⚠️ UNE COLONNE ABSENTE D UN SELECT est LE defaut le plus frequent de ce
  // projet, six fois. Elle ne leve rien : elle rend `undefined`.
  { nom: '🔴 le select des articles ne demande plus le delai',
    fichier: LIGNES,
    de: 'tva_taux, tva_taux_sur_place, delai_minutes\'',
    vers: 'tva_taux, tva_taux_sur_place\'' },

  { nom: '🔴 le select des deals ne demande plus la fenetre',
    fichier: LIGNES,
    de: 'date_deal, date_debut, date_fin, heure_debut, heure_fin\'',
    vers: 'date_deal, date_debut, date_fin\'' },

  // ─── LA ROUTE QUI CRÉE LA COMMANDE ──────────────────────────────────────
  { nom: '🔴 le serveur ne calcule plus le delai du panier',
    fichier: ROUTE,
    de: '      const { minutes: delaiMinutes, nom: articleLent } = delaiDuPanier(lignes)',
    vers: '      const { minutes: delaiMinutes, nom: articleLent } = { minutes: 0, nom: null }' },

  { nom: '🔴 le melange impossible passe au paiement',
    fichier: ROUTE,
    de: '      if (refusMelange) {',
    vers: '      if (false) {' },

  { nom: '🔴 le serveur n’oppose plus le delai au creneau choisi',
    fichier: ROUTE,
    de: '            && debutCreneau.getTime() < pret.getTime()) {',
    vers: '            && false) {' },

  { nom: '🔴 la boutique n’applique plus le delai a son jour de retrait',
    fichier: ROUTE,
    de: '        if (!premier || date_commande < premier) {',
    vers: '        if (false) {' },

  // ⚠️ HORIZON ET DÉLAI SONT DEUX BORNES OPPOSÉES : plafond et plancher.
  { nom: '🔴 l’horizon ne plafonne plus rien cote serveur',
    fichier: ROUTE,
    de: '        if (date_commande < aujourdhui || (dernier && date_commande > dernier)) {',
    vers: '        if (date_commande < aujourdhui) {' },

  { nom: '🔴 une date DEJA PASSEE est acceptee',
    fichier: ROUTE,
    de: '        if (date_commande < aujourdhui || (dernier && date_commande > dernier)) {',
    vers: '        if ((dernier && date_commande > dernier)) {' },

  { nom: '🔴 l’horizon n’est plus demande en base (il vaudra le defaut, en silence)',
    fichier: ROUTE,
    de: 'boutique_delai_heures, horizon_commande, plan, essai_plan, created_at\'',
    vers: 'boutique_delai_heures, plan, essai_plan, created_at\'' },

  { nom: '🔴 les fermetures ne sont plus partagees entre les deux controles',
    fichier: ROUTE,
    de: '    let fermeturesCommercant = []',
    vers: '    let fermeturesCommercant = null' },
]

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 ÉCRIRE PEUT ÉCHOUER, ET LE HARNAIS L'IGNORAIT (04/09).
//
// `writeFileSync` a levé `UNKNOWN: unknown error, open` en pleine série, sur
// Windows : un verrou passager, posé par un antivirus ou par le veilleur de
// fichiers du build. Le dépôt s'en est tiré cette fois-ci parce que l'écriture
// ratée était celle qui POSE la mutation.
//
// ⚠️ MAIS SI C'ÉTAIT LA RESTAURATION QUI AVAIT ÉCHOUÉ, le harnais serait mort
// en laissant un fichier MUTÉ dans le dépôt, et son contrôle de restauration
// n'aurait jamais tourné : il vient APRÈS l'écriture, donc après l'exception.
// Un outil qui vérifie la restauration mais qui meurt avant de la vérifier ne
// protège de rien.
//
// ✅ DEUX REMÈDES, ET IL FAUT LES DEUX :
//   • on réessaie, parce qu'un verrou passager passe ;
//   • et la restauration vit dans un `finally`, donc elle s'exécute même si
//     tout le reste explose.
const ecrire = (f, contenu) => {
  let derniere = null
  for (let essai = 0; essai < 5; essai++) {
    try { writeFileSync(f, contenu, 'utf8'); return true }
    catch (e) {
      derniere = e
      // Une attente courte et BLOQUANTE : ce script est synchrone de bout en
      // bout, et un `await` ici ferait repartir la boucle avant l'écriture.
      const fin = Date.now() + 120
      while (Date.now() < fin) { /* on laisse le verrou se relâcher */ }
    }
  }
  console.log(`\n🔴 ÉCRITURE IMPOSSIBLE sur ${f} après 5 essais : ${derniere?.message}`)
  return false
}

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
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
  if (!ecrire(f, original.replace(m.de, m.vers))) {
    // Le fichier n'a pas bougé : rien à restaurer, on passe.
    manquees.push(`${m.nom} — ÉCRITURE IMPOSSIBLE`)
    continue
  }

  // ⚠️ LA RESTAURATION VIT DANS UN `finally`. Si le banc plante, si `lancer`
  // lève, si le processus reçoit une interruption au mauvais moment, le
  // fichier revient quand même. C'est la seule façon de garantir qu'un harnais
  // ne laisse jamais de mutation derrière lui.
  let res
  try {
    res = lancer()
  } finally {
    if (!ecrire(f, original)) {
      console.log(`\n🔴 RESTAURATION IMPOSSIBLE sur ${m.fichier || MODULE}. Le dépôt est MUTÉ, corrige à la main.`)
      process.exit(2)
    }
  }

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
