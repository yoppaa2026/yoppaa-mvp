// HARNAIS DE MUTATION — CE QU'UN CRENEAU ACCEPTE (07/09).
//
// 🔴 CE QU'ON MESURE : qu'un cours collectif cesse d etre propose a toutes les
// heures de tous les jours. Le defaut d origine ne levait rien, ne se voyait
// nulle part, et se decouvrait le jour ou une personne seule reservait un cours
// de yoga un mardi a 13h. C est Alex qui l a trouve, pas un banc.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, verifie par npm run verif:ancres.
//
//   node scripts/mutations-creneau-prestations.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:slots'
const MODULE = 'lib/rdv-slots.js'

const MUTATIONS = [
  // 🔴 UN COURS N A PAS D HORAIRE HORS DE SA PLAGE (Alex, 08/09).
  //
  // ⚠️ CETTE MUTATION VISAIT AVANT `return !liaisons.some(...)`, la ligne qui
  // retirait AUSSI les prestations solo des plages libres. Elle cassait le
  // metier du coiffeur et a ete supprimee ; c est `verif:ancres` qui a dit que
  // l ancre ne mesurait plus rien. La seule restriction qui reste, et qu il
  // faut donc mesurer, est celle des cours.
  { nom: '🔴 une plage libre reaccepte un COURS rattache ailleurs',
    de: '  if (estCours) return false',
    vers: '  if (false) return false' },

  // 🔴 ET DANS L AUTRE SENS : la confiscation qu Alex a fait tomber le 08/09.
  // Une plage libre qui refuse un SOLO coche ailleurs, c est le soin du visage
  // qui disparait de tout l agenda de l esthéticienne.
  { nom: '🔴 une plage libre reconfisque une prestation SOLO',
    de: '  if (estCours) return false',
    vers: '  if (true) return false' },

  // 🔴 UNE PLAGE ETEINTE NE PORTE PLUS RIEN (Alex, 08/09). Sans ce filtre, le
  // tableau de bord ne prevenait PAS que le cours etait sorti de la vente,
  // pendant que la fiche publique affichait « Dates a venir ».
  { nom: '🔴 les plages eteintes redeviennent porteuses',
    de: '    ? new Set(creneaux.filter(c => c && c.actif !== false && !c.deleted_at).map(c => String(c.id)))',
    vers: '    ? new Set(creneaux.map(c => String(c.id)))' },

  // 🔴 ET LE FRERE SERVEUR : l ecran calcule, le serveur decide, et les deux
  // doivent lire les memes plages.
  { nom: '🔴 le serveur relit les liaisons des plages mortes',
    fichier: 'lib/rdv-creation-server.js',
    de: '    const idsCreneaux = (creneauxCom || []).filter(c => c.actif !== false).map(c => c.id)',
    vers: '    const idsCreneaux = (creneauxCom || []).map(c => c.id)' },

  // 🔴 FERMER SUR UNE IGNORANCE VIDERAIT TOUS LES AGENDAS, sans une erreur.
  { nom: '🔴 des liaisons non chargees FERMENT au lieu d ouvrir',
    de: '  if (!Array.isArray(liaisons)) return true\n  if (!creneauId) return false',
    vers: '  if (!Array.isArray(liaisons)) return false\n  if (!creneauId) return false' },

  { nom: '🔴 un creneau restreint accepte n importe quelle prestation',
    de: '    return duCreneau.some(l => String(l.prestation_id) === String(prestationId))',
    vers: '    return true' },

  // 🔴 SANS LE CONTROLE DE L HEURE, LA GARDE SERVEUR EST DECORATIVE : un
  // creneau du lundi accepte bien le yoga... a 10h, pas a 13h.
  { nom: '🔴 la garde serveur cesse de regarder l heure',
    de: '    if (d < cd || f > cf) return false',
    vers: '    if (false) return false' },

  { nom: '🔴 la garde serveur ignore la pause',
    de: '    if (pd !== null && pf !== null && d < pf && f > pd) return false',
    vers: '    if (false) return false' },

  // ⚠️ LES DEUX SORTIES QUI PROTEGENT L EXISTANT. Les casser refuserait des
  // rendez-vous que le parc entier accepte aujourd hui.
  { nom: '⚠️ un commerce sans aucune liaison se met a etre juge',
    de: '  if (!Array.isArray(liaisons) || liaisons.length === 0) return true',
    vers: '  if (false) return true' },

  { nom: '⚠️ un jour sans aucune plage se met a etre juge',
    de: '  const duJour = creneauxDuJour(creneaux, { dateStr, jour })\n  if (duJour.length === 0) return true',
    vers: '  const duJour = creneauxDuJour(creneaux, { dateStr, jour })\n  if (duJour.length === 0) return false' },

  // 🔴 LE MOTEUR CESSE DE FILTRER : on revient au 06/09 exactement.
  { nom: '🔴 le moteur ne filtre plus les creneaux par prestation',
    de: '  const creneauxRetenus = creneauxPourPrestation(creneauxJour, prestationId, liaisonsCreneaux, { estCours })',
    vers: '  const creneauxRetenus = creneauxJour' },

  { nom: '🔴 l ecran cache des plages alors qu aucune prestation n est choisie',
    de: '  if (!Array.isArray(liaisons) || !prestationId) return creneaux || []',
    vers: '  if (!Array.isArray(liaisons)) return creneaux || []' },


  // 🔴 UN SEUL COURS PAR PLAGE (Alex, 07/09).
  { nom: '🔴 deux cours redeviennent possibles sur la meme plage',
    de: '    if (p && Number(p.capacite) > 1) return p',
    vers: '    if (false) return p' },

  // 🔴 LA PLAGE HORS HORAIRES, DEFAUT SILENCIEUX TROUVE PAR ALEX LE 07/09.
  { nom: '🔴 une plage entierement hors horaires ne se signale plus',
    de: "    return { raison: 'hors_ouverture', plages: lisible }",
    vers: '    return null' },

  { nom: '🔴 une plage a cheval sur la fermeture ne se signale plus',
    de: "    return { raison: 'deborde', plages: lisible }",
    vers: '    return null' },

  { nom: '⚠️ le second service du jour est oublie',
    de: "  if (h.debut2 && h.fin2) plages.push([timeToMinutes(h.debut2), timeToMinutes(h.fin2)])",
    vers: '  void 0' },

  // 🔴 L HORIZON DE L AGENDA (Alex, 07/09).
  { nom: '🔴 le piege du zero ferme l agenda au lieu de le laisser a 60 jours',
    de: '  if (n < HORIZON_RDV_MIN || n > HORIZON_RDV_MAX) return HORIZON_RDV_DEFAUT',
    vers: '  if (false) return HORIZON_RDV_DEFAUT' },

  { nom: '🔴 un commercant absent n a plus d horizon du tout',
    de: '  if (!Number.isFinite(n)) return HORIZON_RDV_DEFAUT',
    vers: '  if (false) return HORIZON_RDV_DEFAUT' },

  { nom: '⚠️ le defaut du parc cesse d etre 60 jours',
    de: 'export const HORIZON_RDV_DEFAUT = 60',
    vers: 'export const HORIZON_RDV_DEFAUT = 90' },

  // 🔴 LA DEMI-CORRECTION, TROUVEE PAR ALEX EN TESTANT. Empecher le cours
  // d aller ailleurs sans reserver son heure ne corrigeait RIEN : le premier
  // client a prendre un soin a 10h fermait le cours pour tout le monde.
  { nom: '🔴 l heure du cours redevient ouverte aux autres prestations',
    de: '      if (tombeDansUneTrancheReservee(t, slotEnd, reservees)) continue',
    vers: '      if (false) continue' },

  { nom: '🔴 une plage dediee cesse de reserver son heure',
    de: '    out.push([timeToMinutes(c.heure_debut), timeToMinutes(c.heure_fin)])',
    vers: '    void 0' },

  { nom: '🔴 une plage qui m accepte se met a se reserver contre moi',
    de: '    if (prestationId && duCreneau.some(l => String(l.prestation_id) === String(prestationId))) continue',
    vers: '    if (false) continue' },

  { nom: '⚠️ une plage libre se met a reserver son heure',
    de: '    if (duCreneau.length === 0) continue',
    vers: '    if (false) continue' },

  // 🔴 LE CHIFFRE FAUX DANS L ALERTE, TROUVE PAR ALEX EN TESTANT (07/09).
  { nom: '🔴 l alerte relit la grille perimee au lieu des emplacements',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '      horairesDetail: horairesReference,',
    vers: '      horairesDetail: commercant?.horaires_detail,' },

  { nom: '🔴 les jours fermes se relisent sur la grille perimee',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '  const joursFermesProfil = JOURS_SEMAINE.filter(j => horairesReference?.[j]?.ouvert === false)',
    vers: '  const joursFermesProfil = JOURS_SEMAINE.filter(j => commercant?.horaires_detail?.[j]?.ouvert === false)' },

  // 🔴 L AVERTISSEMENT QUI NOMME LE MAUVAIS COUPABLE (Alex, 07/09).
  { nom: '🔴 l avertissement renomme les cours qui ont deja leur plage',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                    Number(p.capacite) > 1 && prestationSansCreneauDedie(p.id, liaisons, creneaux))',
    vers: '                    Number(p.capacite) > 1)' },

  // 🔴 L ONGLET QUI SURVIT AU RECHARGEMENT (Alex, 07/09).
  { nom: '🔴 l onglet cesse d etre ecrit dans l adresse',
    fichier: 'app/dashboard/page.js',
    de: "    url.searchParams.set('onglet', ongletPrincipal)",
    vers: '    void 0' },

  { nom: '🔴 aucun onglet n entre plus dans l historique',
    fichier: 'app/dashboard/page.js',
    de: "    const methode = premiereEcriture.current ? 'replaceState' : 'pushState'",
    vers: "    const methode = 'replaceState'" },

  { nom: '🔴 un retour en arriere empile une entree en avant',
    fichier: 'app/dashboard/page.js',
    de: '    if (viensDeLHistorique.current) { viensDeLHistorique.current = false; return }',
    vers: '    if (false) { viensDeLHistorique.current = false; return }' },

  { nom: '⚠️ un onglet inconnu de l adresse est accepte',
    fichier: 'app/dashboard/page.js',
    de: "      setOngletPrincipal(o && ONGLETS_VALIDES.includes(o) ? o : 'commandes')",
    vers: "      setOngletPrincipal(o || 'commandes')" },

  { nom: '⚠️ on ecrit l adresse avant de l avoir lue',
    fichier: 'app/dashboard/page.js',
    de: '    if (!pretUrl) return',
    vers: '    if (false) return' },

  // 🔴 LA COPIE QUI DEBORDAIT (Alex, 07/09), DES DEUX COTES.
  { nom: '🔴 une plage trop longue n est plus raccourcie',
    de: "    statut: (morceaux.length === 1 && debut === d && fin === f) ? 'inchangee' : 'raccourcie',",
    vers: "    statut: 'inchangee'," },

  { nom: '🔴 une plage hors ouverture est copiee quand meme',
    de: "      statut: 'ignoree',\n      raison: 'hors_ouverture',",
    vers: "      statut: 'inchangee',\n      raison: 'hors_ouverture'," },

  { nom: '⚠️ le second service est oublie a la copie',
    de: '  if (horaireJour.debut2 && horaireJour.fin2) plages.push([timeToMinutes(horaireJour.debut2), timeToMinutes(horaireJour.fin2)])',
    vers: '  void 0' },

  { nom: '🔴 la copie des creneaux de commande cesse d ajuster',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '        const ajuste = ajusterPlagePourJour(c, horaires?.[cible])',
    vers: "        const ajuste = { statut: 'inchangee', debut: String(c.heure_debut).slice(0,5), fin: String(c.heure_fin).slice(0,5) }" },

  // 🔴 LE MOTIF DU REFUS (Alex, 07/09 : « je ne suis pas ferme le mercredi »).
  { nom: '🔴 un jour ouvert qui ferme tot redevient un jour ferme',
    de: "      raison: 'hors_ouverture',",
    vers: "      raison: 'jour_ferme'," },

  { nom: '⚠️ le message cesse de citer les heures reelles',
    de: '      heures: plages.map(([a, b]) => `${minutesToTime(a)}–${minutesToTime(b)}`),',
    vers: '      heures: [],' },

  { nom: '🔴 l emplacement qui ne colle pas ne pose plus de question',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: "          premier: 'Copier sur l’emplacement du jour',",
    vers: "          premier: 'Copier'," },

  { nom: '🔴 une question se pose meme quand la salle existe ce jour-la',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '          if (memeLieuCeJour(c.lieu_id, duJour)) continue',
    vers: '          if (false) continue' },

  { nom: '🔴 les details redeviennent un pave illisible',
    fichier: 'app/dashboard/ModaleConfirmation.js',
    de: '                {Array.isArray(details)',
    vers: '                {false && Array.isArray(details)' },
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
