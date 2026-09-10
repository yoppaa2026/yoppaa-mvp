// ─────────────────────────────────────────────────────────────────────────────
// lib/ical.js — Générateur de fichiers iCal (.ics) pour les RDV Yoppaa
//
// Usage côté API/template Resend :
//   import { generateRdvIcs, icsToBase64Attachment } from '@/lib/ical'
//   const ics = generateRdvIcs({ ... })
//   const attachment = icsToBase64Attachment(ics, 'rdv-yoppaa.ics')
//   await resend.emails.send({ ..., attachments: [attachment] })
//
// Spec iCal : RFC 5545 (https://www.rfc-editor.org/rfc/rfc5545)
// Timezone : Europe/Brussels (CET / CEST DST rules embedded en dur)
// ─────────────────────────────────────────────────────────────────────────────

import { groupeReservation } from './reservation-metier'

const TZID = 'Europe/Brussels'

// VTIMEZONE Europe/Brussels — règles DST officielles UE
// (dernier dimanche de mars 2h → CEST UTC+2 / dernier dimanche d'octobre 3h → CET UTC+1)
// Codé en dur pour que les clients calendrier sans table TZ (Outlook ancien, etc.) fonctionnent.
const VTIMEZONE_BLOCK = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  'BEGIN:STANDARD',
  'DTSTART:19701025T030000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
  'END:STANDARD',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700329T020000',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
].join('\r\n')

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Escape selon RFC 5545 §3.3.11 : backslash, virgule, point-virgule, newline.
function escapeText(s) {
  if (s == null) return ''
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

// Plie les lignes > 75 octets avec CRLF + espace (RFC 5545 §3.1).
// Compte en octets UTF-8 pour gérer correctement les caractères accentués.
function foldLine(line) {
  const out = []
  let buf = ''
  let bytes = 0
  for (const ch of line) {
    const chBytes = new TextEncoder().encode(ch).length
    if (bytes + chBytes > 75) {
      out.push(buf)
      buf = ' ' + ch
      bytes = 1 + chBytes
    } else {
      buf += ch
      bytes += chBytes
    }
  }
  if (buf) out.push(buf)
  return out.join('\r\n')
}

// Format date+time pour DTSTART/DTEND avec TZID : 20260515T143000 (pas de Z)
function formatLocal(dateStr, timeStr) {
  // dateStr : 'YYYY-MM-DD' · timeStr : 'HH:MM' ou 'HH:MM:SS'
  const d = String(dateStr).replace(/-/g, '')
  const t = String(timeStr).replace(/:/g, '').padEnd(6, '0').slice(0, 6)
  return `${d}T${t}`
}

// Format DTSTAMP en UTC : 20260530T123045Z (requis par la spec)
function formatUtcStamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    'T',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    'Z',
  ].join('')
}

// ─────────────────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────────────────

// LE NUMÉRO DE VERSION D'UN ÉVÉNEMENT DÉJÀ ENVOYÉ AU CLIENT.
//
// Apple, Google et Outlook reconnaissent l'événement à son UID (l'identifiant
// du rendez-vous) et n'appliquent un changement, déplacement ou annulation,
// que si SEQUENCE a GRANDI. À séquence égale ou plus petite, le fichier est
// reçu, ouvert, et sans effet.
//
// ⚠️ LES MINUTES ÉCOULÉES DEPUIS 1970 : le compteur le plus simple qui grandisse
// tout seul, très loin du plafond de la norme (2 147 483 647, vers l'an 6053).
// La création part à 0, chaque déplacement prend la minute de son envoi.
// ⚠️ Un instant illisible vaut « maintenant » : un paramètre par défaut ne
// protège que de `undefined`, et une séquence NaN serait un fichier invalide.
export function sequenceIcs(maintenant) {
  const t = typeof maintenant === 'number' && Number.isFinite(maintenant) ? maintenant : Date.now()
  return Math.floor(t / 60000)
}

