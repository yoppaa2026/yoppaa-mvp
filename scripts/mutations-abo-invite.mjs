// HARNAIS DE MUTATION — L'ABONNEMENT PAYÉ SANS COMPTE (Abo-I7, 04/10)
//
// 🔴 CE QU'ON MESURE : un invité payait un abonnement qu'il ne pouvait pas
// utiliser. La fiche relisait quinze fois un refus, puis annonçait « tu le
// retrouveras dans Commandes et rendez-vous » ; « Réserver » menait à une
// séance au prix normal ; l'email ne disait pas de se connecter avec CETTE
// adresse ; et le bouton « Payer » annonçait le prix plein d'une période
// entamée. Chaque mutation remet une de ces formes et nomme la garde qui doit
// rougir. Deux frères de la connexion y sont aussi : `redirect` et `next`
// suivaient n'importe quelle adresse.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUNE ANCRE À CHEVAL SUR DEUX LIGNES (npm run verif:ancres).
//
//   node scripts/mutations-abo-invite.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`

const FICHE = 'app/commander/rdv/[slug]/page.js'
const BANC = 'verif:abonnements'

const MUTATIONS = [
  { nom: '🔴 la relecture insiste quinze fois sur un refus « pas connecté »',
    banc: BANC, fichier: FICHE,
    de: '        if (res.status === 401) {',
    vers: '        if (false) {',
    garde: '🔴 la relecture s’arrête au premier refus « pas connecté »' },

  { nom: '🔴 sans compte, « Réserver » mène de nouveau au prix normal',
    banc: BANC, fichier: 'app/commander/rdv/[slug]/ConfirmationAbonnement.js',
    de: '      <button onClick={sansCompte ? onConnecter : onReserver}',
    vers: '      <button onClick={onReserver}',
    garde: '🔴 sans compte, le bouton principal connecte au lieu de réserver au prix normal' },

  { nom: '🔴 sans compte, la troisième étape promet de nouveau « Commandes et rendez-vous »',
    banc: BANC, fichier: 'lib/abonnements.js',
    de: "      ? `Pour réserver et suivre ton solde, **connecte-toi avec ${adresse || 'l’adresse de ton achat'}** : un lien reçu par email suffit, sans mot de passe.`",
    vers: "      ? 'Ton solde et ta date de fin restent visibles dans **Commandes et rendez-vous**.'",
    garde: '🔴 sans compte : la troisième dit avec quelle adresse se connecter' },

  { nom: '🔴 sans compte, le retour annonce « actif » sans avoir rien relu',
    banc: BANC, fichier: 'lib/abonnements.js',
    de: '    if (sansCompte) {',
    vers: '    if (false) {',
    garde: '🔴 sans compte : on n’annonce pas « actif » sans l’avoir relu' },

  { nom: '🔴 l’email ne dit plus avec quelle adresse se connecter',
    banc: BANC, fichier: 'lib/resend.js',
    de: '      ${connexion ? `<p style="margin:8px 0 0;font-size:13px;color:${C.ink};line-height:1.6;">${echapperHtml(connexion)}</p>` : \'\'}',
    vers: '',
    garde: '🔴 l’email porte la phrase de connexion' },

  { nom: '🔴 le webhook ne passe plus la phrase à l’email',
    banc: BANC, fichier: 'app/api/stripe/webhook/route.js',
    de: '          connexion: PHRASE_CONNEXION_ABONNEMENT,',
    vers: '',
    garde: '🔴 le webhook passe la phrase de connexion à l’email' },

  { nom: '🔴 le bouton « Payer » annonce de nouveau le prix plein',
    banc: BANC, fichier: 'app/commander/rdv/[slug]/BlocAbonnements.js',
    de: "                {envoi ? 'Redirection…' : `Payer ${euros(offreChoisie?.prix ?? choisie.prix)}`}",
    vers: "                {envoi ? 'Redirection…' : `Payer ${euros(choisie.prix)}`}",
    garde: '🔴 le bouton « Payer » annonce le prix du jour, celui que Stripe encaisse' },

  { nom: '🔴 la connexion suit de nouveau n’importe quelle adresse',
    banc: BANC, fichier: 'app/commander/auth/page.js',
    de: "  const redirect = cheminInterne(searchParams.get('redirect'), '/commander')",
    vers: "  const redirect = searchParams.get('redirect') || '/commander'",
    garde: '🔴 la connexion ne suit qu’un chemin interne' },

  { nom: '🔴 le lien reçu par email suit de nouveau n’importe quelle adresse',
    banc: BANC, fichier: 'app/commander/auth/confirm/page.js',
    de: "    const next = cheminInterne(searchParams.get('next'), '/commander')",
    vers: "    const next = searchParams.get('next') || '/commander'",
    garde: '🔴 le lien reçu par email non plus' },

  { nom: '🔴 l’adresse proposée reste dans l’onglet après usage',
    banc: BANC, fichier: 'lib/identite-locale.js',
    de: '    sessionStorage.removeItem(CLE_EMAIL_CONNEXION)',
    vers: '',
    garde: '🔴 et une seule fois' },

  { nom: '⚠️ « Me connecter » oublie l’adresse de l’achat',
    banc: BANC, fichier: FICHE,
    de: '                    try { if (aboEmailAchat) sessionStorage.setItem(CLE_EMAIL_CONNEXION, aboEmailAchat) } catch { /* navigation privée */ }',
    vers: '',
    garde: 'et l’adresse passe par la mémoire de l’onglet, pas par l’URL' },

  { nom: '⚠️ le bloc d’achat ne prévient plus l’invité',
    banc: BANC, fichier: FICHE,
    de: 'client={client} sansCompte={sessionProuvee === false}/>',
    vers: 'client={client} sansCompte={false}/>',
    garde: 'le bloc d’achat sait si la personne est connectée' },
]

const lancer = (banc) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, sortie }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, sortie }
  }
}

const bancs = [...new Set(MUTATIONS.map((m) => m.banc))]
for (const b of bancs) {
  const depart = lancer(b)
  if (depart.rouge) {
    console.log(`🔴 ${b} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
    console.log(depart.sortie.slice(-400))
    process.exit(1)
  }
}
console.log(`Bancs verts au départ : ${bancs.join(', ')}.\n`)

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
  ecrireSur(f, original.replace(m.de, () => m.vers))
  const res = lancer(m.banc)
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }

  const nommee = res.sortie.includes(m.garde)
  if (res.rouge && !res.plante && nommee) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else if (res.rouge) { manquees.push(`${m.nom} — rouge, mais PAS sur « ${m.garde} »`); console.log(`  ✕ AUTRE GARDE : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }

const finalRouge = bancs.some((b) => lancer(b).rouge)
if (finalRouge) console.log('🔴 UN BANC EST ROUGE APRÈS RESTAURATION.')
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
