// HARNAIS DE MUTATION — « MON COMPTE » (20/09)
//
// 🔴 CE QU ON MESURE. La page `/dashboard/abonnement` existait, complete, et
// n etait RELIEE A RIEN : ni onglet, ni menu. On n y arrivait que par le
// bandeau d essai, par une fonction verrouillee, ou par un email de relance
// qu il faut avoir recu. « Ou je vois mon abonnement » est la question des
// premiers jours, et elle n avait aucune reponse (Alex, 10/09).
//
// Chacune des mutations ci-dessous remet une des formes fausses possibles. Si
// le banc reste vert sur l une d elles, ce lot ne protege pas ce qu il pretend.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-mon-compte.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:bord'
const MODULE = 'app/dashboard/ConfigDashboard.js'

const MUTATIONS = [
  // ─── LA PORTE ───────────────────────────────────────────────────────────
  { nom: '🔴 LE DEFAUT D ORIGINE : l onglet disparait, la page redevient inatteignable',
    de: "    { id: 'compte', label: 'Mon compte', icon: 'user' },",
    vers: '' },

  { nom: '⚠️ le libelle change : il ne reconnait plus l onglet qu il cherche',
    de: "    { id: 'compte', label: 'Mon compte', icon: 'user' },",
    vers: "    { id: 'compte', label: 'Facturation', icon: 'user' }," },

  // 🔴 LUI POSER UN FORFAIT LE FERMERAIT A CEUX QUI EN ONT LE PLUS BESOIN :
  // celui qui est en Exister ne pourrait plus lire qu il ne paie rien, et celui
  // dont l essai se termine ne verrait pas sa date.
  { nom: '🔴 un cadenas de forfait se pose sur le compte du commercant',
    de: "    { id: 'compte', label: 'Mon compte', icon: 'user' },",
    vers: "    { id: 'compte', label: 'Mon compte', icon: 'user', feature: 'export_comptable' }," },

  { nom: '🔴 l onglet existe mais n affiche plus rien',
    de: "      {tab === 'compte' && <TabMonCompte commercant={commercant} toast={showToast} />}",
    vers: '' },

  { nom: '🔴 le contenu se cache derriere le forfait, en plus de la barre',
    de: "      {tab === 'compte' && <TabMonCompte commercant={commercant} toast={showToast} />}",
    vers: "      {tab === 'compte' && peut(commercant, 'export_comptable') && <TabMonCompte commercant={commercant} toast={showToast} />}" },

  // ─── CE QUE L ECRAN DIT ─────────────────────────────────────────────────
  // 🔴 LA LECON DE L OFFRE DE LANCEMENT : un texte qui devine sa date finit par
  // contredire la facture. La date affichee doit etre le miroir de Stripe.
  { nom: '🔴 la date de fin d essai se calcule en local au lieu de venir de Stripe',
    de: "  const finEssai = dateLongue(commercant?.subscription_trial_end)",
    vers: "  const finEssai = dateLongue(commercant?.essai_demande_le)" },

  { nom: '⚠️ le montant TVA comprise disparait : il ne voit plus ce qui sera debite',
    de: "              prix?.mensuel ? `${euros(prix.mensuel)} HTVA par mois, soit ${euros(ttc)} TVA comprise` : 'Gratuit à vie'",
    vers: "              prix?.mensuel ? `${euros(prix.mensuel)} HTVA par mois` : 'Gratuit à vie'" },

  { nom: '🔴 le rappel du moyen de paiement ne se declenche plus jamais',
    de: "  const rappelCarte = enEssai && joursAvantFin !== null && joursAvantFin <= 30",
    vers: "  const rappelCarte = false" },

  // ⚠️ UN RAPPEL QUI ARRIVE LA VEILLE NE SERT A RIEN : il faut le temps de
  // sortir sa carte, et souvent d en parler a son comptable.
  { nom: '⚠️ le rappel n arrive plus qu a la veille de la fin d essai',
    de: "  const rappelCarte = enEssai && joursAvantFin !== null && joursAvantFin <= 30",
    vers: "  const rappelCarte = enEssai && joursAvantFin !== null && joursAvantFin <= 1" },

  // 🔴 LE 200 QUI DIT NON. `postPro` rend la `Response` et ne leve pas sur un
  // code HTTP : lire le code sans lire le corps annonce une reussite sur un
  // refus, et le commercant attend un portail qui ne s ouvrira jamais.
  { nom: '🔴 le portail ne lit plus le corps de la reponse, seulement le code',
    de: "    if (!res.ok || !corps?.url) {",
    vers: "    if (!res.ok) {" },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTE ». Un banc qui explose au lieu de
    // rougir n est pas une mesure, c est un accident.
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
