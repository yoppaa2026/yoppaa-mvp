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
    prix_estime = null,
    rappel_24h = true,
    status = 'CONFIRMED',
    // method : 'REQUEST' (creation/update) ou 'CANCEL' (annulation : supprime auto
    // l'event du calendrier client si l'UID matche). Sequence DOIT etre incremente
    // a chaque MAJ. Pour MVP : 0 a la creation, 1+ apres annulation/modification.
    method = 'REQUEST',
    sequence = 0,
  } = rdv

  if (!id || !date_rdv || !heure_debut || !heure_fin || !prestation_nom || !commercant_nom) {
    throw new Error('generateRdvIcs: champs requis manquants (id, date_rdv, heure_debut, heure_fin, prestation_nom, commercant_nom)')
  }

  const dtStart = formatLocal(date_rdv, heure_debut)
  const dtEnd   = formatLocal(date_rdv, heure_fin)
  const dtStamp = formatUtcStamp()
  const uid     = `${id}@yoppaa.app`

  const summary = `RDV ${prestation_nom} chez ${commercant_nom}`
  const descParts = [
    `Prestation : ${prestation_nom}`,
    praticien_nom ? `Avec : ${praticien_nom}` : null,
    prix_estime != null ? `Prix estimé : ${Number(prix_estime).toFixed(2)} €` : null,
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

  if (commercant_email) {
    lines.push(`ORGANIZER;CN=${escapeText(commercant_nom)}:mailto:${commercant_email}`)
  }

  // Rappel J-1 (24h avant) : alarme display dans le calendrier client.
  // Pas de VALARM si on annule (le rappel n'a plus de sens).
  if (rappel_24h && method !== 'CANCEL') {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:Rappel — RDV demain chez ${escapeText(commercant_nom)}`,
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
  return {
    filename,
    content: Buffer.from(icsContent, 'utf8').toString('base64'),
    content_type: 'text/calendar; charset=utf-8; method=REQUEST',
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
