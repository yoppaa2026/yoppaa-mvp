// HARNAIS DE MUTATION — CE QU ON VEND CONTRE CE QUE LE CODE DONNE (22/09)
//
// 🔴 POURQUOI CE HARNAIS EXISTE. Alex, le 22/09 : « Pourquoi les cartes
// forfaits ne sont pas completes comme celles de la landing ? Toutes les
// fonctions doivent y figurer. Exemple : la fidelite comptoir n est pas
// affichee dans Communiquer alors qu elle en fait partie. »
//
// Il avait raison, et le defaut etait plus large que le fil qu il tirait.
// QUATRE listes decrivent les memes forfaits dans le depot, et elles
// divergeaient :
//
//   1. `lib/plans.js`, PLAN_FEATURES : la matrice, qui decide vraiment ;
//   2. `app/components/LandingReveal.js` : la page d accueil publique ;
//   3. `app/signup/page.js` : les cartes de l inscription, plus son glossaire ;
//   4. `app/dashboard/abonnement/page.js` : l ecran ou un commercant deja
//      inscrit change de formule, que personne n avait jamais cite.
//
// CE QUI ETAIT FAUX, ET CE QUE CHAQUE MUTATION REMET :
//
// - `communiquer.fidelite` vaut `true` (lib/plans.js:179) et la route du
//   comptoir ne verifie que le forfait : la carte au comptoir est acquise des
//   19,90 €. Le signup la taisait et la carte Vendre se l attribuait. Un
//   commercant qui ne voulait que ca montait a 49,90 € POUR RIEN.
// - Ce que Vendre ajoute vraiment est `fidelite_auto` (lib/plans.js:239) : la
//   vente et le rendez-vous creditent sans geste. Personne ne le disait, donc
//   corriger le premier defaut aurait vide Vendre de son argument.
// - Le signup annoncait le Good Morning « chaque jour » en Exister, alors que
//   `ConfigDashboard.js:2989` plafonne a UNE actu par semaine calendaire
//   (decision d Alex du 01/07, anti-cannibalisation de Communiquer).
// - Quatre cles valent `true` dans la matrice et ne sont lues par AUCUNE ligne
//   de code : `newsletter_ciblee`, `segmentation_favoris`, `ia_bridee`,
//   `ia_avancee`. L ecran d abonnement les vendait comme des avantages.
//
// ⚠️ LA LANDING N A PAS SERVI DE REFERENCE, malgre la consigne. Elle s est
// revelee fausse sur deux points (des push « aux habitants de ta commune » que
// le code ne sait pas envoyer, et une accroche que le fichier s interdit
// lui-meme trois fois). Aucun ecran ne peut servir de reference a un autre :
// c est la MATRICE qui tranche.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-forfaits-annonces.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:plans'

const SIGNUP = 'app/signup/page.js'
const ABO = 'app/dashboard/abonnement/page.js'

const MUTATIONS = [
  // ─── LA FIDELITE, LE FIL QU ALEX A TIRE ─────────────────────────────────
  { nom: '🔴 LE DEFAUT D ORIGINE : Communiquer retait la carte au comptoir qu il paie',
    fichier: SIGNUP,
    de: "'Carte de fidélité au comptoir : le GSM de ton client suffit',",
    vers: "'Une audience qui te suit'," },

  { nom: '🔴 le meme silence sur l ecran ou un commercant deja inscrit change de formule',
    fichier: ABO,
    de: "'Carte de fidélité au comptoir : le GSM de ton client suffit',",
    vers: "'Une audience qui te suit'," },

  // ⚠️ ET CE QUE VENDRE AJOUTE. Sans cette ligne, corriger Communiquer viderait
  // Vendre de son argument au lieu de corriger le mensonge.
  { nom: '🔴 Vendre ne dit plus ce qu il ajoute : la fidelite automatique disparait',
    fichier: SIGNUP,
    de: "'La fidélité se crédite toute seule à chaque vente',",
    vers: "'Carte de fidélité, bons cadeaux, export comptable'," },

  { nom: '🔴 idem sur l ecran d abonnement : « Fidelite configurable » revient',
    fichier: ABO,
    de: "'La fidélité se crédite toute seule à chaque vente',",
    vers: "'Fidélité configurable'," },

  // 🔴 LE GLOSSAIRE EST SUR LA MEME PAGE QUE LES CARTES. Son badge disait
  // « Inclus avec Vendre » a dix centimetres d une carte qui dit l inverse.
  // ⚠️ L ANCRE PORTE LE TITRE AVEC LE BADGE, sur UNE seule ligne. Le glossaire
  // compte sept `plan: 'communiquer'` : une ancre posee sur le badge seul
  // viserait la premiere entree venue et ne prouverait rien.
  { nom: '🔴 le glossaire rebadge la fidelite sur Vendre, sous une carte qui dit Communiquer',
    fichier: SIGNUP,
    de: "titre: 'Carte de fidélité', plan: 'communiquer',",
    vers: "titre: 'Carte de fidélité', plan: 'vendre'," },

  // ─── LE GOOD MORNING EN EXISTER ─────────────────────────────────────────
  { nom: '🔴 le gratuit reannonce une place quotidienne, contre le plafond d une actu par semaine',
    fichier: SIGNUP,
    de: "'Une actu par semaine, publiée dans le Good Morning de ta commune',",
    vers: "'Tu apparais chaque jour dans Good Morning Yoppers'," },

  // ─── LES CLES MORTES ────────────────────────────────────────────────────
  //
  // ⚠️ ON LES REMET DANS UNE LISTE DE FORFAIT, pas n importe ou : le glossaire
  // du signup a le droit d annoncer la newsletter « En construction », et la
  // garde doit continuer de le permettre. C est ce qui l a fait rougir a tort
  // a sa premiere version.
  { nom: '🔴 l ecran d abonnement revend la newsletter ciblee, que rien n implemente',
    fichier: ABO,
    de: "'Alertes urgentes sur ta fiche : fermeture, rupture',",
    vers: "'Newsletter ciblée'," },

  { nom: '🔴 il revend la segmentation des favoris, qu aucune ligne ne lit',
    fichier: ABO,
    de: "'Tes statistiques détaillées : audience et engagement',",
    vers: "'Segmentation des favoris'," },

  { nom: '🔴 il revend l IA avancee, cle morte de la matrice',
    fichier: ABO,
    de: "'Export comptable',",
    vers: "'IA avancée (rédaction, segmentation, benchmarking)'," },

  // 🔴 ET LE COMPTEUR, PARCE QU UNE BOUCLE VIDE SE LIT « TOUT VA BIEN ». Les
  // gardes de cles mortes parcourent les listes reperees par leurs bornes : si
  // une borne disparait, elles ne mesurent plus rien et ne le disent pas.
  { nom: '🔴 PLAN_CONFIG est renomme : les gardes de cles mortes ne visent plus rien',
    fichier: SIGNUP,
    de: 'const PLAN_CONFIG = {',
    vers: 'const PLAN_CONFIG_CARTES = {' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
    const plante = !/clés distinctes/.test(sortie)
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
