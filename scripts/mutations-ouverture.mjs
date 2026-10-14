// HARNAIS DE MUTATION — L'OUVERTURE À CONFIRMER (30/09 au soir)
//
// Chaque mutation remet une date que personne n'a décidée quelque part, et le
// banc `verif:lancement` doit rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   npm run mutations:ouverture

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:lancement'
const LIB = 'lib/lancement.js'
const REVEAL = 'app/components/LandingReveal.js'

const MUTATIONS = [
  // ⚠️ REPOINTÉES LE 14/10 : Alex a basculé l'ouverture (« tout ce soir »).
  // Le danger mesuré s'inverse : un texte d'AVANT qui survit une fois ouvert.
  { nom: '🔴 l ouverture redevient « à confirmer » en silence',
    fichier: LIB, de: 'export const OUVERTURE_A_CONFIRMER = false', vers: 'export const OUVERTURE_A_CONFIRMER = true' },
  { nom: '🔴 sans date, la date du 1er octobre reprend la main',
    fichier: LIB, de: '  if (!datee) return true', vers: '' },
  { nom: '🔴 les phrases ignorent le drapeau',
    fichier: LIB, de: 'const dateeOuDrapeau = (datee) => datee === undefined ? ouvertureDatee() : datee', vers: 'const dateeOuDrapeau = (datee) => true' },
  { nom: '🔴 « très bientôt » redevient une date',
    fichier: LIB, de: "  return dateeOuDrapeau(datee) ? `le ${libelleLancement({ avecAnnee })}` : 'très bientôt'", vers: '  return `le ${libelleLancement({ avecAnnee })}`' },
  { nom: '⚠️ « jusqu à l ouverture » disparaît',
    fichier: LIB, de: "  return dateeOuDrapeau(datee) ? `jusqu’au ${libelleLancement()}` : 'jusqu’à l’ouverture'", vers: "  return dateeOuDrapeau(datee) ? `jusqu’au ${libelleLancement()}` : ''" },
  // ⚠️ REPOINTÉE LE 13/10 : l'email de publication parle au présent (Alex,
  // tableau). Le danger mesuré devient le retour du discours d'avant.
  { nom: '🔴 l email de publication reparle d une ouverture à venir',
    fichier: 'lib/resend.js', de: 'tes clients peuvent la voir et commander dès maintenant.', vers: 'elle s’ouvre au public très bientôt.' },
  { nom: '🔴 l email du kit d après annonce une ouverture à venir',
    fichier: 'lib/resend.js', de: ', ta page est en ligne. Voici ton kit de démarrage', vers: ', ta page s’ouvre au public très bientôt. Voici ton kit de démarrage' },
  { nom: '🔴 le merci de préinscription promet encore « tu recevras un email ce jour-là »',
    fichier: 'lib/resend-landing.js', de: '  const ouvert = !avantLancement()', vers: '  const ouvert = false' },
  { nom: '🔴 Google lit une publication au 1er octobre',
    fichier: 'lib/seo-landing.js', de: '{ datePublished: LAUNCH_DATE_ISO.slice(0, 10) }', vers: "{ datePublished: '2026-10-01' }" },
  // ⚠️ REPOINTÉES LE 14/10 : la landing v2 n'a plus de compte à rebours ni de
  // ligne « Lancement officiel ». La mutation les fait REVENIR, et la garde
  // durcie (« aucun compte à rebours », « aucune ligne Lancement officiel »)
  // doit rougir.
  { nom: '🔴 le compte à rebours revient sans date',
    fichier: REVEAL, de: '            <p className="lp-micro">Sans carte de paiement', vers: '            <CompteurLancement/>\n            <p className="lp-micro">Sans carte de paiement' },
  { nom: '🔴 la barre « J-N » revient sans date',
    fichier: REVEAL, de: '  const barreLancement = restant > 0 && ouvertureDatee() ? (', vers: '  const barreLancement = restant > 0 ? (' },
  { nom: '⚠️ « Lancement officiel » garde une date',
    fichier: REVEAL, de: '<p className="lp-micro">Sans carte de paiement', vers: '<p className="lp-micro">Lancement officiel le {libelleLancement()} · Sans carte de paiement' },
  { nom: '⚠️ le merci du formulaire redonne rendez-vous au 1er octobre',
    fichier: REVEAL, de: "'Bien reçu 🟣 On te prévient dès l’ouverture. À très vite !'", vers: '`Bien reçu 🟣 Rendez-vous le ${libelleLancement()}. À très vite !`' },
  { nom: '🔴 la meta description dit encore « Lancement … » une fois ouvert',
    fichier: 'app/page.tsx', de: 'pour les commerçants. ${finDescription()}`,', vers: 'pour les commerçants. Lancement ${quandOuverture({ avecAnnee: true })}.`,' },
  { nom: '🔴 le bouton des habitants promet encore « le lancement »',
    fichier: REVEAL, de: "avantLancement() ? 'Me prévenir du lancement' : 'Me prévenir'", vers: "'Me prévenir du lancement'" },
  { nom: '🔴 le merci du formulaire n annonce plus l arrivée des commerçants',
    fichier: REVEAL, de: "'Bien reçu 🟣 On te prévient dès que tes commerçants arrivent sur Yoppaa. À très vite !'", vers: "'Bien reçu 🟣 On te prévient dès l’ouverture. À très vite !'" },
  // ─── L ESSAI DE 100 JOURS, DES L INSCRIPTION (14/10, decision d Alex) ───
  { nom: '🔴 le plancher retombe a trente jours',
    fichier: LIB, de: 'export const ESSAI_JOURS_MINIMUM = 100', vers: 'export const ESSAI_JOURS_MINIMUM = 30' },
  { nom: '🔴 la validation du dossier ne lit plus la date d inscription',
    fichier: 'app/api/admin/kyb/valider/route.js', de: 'stripe_customer_id, stripe_subscription_id, created_at', vers: 'stripe_customer_id, stripe_subscription_id' },
  { nom: '🔴 Checkout recompte l essai depuis aujourd hui',
    fichier: 'lib/stripe-billing.js', de: '  const trialEnd = trialEndCommercant(commercant, { margeMs: MARGE_TRIAL_CHECKOUT_MS })', vers: '  const trialEnd = calculerTrialEnd()' },
  { nom: '🔴 un appelant reecrit sa duree d essai a la main',
    fichier: 'app/api/stripe/billing/checkout/route.js', de: '      cancelUrl,', vers: '      cancelUrl,\n      trialDays: 30,' },
  // ─── LES DEUX TEMPS ET L ADRESSE DU TABLEAU DE BORD (banc des emails) ───
  { nom: '🔴 l espace ouvert ne montre plus les deux temps', banc: 'verif:emails',
    // ⚠️ La première occurrence est celle de l'espace ouvert (avant la relance).
    fichier: 'lib/resend.js', de: "      ${deuxTemps('fiche')}", vers: '' },
  { nom: '🔴 le schéma se trompe d étape', banc: 'verif:emails',
    fichier: 'lib/resend.js', de: "    fiche:   ['fait', 'atoi'],", vers: "    fiche:   ['encours', 'avenir']," },
  { nom: '🔴 la validation ne dit plus où est le tableau de bord', banc: 'verif:emails',
    fichier: 'lib/resend.js', de: '      ${blocAccesTableauDeBord()}', vers: '' },
  { nom: '🔴 l adresse n est plus écrite en clair', banc: 'verif:emails',
    // ⚠️ REPOINTÉE LE 13/10 : l'adresse suit le site (`adresseTableauDeBord`).
    fichier: 'lib/resend.js', de: 'text-decoration:none;">${adresseTableauDeBord().texte}</a>', vers: 'text-decoration:none;">Ouvrir</a>' },
  { nom: '🔴 le geste Android disparaît', banc: 'verif:emails',
    fichier: 'lib/resend.js', de: "          ${ligne('Android',", vers: "          ${false && ligne('Android'," },
  { nom: '⚠️ un dégradé entre dans le bloc d aide', banc: 'verif:emails',
    fichier: 'lib/resend.js', de: '      <div style="background-color:${C.bg};border:1px solid ${C.pale};border-radius:12px;padding:16px;margin:0 0 14px;">', vers: '      <div style="background-image:linear-gradient(135deg,#fff,#eee);border:1px solid ${C.pale};border-radius:12px;padding:16px;margin:0 0 14px;">' },
  // ⚠️ La première occurrence est celle de la publication (avant la relance).
  { nom: '⚠️ la publication oublie l adresse', banc: 'verif:emails',
    fichier: 'lib/resend.js', de: '      ${ligneAdresseTableauDeBord()}', vers: '' },
  { nom: '🔴 l icône promise ne porte plus son nom', banc: 'verif:emails',
    fichier: 'public/manifest-dashboard.json', de: '"short_name": "Yoppaa Pro"', vers: '"short_name": "Yoppaa"' },

  // ─── L AIDE DANS LE TABLEAU DE BORD (banc des emails) ───────────────────
  { nom: '🔴 l iPad qui se dit Mac reçoit le conseil du clavier', banc: 'verif:emails',
    fichier: 'lib/aide-installation.js', de: "  if (/Macintosh/i.test(ua) && Number(pointsTactiles) > 1) return 'ios'", vers: '' },
  { nom: '🔴 l aide s affiche depuis l icône installée', banc: 'verif:emails',
    fichier: 'lib/aide-installation.js', de: '  return !installee && !native && !rangee', vers: '  return !native && !rangee' },
  { nom: '🔴 l aide s affiche dans l app des stores', banc: 'verif:emails',
    fichier: 'lib/aide-installation.js', de: '  return !installee && !native && !rangee', vers: '  return !installee && !rangee' },
  { nom: '🔴 « Plus tard » ne range plus rien', banc: 'verif:emails',
    fichier: 'lib/aide-installation.js', de: '  return !installee && !native && !rangee', vers: '  return !installee && !native' },
  { nom: '🔴 Chrome propose l installation, pas de bouton', banc: 'verif:emails',
    fichier: 'lib/aide-installation.js', de: '  if (installable) {', vers: '  if (false) {' },
  { nom: '⚠️ le geste iPhone diverge de l email', banc: 'verif:emails',
    fichier: 'lib/aide-installation.js', de: "puis « Sur l’écran d’accueil ». L’icône", vers: "puis « Ajouter ». L’icône" },
  { nom: '🔴 le composant ignore l icône installée', banc: 'verif:emails',
    fichier: 'app/dashboard/AideInstallation.js', de: '      installee: estDansLApp() === true,', vers: '      installee: false,' },
  { nom: '🔴 le tableau de bord ne montre plus l aide', banc: 'verif:emails',
    fichier: 'app/dashboard/page.js', de: '            {commercant && <AideInstallation/>}', vers: '' },

  { nom: '🔴 l affichette relit la date brute',
    fichier: 'app/affichette/[slug]/page.js', de: '? `Ouverture ${quandOuverture()} : ton compteur', vers: '? `Ouverture le ${libelleLancement()} : ton compteur' },
]

const lancer = (banc) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    return { rouge: true, plante: !/vérifications passées/.test(sortie), extrait: sortie.slice(-400) }
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
