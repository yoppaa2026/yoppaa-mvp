// HARNAIS DE MUTATION — CE QUE LA RECOMPENSE VAUT ET CE QU ELLE COUTE (16/09)
//
// 🔴 CE QU ON MESURE : que la refonte demandee par Alex TIENNE. Avant elle, le
// type et la valeur de la recompense se reglaient a cote de la mecanique, et
// rien ne les reliait :
//
//   • « 10 passages → 5 € » coutait 25 % a un cafe a 2 € le panier et 1,4 % a
//     un traiteur a 35 € ; le meme ecran, et personne ne savait ce qu il donnait ;
//   • une cagnotte affichee « 10,00 € » au client pouvait rendre 5 €.
//
// Desormais chaque mecanique garde SON unite. Chacune des mutations ci-dessous
// remet une de ces deux derives : si le banc reste vert, la refonte ne protege
// rien.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, verifie par npm run verif:ancres.
//
//   node scripts/mutations-fidelite-valeur.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:fid'
const MODULE = 'lib/fidelite.js'

const MUTATIONS = [
  // ─── LA CAGNOTTE NE REND PLUS LA CAGNOTTE ───────────────────────────────
  { nom: '🔴 la cagnotte rend un pourcentage : le client voit des euros et recoit autre chose',
    de: "    return { type: 'remise_montant', valeur: seuilCagnotte(config) }",
    vers: "    return { type: 'remise_pct', valeur: seuilCagnotte(config) }" },

  { nom: '🔴 la cagnotte rend la VALEUR LIBRE : 10 € affiches, 5 € rendus',
    de: "    return { type: 'remise_montant', valeur: seuilCagnotte(config) }",
    vers: "    return { type: 'remise_montant', valeur: pourcentPassages(config) }" },

  // ─── LE MONTANT FIXE REVIENT SUR LES PASSAGES ───────────────────────────
  { nom: '🔴 LE DEFAUT D ORIGINE : les passages rendent un montant fixe en euros',
    de: "  return { type: 'remise_pct', valeur: pourcentPassages(config) }",
    vers: "  return { type: 'remise_montant', valeur: pourcentPassages(config) }" },

  // ─── CE QUE CA COUTE ────────────────────────────────────────────────────
  { nom: '🔴 le cout des passages oublie l achat qui DEPENSE la remise',
    de: '  const part = pourcentPassages(config) / (seuilPassages(config) + 1)',
    vers: '  const part = pourcentPassages(config) / seuilPassages(config)' },

  { nom: '🔴 la cagnotte annonce son seuil au lieu de ce qu elle rend',
    de: '  if (estCagnotte(config)) return tauxCagnotte(config)',
    vers: '  if (estCagnotte(config)) return seuilCagnotte(config)' },

  { nom: '🔴 LE PIEGE DU ZERO : une cagnotte coupee a 0 % distribue quand meme 5 %',
    de: '  return Math.max(0, nombreRegle(config?.fidelite_taux_cagnotte, 5))',
    vers: '  return Math.max(0, Number(config?.fidelite_taux_cagnotte) || 5)' },

  // ─── LES BORNES ─────────────────────────────────────────────────────────
  { nom: '🔴 un seuil de cagnotte a zero : la boucle de deblocage n a plus de fin',
    de: '  return Math.max(SEUIL_CAGNOTTE_MIN, nombreRegle(config?.fidelite_seuil_cagnotte, 10))',
    vers: '  return nombreRegle(config?.fidelite_seuil_cagnotte, 10)' },

  { nom: '🔴 une remise de 300 % : la caisse se vide',
    de: '  return Math.min(POURCENT_MAX, Math.max(POURCENT_MIN, nombreRegle(config?.fidelite_recompense_valeur, 10)))',
    vers: '  return Math.max(POURCENT_MIN, nombreRegle(config?.fidelite_recompense_valeur, 10))' },

  // ─── LE LIBELLE, QUI EST CE QUE LE CLIENT LIT ───────────────────────────
  { nom: '🔴 le libelle relit le reglage libre et annonce l ancien montant',
    de: '  const due = recompenseDue(config)',
    vers: "  const due = { type: config?.fidelite_recompense_type || 'remise_montant', valeur: Number(config?.fidelite_recompense_valeur) || 5 }" },

  { nom: '🔴 un prereglage refige un libelle chiffre, faux des le premier changement de seuil',
    de: "    return { fidelite_mecanique: MECANIQUE_CAGNOTTE, fidelite_taux_cagnotte: 5, fidelite_seuil_cagnotte: 10, fidelite_recompense_libelle: '' }",
    vers: "    return { fidelite_mecanique: MECANIQUE_CAGNOTTE, fidelite_taux_cagnotte: 5, fidelite_seuil_cagnotte: 10, fidelite_recompense_libelle: '10€ offerts' }" },

  // ─── ET PERSONNE NE RECOPIE LA REGLE ────────────────────────────────────
  { nom: '🔴 le serveur refige les deux reglages libres dans la recompense gagnee',
    fichier: 'lib/fidelite-recompense-server.js',
    de: '  const { type, valeur } = recompenseDue(commercant)',
    vers: "  const type = String(commercant.fidelite_recompense_type || '').trim() || 'remise_montant'; const valeur = Number(commercant.fidelite_recompense_valeur) || 5" },

  { nom: '🔴 l ecran cesse de dire ce que le programme coute',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                {phraseCout(cfg)}',
    vers: '                {null}' },

  { nom: '🔴 la sauvegarde reprend la valeur du formulaire au lieu de la regle',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '      fidelite_recompense_valeur: due.valeur,',
    vers: '      fidelite_recompense_valeur: parseFloat(cfg.fidelite_recompense_valeur) || null,' },
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
