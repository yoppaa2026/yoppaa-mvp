// Harnais de mutation de la RESERVATION DE TABLE.
//
// Le banc est parti vert du premier coup, ce qui ne prouve rien : une garde
// qui n a jamais rougi ne garde rien. Chaque mutation ci-dessous remet un
// defaut plausible, et le banc doit le voir.
//
// ⚠️ Aucune ancre ne contient de saut de ligne. Restauration par CONTENU.
import { ecrireSur } from './harnais-mutation.mjs'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:table'
const MODULE = 'lib/reservation-metier.js'

const MUTATIONS = [
  // 🔴 LE METIER DECIDE DE LA FONCTION. L inverser donnerait `rdv` au
  // restaurant, une fonction que la matrice reserve a la vitrine : il perdrait
  // sa reservation sans qu aucune erreur ne le dise.
  { nom: '🔴 le restaurant repasse sur la fonction rdv',
    de: "  return isAlimentaire(commercant) ? 'reservation_table' : 'rdv'",
    vers: "  return 'rdv'" },

  { nom: '🔴 le salon bascule sur la reservation de table',
    de: "  return isAlimentaire(commercant) ? 'reservation_table' : 'rdv'",
    vers: "  return 'reservation_table'" },

  // 🔴 LES DEUX CONDITIONS. Le droit sans l interrupteur affiche une
  // reservation chez quelqu un qui n a jamais ouvert une plage.
  { nom: '🔴 l interrupteur cesse de compter',
    de: "  return commercant?.rdv_actif === true && peutReserver(commercant, maintenant)",
    vers: '  return peutReserver(commercant, maintenant)' },

  // 🔴 ET LE DROIT AUSSI : sans lui, la reservation reste allumee apres un
  // changement de forfait et le client reserve dans le vide.
  { nom: '🔴 le forfait cesse de compter',
    de: "  return commercant?.rdv_actif === true && peutReserver(commercant, maintenant)",
    vers: '  return commercant?.rdv_actif === true' },

  // ⚠️ UNE CLE INCONNUE NE DOIT PAS S AFFICHER : un `undefined` se rend tel
  // quel dans du JSX, et se lit a l ecran du client.
  { nom: '⚠️ une cle de libelle inconnue rend undefined',
    de: "  return Object.prototype.hasOwnProperty.call(mots, cle) ? mots[cle] : ''",
    vers: '  return mots[cle]' },

  // 🔴 UN RESTAURANT N A PAS DEUX FICHES. Le renvoyer sur la fiche agenda lui
  // ferait perdre sa carte a emporter, qui est son autre metier.
  { nom: '🔴 la fiche du restaurant devient son agenda',
    de: "  return isAlimentaire(commercant) || commercant.categorie === 'detail'",
    vers: '  return false' },

  // 🔴 LA PASTILLE : elle s ajoute, elle ne remplace pas.
  { nom: '🔴 la pastille de table s affiche sans l interrupteur',
    fichier: 'lib/plans.js',
    de: "    if (canDoAvecCategorie(plan, 'reservation_table', categorie) && commercant?.rdv_actif === true) {",
    vers: "    if (canDoAvecCategorie(plan, 'reservation_table', categorie)) {" },

  { nom: '🔴 la pastille de table disparait',
    fichier: 'lib/plans.js',
    de: "      pills.push({ key: 'table', label: 'Réserver une table' })",
    vers: '      void 0' },

  // 🔴 LE CABLAGE : la page de reservation redevient reservee aux vitrines.
  { nom: '🔴 la page de reservation referme la porte au restaurant',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: '      if (!isVitrine(c) && !reservationActive(c)) {',
    vers: '      if (!isVitrine(c)) {' },

  { nom: '🔴 la fiche du restaurant perd son bouton',
    fichier: 'app/commander/[slug]/page.js',
    de: '  const peutPrendreRdv = reservationActive(commercant)',
    vers: "  const peutPrendreRdv = isVitrine(commercant) && commercant?.rdv_actif === true" },

  { nom: '🔴 l onglet du tableau de bord se referme',
    fichier: 'app/dashboard/page.js',
    de: 'visible: !!commercant?.rdv_actif || peutReserver(commercant) }',
    vers: 'visible: !!commercant?.rdv_actif }' },

  { nom: '🔴 l interrupteur se referme sur la vitrine',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '        {peutReserver(form) && (',
    vers: "        {form.categorie === 'vitrine' && peut(form, 'rdv') && (" },
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
  console.log(`🔴 ${BANC} EST DEJA ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Banc vert au depart.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier || MODULE)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ! ${m.nom} — texte introuvable`)
    continue
  }
  ecrireSur(f, original.split(m.de).join(m.vers))
  const r = lancer()
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log('RESTAURATION RATEE, on arrete tout.')
    process.exit(2)
  }
  // ⚠️ Une mutation change le RESULTAT, jamais la TERMINAISON.
  if (r.rouge && !r.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else {
    manquees.push(m.nom + (r.plante ? ' (le banc a PLANTÉ, il n a rien mesuré)' : ''))
    console.log(`  ✕ NON attrapée : ${m.nom}${r.plante ? ' (PLANTAGE)' : ''}`)
  }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
const fin = lancer()
if (fin.rouge) { console.log(`🔴 ${BANC} ROUGE APRES RESTAURATION.`); process.exit(2) }
console.log('Banc vert après restauration. Dépôt intact.')
if (manquees.length) { console.log('\nMANQUÉES :'); manquees.forEach(m => console.log('  - ' + m)); process.exit(1) }
