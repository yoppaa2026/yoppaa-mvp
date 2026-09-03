// HARNAIS DE MUTATION — LA CONFIRMATION DE COMMANDE DE L'INVITÉ (03/09).
//
// 🔴 CE QU'ON MESURE : qu'un acheteur SANS COMPTE voie l'écran de confirmation
// après avoir payé, et qu'on lui dise où sa commande l'attend.
//
// Le défaut ne produisait aucune erreur. Il remplissait ses coordonnées, il
// payait, et Stripe le ramenait sur la fiche du commerce, panier vidé par le
// rechargement. Pas de numéro, pas de « c'est bon », pas de bouton
// d'annulation. La relecture partait par `fetchYopper`, qui REFUSE de partir
// sans session Supabase, et tout l'écran vivait dans un `if (data)`.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON : aucune ne casse
//    la syntaxe, sinon le banc exploserait au lieu de rougir, et un banc qui
//    explose ne mesure rien.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES : le dépôt est en CRLF, un `\n` nu ne
//    correspondrait jamais et la mutation serait « introuvable » en silence.
// ⚠️ `tous: true` QUAND LA CIBLE EXISTE EN PLUSIEURS EXEMPLAIRES. Une garde qui
//    cherche un motif N'IMPORTE OÙ reste verte si l'on n'en mute qu'une copie :
//    la mutation serait comptée manquée alors que la garde est bonne.
//
//   node scripts/mutations-tunnel-commande.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:yopper'

const TUNNEL = 'app/commander/[slug]/page.js'
const ROUTE = 'app/api/yopper/commandes/route.js'
const NOTIFS = 'lib/commande-notifs.js'
const PRETE = 'app/api/emails/commande-prete/route.js'
const RESEND = 'lib/resend.js'
const CREATE = 'app/api/stripe/checkout/create-commande/route.js'
const AUTH = 'lib/yopper-auth.js'
const NORMALISE = 'lib/email-normalise.js'

const MUTATIONS = [
  // ─── LE CŒUR : L'APPEL QUI REFUSAIT DE PARTIR ───────────────────────────
  { nom: '🔴 la relecture repasse par l’appel qui renonce sans jeton',
    fichier: TUNNEL,
    de: "await fetchAvecPreuveSiConnecte('/api/yopper/commandes'",
    vers: "await fetchYopper('/api/yopper/commandes'" },

  { nom: '🔴 la confirmation redevient suspendue à la relecture',
    fichier: TUNNEL,
    de: '        allerEtape(4)',
    vers: '        if (data) allerEtape(4)' },

  { nom: '🔴 sans relecture, l’identifiant disparaît (plus d’annulation)',
    fichier: TUNNEL,
    de: '          : { id: commandeId })',
    vers: '          : null)' },

  // ─── LES TROIS ÉTATS DU COMPTE ──────────────────────────────────────────
  { nom: '🔴 tout le monde redevient « connecté »',
    fichier: TUNNEL,
    de: '      setEstConnecte(!!user)',
    vers: '      setEstConnecte(true)' },

  { nom: '🔴 l’encadré de l’invité retrouve sa condition MORTE',
    fichier: TUNNEL,
    de: '              {!estConnecte && (',
    vers: '              {!(client.email && clientId) && (' },

  { nom: '🔴 le nudge « mot de passe » repart vers les invités aussi',
    fichier: TUNNEL,
    de: '              {estConnecte && !aMotDePasse && (',
    vers: '              {!aMotDePasse && (' },

  { nom: '🔴 l’invité est renvoyé créer un DEUXIÈME compte à côté du sien',
    fichier: TUNNEL,
    de: 'router.push(`/commander/auth/definir-mdp$',
    vers: 'router.push(`/commander/auth$' },

  // ─── CE QUE L'ENCADRÉ PROMET ────────────────────────────────────────────
  { nom: '🔴 l’email de confirmation perd le lien promis à l’écran',
    fichier: RESEND,
    de: '${offrir_mdp ? `',
    vers: '${false ? `' },

  { nom: '🔴 le lien de l’email perd l’adresse à cibler',
    fichier: NOTIFS,
    de: 'offrir_mdp_email:        cmd.client_email,',
    vers: 'offrir_mdp_email:        null,' },

  // ⚠️ LE DEUXIÈME COMPOSEUR QUI REVIENT. Une route orpheline composait le même
  // email et avait déjà divergé : ni TVA, ni remise de fidélité, ni adresse de
  // livraison. On la fait renaître ailleurs pour vérifier qu'on la voit.
  { nom: '🔴 un DEUXIÈME endroit se met à composer l’email de confirmation',
    fichier: PRETE,
    de: 'const html = emailCommandePrete({',
    vers: 'const html = emailCommandeConfirmee({' },

  // ─── « TU RETROUVES CETTE COMMANDE » ────────────────────────────────────
  { nom: '🔴 la commande enregistre l’adresse telle que tapée',
    fichier: CREATE,
    de: 'client_email: normaliserEmail(client_email),',
    vers: 'client_email: client_email,' },

  { nom: '🔴 la liste ne retrouve plus les commandes par l’adresse',
    fichier: ROUTE,
    de: ".eq('client_email', yopper.email)",
    vers: ".eq('client_email', yopper.client_id)" },

  { nom: '🔴 l’identité cesse de relire l’adresse en minuscules',
    fichier: AUTH,
    de: 'user.email.toLowerCase()',
    vers: 'user.email',
    tous: true },

  { nom: '🔴 la normalisation d’adresse ne met plus en minuscules',
    fichier: NORMALISE,
    de: ".trim().toLowerCase()",
    vers: '.trim()' },

  // ─── LA PORTE OUVERTE CÔTÉ SERVEUR ──────────────────────────────────────
  //
  // ⚠️ On ne DÉPLACE pas la branche derrière la garde : ce serait un
  // remaniement, pas une mutation. On la rend inatteignable, ce qui produit
  // exactement le même effet pour l'invité.
  { nom: '🔴 la relecture par UUID devient inatteignable',
    fichier: ROUTE,
    de: "if (action === 'get-one') {",
    vers: "if (action === 'get-one-desactive') {" },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
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
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  const mute = m.tous ? original.split(m.de).join(m.vers) : original.replace(m.de, m.vers)
  writeFileSync(f, mute, 'utf8')
  const res = lancer()
  writeFileSync(f, original, 'utf8')

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
