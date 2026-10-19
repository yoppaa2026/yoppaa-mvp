// LE TABLEAU DE PILOTAGE D'ALEX (19/10).
//
// ✅ ALEX, 19/10 (tableau) : « un vrai tableau de bord pour me permettre de
// piloter le dev de Yoppaa et d'orienter mon business ». Une page « Pilotage »
// dans l'admin et un email chaque matin à 7h00, avec quatre blocs : croissance
// et demande, commerçants et revenu, activité, santé technique.
//
// ⚠️ UN SEUL CALCUL POUR LA PAGE ET L'EMAIL. Deux calculs finiraient par dire
// deux chiffres différents pour la même journée, et le premier qui le
// remarque cesse de croire aux deux. Ce fichier est PUR : il reçoit des lignes
// déjà lues (`lib/pilotage-server.js`) et rend des nombres. Il s'exécute au
// banc avec des lignes inventées et une horloge choisie.
//
// 🔴 LES FICHES DE DÉMONSTRATION FAUSSENT TOUT. Le 19/10, la lecture du parc
// comptait 238 commandes passées dans l'app : 235 venaient des fiches de démo
// (`billing_exempt`), c'est-à-dire des tests d'Alex. Le vrai chiffre était 3.
// Elles sont donc ÉCARTÉES de chaque compteur, et seulement listées à part.
//
// ⚠️ LES DÉFINITIONS NE SONT PAS RÉÉCRITES ICI. Ce qu'une commande ou un
// rendez-vous rapporte vient de `lib/statistiques.js`, celui du tableau de bord
// des commerçants : le pilotage ne peut pas dire un autre chiffre qu'eux.
//
// ⚠️ LES JOURS SONT CEUX DE BRUXELLES. Une commande passée à 00h30 le 20 compte
// le 20, pas le 19 comme le dirait l'heure de Greenwich (`jourBruxelles`).

import { jourBruxelles, jourCivilPlus } from './timezone'
import { resolvePlan, getPrixPlan, PLANS, PLAN_LABEL } from './plans'
import { finEssai } from './lancement'
import { commandeEncaissee, valeurCommande, rdvHonore, valeurRdv, arrondi } from './statistiques'
import { STATUTS_RDV_ANNULES } from './remboursements'
import { HEURES_CRON } from './heure-cron'

export const JOURS_COURBE = 30

// Une commande qui n'a jamais existé pour personne : le panier abandonné au
// paiement, et celle dont le paiement n'est jamais revenu.
export const COMMANDE_PAS_NEE = ['paiement_en_attente', 'annulee_paiement_ko']

export const estDemo = (c) => c?.billing_exempt === true
export const commandeComptee = (c) => !!c && !COMMANDE_PAS_NEE.includes(c.statut)
export const commandeEncodee = (c) => c?.origine === 'commercant'
export const rdvCompte = (r) => !!r && !STATUTS_RDV_ANNULES.includes(r.statut)
export const rdvEncode = (r) => r?.source === 'commercant'

// Le jour belge d'un horodatage, ou '' s'il est illisible.
export function jourDe(horodatage) {
  if (!horodatage) return ''
  const d = new Date(horodatage)
  if (Number.isNaN(d.getTime())) return ''
  return jourBruxelles(d)
}

// Les 30 derniers jours COMPLETS, du plus ancien à la veille.
export function joursDeLaCourbe(aujourdhui, jours = JOURS_COURBE) {
  const liste = []
  for (let i = jours; i >= 1; i--) liste.push(jourCivilPlus(aujourdhui, -i))
  return liste
}

// Une série jour par jour : { 'AAAA-MM-JJ': valeur }.
function serie(lignes, jourDeLaLigne, valeur = () => 1) {
  const m = {}
  for (const l of lignes) {
    const j = jourDeLaLigne(l)
    if (!j) continue
    m[j] = (m[j] || 0) + Number(valeur(l) || 0)
  }
  return m
}