// 🔴 L'ANNULATION PARTAIT EN SEQUENCE:1 (trouvé le 11/09, en vérifiant le
// fichier d'annulation d'une table). Un rendez-vous déplacé porte déjà une
// séquence de trente millions : le calendrier du client tenait l'annulation
// pour PÉRIMÉE et gardait l'événement. Elle passe désormais après le dernier
// déplacement, même envoyé dans la même minute.
export function sequenceAnnulation(maintenant) {
  return sequenceIcs(maintenant) + 1
}

/**
 * Génère le contenu .ics pour un RDV Yoppaa.
 *
 * @param {Object} rdv
 * @param {string} rdv.id                  uuid du RDV (sert d'UID iCal stable)
 * @param {string} rdv.date_rdv            'YYYY-MM-DD'
 * @param {string} rdv.heure_debut         'HH:MM' ou 'HH:MM:SS'
 * @param {string} rdv.heure_fin           'HH:MM' ou 'HH:MM:SS'
 * @param {string} rdv.prestation_nom      ex. 'Coupe homme + barbe'
 * @param {string} [rdv.praticien_nom]     ex. 'Sophie'
 * @param {string} rdv.commercant_nom      ex. 'Salon Clémence'
 * @param {string} rdv.commercant_adresse  adresse complète
 * @param {string} [rdv.commercant_telephone]
 * @param {string} [rdv.commercant_email]  pour ORGANIZER
 * @param {number} [rdv.prix_estime]       en €, ajouté à la description
 * @param {boolean} [rdv.rappel_24h]       ajoute VALARM J-1 (défaut: true)
 * @param {string} [rdv.status]            CONFIRMED | CANCELLED (défaut: CONFIRMED)
 * @returns {string} contenu .ics (avec CRLF)
 */
