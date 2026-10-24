// HARNAIS DE MUTATION — L'ÉCRAN DE TRAVAIL DES COMMANDES (11/10)
//
// Chaque mutation casse UNE garde de la vue en colonnes ; `verif:bord` doit
// rougir. Une mutation qui reste verte désigne une garde aveugle.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-vue-commandes.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:bord'
const REGLE = 'lib/vue-commandes.js'
const VUE = 'app/dashboard/VueCommandes.js'
const BORD = 'app/dashboard/page.js'

const MUTATIONS = [
  { nom: '🔴 une livraison prête reçoit « Remettre au client » (elle sauterait son départ en livraison)', fichier: REGLE,
    de: "  if (c.statut === 'pret' && (c.mode_retrait === 'livraison' || c.mode_retrait === 'expedition')) return null", vers: '' },
  { nom: '⚠️ une commande prête est dite « en retard »', fichier: REGLE,
    de: "  if (jour > aujourdhui || c.statut === 'pret') return false", vers: '  if (jour > aujourdhui) return false' },
  { nom: '🔴 « À préparer » compte aussi les prêtes', fichier: REGLE,
    de: "  const actives = (Array.isArray(commandes) ? commandes : []).filter(c => c?.statut === 'en_attente' || c?.statut === 'en_preparation')",
    vers: "  const actives = (Array.isArray(commandes) ? commandes : []).filter(c => ['en_attente', 'en_preparation', 'pret'].includes(c?.statut))" },
  { nom: '⚠️ la semaine d export commence le dimanche', fichier: REGLE,
    de: '  const debut = jourPlus(jour, -((jds + 6) % 7))', vers: '  const debut = jourPlus(jour, -jds)' },
  { nom: '🔴 le PDF garde les paiements échoués (jamais devenus des commandes)', fichier: 'lib/export-commandes-pdf.js',
    de: "    .filter(c => c && c.statut !== 'annulee_paiement_ko')", vers: '    .filter(c => c)' },
  { nom: '🔴 le PDF compte les annulées dans le chiffre et la production', fichier: 'lib/export-commandes-pdf.js',
    de: '    if (annulee) continue', vers: '    void annulee' },
  { nom: '⚠️ le PDF imprime des emoji illisibles (plus de filtre des caractères)', fichier: 'lib/export-commandes-pdf.js',
    de: '    .filter(ch => ch.charCodeAt(0) <= 0xFF || EN_PLUS.has(ch)).join(\'\')', vers: ".join('')" },
  { nom: '⚠️ les commandes du PDF ne sont plus séparées par un filet', fichier: 'lib/export-commandes-pdf.js',
    de: '      pdf.setDrawColor(...FILET); pdf.setLineWidth(0.25); pdf.line(MARGE, y, L - MARGE, y)', vers: '      void FILET' },
  { nom: '⚠️ la page suivante perd le bandeau du jour', fichier: 'lib/export-commandes-pdf.js',
    de: '      if (y + hauteur > BAS) { nouvellePage(); bandeau(jour, true) }', vers: '      if (y + hauteur > BAS) { nouvellePage(); enteteTableau() }' },
  { nom: '⚠️ « Annulée par le » coupé de nouveau', fichier: 'lib/export-commandes-pdf.js',
    de: '          pdf.text(lignesStatut, x + 2, y + 4.4)', vers: '          pdf.text(lignesStatut[0] || \'\', x + 2, y + 4.4)' },
  { nom: '🔴 l export passe à côté du PDF', fichier: VUE,
    de: '      const blob = await pdfCommandes(donnees, { commerceNom, periode })', vers: "      const blob = new Blob([JSON.stringify(donnees)])" },
  { nom: '🔴 les colonnes ne sont plus triées par heure', fichier: REGLE,
    de: '  return COLONNES.map(col => ({ ...col, commandes: trierParHeure(liste.filter(c => c?.statut === col.statut)) }))',
    vers: '  return COLONNES.map(col => ({ ...col, commandes: liste.filter(c => c?.statut === col.statut) }))' },
  { nom: '🔴 « Encoder une commande » disparaît de la barre fixe', fichier: BORD,
    // REPOINTÉE LE 17/10 : la condition lit aussi la formule (encoder, c'est créer).
    de: "                  {commercant?.categorie === 'alimentaire' && canDo(planEffectif(commercant), 'commande') && (creneauxRetrait.length > 0 || creneauxLivraison.length > 0) && (",
    vers: "                  {false && (creneauxRetrait.length > 0 || creneauxLivraison.length > 0) && (" },
  { nom: '🔴 la carte compacte avance par un autre chemin que `changerStatut` (plus d étiquette)', fichier: BORD,
    de: '                    onAvancer={(c, statut) => changerStatut(c.id, statut)}', vers: '                    onAvancer={(c, statut) => changerStatutLivraison(c.id, statut)}' },
  { nom: '🔴 la carte complète perd « Annuler et rembourser »', fichier: BORD,
    de: '                onAnnulerCommerce={annulerParLeCommerce}\n                onExpedier={setCommandeAExpedier}\n                onProduitsRemis={produitsRemis}\n                onRetourArriere={annulerRemise}\n                filtreCourant={filtreStatut}\n                modeHistorique={false}',
    vers: '                onExpedier={setCommandeAExpedier}\n                onProduitsRemis={produitsRemis}\n                onRetourArriere={annulerRemise}\n                filtreCourant={filtreStatut}\n                modeHistorique={false}' },
  { nom: '⚠️ la carte complète passe DEVANT les confirmations', fichier: BORD,
    de: "zIndex: 9990, padding: '1rem' }}>", vers: "zIndex: 10000, padding: '1rem' }}>" },
  { nom: '🔴 fermer un créneau sans confirmation', fichier: VUE,
    de: '    if (ok) onBasculer(r.creneau.id, bloque)', vers: '    onBasculer(r.creneau.id, bloque)' },
  { nom: '🔴 la carte compacte avance deux étapes (clic sans garde « envoi »)', fichier: VUE,
    de: '    try { await onAvancer(commande, action.statut) } finally { setEnvoi(false) }', vers: '    onAvancer(commande, action.statut); setEnvoi(false)' },
  // Les unités réelles dans « À préparer » et le PDF (Alex, 11/10 soir).
  { nom: '🔴 « À préparer » recompte les lots au lieu des croissants', fichier: REGLE,
    de: '  const unites = l.quantite_stock !== null && l.quantite_stock !== undefined ? Number(l.quantite_stock) : Number(l.quantite)', vers: '  const unites = Number(l.quantite)' },
  { nom: '🔴 « À préparer » affiche le nom de l offre au lieu de l article', fichier: REGLE,
    de: '  const nom = l.deal_id ? (l.article?.nom || l.article_nom) : (l.article_nom || l.article?.nom)', vers: '  const nom = l.article_nom || l.article?.nom' },
  { nom: '🔴 le second article du duo disparaît de la production', fichier: REGLE,
    de: '  if (l.duo_article_id) {', vers: '  if (false) {' },
  { nom: '⚠️ une ligne simple prend le nom du catalogue (renommé) au lieu du nom figé', fichier: REGLE,
    de: '  const nom = l.deal_id ? (l.article?.nom || l.article_nom) : (l.article_nom || l.article?.nom)', vers: '  const nom = l.article?.nom || l.article_nom' },
  { nom: '🔴 le PDF recompte les offres', fichier: 'lib/export-commandes-pdf.js',
    // ⚠️ ANCRE REPOINTÉE LE 12/10 : la boucle remplit aussi le bloc du moment.
    de: '      for (const { nom, quantite } of unitesDeLigne(l, nomsArticles)) {', vers: "      for (const { nom, quantite } of [{ nom: l?.article_nom || '?', quantite: Number(l?.quantite) || 0 }]) {" },
  { nom: '⚠️ le panneau ne lit plus le nom du second article', fichier: VUE,
    de: '  const prep = aPreparer(commandesDuJour, { nomsArticles })', vers: '  const prep = aPreparer(commandesDuJour)' },
  // Alex, 11/10 soir.
  { nom: '🔴 la relecture des 60 s remet le jour sur aujourd hui', fichier: BORD,
    de: "    // 🔴 LE JOUR CHOISI N'EST PLUS REMIS À AUJOURD'HUI (Alex, 11/10 : « l'écran", vers: '    setJourSelectionne(dateKey(new Date()))' },
  { nom: '⚠️ un jour qui n est plus proposé ne retombe plus sur aujourd hui', fichier: BORD,
    de: '  const jourActif = (jourSelectionne && joursDispos.includes(jourSelectionne)) ? jourSelectionne : todayKey', vers: '  const jourActif = jourSelectionne || todayKey' },
  { nom: '⚠️ la bascule Livraison redevient violette', fichier: BORD,
    de: "background: vueMode === m.v ? (m.v === 'livraison' ? COULEUR_LIVRAISON.fort : T.main)", vers: 'background: vueMode === m.v ? (T.main)' },
  { nom: '⚠️ la pastille Livraison prend une autre couleur', fichier: VUE,
    de: 'puce(COULEUR_LIVRAISON.pale, COULEUR_LIVRAISON.texte)}>Livraison', vers: "puce('#EEF2FF', '#3730A3')}>Livraison" },
  { nom: '⚠️ la fenêtre d encodage garde le violet pour la livraison', fichier: 'app/dashboard/ModalNouvelleCommande.js',
    de: "background: mode === m ? (m === 'livraison' ? COULEUR_LIVRAISON.pale : T.pale)", vers: 'background: mode === m ? (T.pale)' },
  // ─── 12/10 : À L'AVANCE / LE JOUR MÊME (« deux blocs, partout ») ────────
  { nom: '🔴 le jour de création est lu comme une heure locale (23 h 30 la veille passe pour le jour même)', fichier: REGLE,
    de: '  const passee = jourBelgeDeCreation(c?.created_at)', vers: "  const passee = String(c?.created_at || '').slice(0, 10)" },
  { nom: '🔴 une commande du jour même passe pour « à l avance »', fichier: REGLE,
    de: '  return /^\\d{4}-\\d{2}-\\d{2}$/.test(retrait) && !!passee && passee < retrait', vers: '  return /^\\d{4}-\\d{2}-\\d{2}$/.test(retrait) && !!passee && passee <= retrait' },
  { nom: '🔴 les deux blocs se mélangent', fichier: REGLE,
    de: '    leJourMeme: quantitesParArticle(liste.filter(c => !commandeALAvance(c)), { nomsArticles }),', vers: '    leJourMeme: quantitesParArticle(liste, { nomsArticles }),' },
  { nom: '🔴 le PDF du jour perd ses deux blocs', fichier: 'lib/export-commandes-pdf.js',
    de: "  if ((donnees?.productionALAvance || []).length > 0) {", vers: '  if (false) {' },
  { nom: '🔴 le récap de 8 h ne reçoit plus la production', fichier: 'app/api/cron/recap-jour-8h/route.js',
    de: '            production,', vers: '' },
  { nom: '🔴 le récap compte aussi les commandes déjà prêtes', fichier: 'app/api/cron/recap-jour-8h/route.js',
    de: "          const production = productionSeparee((cmds || []).filter(x => x.statut !== 'pret'), { nomsArticles })", vers: '          const production = productionSeparee(cmds || [], { nomsArticles })' },
  { nom: '🔴 l écran ne montre plus le bloc à l avance', fichier: VUE,
    de: '              <TableArticles articles={prep.aLAvance}/>', vers: '              <TableArticles articles={prep.articles}/>' },
  { nom: '⚠️ le nom d un article part brut dans l email', fichier: 'lib/resend.js',
    de: '${echapperHtml(a.nom)}</td>', vers: '${a.nom}</td>' },
  // ─── 24/10 : LA TABLETTE DU COMPTOIR EN PORTRAIT (décidé au tableau) ────
  { nom: '🔴 les colonnes repassent à 280 px (« Prêtes » tombe sous les autres en portrait)', fichier: VUE,
    de: "    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, alignItems: 'start' }}>",
    vers: "    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, alignItems: 'start' }}>" },
  { nom: '🔴 « Ma journée » perd la bande des créneaux', fichier: VUE,
    de: '              {creneaux}', vers: '' },
  { nom: '🔴 un jour fermé n est plus dit', fichier: BORD,
    de: '                      {fermeCeJour && (', vers: '                      {false && (' },
  { nom: '🔴 le filtre choisi n est pas appliqué', fichier: BORD,
    de: '                      <select className="barre-filtre" value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}',
    vers: '                      <select className="barre-filtre" value={filtreStatut} onChange={() => {}}' },
  { nom: '⚠️ sur tablette, les jours restent sous la bascule (une rangée de plus)', fichier: BORD,
    de: '          .barre-jours-piste { order: 0; flex: 1 1 0; }', vers: '' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
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
  const f = chemin(m.fichier)
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
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
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
