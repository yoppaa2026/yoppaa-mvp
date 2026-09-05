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
const ROUTE = 'app/api/ia/generer-post/route.js'

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

  // ─── LES DÉGRADÉS (05/09) ───────────────────────────────────────────────
  { nom: '🔴 l invendu perd son degrade et redevient un aplat',
    de: "    fond: '#FFFDF7', fondBas: '#F1E9DA',",
    vers: "    fond: '#FFFDF7', fondBas: null," },

  { nom: '🔴 le degrade clair s assombrit jusqu a manger le texte',
    de: "    fond: '#FFFDFF', fondBas: '#EDE6FA',",
    vers: "    fond: '#FFFDFF', fondBas: '#6B5590'," },

  { nom: '🔴 un type inconnu ne retombe sur rien et fait tomber le trace',
    de: '  return HABITS[type] || HABITS[TYPE_ACTU]',
    vers: '  return HABITS[type] || {}' },

  // ─── LE BADGE DIT L'OCCASION (05/09) ────────────────────────────────────
  { nom: '🔴 un remerciement s annonce a nouveau comme une nouveaute',
    de: '  if (type === TYPE_ACTU && mot) return mot',
    vers: '  if (false) return mot' },

  { nom: '🔴 un mot venu de l ecran s ecrit tel quel en gros sur l image',
    de: "  const mot = OCCASIONS_BADGE[String(occasion || '').trim()]",
    vers: "  const mot = String(occasion || '').trim().toUpperCase() || null" },

  { nom: '🔴 un invendu perd son nom au profit d une occasion',
    de: '  if (type === TYPE_ACTU && mot) return mot',
    vers: '  if (mot) return mot' },

  { nom: '🔴 la carte reprend le badge de l habit au lieu du mot decide',
    de: '    badge: badgeDe(type, occasion),',
    vers: '    badge: habit.badge,' },

  { nom: '🔴 l occasion n arrive plus jusqu au visuel',
    fichier: GENE,
    de: '                    occasion,',
    vers: '                    occasion: null,' },

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

  // ⚠️ ANCRE REPOINTÉE LE 05/09 : la pastille de stock a disparu, la condition
  // porte désormais aussi sur la présence de l'heure.
  { nom: '🔴 un deal recoit la pastille de l invendu',
    de: '  if (type === TYPE_INVENDU && tempsRestant) {',
    vers: '  if (tempsRestant) {' },

  // ⚠️ ANCRE REPOINTÉE LE 05/09 : la description passe désormais par le filet.
  { nom: '🔴 la description s invite sur un invendu',
    de: '    description: type === TYPE_ACTU && description ? (resumeVisuel(description) || null) : null,',
    vers: '    description: description ? (resumeVisuel(description) || null) : null,' },

  // ─── LE TITRE D'AFFICHE (05/09) ─────────────────────────────────────────
  //
  // 🔴 ALEX SUR CAPTURE : le titre du visuel était la version COURTE du post,
  // une phrase entière avec deux points, un prix et un emoji.
  { nom: '🔴 le titre ne se coupe plus a la ponctuation forte',
    de: '  const coupe = propre.split(/\\s*[:!?.]\\s+|\\s*[:!?.]$/)[0].trim()',
    vers: '  const coupe = propre' },

  { nom: '🔴 le titre n est plus plafonne en nombre de mots',
    de: '  return propre.split(/\\s+/).slice(0, plafond).join(\' \')',
    vers: '  return propre' },

  { nom: '🔴 un titre court se fait quand meme charcuter',
    de: '  if (propre.split(/\\s+/).length <= plafond) return propre',
    vers: '  if (false) return propre' },

  { nom: '🔴 les emojis reviennent sur l affiche',
    de: "    .replace(/[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{FE00}-\\u{FE0F}\\u{2190}-\\u{21FF}\\u{2B00}-\\u{2BFF}]/gu, '')",
    vers: '    .replace(/(?!)/gu, \'\')' },

  { nom: '🔴 la description n est plus ramenee a sa place',
    de: '  if (propre.length <= plafond) return propre',
    vers: '  return propre' },

  { nom: '🔴 la description coupe au milieu d un mot',
    de: '  const dernier = tranche.lastIndexOf(\' \')',
    vers: '  const dernier = -1' },

  { nom: '🔴 la carte n applique plus le filet au titre',
    de: '  const quoi = accrocheVisuelle(titre)',
    vers: "  const quoi = String(titre || '').trim()" },

  { nom: '🔴 la carte n applique plus le filet a la description',
    de: '    description: type === TYPE_ACTU && description ? (resumeVisuel(description) || null) : null,',
    vers: "    description: type === TYPE_ACTU && description ? String(description).trim() : null," },

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

  // ─── LA MARQUE EN TÊTE (05/09) ──────────────────────────────────────────
  { nom: '🔴 les points redescendent en pied, ou personne ne les voit',
    fichier: TRACE,
    de: '  const hPied = hAdresse + F.ecart * 1.2',
    vers: '  const hPied = hAdresse + hPoints + F.ecart * 1.2' },

  { nom: '🔴 le badge n est plus cale a droite et sort du cadre',
    fichier: TRACE,
    de: '  const xBadge = F.largeur - F.marge - lBadge',
    vers: '  const xBadge = gauche + largeurDesPoints(F.point) + F.ecart * 4' },

  // ─── LA MARQUE ET L'ÉQUILIBRE (05/09, sur capture) ──────────────────────
  { nom: '🔴 la marque anti-gaspi revient a cote du nom du commercant',
    fichier: TRACE,
    de: '  ctx.fillText(c.enseigne.toUpperCase(), gauche, y + F.enseigne * 0.55)',
    vers: '  tracerMarque(ctx, gauche, y, F.enseigne, h.marque); ctx.fillText(c.enseigne.toUpperCase(), gauche + F.enseigne * 1.45, y + F.enseigne * 0.55)' },

  { nom: '🔴 la marque se trace sans que l habit la reclame',
    fichier: TRACE,
    de: '  if (h.marqueSurBadge) {',
    vers: '  if (true) {' },

  { nom: '🔴 la tete redescend avec le corps et le haut se vide',
    fichier: TRACE,
    de: '  const yEntete = F.marge + (hEntete - hBadge) / 2',
    vers: '  const yEntete = y + (hEntete - hBadge) / 2' },

  { nom: '🔴 les points redescendent avec le corps',
    fichier: TRACE,
    de: '  const yPoints = F.marge + (hEntete - hPoints) / 2',
    vers: '  const yPoints = y + (hEntete - hPoints) / 2' },

  { nom: '🔴 le corps remonte ecrire par-dessus les points',
    fichier: TRACE,
    de: '  let y = Math.max(hautDuCorps, hautDuCorps + (basDuCorps - hautDuCorps - hCorps) / 2)',
    vers: '  let y = hautDuCorps + (basDuCorps - hautDuCorps - hCorps) / 2' },

  { nom: '🔴 les points sont traces deux fois',
    fichier: TRACE,
    de: '  pointsDuVisuel(F.point, h.pointsClairs).forEach(p => {',
    vers: '  pointsDuVisuel(F.point, h.pointsClairs).forEach(p => {}); pointsDuVisuel(F.point, h.pointsClairs).forEach(p => {' },

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

  { nom: '🔴 le generateur reprend la version COURTE comme titre',
    fichier: GENE,
    de: "                    titre: v.accroche || v.court || v.long || '',",
    vers: "                    titre: v.court || v.long || ''," },

  { nom: '🔴 le prompt cesse de demander une accroche d affiche',
    fichier: ROUTE,
    de: '- "accroche" : 2 à 5 MOTS, le titre de l\'affiche.',
    vers: '- "accroche" : ce que tu veux.' },

  // ─── DEUX NIVEAUX ET DEUX BOUTONS (05/09) ───────────────────────────────
  { nom: '🔴 la version courte perd sa signature : ce post ne ramene personne',
    fichier: GENE,
    de: 'onClick={() => copier(postAvecSignature(v.court, lien, nomCommerce), `court-${i}`)}',
    vers: 'onClick={() => copier(v.court, `court-${i}`)}' },

  { nom: '🔴 les deux versions ne se distinguent plus',
    fichier: GENE,
    de: '                      Version standard',
    vers: '                      Le post' },

  { nom: '🔴 le telechargement disparait, il ne reste que le partage',
    fichier: BOUTON,
    de: '        <button onClick={telecharger} disabled={occupe || !apercu}',
    vers: '        <button onClick={null} disabled={occupe || !apercu}' },

  // ⚠️ ANCRE REPOINTÉE : le message dit « Visuel » depuis qu Alex a aligné le
  // vocabulaire des deux boutons.
  { nom: '🔴 le telechargement echoue en silence',
    fichier: BOUTON,
    de: "      if (fait) toast?.('Visuel téléchargé.', 'success')",
    vers: "      if (false) toast?.('Visuel téléchargé.', 'success')" },

  { nom: '🔴 les deux boutons cessent de nommer le meme objet',
    fichier: BOUTON,
    de: '          Télécharger le visuel',
    vers: '          Télécharger l&apos;image' },

  { nom: '🔴 l apercu redevient une vignette impossible a juger',
    fichier: BOUTON,
    de: 'maxWidth: format === FORMAT_CARRE ? 420 : 560,',
    vers: 'maxWidth: format === FORMAT_CARRE ? 120 : 160,' },

  // ─── LE PARTAGE DEPUIS LES TROIS ÉCRANS (05/09) ─────────────────────────
  //
  // 🔴 CE QU'ON MESURE : qu'un post ne survive pas a ce qu il annonce, et que
  // les montants viennent de la BASE. C est toute la difference avec le
  // generateur, qui travaille sur un champ libre.
  { nom: '🔴 un deal ETEINT redevient partageable',
    de: '  if (actif === false) return false',
    vers: '  if (false) return false' },

  { nom: '🔴 le deal DU JOUR perd son bouton (comparaison stricte)',
    de: '  return fin >= jour',
    vers: '  return fin > jour' },

  { nom: '🔴 une echeance qu on ne peut pas juger ouvre le partage',
    de: '  if (!jour) return false',
    vers: '  if (!jour) return true' },

  { nom: '🔴 une actualite sans echeance perd son bouton',
    de: '  if (!fin) return true',
    vers: '  if (!fin) return false' },

  { nom: '🔴 le stock revient sur l image et vieillit avec elle',
    de: '  if (type === TYPE_INVENDU && tempsRestant) {',
    vers: "  if (type === TYPE_INVENDU && tempsRestant) { pastilles.push({ icone: 'sac', texte: '3' });" },

  { nom: '🔴 les centimes nuls reviennent sur l affiche',
    de: "  return `${v.toFixed(2).replace('.', ',').replace(/,00$/, '')} €`",
    vers: "  return `${v.toFixed(2).replace('.', ',')} €`" },

  { nom: '🔴 la legende fait passer une hausse pour une remise',
    de: '  const aBarre = aPrix && Number.isFinite(pb) && pb > p',
    vers: '  const aBarre = aPrix && Number.isFinite(pb)' },

  { nom: '🔴 le piege du zero dans la legende : « 0 € »',
    de: '  const aPrix = Number.isFinite(p) && p > 0',
    vers: '  const aPrix = Number.isFinite(p)' },

  { nom: '🔴 la legende perd sa mention de fin',
    de: '  if (fin) lignes.push(fin.endsWith(\'.\') ? fin : `${fin}.`)',
    vers: '  if (false) lignes.push(fin)' },

  // ─── LES TROIS ÉCRANS ───────────────────────────────────────────────────
  { nom: '🔴 l invendu se partage fenetre FERMEE',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '              {fenetreOuverte(d) && (',
    vers: '              {true && (' },

  // ⚠️ L'INDENTATION EST LA CIBLE : douze espaces, c'est l'annonce du deal.
  // Celle de l'invendu en a vingt, et les deux légendes tiennent sur une ligne.
  { nom: '🔴 le deal ne passe plus son prix barre au visuel',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '            prixBarre: d.prix_original,',
    vers: '            prixBarre: null,' },

  { nom: '🔴 une alerte s annonce comme une NOUVEAUTE',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: "                occasion: a.type === 'alerte' ? 'Infos pratiques' : 'Nouveauté',",
    vers: "                occasion: 'Nouveauté'," },

  { nom: '🔴 l adresse de la fiche est recomposee a la main',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '  const url = lienFiche(slug)',
    vers: '  const url = slug ? `https://www.yoppaa.app/commander/${slug}` : null' },
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
