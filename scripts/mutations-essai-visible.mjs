// HARNAIS DE MUTATION — L'ESSAI VISIBLE PARTOUT (15/09).
//
// 🔴 CE QU'ON MESURE : qu'un commerçant en essai de Vendre dispose AILLEURS
// que dans son tableau de bord de ce que l'essai lui ouvre. Trouvé en relisant
// le règlement du concours : il allumait ses bons cadeaux, et personne ne
// pouvait en acheter.
//
// Chaque mutation remet l'ancienne lecture, `commercant.plan`, ou retire les
// colonnes sans lesquelles `planEffectif` retombe en silence sur le forfait
// choisi. Les deux régressions sont plausibles, et aucune ne lève d'erreur.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES (npm run verif:ancres).
//
//   node scripts/mutations-essai-visible.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:gardes'
const MODULE = 'lib/plans.js'
const GOOGLE = 'lib/action-google.js'
const ELIGIBILITE = 'lib/morning-eligibilite.js'
const BON_CONFIG = 'app/api/bons-cadeaux/config/route.js'
const BON_ACHAT = 'app/api/bons-cadeaux/checkout/route.js'
const ACTUS = 'app/api/actus/notify-favoris/route.js'
const DEALS = 'app/api/deals/notify-favoris/route.js'
const EXPORT = 'app/api/dashboard/export-comptable/route.js'
const STATS = 'app/api/dashboard/statistiques/route.js'
const SMS = 'app/api/fidelite/sms-packs/checkout/route.js'
const WEBHOOK = 'app/api/stripe/webhook/route.js'
const CRON_GMY = 'app/api/cron/morning-yoppers/route.js'
const RECAP = 'app/api/cron/recap-jour-8h/route.js'
const PAGE_GMY = 'app/commander/morning/page.js'
const BALISAGE = 'app/commander/[slug]/layout.js'
const KIT = 'app/kit/[slug]/page.js'
const BORD = 'app/dashboard/ConfigDashboard.js'

