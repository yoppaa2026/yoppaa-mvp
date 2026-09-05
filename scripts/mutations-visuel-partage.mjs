// HARNAIS DE MUTATION — LE VISUEL PARTAGÉ (05/09).
//
// 🔴 CE QU'ON MESURE, ET C'EST DE L'ACQUISITION : qu'un visuel publié sur
// Instagram ramène chez Yoppaa. Un lien dans une légende Instagram n'est pas
// cliquable ; l'adresse écrite SUR l'image est la seule chose qui puisse faire
// revenir quelqu'un. Un visuel sans adresse est une belle image qui travaille
// pour Meta, et rien ne le signalerait.
//
// 🔴 ET QUE RIEN NE DÉBORDE. `fillText` ne replie ni ne rétrécit : il déborde,
// et le canvas coupe EN SILENCE. Le fichier sort, il est correct, il est juste
// tronqué, et le commerçant le découvre publié.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, vérifié par npm run verif:ancres.
//
//   node scripts/mutations-visuel-partage.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:visuel'
const MODULE = 'lib/visuel-partage.js'
const TRACE = 'lib/visuel-partage-canvas.js'
const BOUTON = 'app/components/PartageVisuel.js'
const GENE = 'app/dashboard/TabGenerateur.js'

const MUTATIONS = [
  // ─── LES DEUX FORMATS ───────────────────────────────────────────────────
  { nom: '🔴 le paysage reprend les tailles du carre (le titre deborde)',
    de: '    badge: 24, enseigne: 25, titre: 58, titreMini: 34, desc: 27,',
    vers: '    badge: 30, enseigne: 32, titre: 82, titreMini: 46, desc: 36,' },

  { nom: '🔴 le paysage accepte autant de lignes que le carre',
    de: '    titreLignes: 2, descLignes: 2,',
    vers: '    titreLignes: 3, descLignes: 3,' },

  // ─── LES TROIS HABITS ───────────────────────────────────────────────────
  { nom: '🔴 le deal reprend le creme de l invendu : on les confond',
    de: "    fond: '#1A0840', fondBas: '#4A1E96',",
    vers: "    fond: '#FBF8F2', fondBas: null," },

  { nom: '🔴 la marque anti-gaspi coiffe aussi le deal',
    de: "    badge: 'DEAL DU JOUR', marqueSurBadge: false, pointsClairs: false,",
    vers: "    badge: 'DEAL DU JOUR', marqueSurBadge: true, pointsClairs: false," },

  { nom: '🔴 un type inconnu ne retombe sur rien et fait tomber le trace',
    de: '  return HABITS[type] || HABITS[TYPE_ACTU]',
    vers: '  return HABITS[type] || {}' },

  // ─── LES CINQ POINTS ────────────────────────────────────────────────────
  { nom: '🔴 les points reprennent la palette du fond clair sur un fond sombre',
    de: '  const couleurs = surClair ? POINTS_SUR_CLAIR : POINTS_SUR_SOMBRE',
    vers: '  const couleurs = POINTS_SUR_CLAIR' },

  { nom: '🔴 les points se chevauchent (l ecart disparait)',
    de: '    x += p.diametre + dotGap',
    vers: '    x += p.diametre * 0.4' },

  // ─── LE REPLI DU TEXTE ──────────────────────────────────────────────────
  { nom: '🔴 le titre ne se replie plus : il deborde et le canvas coupe',
    de: '    if (mesurer(essai) <= largeur) { courante = essai; continue }',
    vers: '    { courante = essai; continue }' },

  // ⚠️ DEUX MUTATIONS SONT RESTÉES VERTES ICI LE 05/09, et elles avaient
  // raison : j'avais posé DEUX plafonds pour la même chose, un arrêt de boucle
  // et une coupe à la sortie. Chacun seul donnait le bon résultat. Le second a
  // été retiré, il ne pouvait de toute façon jamais se déclencher.
  { nom: '🔴 le plafond de lignes saute : la quatrieme sort du cadre',
    de: '    if (lignes.length === plafond) return lignes',
    vers: '    if (false) return lignes' },

  { nom: '🔴 un plafond absurde rend une ligne par mot',
    de: '  const plafond = Math.max(1, Math.floor(Number(maxLignes)) || 1)',
    vers: '  const plafond = Number(maxLignes)' },

  { nom: '🔴 la taille descend sous le plancher : le titre n est plus un titre',
    de: '  while (t > mini && replierTexte(m => mesurerA(m, t), texte, largeur, maxLignes + 1).length > maxLignes) {',
    vers: '  while (t > 8 && replierTexte(m => mesurerA(m, t), texte, largeur, maxLignes + 1).length > maxLignes) {' },

  // ─── CE QUE LA CARTE DIT ────────────────────────────────────────────────
  { nom: '🔴 une carte se dessine sans titre ni enseigne',
    de: '  if (!quoi || !nom) return null',
    vers: '  if (false) return null' },

  { nom: '🔴 le piege du zero : un prix a zero euro passe pour un prix',
    de: '    return Number.isFinite(n) && n > 0 ? n : null',
    vers: '    return Number.isFinite(n) ? n : null' },

  { nom: '🔴 un prix barre plus BAS que le prix passe pour une remise',
    de: '  const barreUtile = p !== null && pb !== null && pb > p ? pb : null',
    vers: '  const barreUtile = pb' },

  { nom: '🔴 un deal recoit les pastilles de l invendu',
    de: '  if (type === TYPE_INVENDU) {',
    vers: '  if (true) {' },

  { nom: '🔴 la description s invite sur un invendu',
    de: '    description: type === TYPE_ACTU && description ? String(description).trim() : null,',
    vers: '    description: description ? String(description).trim() : null,' },

  // ─── L'ADRESSE ──────────────────────────────────────────────────────────
  { nom: '🔴 l adresse garde son protocole et mange la largeur',
    de: "  return url.replace(/^https?:\\/\\//i, '').replace(/^www\\./i, '').replace(/\\/+$/, '')",
    vers: '  return url' },

  { nom: '🔴 sans lien, une adresse vide s ecrit quand meme',
    de: "  if (!url) return null",
    vers: "  if (false) return null" },

  { nom: '🔴 le nom de fichier accepte n importe quel caractere',
    de: "  return `${morceaux.join('-').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.png`",
    vers: '  return `${morceaux.join(String.fromCharCode(45))}.png`' },

  // ─── LE TRACÉ ───────────────────────────────────────────────────────────
  { nom: '🔴 on dessine avant que les polices soient chargees (tout part en Arial)',
    fichier: TRACE,
    de: '  try { if (document.fonts && document.fonts.ready) await document.fonts.ready } catch { /* police système */ }',
    vers: '  try { if (false) await document.fonts.ready } catch { /* police système */ }' },

  { nom: '🔴 on appelle share sans verifier que le fichier passe',
    fichier: TRACE,
    de: '    && navigator.share && navigator.canShare && navigator.canShare({ files: [fichier] })',
    vers: '    && navigator.share' },

  { nom: '🔴 une annulation declenche un telechargement non voulu',
    fichier: TRACE,
    de: "      if (e && e.name === 'AbortError') return 'annule'",
    vers: "      if (false) return 'annule'" },

  // ─── LE BOUTON ──────────────────────────────────────────────────────────
  { nom: '🔴 un bouton mort s affiche quand il n y a pas de carte',
    fichier: BOUTON,
    de: '  if (!contenuVisuel(annonce || {})) return null',
    vers: '  if (false) return null' },

  { nom: '🔴 l apercu ne se redessine plus au changement de proposition',
    fichier: BOUTON,
    de: '  const cle = JSON.stringify(annonce || null) + format',
    vers: '  const cle = String(format)' },

  { nom: '🔴 le bouton promet de publier a la place du commercant',
    fichier: BOUTON,
    de: "        {occupe ? 'On prépare…' : 'Partager le visuel'}",
    vers: "        {occupe ? 'On prépare…' : 'Publier sur Facebook'}" },

  { nom: '🔴 le trace n est plus charge a la demande',
    fichier: BOUTON,
    de: "      .then(m => m.visuelEnApercu(annonce, format))",
    vers: '      .then(() => null)' },

  // ─── LE GÉNÉRATEUR ──────────────────────────────────────────────────────
  { nom: '🔴 le generateur compose un invendu au lieu d une nouveaute',
    fichier: GENE,
    de: '                    type: TYPE_ACTU,',
    vers: '                    type: TYPE_INVENDU,' },

  { nom: '🔴 le visuel du generateur ne porte plus le lien',
    fichier: GENE,
    de: '                    lien,\n                  }}',
    vers: '                    lien: null,\n                  }}' },
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
