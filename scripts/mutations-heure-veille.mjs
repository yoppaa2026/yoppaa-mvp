// Harnais de mutation de l'heure limite de la veille (20/10) :
// `npm run mutations:heure-veille`.
//
// Chaque mutation casse UNE règle ; `verif:heure-veille` doit rougir. Écrite,
// mesurée, restaurée par `ecrireSur`, restauration vérifiée. Jamais de
// `git checkout`.

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:heure-veille'

const REGLE = 'lib/heure-veille.js'
const CIRCUITS = 'lib/stock-article.js'
const DELAI = 'lib/delai-commande.js'
const FICHE = 'app/commander/[slug]/page.js'
const ROUTE = 'app/api/stripe/checkout/create-commande/route.js'
const ECRAN = 'app/dashboard/ConfigDashboard.js'

const MUTATIONS = [
  { nom: '🔴 sans heure, les circuits changent de forme (l’app change pour tout le monde)', fichier: CIRCUITS,
    de: '  return l ? { ...circuits, limite: l.limite, apresLimite: l.apresLimite } : circuits',
    vers: '  return { ...circuits, limite: l?.limite ?? null, apresLimite: !!l?.apresLimite }' },
  // ✅ 22/10 : l'article hors de l'heure limite (sandwichs de la 7 Abbayes).
  { nom: '🔴 le serveur ne lit plus « hors limite » (il refuse ce que la fiche propose)', fichier: 'lib/lignes-commande.js',
    de: 'vente_jour, commande_active, hors_heure_limite, stock_mode,', vers: 'vente_jour, commande_active, stock_mode,' },
  { nom: 'la copie perd « hors limite »', fichier: 'lib/catalogue-copie.js',
    de: "  'hors_heure_limite',", vers: '' },
  { nom: '🔴 le lot écrit l’inverse du choix', fichier: 'lib/catalogue-lot.js',
    de: '      sortie.push({ id: a.id, patch: { hors_heure_limite: valeur } })', vers: '      sortie.push({ id: a.id, patch: { hors_heure_limite: !valeur } })' },
  { nom: '🔴 la fiche article oublie de l’écrire', fichier: ECRAN,
    de: '      hors_heure_limite: form.hors_heure_limite === true,', vers: '' },
  { nom: '🔴 minuit devient une limite (demain fermé toute la journée)', fichier: REGLE,
    de: '  if (m === null || m === 0) return null', vers: '  if (m === null) return null' },
  { nom: '18 h pile passe encore', fichier: REGLE,
    de: 'apresLimite: m !== null && m >= minutesDeLHeure(limite)', vers: 'apresLimite: m !== null && m > minutesDeLHeure(limite)' },
  { nom: '🔴 l’heure du serveur (temps universel) au lieu de Bruxelles', fichier: REGLE,
    de: '  const m = minutesBruxelles(maintenant)', vers: '  const m = maintenant.getUTCHours() * 60 + maintenant.getUTCMinutes()' },
  { nom: '🔴 le jour même prend la limite aussi', fichier: CIRCUITS,
    // REPOINTÉE LE 22/10 : la condition porte aussi `hors_heure_limite`.
    de: '  const l = circuits.surCommande && article?.hors_heure_limite !== true ? limiteDeLaVeille(commercant, maintenant) : null',
    vers: '  const l = article?.hors_heure_limite !== true ? limiteDeLaVeille(commercant, maintenant) : null' },
  { nom: '🔴 l’article hors de l’heure limite la suit quand même', fichier: CIRCUITS,
    de: '  const l = circuits.surCommande && article?.hors_heure_limite !== true ? limiteDeLaVeille(commercant, maintenant) : null',
    vers: '  const l = circuits.surCommande ? limiteDeLaVeille(commercant, maintenant) : null' },
  { nom: '🔴 le plancher de B ne recule pas', fichier: DELAI,
    de: 'jourPlus(aujourdhui, n + (recule ? 1 : 0))', vers: 'jourPlus(aujourdhui, n)' },
  { nom: 'le refus ne porte plus l’heure (message faux « 1 jour à l’avance »)', fichier: DELAI,
    de: ', ...(recule ? { limite: circuits.limite } : {}) }', vers: ' }' },
  { nom: '🔴 le croissant du jour même est refusé après 18 h', fichier: DELAI,
    de: '      if (circuits.aujourdhui) return null\n      // ⚠️ B SEUL',
    vers: '      if (circuits.aujourdhui && !recule) return null\n      // ⚠️ B SEUL' },
  { nom: '🔴 le duo perd la limite', fichier: CIRCUITS,
    de: '  const limite = a.limite || b.limite || null', vers: '  const limite = null' },
  { nom: 'le duo sans B garde la limite', fichier: CIRCUITS,
    de: '  if (!c.surCommande || !limite) return c', vers: '  if (!limite) return c' },
  { nom: '🔴 le calendrier ne montre pas après-demain', fichier: DELAI,
    de: '  return recule ? n + 1 : n', vers: '  return n' },
  { nom: 'la carte du pain sur commande oublie l’heure', fichier: DELAI,
    de: 'mentionDisponibilite({ delaiJours: nB, indispo, limite: circuits.limite || null })', vers: 'mentionDisponibilite({ delaiJours: nB, indispo })' },
  { nom: '« la veille avant 18 h » disparaît', fichier: REGLE,
    de: '  if (h && n === 1) return `la veille avant ${libelleHeure(h)}`\n', vers: '' },
  { nom: 'une phrase sur la fiche sans article sur commande', fichier: REGLE,
    de: '  if (!h || !surCommande) return null', vers: '  if (!h) return null' },
  { nom: 'une saisie illisible passe', fichier: REGLE,
    de: "  if (minutesDeLHeure(valeur) === null) return 'L’heure limite n’est pas lisible.'\n", vers: '' },
  { nom: '🔴 le serveur ne lit plus l’heure du commerce', fichier: ROUTE,
    de: "livraison_actif, commande_veille_avant')", vers: "livraison_actif')" },
  { nom: 'le message du serveur ne nomme plus l’heure', fichier: ROUTE,
    de: 'se commande ${delaiEnClair(j, refus.limite || null)} : le premier', vers: 'se commande ${j} jours à l\'avance : le premier' },
  { nom: 'l’encodage (création) ne lit plus l’heure', fichier: 'app/api/equipe/commande/creer/route.js',
    // ⚠️ ANCRES REPOINTÉES LE 21/10 : `boutique_horizon_jours` suit la colonne.
    de: "horaires_detail, commande_veille_avant, boutique_horizon_jours')", vers: "horaires_detail, boutique_horizon_jours')" },
  { nom: 'la grille de l’encodage ne lit plus l’heure', fichier: 'app/api/equipe/commande/catalogue/route.js',
    de: "horaires_detail, commande_veille_avant, boutique_horizon_jours').eq(", vers: "horaires_detail, boutique_horizon_jours').eq(" },
  { nom: 'l’avertissement de l’encodage ne nomme plus l’heure', fichier: 'lib/commande-encodee.js',
    de: '  if (refus.limite) {\n    return {', vers: '  if (false) {\n    return {' },
  { nom: 'la fiche ne dit plus la phrase', fichier: FICHE,
    de: 'const phrase = phraseHeureLimite()', vers: 'const phrase = null' },
  { nom: 'la carte de la fiche oublie l’heure', fichier: FICHE,
    de: '      limite: refus.limite || null,\n', vers: '' },
  { nom: '🔴 le réglage écrit la saisie brute', fichier: ECRAN,
    de: 'update({ commande_veille_avant: valeur })', vers: 'update({ commande_veille_avant: val })' },
  { nom: '🔴 une écriture refusée se tait', fichier: ECRAN,
    de: "    if (error) { toast('L’heure limite n’a pas été enregistrée. Réessaie dans un instant.', 'error'); return }\n", vers: '' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/en échec/.test(sortie)
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
  const n = original.split(m.de).length - 1
  if (n !== 1) {
    manquees.push(`${m.nom} — ANCRE ${n === 0 ? 'INTROUVABLE' : `PRÉSENTE ${n} FOIS`}`)
    console.log(`  ? ancre ${n === 0 ? 'introuvable' : 'non unique'} : ${m.nom}`)
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
if (manquees.length) {
  console.log('\nÀ reprendre :')
  for (const m of manquees) console.log(`  - ${m}`)
  process.exit(1)
}