// La somme d'une série sur une liste de jours.
const somme = (s, jours) => jours.reduce((t, j) => t + (s[j] || 0), 0)

// Ce que dit une tuile : la veille, le même jour une semaine plus tôt, les
// sept derniers jours et les sept d'avant. ⚠️ ON COMPARE AU MÊME JOUR DE LA
// SEMAINE : un lundi contre un dimanche ne dit rien d'une friterie.
export function tuile(cle, libelle, s, aujourdhui, { argent = false } = {}) {
  const hier = jourCivilPlus(aujourdhui, -1)
  const septJours = [1, 2, 3, 4, 5, 6, 7].map(i => jourCivilPlus(aujourdhui, -i))
  const septAvant = [8, 9, 10, 11, 12, 13, 14].map(i => jourCivilPlus(aujourdhui, -i))
  const arr = (v) => (argent ? arrondi(v) : v)
  return {
    cle,
    libelle,
    argent,
    hier: arr(s[hier] || 0),
    memeJourSemainePassee: arr(s[jourCivilPlus(hier, -7)] || 0),
    septJours: arr(somme(s, septJours)),
    septJoursAvant: arr(somme(s, septAvant)),
    courbe: joursDeLaCourbe(aujourdhui).map(j => ({ jour: j, valeur: arr(s[j] || 0) })),
  }
}

// ─── LES TÂCHES AUTOMATIQUES ATTENDUES ──────────────────────────────────────
// Ce que le journal doit voir passer, et à quel rythme. Les crons de la table
// des heures passent chaque jour (sauf les signaux, le mardi) ; deux autres
// n'y figurent pas parce qu'ils ne visent pas une heure belge.
// ⚠️ `expire-reservations` (toutes les 5 minutes) n'écrit PAS au journal :
// 288 lignes par jour pour dire « je tourne » noieraient tout le reste.
export const CRONS_SUIVIS = [
  ...Object.keys(HEURES_CRON).map(chemin => ({
    chemin,
    rythme: chemin === '/api/cron/signaux-hebdo' ? 'semaine' : 'jour',
  })),
  { chemin: '/api/cron/stripe-frais', rythme: 'jour' },
  { chemin: '/api/cron/purge-adresses-livraison', rythme: 'mois' },
]

// Au-delà de ce délai sans passage, la tâche est en retard. Une marge de deux
// heures sur le jour (un passage peut glisser), d'un jour sur la semaine et
// sur le mois.
export const TOLERANCE_HEURES = { jour: 26, semaine: 8 * 24, mois: 32 * 24 }

export function etatCron({ chemin, rythme }, passages, journalDepuis, maintenant) {
  const dernier = passages
    .filter(p => p.nom === chemin)
    .map(p => new Date(p.cree_le).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0] || null
  const tolerance = TOLERANCE_HEURES[rythme] * 3600 * 1000
  const t = maintenant.getTime()
  let etat
  if (dernier && t - dernier <= tolerance) etat = 'ok'
  // ⚠️ UN JOURNAL TOUT NEUF NE PEUT PAS ACCUSER. Le lendemain de son
  // installation, la purge mensuelle n'a évidemment pas encore tourné : ce
  // n'est pas un retard, c'est une attente.
  else if (!journalDepuis || t - new Date(journalDepuis).getTime() < tolerance) etat = 'attente'
  else etat = 'retard'
  return { chemin, rythme, dernierPassage: dernier ? new Date(dernier).toISOString() : null, etat }
}