const MUTATIONS = [
  // ─── CE QUI S'EXÉCUTE ───────────────────────────────────────────────────
  { nom: '🔴 les pastilles relisent le forfait choisi',
    de: '  const plan = planEffectif(commercant, maintenant)',
    vers: "  const plan = commercant?.plan || 'exister'" },

  { nom: '🔴 Google relit le forfait choisi',
    fichier: GOOGLE,
    de: '  const plan = planEffectif(commercant, maintenant)',
    vers: '  const plan = commercant?.plan' },

  { nom: '🔴 le deal du Good Morning relit le forfait choisi',
    fichier: ELIGIBILITE,
    de: '  const plan = planEffectif(c, maintenant)',
    vers: '  const plan = c.plan' },

  { nom: '🔴 l’actu du Good Morning relit le forfait choisi',
    fichier: ELIGIBILITE,
    de: "  if (!canDo(planEffectif(c, maintenant), 'actu_gmy')) return false",
    vers: "  if (!canDo(c.plan, 'actu_gmy')) return false" },

  // ─── LES BONS CADEAUX, LE DÉFAUT D'ORIGINE ──────────────────────────────
  { nom: '🔴 le bouton « offrir un bon » relit le forfait choisi',
    fichier: BON_CONFIG,
    de: "&& canDo(planEffectif(c), 'bons_cadeaux')",
    vers: "&& canDo(c.plan, 'bons_cadeaux')" },

  { nom: '🔴 le bouton ne charge plus l’essai',
    fichier: BON_CONFIG,
    de: "'plan, essai_plan, created_at, statut_publication",
    vers: "'plan, statut_publication" },

  { nom: '🔴 l’achat d’un bon relit le forfait choisi',
    fichier: BON_ACHAT,
    de: "!canDo(planEffectif(commercant), 'bons_cadeaux')",
    vers: "!canDo(commercant.plan, 'bons_cadeaux')" },

  { nom: '🔴 l’achat d’un bon ne charge plus l’essai',
    fichier: BON_ACHAT,
    de: 'slug, plan, essai_plan, created_at, categorie',
    vers: 'slug, plan, categorie' },

  // ─── LES NOTIFICATIONS AUX FAVORIS ──────────────────────────────────────
  { nom: '🔴 la notification d’actu relit le forfait choisi',
    fichier: ACTUS,
    de: '  const planVivant = planEffectif(c)',
    vers: '  const planVivant = c.plan' },

  { nom: '🔴 la notification d’actu ne charge plus l’essai',
    fichier: ACTUS,
    de: 'slug, plan, essai_plan, created_at, statut_publication',
    vers: 'slug, plan, statut_publication' },

  { nom: '🔴 la notification de deal relit le forfait choisi',
    fichier: DEALS,
    de: "if (!canDo(planEffectif(c), 'deals')) {",
    vers: "if (!canDo(c.plan, 'deals')) {" },

  { nom: '🔴 la notification de deal ne charge plus l’essai',
    fichier: DEALS,
    de: 'slug, plan, essai_plan, created_at, statut_publication',
    vers: 'slug, plan, statut_publication' },

  // ─── LE TABLEAU DE BORD CÔTÉ SERVEUR ────────────────────────────────────
  { nom: '🔴 l’export comptable relit le forfait choisi',
    fichier: EXPORT,
    de: "canDo(planEffectif(commercant), 'export_comptable')",
    vers: "canDo(commercant.plan, 'export_comptable')" },

  { nom: '🔴 l’export comptable ne charge plus l’essai',
    fichier: EXPORT,
    de: "'id, nom, plan, essai_plan, created_at, auth_user_id",
    vers: "'id, nom, plan, auth_user_id" },

  { nom: '🔴 les statistiques relisent le forfait choisi',
    fichier: STATS,
    de: "peutVendre: canDo(planEffectif(commercant), 'deals'),",
    vers: "peutVendre: canDo(commercant.plan, 'deals')," },

  { nom: '🔴 les statistiques ne chargent plus l’essai',
    fichier: STATS,
    de: "'id, auth_user_id, plan, essai_plan, created_at, categorie'",
    vers: "'id, auth_user_id, plan, categorie'" },

  { nom: '🔴 les packs SMS relisent le forfait choisi',
    fichier: SMS,
    de: "canDo(planEffectif(com), 'fidelite')",
    vers: "canDo(com.plan, 'fidelite')" },

  { nom: '🔴 les packs SMS ne chargent plus l’essai',
    fichier: SMS,
    de: 'plan, essai_plan, created_at, auth_user_id, stripe_customer_id',
    vers: 'plan, auth_user_id, stripe_customer_id' },

  { nom: '🔴 la fidélité d’un bon acheté relit le forfait choisi',
    fichier: WEBHOOK,
    de: "canDo(planEffectif(complet), 'fidelite_auto')",
    vers: "canDo(complet.plan, 'fidelite_auto')" },

  // ─── LES CRONS ──────────────────────────────────────────────────────────
  { nom: '🔴 le cron du Good Morning relit le forfait choisi pour les deals',
    fichier: CRON_GMY,
    de: '    const planDeal = planEffectif(c)',
    vers: '    const planDeal = c.plan' },

  { nom: '🔴 le cron du Good Morning relit le forfait choisi pour les actus',
    fichier: CRON_GMY,
    de: "canDo(planEffectif(c), 'actu_gmy')",
    vers: "canDo(c.plan, 'actu_gmy')" },

  // ⚠️ Deux requêtes identiques : la mutation n'en retire qu'une, et c'est
  // précisément ce que la garde doit voir (elle en exige deux).
  { nom: '🔴 une des deux requêtes du cron ne charge plus l’essai',
    fichier: CRON_GMY,
    de: 'adresse, plan, essai_plan, created_at, statut_publication',
    vers: 'adresse, plan, statut_publication' },

  { nom: '🔴 le récap du matin ne charge plus l’essai',
    fichier: RECAP,
    de: "categorie, plan, essai_plan, created_at, rdv_actif'",
    vers: "categorie, plan, rdv_actif'" },

  { nom: '🔴 le récap du matin relit le forfait choisi',
    fichier: RECAP,
    de: "planEffectif(c) === 'vendre'",
    vers: "c.plan === 'vendre'" },

  // ─── LES ÉCRANS ET LE BALISAGE ──────────────────────────────────────────
  { nom: '🔴 une requête de la page Good Morning ne charge plus l’essai',
    fichier: PAGE_GMY,
    de: 'plan, essai_plan, created_at, statut_publication, logo_url, slug, telephone',
    vers: 'plan, statut_publication, logo_url, slug, telephone' },

  { nom: '🔴 le balisage Google ne charge plus l’essai',
    fichier: BALISAGE,
    de: "longitude, plan, essai_plan, created_at'",
    vers: "longitude, plan'" },

  { nom: '🔴 le kit ne charge plus l’essai',
    fichier: KIT,
    de: "'nom, slug, plan, essai_plan, created_at, categorie'",
    vers: "'nom, slug, plan, categorie'" },

  { nom: '🔴 la consigne Google du tableau de bord ne charge plus l’essai',
    fichier: BORD,
    de: "'slug, nom, plan, essai_plan, created_at, categorie'",
    vers: "'slug, nom, plan, categorie'" },

  { nom: '🔴 la limite d’actus relit le forfait choisi',
    fichier: BORD,
    de: '  const planResolu = planEffectif(commercant)',
    vers: '  const planResolu = commercant?.plan' },
]

// ⚠️ L ÉCRITURE ET LA RESTAURATION PASSENT PAR `scripts/harnais-mutation.mjs`,
// comme pour les autres harnais : réessai sur verrou et restauration sur toutes
// les sorties.
const ecrire = (f, contenu) => ecrireSur(f, contenu)

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ « ROUGE » N'EST PAS « PLANTÉ » : un banc qui explose ne mesure rien.
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
    manquees.push(`${m.nom} — ÉCRITURE IMPOSSIBLE`)
    continue
  }

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
