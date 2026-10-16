// HARNAIS DE MUTATION — LA COMMANDE ENCODÉE À LA MAIN (10/10)
//
// Chaque mutation casse UNE garde de la commande encodée ; `verif:encodee`
// doit rougir. Une mutation qui reste verte désigne une garde aveugle.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-commande-encodee.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:encodee'
const REGLE = 'lib/commande-encodee.js'
const ROUTE = 'app/api/equipe/commande/creer/route.js'
const LECTURE = 'app/api/equipe/commande/catalogue/route.js'
const FENETRE = 'app/dashboard/ModalNouvelleCommande.js'
const BORD = 'app/dashboard/page.js'
const SQL = 'migrations/MIGRATION_COMMANDE_ENCODEE.sql'

const MUTATIONS = [
  // ─── LA RÈGLE ────────────────────────────────────────────────────────────
  { nom: '🔴 « payé » passe en paiement en ligne : la compta compte une carte qui n existe pas',
    fichier: REGLE, de: '  const base = { paye_en_ligne: false }', vers: '  const base = { paye_en_ligne: paiement !== \'a_payer\' }' },
  { nom: '🔴 « à payer au retrait » écrit quand même un encaissement',
    fichier: REGLE, de: "  if (paiement === 'a_payer') return { ok: true, champs: { ...base, encaisse_mode: null, encaisse_montant: null, encaisse_le: null } }", vers: "  if (paiement === 'a_payer') return { ok: true, champs: { ...base, encaisse_mode: 'especes', encaisse_montant: Number(total), encaisse_le: maintenant.toISOString() } }" },
  { nom: '🔴 la confirmation donnée vaut pour TOUT avertissement, même nouveau',
    fichier: REGLE, de: '  return (avertissements || []).some(a => !vus.has(a.code))', vers: '  return (avertissements || []).length > 0 && vus.size === 0' },
  { nom: '🔴 une date passée s encode',
    fichier: REGLE, de: "  if (dateCommande < aujourdhui) return { refus: 'Cette date est passée.' }", vers: '' },
  { nom: '⚠️ un créneau commencé est refusé au lieu d être signalé',
    fichier: REGLE, de: "  if (verdict.raison === 'passe') return { refus: null, avertissement: avertissement('creneau_commence') }", vers: "  if (verdict.raison === 'passe') return { refus: 'Créneau passé.' }" },
  { nom: '🔴 un créneau terminé s encode (le serveur ne le refuse plus)',
    fichier: REGLE, de: "  if (termine) return { refus: 'Ce créneau est terminé. Choisis-en un autre.' }", vers: '' },
  { nom: '🔴 le créneau EN COURS est caché (fin confondue avec début)',
    fichier: REGLE, de: '  const fin = instant(dateStr, creneau.heure_fin)', vers: '  const fin = instant(dateStr, creneau.heure_debut)' },
  { nom: '⚠️ le créneau qui passe minuit est caché dès le soir',
    fichier: REGLE, de: '    ? new Date(fin.getTime() + 24 * 3600 * 1000) : fin', vers: '    ? fin : fin' },
  { nom: '🔴 la route ne dit plus si le créneau est terminé',
    fichier: ROUTE, de: '      termine: creneauTermine(creneau, { dateStr: date_commande, instant: brusselsInstant }),', vers: '' },
  { nom: '🔴 la fenêtre montre à nouveau les créneaux de 7 h à 15 h',
    fichier: FENETRE, de: "  }).filter(({ creneau }) => !creneauTermine(creneau, { dateStr: date, maintenant: new Date(minute), instant: brusselsInstant }))", vers: '  })' },
  { nom: '🔴 la bande de remplissage montre à nouveau les créneaux de 7 h',
    fichier: BORD, de: "  })).filter(({ creneau }) => !creneauTermine(creneau, { dateStr: jourActif, maintenant: new Date(minuteBande), instant: brusselsInstant }))", vers: '  }))' },
  { nom: '⚠️ la bande ne relit plus l heure : un créneau fini reste jusqu au rechargement',
    fichier: BORD, de: '    const t = setInterval(() => setMinuteBande(Date.now()), 60000)', vers: '    const t = null' },
  { nom: '⚠️ un créneau choisi qui se termine reste choisi',
    fichier: FENETRE, de: '    if (creneauId && !creneaux.some(({ creneau }) => creneau.id === creneauId)) setCreneauId(null)', vers: '' },
  { nom: '🔴 la tarte à J+2 s encode pour demain sans un mot (règles de l article ignorées)',
    fichier: REGLE, de: '  const refus = refusDuJour({ ...regle, jour, aujourdhui })', vers: '  const refus = null' },
  { nom: '⚠️ les règles lues sans les circuits : l article sur commande seul passe pour J+0',
    fichier: REGLE, de: '    indispo, circuits: circuitsDeLArticle(article, commercant),', vers: '    indispo, circuits: null,' },
  { nom: '🔴 « dès lundi » revient : le premier jour ignore les jours de vente',
    fichier: REGLE, de: '  const premier = premierJourPossible({ regle, aujourdhui })', vers: "  const premier = refus.plancher || null" },
  { nom: '🔴 la tuile parle de stock pour un article hors jour',
    fichier: REGLE, de: '  if (hors || dejaCommande === null || dejaCommande === undefined) return { hors, gere: false, dispo: Infinity }', vers: '  if (dejaCommande === null || dejaCommande === undefined) return { hors, gere: false, dispo: Infinity }' },
  { nom: '🔴 un vendu illisible devient « rien vendu » : la tuile annonce un stock plein',
    fichier: REGLE, de: '  if (hors || dejaCommande === null || dejaCommande === undefined) return { hors, gere: false, dispo: Infinity }', vers: '  if (hors) return { hors, gere: false, dispo: Infinity }' },
  { nom: '🔴 la route ne prévient plus des règles de l article',
    fichier: ROUTE, de: '      if (hors) avertissements.push(avertissement(`article:${id}`, hors.message))', vers: '      if (hors) void 0' },
  { nom: '⚠️ la route ne lit plus les jours de vente : le pain du week-end passe un lundi',
    fichier: ROUTE, de: '      const hors = articleHorsJour({ article: art, indispo: joursIndisponibles(entrees), commercant, jour: date_commande, aujourdhui })', vers: '      const hors = articleHorsJour({ article: art, indispo: [], commercant, jour: date_commande, aujourdhui })' },
  { nom: '⚠️ la tuile ne dit plus la règle du jour',
    fichier: FENETRE, de: '                            {tuile.hors ? (', vers: '                            {false ? (' },
  { nom: '⚠️ la lecture de la grille fait d un vendu illisible un « rien vendu »',
    fichier: LECTURE, de: '    let dejaCommande = null', vers: '    let dejaCommande = {}' },
  { nom: '🔴 le calendrier propose les jours de fermeture',
    fichier: REGLE, de: '    if (!j || estFermeExceptionnellement(fermetures, j)) continue', vers: '    if (!j) continue' },
  { nom: '⚠️ aujourd hui proposé même sans créneau restant',
    fichier: REGLE, de: '    if (i === 0 && !aujourdhuiOuvert) continue', vers: '' },
  { nom: '🔴 au-delà du calendrier : plus rien n est signalé',
    fichier: REGLE, de: "  return !!dernier && /^\\d{4}-\\d{2}-\\d{2}$/.test(String(jour || '')) && jour > dernier", vers: '  return false' },
  { nom: '🔴 la route ne prévient plus au-delà du calendrier',
    fichier: ROUTE, de: "      avertissements.push(avertissement('hors_calendrier'))", vers: '      void 0' },
  { nom: '⚠️ la longueur du calendrier ignore les jours de vente des articles',
    fichier: 'lib/calendrier-commande-server.js', de: '      delaiJours: delaiEnJours(a), indispo: offParArticle[a.id] || [], horizonJours: a.horizon_jours, circuits: circuitsDeLArticle(a, commercant),', vers: '      delaiJours: delaiEnJours(a), indispo: [], horizonJours: a.horizon_jours, circuits: circuitsDeLArticle(a, commercant),' },
  { nom: '⚠️ les pastilles reviennent à Aujourd hui / Demain',
    fichier: FENETRE, de: '    return joursDuCalendrier({ aujourdhui, longueur: donnees.calendrier.longueur, fermetures: donnees.calendrier.fermetures, aujourdhuiOuvert, horairesDetail: horaires })', vers: '    return [aujourdhui, jourPlus(aujourdhui, 1)]' },
  { nom: '🔴 après l enregistrement, la fenêtre garde l ancienne commande',
    fichier: FENETRE, de: '    nouvelleCommande()', vers: '    void 0' },
  { nom: '⚠️ le pop-up ne part plus tout seul',
    fichier: FENETRE, de: '    const t = setTimeout(() => setEnregistree(null), 2000)', vers: '    const t = null' },
  { nom: '⚠️ le remplissage n est pas relu après l enregistrement',
    fichier: FENETRE, de: '  }, [commercantId, date, relecture])', vers: '  }, [commercantId, date])' },
  { nom: '🔴 le tableau de bord referme la fenêtre après chaque commande',
    fichier: BORD, de: '                    onCree={() => chargerCommandes(commercant.id)}', vers: '                    onCree={() => { setEncoderOuvert(false); chargerCommandes(commercant.id) }}' },
  // ─── LES HORAIRES, POUR LE RETRAIT (11/10) ───────────────────────────────
  { nom: '🔴 le mardi fermé redevient commandable', fichier: 'lib/ouverture.js',
    de: "  if (h.ouvert === false) return { raison: 'jour_ferme', plages: [] }", vers: '' },
  { nom: '🔴 un créneau qui déborde la fermeture passe (chevauchement au lieu d inclusion)', fichier: 'lib/ouverture.js',
    de: '  if (plages.some(([a, b]) => d >= a && f <= b)) return null', vers: '  if (plages.some(([a, b]) => d < b && f > a)) return null' },
  { nom: '⚠️ la forme `creneaux` des horaires est ignorée', fichier: 'lib/ouverture.js',
    de: '  const plages = creneauxDuJour(h)', vers: '  const plages = (h.debut && h.fin ? [[h.debut, h.fin]] : [])' },
  { nom: '🔴 le serveur en ligne accepte un retrait hors horaires', fichier: 'app/api/stripe/checkout/create-commande/route.js',
    de: "          return NextResponse.json({ ok: false, error: messageHorsHoraires(hors, date_commande), creneau_indisponible: true }, { status: 409 })", vers: '          void 0' },
  { nom: '🔴 la fiche propose à nouveau le mardi fermé', fichier: 'app/commander/[slug]/page.js',
    de: '      if (fermeCeJour(d)) continue', vers: '      if (estEnFermeture(d)) continue' },
  { nom: '⚠️ la fiche cache aussi les tournées hors horaires', fichier: 'app/commander/[slug]/page.js',
    de: 'data.blocagesLivraison || [], longueurCal, false))', vers: 'data.blocagesLivraison || [], longueurCal))' },
  { nom: '⚠️ l encodage ne prévient plus d un retrait hors horaires', fichier: ROUTE,
    de: "      if (hors) avertissements.push(avertissement('hors_horaires', messageHorsHoraires(hors, date_commande, { pourCommercant: true })))", vers: '' },
  { nom: '⚠️ les pastilles proposent le jour fermé', fichier: REGLE,
    // ⚠️ ANCRE RECALÉE LE 16/10 : l'horaire du JOUR (`ouvertLe`, la liste unique).
    de: '    if (horairesDetail && !ouvertLe({ horairesDetail, fermetures, dateStr: j })) continue', vers: '' },
  { nom: '🔴 le nom n est plus obligatoire',
    fichier: REGLE, de: "  if (n.length < 2) return { ok: false, error: 'Indique au moins le nom du client.' }", vers: '' },
  { nom: '🔴 la saisie du commerçant fait sonner son propre écran',
    fichier: REGLE, de: '  return (commandes || []).filter(c => c && c.origine !== ORIGINE_COMMERCANT && c.statut !== \'paiement_en_attente\').length', vers: '  return (commandes || []).filter(c => c && c.statut !== \'paiement_en_attente\').length' },
  { nom: '⚠️ deux articles courts partagent un seul code : confirmer l un confirme l autre',
    fichier: REGLE, de: "  const famille = String(code).split(':')[0]", vers: "  const famille = String(code).split(':')[0]; code = famille" },

  // ─── LA ROUTE ────────────────────────────────────────────────────────────
  { nom: '🔴 n importe quel membre encode, même sans la case',
    fichier: ROUTE, de: "    const garde = await gardeEquipe(request, admin, commercant_id, 'commandes')", vers: "    const garde = await gardeEquipe(request, admin, commercant_id, ['commandes', 'agenda', 'livraisons', 'comptoir'])" },
  { nom: '🔴 le créneau plein passe sans prévenir',
    fichier: ROUTE, de: "      })) avertissements.push(avertissement('creneau_plein'))", vers: '      })) void 0' },
  { nom: '🔴 un stock court passe sans prévenir',
    fichier: ROUTE, de: '      avertissements.push(avertissement(`stock:${id}`, Number.isFinite(v.stock_disponible)', vers: '      void (avertissement(`stock:${id}`, Number.isFinite(v.stock_disponible)' },
  { nom: '🔴 une panne de lecture du stock passe pour un simple avertissement',
    fichier: ROUTE, de: '      if (v.status >= 500) return non(v.error, v.status)', vers: '' },
  { nom: '⚠️ le stock se vérifie d un bloc : on ne voit que le premier problème',
    fichier: ROUTE, de: '      supabase: admin, lignes: lignes.filter(l => String(l.article_id) === id),', vers: '      supabase: admin, lignes,' },
  { nom: '🔴 on écrit sans attendre la confirmation',
    fichier: ROUTE, de: '    if (confirmationRequise(avertissements, corps.confirmes)) {', vers: '    if (false) {' },
  { nom: '🔴 la commande encodée n est plus marquée comme telle : le verrou la refuse et l écran sonne',
    fichier: ROUTE, de: '        origine: ORIGINE_COMMERCANT,', vers: '' },
  { nom: '🔴 le commerçant reçoit l e-mail « Nouvelle commande » de sa propre saisie',
    fichier: ROUTE, de: '    await envoyerEmailsCommande(commande.id, admin, { versClient: confirmation, versCommercant: false })', vers: '    await envoyerEmailsCommande(commande.id, admin)' },
  { nom: '🔴 la confirmation part même sans que le commerçant l ait demandée',
    fichier: ROUTE, de: '    const confirmation = !!corps.envoyer_confirmation && !!client.client_email', vers: '    const confirmation = !!client.client_email' },
  { nom: '🔴 une version en rupture refuse la commande au lieu de prévenir',
    fichier: ROUTE, de: '      stockVarianteIndicatif: true,', vers: '      stockVarianteIndicatif: false,' },
  { nom: '⚠️ des lignes ratées laissent une commande fantôme',
    fichier: ROUTE, de: "      await admin.from('commandes').delete().eq('id', commande.id)", vers: '      void 0' },

  // ─── LA LECTURE ──────────────────────────────────────────────────────────
  { nom: '🔴 la lecture des commandes du jour laisse sortir le nom des clients',
    fichier: LECTURE, de: "        .select('statut, date_commande, creneau_id, creneau_livraison_id, commande_articles(quantite, article:articles!commande_articles_article_id_fkey(temps_prepa))')", vers: "        .select('statut, client_nom, date_commande, creneau_id, creneau_livraison_id, commande_articles(quantite, article:articles!commande_articles_article_id_fkey(temps_prepa))')" },

  // ─── LES ÉCRANS ──────────────────────────────────────────────────────────
  { nom: '🔴 un créneau sans limite s affiche « Plein »',
    fichier: FENETRE, de: '                const complet = !!capacite && completBrut', vers: '                const complet = completBrut' },
  { nom: '⚠️ un avertissement périmé reste affiché après un changement',
    fichier: FENETRE, de: '  useEffect(() => { setAvertissements(null) }, [mode, date, creneauId, panier, adresse, paiement])', vers: '' },
  { nom: '🔴 le tableau de bord recompte toutes les commandes pour sonner',
    fichier: BORD, de: '      const arrivees = nombreArriveesEnLigne(triees)', vers: '      const arrivees = triees.length' },
  // Les frais de livraison dits au téléphone (Alex, 11/10 soir).
  { nom: '🔴 le total à payer oublie les frais',
    fichier: REGLE, de: '    total: Math.round((total + f.montant) * 100) / 100,', vers: '    total: Math.round(total * 100) / 100,' },
  { nom: '🔴 la fenêtre calcule les frais sur 0 € (toujours plein tarif, jamais offerte)',
    fichier: FENETRE, de: 'resumeLivraison({ totalArticles: totalLignes, config: configLivraison })', vers: 'resumeLivraison({ totalArticles: 0, config: configLivraison })' },
  { nom: '⚠️ le minimum n est plus dit',
    fichier: REGLE, de: '    minimum: mini.seuil, manqueMinimum: mini.ok ? 0 : mini.manque,', vers: '    minimum: mini.seuil, manqueMinimum: 0,' },
  { nom: '🔴 la route du catalogue ne renvoie plus la configuration',
    fichier: LECTURE, de: '      configLivraison: configLivraison.data || null,', vers: '      configLivraison: null,' },
  { nom: '⚠️ une erreur de lecture de la configuration passe en silence',
    fichier: LECTURE, de: 'for (const r of [commerce, articles, deals, retrait, livraison, jour, configLivraison])', vers: 'for (const r of [commerce, articles, deals, retrait, livraison, jour])' },
  { nom: '⚠️ les conditions oublient « offerte dès »',
    fichier: REGLE, de: "Number.isFinite(gratuit)) morceaux.push(`offerte dès ${formater(gratuit)}`)", vers: 'Number.isFinite(gratuit)) void 0' },
  // « Autre date » dit pourquoi (Alex, 11/10 soir : un mardi fermé restait muet).
  { nom: '🔴 « Autre date » sur un mardi fermé : rien n est dit',
    fichier: REGLE, de: "    avis.push(messageHorsHoraires({ raison: 'jour_ferme', plages: [] }, jour, { pourCommercant: true }))", vers: '    void 0' },
  { nom: '🔴 « Autre date » sur un jour de fermeture notée : rien n est dit',
    fichier: REGLE, de: '  if (estFermeExceptionnellement(fermetures, jour)) avis.push(AVERTISSEMENTS.jour_ferme)', vers: '' },
  { nom: '⚠️ « Autre date » au-delà du calendrier : rien n est dit',
    fichier: REGLE, de: '  if (horsCalendrier({ jour, aujourdhui, longueur })) avis.push(AVERTISSEMENTS.hors_calendrier)', vers: '' },
  { nom: '🔴 « Autre date » : les créneaux hors horaires restent cachés (aucun moyen d encoder)',
    fichier: FENETRE, de: '    .filter(r => autreDate || !r.horsHoraires),', vers: '    .filter(r => !r.horsHoraires),' },
  { nom: '🔴 hors « Autre date », les créneaux hors horaires sont proposés',
    fichier: FENETRE, de: '    .filter(r => autreDate || !r.horsHoraires),', vers: '    .filter(r => autreDate || true),' },
  { nom: '⚠️ l encadré jaune n est plus affiché',
    fichier: FENETRE, de: '          {avisDate.length > 0 && (', vers: '          {false && (' },

  // ─── LA MIGRATION ────────────────────────────────────────────────────────
  { nom: '🔴 l exemption passe avant le filtre des statuts',
    fichier: SQL, de: "  IF NEW.statut NOT IN ('paiement_en_attente', 'en_attente', 'en_preparation', 'pret') THEN", vers: "  IF NEW.origine = 'commercant' THEN RETURN NEW; END IF; IF NEW.statut NOT IN ('paiement_en_attente', 'en_attente', 'en_preparation', 'pret') THEN" },
  { nom: '🔴 le verrou change en douce pour les commandes en ligne',
    fichier: SQL, de: '    IF v_nb + 1 > v_max THEN', vers: '    IF v_nb > v_max THEN' },
  { nom: '🔴 l origine n est plus fermée',
    fichier: SQL, de: "  ADD CONSTRAINT commandes_origine_check CHECK (origine IN ('en_ligne', 'commercant'));", vers: "  ADD CONSTRAINT commandes_origine_check CHECK (origine IS NOT NULL);" },
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