// ─── LE CALCUL ───────────────────────────────────────────────────────────────
//
// `d` : les lignes lues par `lirePilotage`, et `d.erreurs`, la liste des
// sources qui n'ont pas pu être lues. Une source manquante rend son bloc
// « indisponible », jamais zéro : un zéro inventé se lit comme un fait.
export function calculerPilotage(d = {}, maintenant = new Date()) {
  const erreurs = Array.isArray(d.erreurs) ? d.erreurs : []
  const indisponible = (source) => erreurs.includes(source)
  const aujourdhui = jourBruxelles(maintenant)
  const hier = jourCivilPlus(aujourdhui, -1)
  const il30 = jourCivilPlus(aujourdhui, -30)
  const dans30 = (jour) => !!jour && jour >= il30 && jour < aujourdhui

  const commercants = d.commercants || []
  const demoIds = new Set(commercants.filter(estDemo).map(c => c.id))
  const reelle = (l) => !demoIds.has(l?.commercant_id)

  const commandes = (d.commandes || []).filter(commandeComptee)
  const rdvs = (d.rdvs || []).filter(rdvCompte)
  const commandesReelles = commandes.filter(reelle)
  const rdvsReels = rdvs.filter(reelle)
  const signaux = (d.signaux || []).filter(reelle)
  const vues = (d.vues || []).filter(reelle)
  const favoris = (d.favoris || []).filter(reelle)
  const avis = (d.avis || []).filter(reelle)
  const bons = (d.bons || []).filter(reelle).filter(b => b.statut === 'actif')
  const cartes = (d.cartes || []).filter(reelle)

  const parCreation = (l) => jourDe(l.created_at)
  const valeurAffaire = (l) => (l.__rdv ? valeurRdv(l) : valeurCommande(l))
  const affairesReelles = [
    ...commandesReelles.filter(commandeEncaissee),
    ...rdvsReels.filter(rdvHonore).map(r => ({ ...r, __rdv: true })),
  ]

  const comptesParJour = {}
  for (const l of d.comptesParJour || []) if (l?.jour) comptesParJour[l.jour] = Number(l.comptes || 0)

  // ─── 1. CROISSANCE ET DEMANDE ─────────────────────────────────────────────
  const tuiles = [
    tuile('comptes', 'Nouveaux comptes Yopper', comptesParJour, aujourdhui),
    tuile('vues', 'Vues des fiches', serie(vues, v => v.jour, v => v.vues), aujourdhui),
    tuile('signaux', 'Signaux d’envie', serie(signaux, parCreation), aujourdhui),
    tuile('commandes_app', 'Commandes dans l’app', serie(commandesReelles.filter(c => !commandeEncodee(c)), parCreation), aujourdhui),
    tuile('commandes_encodees', 'Commandes encodées', serie(commandesReelles.filter(commandeEncodee), parCreation), aujourdhui),
    tuile('rdv_app', 'RDV et tables dans l’app', serie(rdvsReels.filter(r => !rdvEncode(r)), parCreation), aujourdhui),
    tuile('rdv_encodes', 'RDV et tables encodés', serie(rdvsReels.filter(rdvEncode), parCreation), aujourdhui),
    tuile('volume', 'Volume d’affaires', serie(affairesReelles, parCreation, valeurAffaire), aujourdhui, { argent: true }),
  ].map(t => {
    const sources = { comptes: 'comptes', vues: 'vues', signaux: 'signaux', commandes_app: 'commandes', commandes_encodees: 'commandes', rdv_app: 'rdvs', rdv_encodes: 'rdvs', volume: 'commandes' }
    return { ...t, indisponible: indisponible(sources[t.cle]) || (t.cle === 'volume' && indisponible('rdvs')) }
  })

  const preinscrits = d.preinscrits || []
  const croissance = {
    comptesYopper: Object.values(comptesParJour).reduce((a, b) => a + b, 0),
    comptesIndisponibles: indisponible('comptes'),
    clientsSansCompte: d.clientsSansCompte ?? null,
    preinscritsYopper: preinscrits.filter(p => p.type_utilisateur === 'yopper').length,
    preinscritsCommercant: preinscrits.filter(p => p.type_utilisateur === 'commercant').length,
    favoris: favoris.length,
    vues30: vues.filter(v => dans30(v.jour)).reduce((t, v) => t + Number(v.vues || 0), 0),
  }

  const typesSignaux = {}
  for (const s of signaux) {
    const t = typesSignaux[s.type] || (typesSignaux[s.type] = { type: s.type, total: 0, trenteJours: 0 })
    t.total++
    if (dans30(jourDe(s.created_at)) || jourDe(s.created_at) === aujourdhui) t.trenteJours++
  }
  const demande = {
    signauxTotal: signaux.length,
    parType: Object.values(typesSignaux).sort((a, b) => b.total - a.total),
    suggestions: d.suggestions?.length ?? null,
    suggestions7: (d.suggestions || []).filter(s => jourDe(s.created_at) >= jourCivilPlus(aujourdhui, -7)).length,
    signalements7: (d.signalements || []).filter(s => jourDe(s.created_at) >= jourCivilPlus(aujourdhui, -7)).length,
    avis: avis.length,
    bonsVendus: bons.length,
    cartesFidelite: cartes.length,
    indisponible: indisponible('signaux'),
  }

  // ─── 2. LES COMMERCES, UNE LIGNE CHACUN ───────────────────────────────────
  const parCommerce = (lignes) => {
    const m = new Map()
    for (const l of lignes) {
      const liste = m.get(l.commercant_id) || []
      liste.push(l)
      m.set(l.commercant_id, liste)
    }
    return m
  }
  const sigP = parCommerce(d.signaux || [])
  const favP = parCommerce(d.favoris || [])
  const vuesP = parCommerce(d.vues || [])
  const cmdP = parCommerce(commandes)
  const rdvP = parCommerce(rdvs)
  const affP = parCommerce([
    ...commandes.filter(commandeEncaissee),
    ...rdvs.filter(rdvHonore).map(r => ({ ...r, __rdv: true })),
  ])

  const lignesCommerces = commercants.map(c => {
    const choisi = resolvePlan(c.plan) || 'exister'
    const essai = resolvePlan(c.essai_plan)
    const essaieMieux = essai && PLANS.indexOf(essai) > PLANS.indexOf(choisi) ? essai : null
    const sig = sigP.get(c.id) || []
    const cmd = cmdP.get(c.id) || []
    const rdv = rdvP.get(c.id) || []
    const derniere = [...cmd, ...rdv]
      .map(l => l.created_at).filter(Boolean).sort().pop() || null
    const inscrit = c.created_at ? new Date(c.created_at).getTime() : null
    return {
      id: c.id,
      nom: c.nom || 'Sans nom',
      demo: estDemo(c),
      formule: choisi,
      essai: essaieMieux,
      categorie: c.categorie || null,
      statutFiche: c.statut_publication || null,
      statutEspace: c.statut || null,
      joursDepuisInscription: inscrit ? Math.floor((maintenant.getTime() - inscrit) / 86400000) : null,
      abonnement: c.subscription_status || null,
      aUnAbonnement: !!c.stripe_subscription_id,
      signaux: sig.length,
      signaux30: sig.filter(s => dans30(jourDe(s.created_at)) || jourDe(s.created_at) === aujourdhui).length,
      typesSignaux: [...new Set(sig.map(s => s.type))],
      signauxHier: sig.filter(s => jourDe(s.created_at) === hier).length,
      favoris: (favP.get(c.id) || []).length,
      vues30: (vuesP.get(c.id) || []).filter(v => dans30(v.jour)).reduce((t, v) => t + Number(v.vues || 0), 0),
      commandesApp: cmd.filter(x => !commandeEncodee(x)).length,
      commandesEncodees: cmd.filter(commandeEncodee).length,
      rdvApp: rdv.filter(x => !rdvEncode(x)).length,
      rdvEncodes: rdv.filter(rdvEncode).length,
      volume30: arrondi((affP.get(c.id) || [])
        .filter(l => dans30(jourDe(l.created_at)))
        .reduce((t, l) => t + valeurAffaire(l), 0)),
      derniereActivite: derniere,
    }
  }).sort((a, b) => (b.signaux - a.signaux) || ((b.commandesApp + b.rdvApp) - (a.commandesApp + a.rdvApp)) || a.nom.localeCompare(b.nom, 'fr'))

  const reels = lignesCommerces.filter(l => !l.demo)
  const compter = (liste, cle) => {
    const m = {}
    for (const l of liste) { const k = l[cle] || '?'; m[k] = (m[k] || 0) + 1 }
    return m
  }

  // ─── 3. COMMERÇANTS ET REVENU ─────────────────────────────────────────────
  // ⚠️ CE QUE YOPPAA TOUCHERAIT, PAS CE QU'ELLE TOUCHE. Personne ne paie avant
  // la fin de son essai : le chiffre est un revenu ATTENDU, et il ne vaut que
  // si chacun reste. Une fiche suspendue n'y compte pas.
  const payants = reels.filter(l => l.formule !== 'exister' && l.statutFiche !== 'suspendu')
  const prix = (formule) => getPrixPlan(formule)?.mensuel || 0
  const prochaines = commercants
    .filter(c => !estDemo(c) && c.created_at)
    .map(c => finEssai(c.created_at).getTime())
    .filter(t => t > maintenant.getTime())
    .sort((a, b) => a - b)
  const revenu = {
    revenuAttenduHtva: arrondi(payants.reduce((t, l) => t + prix(l.formule), 0)),
    payants: payants.length,
    avecAbonnement: payants.filter(l => l.aUnAbonnement).length,
    // 🔴 SANS ABONNEMENT STRIPE, PERSONNE NE LES PRÉLÈVERA : ni le jour J, ni
    // jamais. Ce sont les formules ouvertes à la main ou pas encore validées.
    sansAbonnement: payants.filter(l => !l.aUnAbonnement).map(l => ({ nom: l.nom, formule: l.formule })),
    enEssai: reels.filter(l => l.essai).map(l => ({ nom: l.nom, formule: l.formule, essai: l.essai })),
    // ✅ CE QUI A FAIT RENONCER AU BRIEF « EXISTER PLAFONNÉ » (19/10) : un
    // commerce gratuit qui reçoit des signaux est la meilleure porte où frapper.
    aDemarcher: reels
      .filter(l => l.formule !== 'vendre' && !l.essai && l.signaux30 > 0)
      .map(l => ({ nom: l.nom, formule: l.formule, signaux30: l.signaux30, types: l.typesSignaux })),
    premierPrelevement: prochaines.length ? new Date(prochaines[0]).toISOString() : null,
  }

  const commerces = {
    total: reels.length,
    demo: lignesCommerces.length - reels.length,
    parFormule: compter(reels, 'formule'),
    parCategorie: compter(reels, 'categorie'),
    parStatutFiche: compter(reels, 'statutFiche'),
    publies: reels.filter(l => l.statutFiche === 'publie').length,
    // ⚠️ LE GOULOT DU 19/10 : six vrais commerces inscrits, fiche pas en ligne.
    // Chaque jour d'attente est un jour où ils ne voient rien venir.
    pasEnLigne: reels
      .filter(l => l.statutFiche !== 'publie' && l.statutFiche !== 'suspendu')
      .map(l => ({ nom: l.nom, statutFiche: l.statutFiche, jours: l.joursDepuisInscription }))
      .sort((a, b) => (b.jours ?? 0) - (a.jours ?? 0)),
    nouveaux7: reels.filter(l => l.joursDepuisInscription != null && l.joursDepuisInscription < 7).length,
    lignes: lignesCommerces,
    indisponible: indisponible('commercants'),
  }

  // ─── 4. ACTIVITÉ (cumul, hors démo) ───────────────────────────────────────
  const activite = {
    commandesApp: commandesReelles.filter(c => !commandeEncodee(c)).length,
    commandesEncodees: commandesReelles.filter(commandeEncodee).length,
    rdvApp: rdvsReels.filter(r => !rdvEncode(r)).length,
    rdvEncodes: rdvsReels.filter(rdvEncode).length,
    volume30: arrondi(affairesReelles.filter(l => dans30(jourDe(l.created_at))).reduce((t, l) => t + valeurAffaire(l), 0)),
    volumeTotal: arrondi(affairesReelles.reduce((t, l) => t + valeurAffaire(l), 0)),
    demoCommandes: commandes.length - commandesReelles.length,
    demoRdv: rdvs.length - rdvsReels.length,
  }

  // ─── 5. SANTÉ TECHNIQUE ───────────────────────────────────────────────────
  const journal = d.journal || []
  const passages = journal.filter(l => l.genre === 'cron')
  const erreursEcran = journal.filter(l => l.genre === 'erreur_ecran')
  const crons = indisponible('journal')
    ? []
    : CRONS_SUIVIS.map(c => etatCron(c, passages, d.journalDepuis || null, maintenant))
  const pages = {}
  for (const e of erreursEcran.filter(e => jourDe(e.cree_le) >= jourCivilPlus(aujourdhui, -7))) {
    pages[e.nom] = (pages[e.nom] || 0) + 1
  }
  const sante = {
    journalIndisponible: indisponible('journal'),
    crons,
    cronsEnRetard: crons.filter(c => c.etat === 'retard').map(c => c.chemin),
    erreursEcranHier: erreursEcran.filter(e => jourDe(e.cree_le) === hier).length,
    erreursEcran7: erreursEcran.filter(e => jourDe(e.cree_le) >= jourCivilPlus(aujourdhui, -7)).length,
    pagesEnErreur: Object.entries(pages).map(([page, n]) => ({ page, n })).sort((a, b) => b.n - a.n).slice(0, 5),
    webhooksIndisponibles: indisponible('webhooks'),
    webhooksEnErreur7: (d.webhooksEnErreur || []).length,
    derniersWebhooksEnErreur: (d.webhooksEnErreur || [])
      .slice().sort((a, b) => String(b.processed_at).localeCompare(String(a.processed_at)))
      .slice(0, 5).map(w => ({ type: w.event_type, quand: w.processed_at })),
  }

  // ─── 6. CE QUI MÉRITE TON ATTENTION CE MATIN ──────────────────────────────
  // Rouge : quelque chose ne marche pas. Orange : quelque chose attend.
  // Vert : une occasion. Rien d'autre n'y entre, sinon on cesse de le lire.
  const alertes = []
  for (const c of sante.cronsEnRetard) alertes.push({ niveau: 'rouge', texte: `La tâche ${c.replace('/api/cron/', '')} n’a pas tourné dans les temps.` })
  if (sante.webhooksEnErreur7 > 0) alertes.push({ niveau: 'rouge', texte: `${sante.webhooksEnErreur7} événement${sante.webhooksEnErreur7 > 1 ? 's' : ''} Stripe en erreur sur 7 jours.` })
  if (sante.erreursEcranHier > 0) alertes.push({ niveau: 'orange', texte: `${sante.erreursEcranHier} plantage${sante.erreursEcranHier > 1 ? 's' : ''} d’écran hier.` })
  const bloques = commerces.pasEnLigne.filter(l => (l.jours ?? 0) >= 7)
  if (bloques.length) alertes.push({ niveau: 'orange', texte: `${bloques.length} commerce${bloques.length > 1 ? 's' : ''} inscrit${bloques.length > 1 ? 's' : ''} depuis plus de 7 jours, fiche pas en ligne.` })
  for (const l of reels.filter(x => x.signauxHier > 0 && x.formule !== 'vendre' && !x.essai)) {
    alertes.push({ niveau: 'vert', texte: `${l.nom} (${PLAN_LABEL[l.formule] || l.formule}) a reçu ${l.signauxHier} signal${l.signauxHier > 1 ? 'aux' : ''} hier : à démarcher.` })
  }
  if (erreurs.length) alertes.push({ niveau: 'orange', texte: `Lecture impossible : ${erreurs.join(', ')}. Ces blocs sont marqués indisponibles.` })

  return {
    genereLe: maintenant.toISOString(),
    aujourdhui,
    hier,
    alertes,
    tuiles,
    croissance,
    demande,
    commerces,
    revenu,
    activite,
    sante,
    erreurs,
  }
}
