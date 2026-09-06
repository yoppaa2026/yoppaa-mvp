// HARNAIS DE MUTATION — LA LISTE D'ATTENTE DES RENDEZ-VOUS (06/09).
//
// 🔴 CE QU'ON MESURE : que les gardes du banc TIENNENT. Une liste d'attente qui
// ne previent personne est le pire des defauts de cette famille : le client a
// fait le geste, il attend pour de bon, et le silence lui donne raison de ne
// plus jamais recommencer. Aucune erreur, aucun journal, aucun ecran rouge.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, verifie par npm run verif:ancres.
//
//   node scripts/mutations-attente-rdv.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:attente'
const MODULE = 'lib/attente-rdv.js'
const SERVEUR = 'lib/attente-rdv-server.js'

const MUTATIONS = [
  // ─── LES DEUX FORMATS D'HEURE ───────────────────────────────────────────
  // Le defaut le plus silencieux du lot : la base rend « 09:30:00 », l'ecran
  // envoie « 09:30 », et plus personne n'est jamais prevenu.
  { nom: '🔴 deux heures absentes deviennent egales : prevenu pour toute la journee',
    de: '  return ha.length === 5 && ha === hb',
    vers: '  return ha === hb' },

  // ─── LES BORNES DE LA FENETRE ───────────────────────────────────────────
  { nom: '🔴 la borne haute est exclue : « jusqu au 20 » ne previent pas le 20',
    de: '    return d <= jour && jour <= f',
    vers: '    return d <= jour && jour < f' },

  { nom: '🔴 la borne basse est exclue : inscrit lundi, pas prevenu lundi',
    de: '    return d <= jour && jour <= f',
    vers: '    return d < jour && jour <= f' },

  // ─── LA PORTEE ──────────────────────────────────────────────────────────
  { nom: '🔴 tout devient une seance : le solo n a plus de point d entree',
    de: '  return Number.isFinite(cap) && cap > 1 ? PORTEE_SEANCE : PORTEE_FENETRE',
    vers: '  return Number.isFinite(cap) && cap >= 1 ? PORTEE_SEANCE : PORTEE_FENETRE' },

  // ─── LA CHAINE DES NOTIFICATIONS ────────────────────────────────────────
  { nom: '🔴 un push part APRES le debut du creneau, pour une place qui n existe plus',
    de: '    if (limite !== null && quand >= limite) break',
    vers: '    if (false) break' },

  { nom: '🔴 le premier n est plus prevenu tout de suite mais programme comme les autres',
    de: '      sendAfter: i === 0 ? null : new Date(quand).toISOString(),',
    vers: '      sendAfter: new Date(quand).toISOString(),' },

  { nom: '🔴 la fenetre de priorite disparait : tout le monde recoit en meme temps',
    de: '    const quand = depart + i * pas',
    vers: '    const quand = depart' },

  // ─── CE QUI SORT DE LA FILE ─────────────────────────────────────────────
  { nom: '🔴 une seance du jour meme est declaree passee',
    de: "  if (ligne.portee === PORTEE_SEANCE) return String(ligne.date_rdv || '') >= jour",
    vers: "  if (ligne.portee === PORTEE_SEANCE) return String(ligne.date_rdv || '') > jour" },

  { nom: '🔴 une fenetre qui finit aujourd hui est declaree expiree',
    de: "  if (ligne.portee === PORTEE_FENETRE) return String(ligne.date_fin || '') >= jour",
    vers: "  if (ligne.portee === PORTEE_FENETRE) return String(ligne.date_fin || '') > jour" },

  // ─── LE PLAFOND ─────────────────────────────────────────────────────────
  { nom: '🔴 une personne de trop entre dans la file',
    de: "  if (deja >= plafondDe(prestation)) return { ok: false, raison: 'complete' }",
    vers: "  if (deja > plafondDe(prestation)) return { ok: false, raison: 'complete' }" },

  { nom: '🔴 les lignes expirees bloquent la file pour toujours',
    de: '  return (lignes || []).filter(l => attenteVivante(l, jourISO) && memeCible(l, cible)).length',
    vers: '  return (lignes || []).filter(l => memeCible(l, cible)).length' },

  { nom: '🔴 en solo le plafond se compte par plage : la file ne se ferme jamais',
    de: '  if (a.portee === PORTEE_FENETRE) return true',
    vers: "  if (a.portee === PORTEE_FENETRE) return String(a.date_debut || '') === String(b.date_debut || '')" },

  { nom: '🔴 le cours du lundi et celui du mardi comptent dans la meme file',
    de: "    return String(a.date_rdv || '') === String(b.date_rdv || '')",
    vers: "    return true || String(a.date_rdv || '') === String(b.date_rdv || '')" },

  { nom: '🔴 on ne reconnait plus qui attend deja : double inscription',
    de: "    l.statut !== STATUT_SERVI && String(l.client_id) === String(clientId) && memeCible(l, cible))",
    vers: '    l.statut !== STATUT_SERVI && memeCible(l, cible))' },

  // ─── L'INSCRIPTION ──────────────────────────────────────────────────────
  { nom: '🔴 on peut attendre une seance deja passee : la ligne dort pour rien',
    de: "    if (JOUR_ISO.test(String(jourISO || '')) && d < jourISO) return null",
    vers: '    if (false) return null' },

  { nom: '🔴 le piege du zero revient : une duree absente ouvre une fenetre d un jour',
    de: "  if (jours === null || jours === undefined || jours === '') return null",
    vers: '  if (false) return null' },

  { nom: '🔴 l heure est ecrite au format long : le declencheur ne la retrouvera pas',
    de: "    return { ...base, date_rdv: d, heure_debut: h, date_debut: null, date_fin: null }",
    vers: '    return { ...base, date_rdv: d, heure_debut: heureDebut, date_debut: null, date_fin: null }' },

  // ─── LES BRANCHEMENTS ───────────────────────────────────────────────────
  { nom: '🔴 l annulation ne charge plus prestation_id : la file est introuvable',
    fichier: 'app/api/rdv/cancel/route.js',
    de: '      commercant_id, prestation_id, rappel_push_id, commande_id, fidelite_recompense_id,',
    vers: '      commercant_id, rappel_push_id, commande_id, fidelite_recompense_id,' },

  { nom: '🔴 l annulation du client ne previent plus personne',
    fichier: 'app/api/rdv/cancel/route.js',
    de: '    const fileRes = await prevenirLaFile(supabase, {',
    vers: '    const fileRes = await Object.assign({ ok: true, prevenus: 0, file: 0 }, {' },

  // 🔴 LA DECISION D'ALEX, DANS L'AUTRE SENS. Le commercant annule souvent
  // parce qu il n est pas la : un declenchement automatique enverrait quelqu un
  // vers un creneau qu il n honorera pas.
  { nom: '🔴 l annulation du commercant se met a prevenir toute seule',
    fichier: 'app/api/rdv/annuler-commercant/route.js',
    de: "      console.error('[rdv/annuler-commercant] UPDATE KO', errUpd)",
    vers: "      console.error('[rdv/annuler-commercant] UPDATE KO', errUpd, 'prevenirLaFile(')" },

  { nom: '🔴 une reservation ne ferme plus la place : des pushs partent dans le vide',
    fichier: 'lib/rdv-creation-server.js',
    de: '  const suite = await placePrise(db, {',
    vers: '  const suite = await Object.assign({ ok: true }, {' },

  { nom: '🔴 la suppression de compte laisse l attente derriere elle',
    fichier: 'app/api/yopper/supprimer-compte/route.js',
    de: "      await admin.from('rdv_attente').delete().in('client_id', ids)",
    vers: "      await admin.from('favoris').delete().in('client_id', ids)" },

  { nom: '🔴 l ecran repasse a un fetch nu : plus personne n est reconnu',
    fichier: 'app/commander/rdv/[slug]/BlocAttente.js',
    de: "      const r = await fetchAvecPreuveSiConnecte('/api/rdv/attente')",
    vers: "      const r = await fetch('/api/rdv/attente')" },

  { nom: '🔴 la liste de colonnes perd client_id : plus personne a qui pousser',
    fichier: SERVEUR,
    de: '  id, commercant_id, prestation_id, client_id, portee,',
    vers: '  id, commercant_id, prestation_id, portee,' },

  // 🔴 LA FAILLE. Sans ce filtre, un identifiant de ligne suffit a sortir
  // n importe qui de n importe quelle file : la table n a AUCUNE policy pour
  // rattraper le coup.
  { nom: '🔴 on peut sortir quelqu un d autre de sa file d attente',
    fichier: SERVEUR,
    de: "  const { error } = await supabase.from('rdv_attente').delete().eq('id', id).in('client_id', ids)",
    vers: "  const { error } = await supabase.from('rdv_attente').delete().eq('id', id)" },

  { nom: '🔴 le push promet une place gardee que le code ne tient pas',
    fichier: SERVEUR,
    de: 'Tu es prévenu avant les autres.',
    vers: 'Ta place est gardée 15 minutes.' },

  { nom: '🔴 la route accepte la portee envoyee par le navigateur',
    fichier: 'app/api/rdv/attente/route.js',
    de: '      duree: corps?.duree,',
    vers: '      duree: corps?.duree, portee: corps?.portee,' },
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
