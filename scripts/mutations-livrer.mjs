// HARNAIS DE MUTATION — LIVRER UNE COMMANDE (équipe, étape 4)
//
// Chaque mutation casse une chose précise, et le banc qu'elle nomme doit
// rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   npm run mutations:livrer

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:livrer'
const REGLE = 'lib/livraison-geste.js'
const SERVEUR = 'lib/livraison-serveur.js'
const ROUTE = 'app/api/livraison/livrer/route.js'
const STATUT = 'app/api/livraison/statut/route.js'
const BORD = 'app/dashboard/page.js'
const POSTE = 'app/equipe/PosteEquipe.js'
const VUE = 'lib/equipe-poste.js'

const MUTATIONS = [
  // ─── LA RÈGLE ────────────────────────────────────────────────────────────
  { nom: '🔴 une livraison en route repart',
    fichier: REGLE, de: "  if (vers === 'en_livraison') return actuel === null", vers: "  if (vers === 'en_livraison') return actuel !== 'livree'" },
  { nom: '🔴 « Livrée » exige d être parti (livreur bloqué devant la porte)',
    fichier: REGLE, de: "  if (vers === 'livree') return actuel === null || actuel === 'en_livraison'", vers: "  if (vers === 'livree') return actuel === 'en_livraison'" },
  { nom: '🔴 une livraison livrée se relivre',
    fichier: REGLE, de: "  if (vers === 'livree') return actuel === null || actuel === 'en_livraison'", vers: "  if (vers === 'livree') return true" },
  { nom: '🔴 une commande pas prête, ou un retrait, se livre',
    fichier: REGLE, de: "  if (!commande || commande.mode_retrait !== 'livraison' || commande.statut !== 'pret') return false", vers: '  if (!commande) return false' },
  { nom: '🔴 « Livrée » ne termine plus la commande',
    // ⚠️ REPOINTÉE LE 05/10 (I5) : « livrée » et « retirée au magasin »
    // terminent par la même ligne, le suivi choisi juste au-dessus.
    fichier: REGLE, de: "  return { champs: { statut_livraison: fin, statut: 'recupere', ...(argent || {}) }, refus: null }", vers: "  return { champs: { statut_livraison: fin, ...(argent || {}) }, refus: null }" },
  { nom: '🔴 « En route » termine la commande',
    fichier: REGLE, de: "  if (vers === 'en_livraison') return { champs: { statut_livraison: 'en_livraison' }, refus: null }", vers: "  if (vers === 'en_livraison') return { champs: { statut_livraison: 'en_livraison', statut: 'recupere' }, refus: null }" },
  { nom: '🔴 l argent déjà encaissé se réécrit',
    fichier: REGLE, de: '  if (!commande.encaisse_mode) {', vers: '  if (true) {' },
  { nom: '🔴 payée à la porte sans le moyen, ça passe',
    fichier: REGLE, de: '    if (r.refus) return { champs: null, refus: r.refus }', vers: '' },

  { nom: '🔴 « absent » possible avant le départ',
    fichier: REGLE, de: "  if (vers === 'absent') return actuel === 'en_livraison'", vers: "  if (vers === 'absent') return actuel !== 'livree'" },
  { nom: '🔴 « absent » termine la commande',
    fichier: REGLE, de: "  if (vers === 'absent') return { champs: { statut_livraison: null }, refus: null }", vers: "  if (vers === 'absent') return { champs: { statut_livraison: null, statut: 'recupere' }, refus: null }" },

  // ─── LE CLIENT ABSENT ────────────────────────────────────────────────────
  { nom: '🔴 « absent » ne prévient plus le client',
    fichier: ROUTE, de: "    if (statut_livraison === 'absent') {", vers: '    if (false) {' },
  { nom: '🔴 pas de notification au client absent',
    fichier: 'lib/livraison-absent-serveur.js', de: '    if (client?.id) {', vers: '    if (false) {' },
  { nom: '🔴 un email raté passe pour envoyé',
    fichier: 'lib/livraison-absent-serveur.js', de: '  return { email: !!envoi?.ok, push }', vers: '  return { email: true, push: true }' },
  { nom: '🔴 le bouton de l email porte le nom brut',
    fichier: 'lib/resend.js', de: "    ctaLabel: lienTel ? `Appeler ${commerce}` : 'Voir ma commande',", vers: "    ctaLabel: lienTel ? `Appeler ${commercant_nom}` : 'Voir ma commande'," },
  { nom: '⚠️ le lien d appel garde les espaces',
    fichier: 'lib/resend.js', de: "  const lienTel = tel ? `tel:${tel.replace(/[^\\d+]/g, '')}` : null", vers: '  const lienTel = tel ? `tel:${tel}` : null' },
  { nom: '🔴 tableau de bord : on ne dit plus si le client est prévenu',
    fichier: BORD, de: "    if (statutLivraison === 'absent') {", vers: '    if (false) {' },
  { nom: '🔴 Poste : « prévenu » affiché même quand rien n est parti',
    fichier: POSTE, de: "      if (j.client_prevenu) dire('Noté : le client est prévenu de vous appeler.')", vers: "      dire('Noté : le client est prévenu de vous appeler.')" },
  { nom: '🔴 Poste : « Client absent » s affiche sans la règle',
    // ⚠️ ANCRES REPOINTÉES LE 06/10 : chaque bouton vérifie aussi son geste.
    fichier: POSTE, de: "      {gestes?.absent && gesteLivraisonPermis(l, 'absent') && (", vers: '      {gestes?.absent && true && (' },

  // ─── LE SERVEUR ──────────────────────────────────────────────────────────
  { nom: '🔴 la lecture oublie le commerce',
    fichier: SERVEUR, de: "    .eq('id', commandeId).eq('commercant_id', commercantId).maybeSingle()", vers: "    .eq('id', commandeId).maybeSingle()" },
  { nom: '🔴 l écriture oublie le statut lu (annulée pendant le geste)',
    fichier: SERVEUR, de: "    .eq('id', commandeId).eq('commercant_id', commercantId).eq('statut', c.statut)", vers: "    .eq('id', commandeId).eq('commercant_id', commercantId)" },
  { nom: '🔴 l écriture oublie l étape lue (deux « Partir »)',
    fichier: SERVEUR, de: "    : ecriture.is('statut_livraison', null)", vers: '    : ecriture' },
  { nom: '🔴 une écriture sans ligne passe pour une réussite',
    fichier: SERVEUR, de: "  if (!ecrit) return { ok: false, code: 'deja_fait', message: 'Cette livraison vient d’être traitée par quelqu’un d’autre.' }", vers: '' },

  // ─── LES ROUTES ──────────────────────────────────────────────────────────
  { nom: '🔴 la route s ouvre sans la case « livraisons »',
    // ⚠️ ANCRE REPOINTÉE LE 06/10 : la garde s'ouvre à « Commandes » pour le
    // seul « Retirée au magasin » ; la mutation retire ce verrou.
    fichier: ROUTE, de: "    if (verdict.role === 'membre' && !verdict.permis?.livraisons && statut_livraison !== 'retiree_magasin') {", vers: '    if (false) {' },
  { nom: '🔴 le commerce ne vient plus de la garde',
    fichier: ROUTE, de: '      commercantId: verdict.commercant.id,', vers: '      commercantId: verdict.commercant?.id || null,' },
  { nom: '🔴 le message au client part sans que rien soit écrit',
    // ⚠️ ANCRE REPOINTÉE LE 06/10 : la garde passe par `annonceConforme`.
    fichier: STATUT, de: '    if (!annonceConforme(cmd, statut_livraison)) {', vers: '    if (false) {' },
  { nom: '🔴 le livreur ne peut plus prévenir le client',
    fichier: STATUT, de: "gardeLigneEquipe(request, supabase, 'commandes', commande_id, ['commandes', 'livraisons'])", vers: "gardeLigneEquipe(request, supabase, 'commandes', commande_id, 'commandes')" },

  // ─── LE TABLEAU DE BORD ──────────────────────────────────────────────────
  { nom: '🔴 le tableau de bord réécrit depuis le navigateur',
    fichier: BORD, de: "    const res = await postPro('/api/livraison/livrer', { commande_id: commandeId, statut_livraison: statutLivraison, encaissement })", vers: "    const res = await supabase.from('commandes').update({ statut_livraison: statutLivraison }).eq('id', commandeId)" },
  { nom: '🔴 « rien encaissé » part sous un nom que le serveur refuse',
    fichier: BORD, de: "      ? (champs.encaisse_mode === 'rien' ? 'sans_paiement' : champs.encaisse_mode)", vers: '      ? champs.encaisse_mode' },

  // ─── LE POSTE ────────────────────────────────────────────────────────────
  { nom: '🔴 payée à la porte, le livreur ne dit pas comment',
    fichier: POSTE, de: '      if (Number(l.a_encaisser) > 0) {', vers: '      if (false) {' },
  { nom: '🔴 « Livrée » part sans confirmation',
    fichier: POSTE, de: "        if (choix !== 'oui') return", vers: '' },
  // ⚠️ ANCRE REPOINTÉE LE 06/10 : le crédit d'une livraison est fait par la
  // route `livrer`, plus par le Poste.
  { nom: '🔴 la livraison ne crédite plus la fidélité',
    fichier: ROUTE, de: "      await crediterFideliteCommande(admin, commande_id, '[livraison/livrer]')", vers: '' },
  { nom: '🔴 sans la case, les boutons apparaissent',
    fichier: POSTE, de: 'gestes={etat.droits?.livraisons ? gestesLivraison : null}', vers: 'gestes={gestesLivraison}' },
  { nom: '🔴 « Partir » s affiche sans la règle',
    fichier: POSTE, de: "      {gestes?.partir && gesteLivraisonPermis(l, 'en_livraison') && (", vers: '      {gestes?.partir && true && (' },
  { nom: '🔴 la vue du livreur perd le mode (aucun bouton)',
    fichier: VUE, de: '    mode_retrait: c.mode_retrait || null,', vers: '' },

  // ─── AUDIT ÉCRAN CLIENT, 06/10 : RÉCAP DE 8 H ET TOTAL ───────────────────
  { nom: '🔴 le récap repart à 7 h en hiver',
    fichier: 'lib/recap-commandes.js', de: '  return partiesBruxelles(instant)?.heure === HEURE_DU_RECAP', vers: '  return new Date(instant).getUTCHours() === 6' },
  { nom: '🔴 la rue part dans l email',
    fichier: 'lib/recap-commandes.js', de: "      localite: mode === 'livraison' ? localiteDeAdresse(cmd.adresse_livraison) : null,", vers: "      localite: mode === 'livraison' ? cmd.adresse_livraison : null," },
  { nom: '🔴 livraisons et retraits remélangés',
    fichier: 'lib/recap-commandes.js', de: "filter(l => (l.mode || 'retrait') === b.mode)", vers: 'filter(() => b.mode === BLOCS_RECAP[0].mode)' },
  { nom: '🔴 le tri revient au numéro',
    fichier: 'lib/recap-commandes.js', de: '    if (ha !== hb) return ha < hb ? -1 : 1', vers: '' },
  { nom: '🔴 le cron n attend plus 8 h',
    fichier: 'app/api/cron/recap-jour-8h/route.js', de: '  if (!forcer && !estHeureDuRecap(new Date())) {', vers: '  if (false) {' },
  { nom: '🔴 « la veille » relit aujourd hui',
    fichier: 'app/api/cron/recap-jour-8h/route.js', de: "    const debutVeille = brusselsInstant(jourCivilPlus(dateJour, -1), '00:00').toISOString()", vers: "    const debutVeille = brusselsInstant(dateJour, '00:00').toISOString()" },
  { nom: '🔴 l écran remise avec les deals d aujourd hui',
    fichier: 'app/commander/[slug]/page.js', de: '        dealsData: dealsTous,', vers: '        dealsData: dealsActifs,' },
  { nom: '🔴 l écran calcule pour une autre date que celle envoyée',
    fichier: 'app/commander/[slug]/page.js', de: '        dateCommande: dateDeLaCommande(),', vers: '        dateCommande: jourLocalISO(new Date()),' },
  { nom: '🔴 l envoi repart avec sa propre date',
    fichier: 'app/commander/[slug]/page.js', de: '      const dateStr = dateDeLaCommande()', vers: '      const dateStr = jourLocalISO(new Date())' },
  { nom: '🔴 le minimum ne bloque plus le paiement',
    fichier: 'app/commander/[slug]/page.js', de: ' && choixLivraisonValable && minimumLivraison().ok)', vers: ' && choixLivraisonValable)' },
  { nom: '🔴 le total avec frais repasse en euros à virgule',
    fichier: 'app/commander/[slug]/page.js', de: '  function totalAvecFrais() { return (totalPanierCents() + Math.round(fraisLivraison() * 100)) / 100 }', vers: '  function totalAvecFrais() { return totalPanier() + fraisLivraison() }' },
  { nom: '⚠️ l onglet ouvert ne se redessine plus',
    fichier: 'app/commander/[slug]/page.js', de: '    const t = setInterval(() => setMinuteEcran(m => m + 1), 60000)', vers: '    const t = null' },
  { nom: '🔴 la règle des heures laisse tout passer',
    fichier: 'lib/heure-cron.js', de: '  return !forcer && !estHeureBruxelles(cible.heure, instant)', vers: '  return false' },
  { nom: '🔴 le rappel RDV ne lit plus son heure',
    fichier: 'app/api/cron/rdv-reminder-9h/route.js', de: "  if (horsDeSonHeure(request, '/api/cron/rdv-reminder-9h')) return NextResponse.json({ ok: true, ignore: 'pas_son_heure' })", vers: '' },
  { nom: '🔴 Good Morning perd son passage d hiver',
    fichier: 'vercel.json', de: '      "schedule": "30 5,6 * * *"', vers: '      "schedule": "30 5 * * *"' },
  { nom: '🔴 les rappels de retrait visent une autre heure',
    fichier: 'lib/heure-cron.js', de: "  '/api/cron/rappels-retrait':       { heure: 11 },", vers: "  '/api/cron/rappels-retrait':       { heure: 12 }," },
  { nom: '🔴 le total se réadditionne en euros',
    fichier: 'app/api/stripe/checkout/create-commande/route.js', de: '        total: (totalCents + fraisLivraisonCents) / 100,', vers: '        total: totalEUR + fraisLivraisonEUR,' },
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