export function generateRdvIcs(rdv) {
  const {
    id,
    date_rdv,
    heure_debut,
    heure_fin,
    prestation_nom,
    praticien_nom = null,
    commercant_nom,
    commercant_adresse,
    commercant_telephone = null,
    commercant_email = null,
    // Email du Yopper. Indispensable à iOS : Apple Mail n'affiche le bandeau
    // « Ajouter au calendrier » que si le destinataire figure comme ATTENDEE
    // d'un événement METHOD:REQUEST. Sans lui, le .ics reste une pièce jointe
    // inerte qu'on ne peut qu'ouvrir à la main. Android, plus permissif,
    // acceptait le fichier tel quel, d'où « Android OK, iOS NOK ».
    client_email = null,
    client_nom = null,
    prix_estime = null,
    rappel_24h = true,
    status = 'CONFIRMED',
    // method : 'REQUEST' (creation/update) ou 'CANCEL' (annulation : supprime auto
    // l'event du calendrier client si l'UID matche). Sequence DOIT etre incremente
    // a chaque MAJ. Pour MVP : 0 a la creation, 1+ apres annulation/modification.
    method = 'REQUEST',
    sequence = 0,
    // 🔴 UNE TABLE N'EST PAS UN « RDV » (email d'Alex, 10/09 tard). Le client
    // retrouvait dans son calendrier « RDV Table de 6 personnes chez… » pour un
    // groupe de quatre, « Avec : Salle principale », et « Rappel — RDV demain ».
    table = false,
    couverts = null,
  } = rdv

  if (!id || !date_rdv || !heure_debut || !heure_fin || !prestation_nom || !commercant_nom) {
    throw new Error('generateRdvIcs: champs requis manquants (id, date_rdv, heure_debut, heure_fin, prestation_nom, commercant_nom)')
  }

  const dtStart = formatLocal(date_rdv, heure_debut)
  const dtEnd   = formatLocal(date_rdv, heure_fin)
  const dtStamp = formatUtcStamp()
  const uid     = `${id}@yoppaa.app`

  // ⚠️ SANS NOMBRE LISIBLE, une table garde son nom : on n'invente pas « 1 ».
  // La règle est celle des emails, lue au même endroit.
  const groupe = groupeReservation({ table, couverts })
  const summary = groupe
    ? `Table pour ${groupe} chez ${commercant_nom}`
    : `RDV ${prestation_nom} chez ${commercant_nom}`
  const descParts = [
    groupe ? `Table : ${groupe}` : `Prestation : ${prestation_nom}`,
    praticien_nom ? `${table ? 'Salle' : 'Avec'} : ${praticien_nom}` : null,
    // ⚠️ « Prix », pas « Prix estimé » (Alex, 27/08) : le prix est le prix. Ce
    // qu'un commerçant ajoute, il l'ajoute à son comptoir, et ça ne regarde pas
    // l'application.
    prix_estime != null ? `Prix : ${Number(prix_estime).toFixed(2)} €` : null,
    commercant_telephone ? `Téléphone : ${commercant_telephone}` : null,
    '',
    'Géré via Yoppaa — yoppaa.app',
  ].filter(Boolean).join('\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Yoppaa//Module RDV//FR',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    VTIMEZONE_BLOCK,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;TZID=${TZID}:${dtStart}`,
    `DTEND;TZID=${TZID}:${dtEnd}`,
    `SUMMARY:${escapeText(method === 'CANCEL' ? `[ANNULÉ] ${summary}` : summary)}`,
    `DESCRIPTION:${escapeText(descParts)}`,
    `LOCATION:${escapeText(commercant_adresse)}`,
    `STATUS:${status}`,
    `SEQUENCE:${sequence}`,
    'TRANSP:OPAQUE', // bloque le créneau dans le calendrier
  ]

  // ORGANIZER et ATTENDEE vont ENSEMBLE : un événement METHOD:REQUEST sans
  // participant n'est pas une invitation aux yeux d'Apple Mail, juste un
  // fichier. On garde une adresse Yoppaa en secours quand le commerçant n'a
  // pas renseigné la sienne, sans quoi iOS ignorerait tout le bloc.
  const organisateur = commercant_email || 'rdv@yoppaa.app'
  lines.push(`ORGANIZER;CN=${escapeText(commercant_nom)}:mailto:${organisateur}`)
  if (client_email) {
    lines.push(
      `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE${client_nom ? `;CN=${escapeText(client_nom)}` : ''}:mailto:${client_email}`
    )
  }

  // Rappel J-1 (24h avant) : alarme display dans le calendrier client.
  // Pas de VALARM si on annule (le rappel n'a plus de sens).
  if (rappel_24h && method !== 'CANCEL') {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${table ? 'Rappel — ta table demain chez' : 'Rappel — RDV demain chez'} ${escapeText(commercant_nom)}`,
      'TRIGGER:-P1D',
      'END:VALARM',
    )
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')

  // Plie chaque ligne à 75 octets puis joint avec CRLF (spec iCal)
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/**
 * Transforme un .ics en pièce jointe Resend.
 * @param {string} icsContent   contenu .ics retourné par generateRdvIcs
 * @param {string} [filename]   nom du fichier (défaut: 'rdv.ics')
 * @returns {{ filename: string, content: string, content_type: string }}
 */
export function icsToBase64Attachment(icsContent, filename = 'rdv.ics') {
  // La méthode déclarée dans le type MIME doit être CELLE du fichier. Elle
  // était figée à REQUEST, y compris sur les .ics d'annulation : le client mail
  // recevait un CANCEL annoncé comme une invitation, et pouvait ne pas retirer
  // l'événement du calendrier.
  const methode = /^METHOD:(\w+)/m.exec(icsContent)?.[1] || 'REQUEST'
  return {
    filename,
    content: Buffer.from(icsContent, 'utf8').toString('base64'),
    content_type: `text/calendar; charset=utf-8; method=${methode}`,
  }
}

/**
 * Génère un .ics + un attachement Resend prêt à l'emploi en un seul appel.
 * @param {Object} rdv  même signature que generateRdvIcs
 * @returns {{ ics: string, attachment: { filename, content, content_type } }}
 */
export function generateRdvAttachment(rdv) {
  const ics = generateRdvIcs(rdv)
  return { ics, attachment: icsToBase64Attachment(ics, `rdv-${rdv.id}.ics`) }
}
