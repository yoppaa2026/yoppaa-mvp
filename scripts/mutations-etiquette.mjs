// HARNAIS DE MUTATION — L'ÉTIQUETTE DE COMMANDE
//
// Chaque mutation casse une chose précise, et le banc qu'elle nomme doit
// rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   npm run mutations:etiquette

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:etiquette'
const REGLE = 'lib/etiquette-commande.js'
const IMPRESSION = 'lib/impression-etiquette.js'
const BORD = 'app/dashboard/page.js'
const POSTE = 'app/equipe/PosteEquipe.js'
const REGLAGE = 'app/dashboard/ReglageEtiquettes.js'

const MUTATIONS = [
  // ─── CE QUE PORTE L'ÉTIQUETTE ────────────────────────────────────────────
  { nom: '🔴 le nom complet s imprime sur le sac',
    fichier: REGLE, de: '  return `${mots[0]} ${mots[1].charAt(0).toUpperCase()}.`', vers: "  return mots.join(' ')" },
  { nom: '⚠️ l initiale reste en minuscule',
    fichier: REGLE, de: '  return `${mots[0]} ${mots[1].charAt(0).toUpperCase()}.`', vers: '  return `${mots[0]} ${mots[1].charAt(0)}.`' },
  { nom: '🔴 une livraison ne reçoit plus d étiquette',
    fichier: REGLE, de: "  return ['retrait', 'livraison'].includes(commande?.mode_retrait)", vers: "  return commande?.mode_retrait === 'retrait'" },
  { nom: '🔴 une expédition reçoit une étiquette',
    fichier: REGLE, de: "  return ['retrait', 'livraison'].includes(commande?.mode_retrait)", vers: '  return !!commande?.mode_retrait' },
  { nom: '🔴 une livraison lit le créneau du retrait',
    fichier: REGLE, de: '  const cren = livraison ? (commande.creneau_livraison || commande.creneau) : commande.creneau', vers: '  const cren = commande.creneau' },
  { nom: '🔴 la rue s imprime sur un sac de retrait',
    fichier: REGLE, de: "  const adresse = commande.mode_retrait === 'livraison'", vers: '  const adresse = true' },
  { nom: '🔴 l étiquette ne grandit pas pour la rue',
    fichier: REGLE, de: '  let h = format.hauteurMm + (contenu?.adresse ? SUPPLEMENT_ADRESSE_MM : 0)', vers: '  let h = format.hauteurMm' },
  { nom: '🔴 les sacs ne sont plus numérotés',
    fichier: REGLE, de: '  return Array.from({ length: n }, (_, i) => ({ ...contenu, sac: `Sac ${i + 1}/${n}` }))', vers: '  return Array.from({ length: n }, () => ({ ...contenu, sac: null }))' },
  { nom: '🔴 un nombre illisible imprime zéro étiquette',
    fichier: REGLE, de: '  const n = Math.min(SACS_MAX, Math.max(1, Math.floor(Number(sacs)) || 1))', vers: '  const n = Math.min(SACS_MAX, Math.floor(Number(sacs)) || 0)' },
  { nom: '🔴 sans la jointure, le rendez-vous n est plus reconnu',
    fichier: REGLE, de: '  if (commande.rdv_reservation_id || commande.rdv) {', vers: '  if (commande.rdv) {' },
  { nom: '🔴 le créneau disparaît de l étiquette',
    fichier: REGLE, de: '  if (cren?.heure_debut) {', vers: '  if (false) {' },
  { nom: '🔴 les articles se comptent en lignes',
    fichier: REGLE, de: '  const n = lignes.reduce((s, l) => s + (Number(l?.quantite) > 0 ? Number(l.quantite) : 0), 0)', vers: '  const n = lignes.length' },
  { nom: '🔴 le montant ignore la récompense',
    fichier: REGLE, de: '    paiement: paiement?.libelle || null,', vers: "    paiement: commande.paye_en_ligne ? 'Payé en ligne' : `À payer ${commande.total}`," },
  { nom: '🔴 « à payer » ne se détache plus',
    fichier: REGLE, de: "    aEncaisser: paiement?.cle === 'du',", vers: '    aEncaisser: false,' },

  { nom: '🔴 la liste perd ses options',
    fichier: REGLE, de: '      options: libelleOptions(l.options),', vers: '      options: null,' },
  { nom: '🔴 le nom du catalogue passe avant le nom figé',
    fichier: REGLE, de: "      article: `${Number(l.quantite)} × ${String(l.article_nom || l.article?.nom || 'Article retiré du catalogue').trim()}`,", vers: "      article: `${Number(l.quantite)} × ${String(l.article?.nom || l.article_nom || 'Article retiré du catalogue').trim()}`," },
  { nom: '🔴 la liste ne fait pas grandir l étiquette',
    fichier: REGLE, de: '  if (lignes.length > 0) {', vers: '  if (false) {' },
  { nom: '🔴 un nom long compte pour une seule ligne',
    fichier: REGLE, de: "      h += Math.max(1, Math.ceil(String(l.article || '').length / L.caracteresArticle)) * L.mmParLigne", vers: '      h += L.mmParLigne' },
  { nom: '🔴 la liste n est plus dans l étiquette',
    fichier: REGLE, de: '    lignes: lignesArticlesEtiquette(commande),', vers: '    lignes: [],' },

  // ─── L'IMPRESSION ────────────────────────────────────────────────────────
  { nom: '🔴 les articles ne s impriment pas',
    fichier: IMPRESSION, de: "      liste.appendChild(ligne('article', l.article))", vers: '' },
  { nom: '🔴 les options ne s impriment pas',
    fichier: IMPRESSION, de: "      if (l.options) liste.appendChild(ligne('options', l.options))", vers: '' },
  { nom: '🔴 le nom du client devient du HTML',
    fichier: IMPRESSION, de: '    el.textContent = texte', vers: '    el.innerHTML = texte' },
  { nom: '🔴 le style survit à l impression',
    fichier: IMPRESSION, de: '      retirer(doc)', vers: '' },
  { nom: '🔴 personne n écoute la fin de l impression',
    fichier: IMPRESSION, de: "    window.addEventListener('afterprint', fin)", vers: '' },
  { nom: '⚠️ pas de filet si « afterprint » ne vient pas',
    fichier: IMPRESSION, de: '    filet = setTimeout(fin, FILET_MS)', vers: '' },
  { nom: '🔴 deux impressions laissent deux étiquettes',
    fichier: IMPRESSION, de: '    if (nettoyage) nettoyage()', vers: '' },
  { nom: '🔴 une imprimante qui lâche passe pour une réussite',
    fichier: IMPRESSION, de: '    window.print()', vers: '    try { window.print() } catch { return true }' },
  { nom: '🔴 la page garde son format A4',
    fichier: IMPRESSION, de: '    `  @page { size: ${l}mm ${h}mm; margin: 0; }`,', vers: '' },
  { nom: '🔴 tout l écran s imprime avec l étiquette',
    fichier: IMPRESSION, de: '    `  body > *:not(#${ID_ZONE}) { display: none !important; }`,', vers: '' },
  { nom: '🔴 la Brother ne coupe plus entre les sacs',
    fichier: IMPRESSION, de: 'overflow: hidden; break-after: page; page-break-after: always; }', vers: 'overflow: hidden; }' },
  { nom: '🔴 seul le premier sac s imprime',
    fichier: IMPRESSION, de: '    for (const contenu of liste) {', vers: '    for (const contenu of liste.slice(0, 1)) {' },
  { nom: '🔴 la rue ne s imprime pas',
    fichier: IMPRESSION, de: "  if (contenu.adresse) lignes.push(ligne('adresse', contenu.adresse))", vers: '' },
  { nom: '🔴 le numéro de sac ne s imprime pas',
    fichier: IMPRESSION, de: "    if (contenu.sac) tete.appendChild(ligne('sac', contenu.sac, 'span'))", vers: '' },
  { nom: '🔴 la page ne grandit pas pour la rue',
    fichier: IMPRESSION, de: '    style.textContent = feuilleEtiquette(FORMAT_ETIQUETTE, hauteurEtiquetteMm(liste[0]))', vers: '    style.textContent = feuilleEtiquette(FORMAT_ETIQUETTE)' },
  { nom: '🔴 un appareil neuf imprime par défaut',
    fichier: IMPRESSION, de: "  try { return window.localStorage.getItem(CLE_ETIQUETTES_APPAREIL) === '1' } catch { return false }", vers: "  try { return window.localStorage.getItem(CLE_ETIQUETTES_APPAREIL) !== '0' } catch { return true }" },
  { nom: '🔴 le réglage de l appareil est ignoré',
    fichier: IMPRESSION, de: '  if (!etiquetteConcernee(commande) || !lireImpressionActive()) return false', vers: '  if (!etiquetteConcernee(commande)) return false' },
  { nom: '🔴 le périmètre est ignoré',
    fichier: IMPRESSION, de: '  if (!etiquetteConcernee(commande) || !lireImpressionActive()) return false', vers: '  if (!lireImpressionActive()) return false' },

  // ─── LE GESTE ────────────────────────────────────────────────────────────
  { nom: '🔴 tableau de bord : l étiquette part après un await',
    fichier: BORD, de: "    if (statut === 'en_preparation') {", vers: "    await Promise.resolve(); if (statut === 'en_preparation') {" },
  { nom: '🔴 tableau de bord : l étiquette revient à « prête »',
    fichier: BORD, de: "    if (statut === 'en_preparation') {", vers: "    if (statut === 'pret') {" },
  { nom: '🔴 tableau de bord : l étiquette ressort sans venir d « en attente »',
    fichier: BORD, de: "      if (aImprimer?.statut === 'en_attente') imprimerSiActive(", vers: '      if (aImprimer) imprimerSiActive(' },
  { nom: '🔴 tableau de bord : le bouton attend avant de passer la commande',
    fichier: BORD, de: '                        onChangerStatut={changerStatut}', vers: '                        onChangerStatut={async (id, st) => { await Promise.resolve(); changerStatut(id, st) }}' },
  { nom: '⚠️ tableau de bord : le rattrapage s affiche dans l historique',
    fichier: BORD, de: "        {etiquettes && !modeHistorique && ['en_preparation', 'pret'].includes(commande.statut) && etiquetteConcernee(commande) && (", vers: "        {etiquettes && ['en_preparation', 'pret'].includes(commande.statut) && etiquetteConcernee(commande) && (" },
  { nom: '🔴 tableau de bord : pas de sacs en plus pendant la préparation',
    fichier: BORD, de: "        {etiquettes && !modeHistorique && ['en_preparation', 'pret'].includes(commande.statut) && etiquetteConcernee(commande) && (", vers: "        {etiquettes && !modeHistorique && commande.statut === 'pret' && etiquetteConcernee(commande) && (" },
  { nom: '🔴 Poste : l étiquette part après un await',
    fichier: POSTE, de: "      if (vers === 'en_preparation') imprimerSiActive(c, { categorie })", vers: "      await Promise.resolve(); if (vers === 'en_preparation') imprimerSiActive(c, { categorie })" },
  { nom: '🔴 Poste : l étiquette revient à « prête »',
    fichier: POSTE, de: "      if (vers === 'en_preparation') imprimerSiActive(c, { categorie })", vers: "      if (vers === 'pret') imprimerSiActive(c, { categorie })" },
  { nom: '🔴 Poste : plus d étiquette du tout',
    fichier: POSTE, de: "      if (vers === 'en_preparation') imprimerSiActive(c, { categorie })", vers: '' },
  { nom: '🔴 Poste : pas de sacs en plus pendant la préparation',
    fichier: POSTE, de: "      {etiquettes && ['en_preparation', 'pret'].includes(c.statut) && etiquetteConcernee(c) && (", vers: "      {etiquettes && c.statut === 'pret' && etiquetteConcernee(c) && (" },
  { nom: '🔴 Poste : `geste` attend avant de lancer le travail',
    fichier: POSTE, de: '    setEnCours(id); setAvis(null)', vers: '    setEnCours(id); setAvis(null); await Promise.resolve()' },
  { nom: '⚠️ Poste : le rattrapage s affiche sans le droit « commandes »',
    fichier: POSTE, de: ' etiquettes={etiquettesIci && !!gestes} retourPossible=', vers: ' etiquettes={etiquettesIci} retourPossible=' },
  { nom: '🔴 le réglage part allumé',
    fichier: REGLAGE, de: '  const [actif, setActif] = useState(false)', vers: '  const [actif, setActif] = useState(true)' },
  { nom: '🔴 « Imprimer » ignore le nombre de sacs',
    fichier: REGLAGE, de: 'onClick={() => imprimerEtiquette(etiquettesPourSacs(contenuEtiquette(commande, { categorie }), sacs))}', vers: 'onClick={() => imprimerEtiquette(contenuEtiquette(commande, { categorie }))}' },
  { nom: '🔴 le réglage disparaît de l écran des livraisons',
    fichier: BORD, de: '                {!modeHistorique && (', vers: "                {vueMode !== 'livraison' && !modeHistorique && (" },
]

const lancer = (banc) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    return { rouge: true, plante: !/vérifications/.test(sortie), extrait: sortie.slice(-400) }
  }
}

const depart = lancer(BANC)
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log(`Banc vert au départ : ${BANC}.\n`)

let attrapees = 0
const manquees = []
for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  // ⚠️ Les fichiers peuvent être en CRLF : la cible suit la fin de ligne du fichier.
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const de = m.de.split('\n').join(eol)
  const vers = m.vers.split('\n').join(eol)
  if (!original.includes(de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(de, vers))
  const res = lancer(m.banc || BANC)
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }
  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉE VERTE`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }
const finalRouge = lancer(BANC).rouge
if (finalRouge) console.log(`🔴 ${BANC} EST ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
