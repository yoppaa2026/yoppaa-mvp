// Harnais de mutation : L'ANNULATION, L'ABSENCE ET LE RAPPEL D'UNE TABLE
// DISENT LE GROUPE (11/09/2026).
//
// La confirmation disait « 4 personnes » depuis le 10/09 ; l'annulation, le
// non-honoré, le rappel de la veille, le rappel push et le fichier calendrier
// d'annulation redisaient le format de la table. Chaque mutation remet un
// défaut plausible ; le banc désigné doit rougir.
// ⚠️ Aucune ancre ne contient de saut de ligne. Restauration par CONTENU,
// vérifiée. Jamais `git checkout`. Une mutation change le RÉSULTAT, jamais la
// TERMINAISON : un banc qui plante n'a rien mesuré.
import { ecrireSur } from './harnais-mutation.mjs'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const MODULE = 'lib/reservation-metier.js'

const MUTATIONS = [
  // ─── LA RÈGLE ───────────────────────────────────────────────────────────
  { nom: '🔴 un salon se dit en personnes', banc: 'verif:table',
    de: '  if (table && Number.isFinite(n) && n >= 1) return',
    vers: '  if (Number.isFinite(n) && n >= 1) return' },
  { nom: '🔴 un nombre illisible devient « 0 personnes »', banc: 'verif:table',
    de: '&& n >= 1) return `${n} personne',
    vers: '&& n >= 0) return `${n} personne' },
  { nom: '🔴 l’objet oublie le groupe', banc: 'verif:table',
    de: "  return groupeReservation({ table, couverts }) || prestation_nom || ''",
    vers: "  return prestation_nom || ''" },
  { nom: '🔴 l’intitulé oublie la table', banc: 'verif:table',
    de: "  return groupe ? `Table pour ${groupe}` : (prestation_nom || '')",
    vers: "  return prestation_nom || ''" },
  { nom: '⚠️ le calendrier reprend sa propre copie de la règle', banc: 'verif:table', fichier: 'lib/ical.js',
    de: '  const groupe = groupeReservation({ table, couverts })',
    vers: "  const groupe = table && Number(couverts) >= 1 ? `${Math.floor(Number(couverts))} personne${Number(couverts) >= 2 ? 's' : ''}` : null" },

  // ─── LES GABARITS ───────────────────────────────────────────────────────
  { nom: '🔴 l’annulation redit le format', banc: 'verif:table', fichier: 'lib/resend.js',
    de: '${mots.prestationLigne} : ${echapperHtml(objetReservation({ prestation_nom, table, couverts }))',
    vers: '${mots.prestationLigne} : ${echapperHtml(prestation_nom)' },
  { nom: '🔴 le non-honoré redit le format', banc: 'verif:table', fichier: 'lib/resend.js',
    de: 'font-weight:600;">${echapperHtml(objetReservation({ prestation_nom, table, couverts }))',
    vers: 'font-weight:600;">${echapperHtml(prestation_nom)' },
  { nom: '🔴 le rappel de la veille redit le format', banc: 'verif:table', fichier: 'lib/resend.js',
    de: '${echapperHtml(intituleReservation({ prestation_nom, table, couverts }))',
    vers: '${echapperHtml(prestation_nom)' },

  // ─── LE RAPPEL PUSH, EXÉCUTÉ SUR UNE BASE QUI NE REND QUE CE QU'ON DEMANDE
  { nom: '🔴 le rappel push ne charge plus le nombre de personnes', banc: 'verif:table', fichier: 'lib/rappels.js',
    de: '        couverts,',
    vers: '' },
  { nom: '🔴 le rappel push ne sait plus ce qu’est une table', banc: 'verif:table', fichier: 'lib/rappels.js',
    de: 'prestation:rdv_prestations(nom, par_couverts)',
    vers: 'prestation:rdv_prestations(nom)' },
  { nom: '🔴 le rappel push redit le format', banc: 'verif:table', fichier: 'lib/rappels.js',
    de: "    const presta = objet ? ` (${objet})` : ''",
    vers: "    const presta = rdv.prestation?.nom ? ` (${rdv.prestation.nom})` : ''" },
  { nom: '🔴 le rappel push ne lit plus la table', banc: 'verif:table', fichier: 'lib/rappels.js',
    de: '      table: rdv.prestation?.par_couverts === true,',
    vers: '      table: false,' },

  // ─── L'ANNULATION PAR LE COMMERÇANT ─────────────────────────────────────
  { nom: '🔴 l’annulation du commerçant ne charge plus le nombre', banc: 'verif:table', fichier: 'app/api/emails/rdv-annule/route.js',
    de: '        couverts,',
    vers: '' },
  { nom: '🔴 l’annulation du commerçant ne sait plus ce qu’est une table', banc: 'verif:table', fichier: 'app/api/emails/rdv-annule/route.js',
    de: 'prestation:rdv_prestations(nom, par_couverts)',
    vers: 'prestation:rdv_prestations(nom)' },
  { nom: '🔴 l’annulation du commerçant ne lit plus la table', banc: 'verif:table', fichier: 'app/api/emails/rdv-annule/route.js',
    de: '    const table = rdv?.prestation?.par_couverts === true',
    vers: '    const table = false' },
  { nom: '🔴 l’email d’annulation du commerçant perd le nombre', banc: 'verif:table', fichier: 'app/api/emails/rdv-annule/route.js',
    de: '      couverts:          rdv.couverts,',
    vers: '      couverts:          null,' },
  { nom: '🔴 le calendrier de l’annulation du commerçant perd le nombre', banc: 'verif:table', fichier: 'app/api/emails/rdv-annule/route.js',
    de: '      couverts: rdv.couverts,',
    vers: '      couverts: null,' },
  { nom: '🔴 les deux annulations divergent (commerçant)', banc: 'verif:table', fichier: 'app/api/emails/rdv-annule/route.js',
    de: '      nb_bons,',
    vers: '' },

  // ─── L'ANNULATION PAR LE CLIENT ─────────────────────────────────────────
  { nom: '🔴 l’annulation du client ne charge plus le nombre', banc: 'verif:table', fichier: 'app/api/rdv/cancel/route.js',
    de: '      couverts,',
    vers: '' },
  { nom: '🔴 l’annulation du client ne sait plus ce qu’est une table', banc: 'verif:table', fichier: 'app/api/rdv/cancel/route.js',
    de: 'prestation:rdv_prestations(nom, par_couverts)',
    vers: 'prestation:rdv_prestations(nom)' },
  { nom: '🔴 l’annulation du client ne lit plus la table', banc: 'verif:table', fichier: 'app/api/rdv/cancel/route.js',
    de: '    const table = rdv.prestation?.par_couverts === true',
    vers: '    const table = false' },
  { nom: '🔴 l’email d’annulation du client perd le nombre', banc: 'verif:table', fichier: 'app/api/rdv/cancel/route.js',
    de: '          couverts:          rdv.couverts,',
    vers: '          couverts:          null,' },
  { nom: '🔴 le calendrier de l’annulation du client perd le nombre', banc: 'verif:table', fichier: 'app/api/rdv/cancel/route.js',
    de: '          couverts:     rdv.couverts,',
    vers: '          couverts:     null,' },
  { nom: '🔴 l’objet de l’annulation du client redit « Ton RDV »', banc: 'verif:table', fichier: 'app/api/rdv/cancel/route.js',
    de: "subject: `${mots.sujetAnnule} ${commercant?.nom || 'le commerçant'} a été ${mots.participeAnnule}`,",
    vers: "subject: `Ton RDV chez ${commercant?.nom || 'le commerçant'} a été annulé`," },
  { nom: '🔴 les deux annulations divergent (client)', banc: 'verif:table', fichier: 'app/api/rdv/cancel/route.js',
    de: '          nb_bons:           lignesBonsDe(rdv).length',
    vers: '          nb_bons_client:    lignesBonsDe(rdv).length' },

  // ─── LE NON-HONORÉ ──────────────────────────────────────────────────────
  { nom: '🔴 le non-honoré ne charge plus le nombre', banc: 'verif:table', fichier: 'app/api/emails/rdv-no-show/route.js',
    de: '        couverts,',
    vers: '' },
  { nom: '🔴 le non-honoré ne sait plus ce qu’est une table', banc: 'verif:table', fichier: 'app/api/emails/rdv-no-show/route.js',
    de: 'prestation:rdv_prestations(nom, par_couverts)',
    vers: 'prestation:rdv_prestations(nom)' },
  { nom: '🔴 le non-honoré ne lit plus la table', banc: 'verif:table', fichier: 'app/api/emails/rdv-no-show/route.js',
    de: '    const table = rdv.prestation?.par_couverts === true',
    vers: '    const table = false' },
  { nom: '🔴 le non-honoré perd le nombre', banc: 'verif:table', fichier: 'app/api/emails/rdv-no-show/route.js',
    de: '        couverts:         rdv.couverts,',
    vers: '        couverts:         null,' },
  { nom: '🔴 l’objet du non-honoré redit « Ton RDV »', banc: 'verif:table', fichier: 'app/api/emails/rdv-no-show/route.js',
    de: "subject: `${mots.sujetChez} ${rdv.commercant?.nom || 'le commerçant'} a été ${mots.participeMarque} non ${mots.participeHonore}`,",
    vers: "subject: `Ton RDV chez ${rdv.commercant?.nom || 'le commerçant'} a été marqué non honoré`," },

  // ─── LE RAPPEL DE LA VEILLE ─────────────────────────────────────────────
  { nom: '🔴 le rappel de la veille ne charge plus le nombre', banc: 'verif:table', fichier: 'app/api/cron/rdv-reminder-9h/route.js',
    de: '        couverts,',
    vers: '' },
  { nom: '🔴 le rappel de la veille ne sait plus ce qu’est une table', banc: 'verif:table', fichier: 'app/api/cron/rdv-reminder-9h/route.js',
    de: 'prestation:rdv_prestations(nom, par_couverts)',
    vers: 'prestation:rdv_prestations(nom)' },
  { nom: '🔴 le rappel de la veille ne lit plus la table', banc: 'verif:table', fichier: 'app/api/cron/rdv-reminder-9h/route.js',
    de: '          table:                   r.prestation.par_couverts === true,',
    vers: '          table:                   false,' },
  { nom: '🔴 le rappel de la veille perd le nombre', banc: 'verif:table', fichier: 'app/api/cron/rdv-reminder-9h/route.js',
    de: '          couverts:                r.couverts,',
    vers: '          couverts:                null,' },
  // ⚠️ Aucune garde ne lit l'objet de CE rappel : seule la garde de tout le
  // dépôt peut rougir. C'est elle que cette mutation mesure.
  { nom: '⚠️ un objet réécrit « RDV » en dur ailleurs', banc: 'verif:table', fichier: 'app/api/cron/rdv-reminder-9h/route.js',
    de: 'subject: `${motsReservation(r.commercant).sujetRappel} ${r.commercant.nom} à ${r.heure_debut?.slice(0,5)}`,',
    vers: 'subject: `Rappel — RDV demain chez ${r.commercant.nom} à ${r.heure_debut?.slice(0,5)}`,' },

  // ─── LE FICHIER D'ANNULATION RETIRE VRAIMENT L'ÉVÉNEMENT ────────────────
  { nom: '🔴 l’annulation arrive à égalité avec un déplacement de la même minute', banc: 'verif:table', fichier: 'lib/ical.js',
    de: '  return sequenceIcs(maintenant) + 1',
    vers: '  return sequenceIcs(maintenant)' },
  { nom: '⚠️ un instant illisible donne une séquence fausse', banc: 'verif:table', fichier: 'lib/ical.js',
    de: "  const t = typeof maintenant === 'number' && Number.isFinite(maintenant) ? maintenant : Date.now()",
    vers: '  const t = maintenant === undefined ? Date.now() : maintenant' },
  { nom: '🔴 l’annulation du commerçant repart en séquence 1', banc: 'verif:table', fichier: 'app/api/emails/rdv-annule/route.js',
    de: '      sequence: sequenceAnnulation(),',
    vers: '      sequence: 1,' },
  { nom: '🔴 l’annulation du client repart en séquence 1', banc: 'verif:table', fichier: 'app/api/rdv/cancel/route.js',
    de: '          sequence: sequenceAnnulation(),',
    vers: '          sequence: 1,' },
  { nom: '🔴 l’annulation du client perd l’organisateur', banc: 'verif:table', fichier: 'app/api/rdv/cancel/route.js',
    de: '          commercant_email: commercant?.email,',
    vers: '' },
  { nom: '🔴 l’annulation du client ne charge plus l’adresse du commerce', banc: 'verif:table', fichier: 'app/api/rdv/cancel/route.js',
    de: 'adresse, telephone, email, stripe_account_id',
    vers: 'adresse, telephone, stripe_account_id' },
  { nom: '⚠️ le déplacement recalcule l’horloge à la main', banc: 'verif:table', fichier: 'app/api/emails/rdv-confirme/route.js',
    de: '          sequence: deplace ? sequenceIcs() : 0,',
    vers: '          sequence: deplace ? Math.floor(Date.now() / 60000) : 0,' },

  // ─── TOUT REMBOURSEMENT PASSE PAR UNE ANNULATION ────────────────────────
  { nom: '🔴 une route se remet à rembourser sans rien annuler', banc: 'verif:tunnel-rdv', fichier: 'app/api/emails/rdv-no-show/route.js',
    de: "import { motsReservation } from '@/lib/reservation-metier'",
    vers: "import { motsReservation } from '@/lib/reservation-metier'; export const rembourser = (s, pi) => s.refunds.create({ payment_intent: pi })" },
  { nom: '🔴 le non-honoré rembourse sans écrire son statut', banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/no-show/route.js',
    de: ".update({ statut: 'no_show', motif_annulation: 'commercant' })",
    vers: ".update({ motif_annulation: 'commercant' })" },
]

