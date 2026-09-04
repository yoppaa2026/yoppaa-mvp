// HARNAIS DE MUTATION — L'OFFRE DE FIN DE JOURNÉE (04/09).
//
// 🔴 CE QU'ON MESURE : qu'une offre s'affiche pendant sa fenêtre et JAMAIS en
// dehors. Un invendu ne vit que quelques heures. Se tromper d'une heure, c'est
// envoyer quelqu'un devant une porte fermée, ou cacher l'offre pendant qu'elle
// existe. Aucune erreur ne s'afficherait dans les deux cas.
//
// La mutation qui compte est celle du FUSEAU : les heures sont belges, le temps
// machine est universel, et l'écart vaut UNE heure en hiver, DEUX en été.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES : le dépôt est en CRLF.
//
//   node scripts/mutations-anti-gaspi.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:anti-gaspi'
const MODULE = 'lib/anti-gaspi.js'
const HEURE = 'lib/heure-belge.js'

const MUTATIONS = [
  // ─── LE FUSEAU, LE PIÈGE PRINCIPAL ──────────────────────────────────────
  //
  // ⚠️ CES DEUX-LÀ VISENT `lib/heure-belge.js` DEPUIS LE 04/09 : les primitives
  // d'heure ont été extraites pour que le module des délais de commande les
  // partage, plutôt que d'en garder une seconde copie qui aurait divergé au
  // premier changement d'heure. Le harnais l'a signalé sur-le-champ, en
  // « TEXTE INTROUVABLE ». Quatrième fois qu'un point d'ancrage périme.
  { nom: '🔴 le module lit l’heure UNIVERSELLE au lieu de l’heure belge',
    fichier: HEURE,
    de: "  timeZone: FUSEAU, hour: '2-digit', minute: '2-digit', hour12: false,",
    vers: "  timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false," },

  { nom: '🔴 minuit redevient 1440 (hors de toutes les fenetres)',
    fichier: HEURE,
    de: '  return h === 24 ? 0 : h',
    vers: '  return h' },

  // ─── LIRE UNE HEURE ─────────────────────────────────────────────────────
  { nom: '🔴 une heure absente rend ZERO au lieu de rien',
    de: '  if (!m) return null',
    vers: '  if (!m) return 0' },

  { nom: '🔴 une heure impossible est acceptee',
    de: '  if (h > 23 || min > 59) return null',
    vers: '  if (false) return null' },

  // ─── LA FENÊTRE ─────────────────────────────────────────────────────────
  { nom: '🔴 la fin redevient incluse (on affiche a l’heure de fermeture)',
    de: '    ? (t >= debut && t < fin)',
    vers: '    ? (t >= debut && t <= fin)' },

  { nom: '🔴 une fenetre qui franchit minuit ne s’ouvre plus jamais',
    de: '    : (t >= debut || t < fin)',
    vers: '    : (false)' },

  { nom: '🔴 une fenetre de duree nulle s’affiche une minute par jour',
    de: '  if (debut === fin) return false',
    vers: '  if (false) return false' },

  { nom: '🔴 une demi-fenetre passe pour une offre de fin de journee',
    de: "  return minutesDeLHeure(offre?.heure_debut) !== null",
    vers: "  return true || minutesDeLHeure(offre?.heure_debut) !== null" },

  // ─── LE TEMPS RESTANT ───────────────────────────────────────────────────
  { nom: '🔴 le compte a rebours devient NEGATIF apres minuit',
    de: '  return reste > 0 ? reste : reste + 24 * 60',
    vers: '  return reste' },

  { nom: '🔴 « encore 0 minute » redevient possible',
    de: '  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return \'\'',
    vers: '  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes < 0) return \'\'' },

  // ─── L'ORDRE DE LECTURE ─────────────────────────────────────────────────
  { nom: '🔴 le reservable ne passe plus devant',
    de: '      (a.reservable === b.reservable ? 0 : (a.reservable ? -1 : 1))',
    vers: '      (0)' },

  { nom: '🔴 les offres fermees s’affichent aussi',
    de: '    .filter(o => offreValable(o) && fenetreOuverte(o, instant))',
    vers: '    .filter(o => offreValable(o))' },

  // ─── LE PRIX, ET LE JEU JOUÉ ────────────────────────────────────────────
  { nom: '🔴 le plancher de remise disparait (10 % occuperait l ecran)',
    de: 'export const REMISE_MINIMALE = 30',
    vers: 'export const REMISE_MINIMALE = 0' },

  // ⚠️ PAS DE MUTATION SUR LA CONSTRUCTION DU CONSEIL, ET C EST DELIBERE.
  //
  // Remplacer le gabarit par la chaine ecrite a la main produit EXACTEMENT le
  // meme texte tant que le plancher vaut 30 : la mutation ne change aucun
  // resultat, donc elle ne mesure rien. UNE MUTATION QUI NE MUTE RIEN EST UNE
  // MUTATION MANQUEE, pas une garde faible.
  //
  // Le lien est deja mesure par la mutation du plancher ci-dessus : mise a 0,
  // un conseil ecrit en dur continuerait d annoncer « -30 % » et la garde
  // « le conseil cite le plancher reel » rougirait.

  { nom: '🔴 le conseil ne vise plus plus haut que l obligation',
    de: 'export const REMISE_CONSEILLEE = 50',
    vers: 'export const REMISE_CONSEILLEE = 10' },

  { nom: '🔴 le prix plein passe pour une affaire',
    de: '  return casse < plein',
    vers: '  return casse <= plein' },

  { nom: '🔴 un prix ABSENT vaut zero et laisse passer l offre',
    de: '  if (casse <= 0 || plein <= 0) return false',
    vers: '  if (false) return false' },

  { nom: '🔴 la lecture cesse de se defendre seule (offres non valables affichees)',
    de: '    .filter(o => offreValable(o) && fenetreOuverte(o, instant))',
    vers: '    .filter(o => fenetreOuverte(o, instant))' },

  { nom: '🔴 le titre cote Yopper emprunte le verbe de Too Good To Go',
    de: "export const TITRE_YOPPER = 'Rien ne se perd'",
    vers: "export const TITRE_YOPPER = 'A sauver pres de chez toi'" },

  { nom: '🔴 le bouton redevient une injonction',
    de: "export const LIBELLE_BOUTON = 'Je le prends'",
    vers: "export const LIBELLE_BOUTON = 'Depeche-toi !'" },

  // ─── LES CRÉNEAUX, ET LE REFUS QUI DIT POURQUOI ─────────────────────────
  { nom: '🔴 le chevauchement ne se lit plus que dans un sens',
    de: '    return dansFenetre(debutC, debutF, finF) || dansFenetre(debutF, debutC, finC)',
    vers: '    return dansFenetre(debutC, debutF, finF)' },

  // ⚠️ PAS DE DEUXIEME MUTATION SUR LE FILTRE, ET C EST DELIBERE. Ma premiere
  // tentative enveloppait le filtre dans un `.filter(() => true)` : le filtre
  // suivant s appliquait quand meme, donc RIEN NE CHANGEAIT. Une mutation qui
  // ne mute rien est une mutation manquee. La regle du chevauchement est deja
  // mesuree par la mutation ci-dessus.

  { nom: '🔴 on publie une offre que personne ne peut venir chercher',
    de: '  if (creneauxUtilisables(offre, creneaux).length === 0) {',
    vers: '  if (false) {' },

  // ⚠️ CIBLE SUR LA PARTIE STABLE DE LA LIGNE. Le gabarit contient des accents
  // graves et des `${}` : les faire traverser un shell les detruit, et la
  // mutation ecrite de travers a fait PLANTER le banc au lieu de le faire
  // rougir. On ne vise donc que le debut de la phrase.
  //
  // ⚠️ ET ON VISE LE CHIFFRE, PAS LA PROSE AUTOUR. Ma deuxieme tentative
  // remplacait « Ta remise est de » par « Remise insuffisante. » : le message
  // gardait ses deux nombres, donc la garde, qui mesure les NOMBRES, restait
  // verte a juste titre. Retirer le chiffre du commercant, la, degrade
  // vraiment ce qu il lit.
  { nom: '🔴 le refus cesse de donner la remise obtenue',
    de: 'Ta remise est de ${remise} %',
    vers: 'Ta remise est trop faible' },

  { nom: '🔴 le refus du creneau ne nomme plus le geste qui repare',
    de: "    return 'Aucun créneau de retrait dans cette plage. Ajoute un créneau, sinon personne ne pourra venir chercher.'",
    vers: "    return 'Plage invalide.'" },

  // ⚠️ LES TROIS MUTATIONS DU STOCK ONT ETE RETIREES LE 04/09 : la fonction
  // qu elles mesuraient reposait sur une premisse fausse et a ete supprimee.
  // La quantite vit desormais sur l OFFRE, pas sur l article. Voir
  // migrations/MIGRATION_OFFRE_QUANTITE.sql.

  // ─── CE QUE L'ÉCRAN ÉCRIT ───────────────────────────────────────────────
  { nom: '🔴 l’heure s’ecrit sans espace (« 19h »)',
    de: "  return min === 0 ? `${h} h` : `${h} h ${String(min).padStart(2, '0')}`",
    vers: "  return min === 0 ? `${h}h` : `${h}h${String(min).padStart(2, '0')}`" },
]

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
  writeFileSync(f, original.replace(m.de, m.vers), 'utf8')
  const res = lancer()
  writeFileSync(f, original, 'utf8')

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${MODULE}. On s'arrête.`)
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