const lancer = (banc) => {
  try {
    execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    return { rouge: true, plante: !/vérifications/.test(sortie), extrait: sortie.slice(-600) }
  }
}

// Filtre facultatif : `node scripts/mutations-emails-table.mjs verif:table`
const seul = process.argv[2] || null
const LISTE = seul ? MUTATIONS.filter(m => m.banc === seul) : MUTATIONS
const BANCS = [...new Set(LISTE.map(m => m.banc))]

for (const b of BANCS) {
  const depart = lancer(b)
  if (depart.rouge) {
    console.log(`🔴 ${b} EST DEJA ROUGE. On ne mesure rien sur un banc rouge.`)
    console.log(depart.extrait)
    process.exit(1)
  }
}
console.log(`Bancs verts au depart : ${BANCS.join(', ')}.\n`)

let attrapees = 0
const manquees = []

for (const m of LISTE) {
  const f = chemin(m.fichier || MODULE)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ! ${m.nom} — texte introuvable`)
    continue
  }
  // ⚠️ UNE ANCRE QUI APPARAÎT DEUX FOIS MUTE LES DEUX : la garde mesurée ne
  // serait pas celle qu'on croit. On le refuse plutôt que de le découvrir.
  if (original.split(m.de).length !== 2) {
    manquees.push(`${m.nom} — ANCRE NON UNIQUE`)
    console.log(`  ! ${m.nom} — ancre non unique`)
    continue
  }
  ecrireSur(f, original.split(m.de).join(m.vers))
  const r = lancer(m.banc)
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log('RESTAURATION RATEE, on arrete tout.')
    process.exit(2)
  }
  if (r.rouge && !r.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else {
    manquees.push(m.nom + (r.plante ? ' (le banc a PLANTÉ, il n a rien mesuré)' : ''))
    console.log(`  ✕ NON attrapée : ${m.nom}${r.plante ? ' (PLANTAGE)' : ''}`)
  }
}

console.log(`\n${attrapees}/${LISTE.length} mutations attrapées.`)
for (const b of BANCS) {
  if (lancer(b).rouge) { console.log(`🔴 ${b} ROUGE APRES RESTAURATION.`); process.exit(2) }
}
console.log('Bancs verts après restauration. Dépôt intact.')
if (manquees.length) { console.log('\nMANQUÉES :'); manquees.forEach(m => console.log('  - ' + m)); process.exit(1) }
