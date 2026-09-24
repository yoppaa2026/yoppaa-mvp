// Ce que Supabase refuse, dit en français.
//
// POURQUOI UN MODULE, ET PAS TROIS `if` DANS L'ÉCRAN. Les refus de GoTrue
// arrivent en anglais (« Password is known to be weak and easy to guess »), et
// un commerçant qui lit ça ne sait pas s'il a mal tapé, si son mot de passe est
// trop court, ou si Yoppaa est en panne. Ici on traduit une fois, et le banc
// peut EXÉCUTER la traduction sur chaque cas connu au lieu de chercher un mot
// dans un écran.
//
// 🔴 ON VISE LE `code`, PAS LE MESSAGE. Les messages de GoTrue changent de
// version en version, les codes non. Un aiguillage sur le texte anglais est une
// garde qui devient muette à la première mise à jour, sans que rien ne le dise.
// Le texte ne sert que de dernier recours, pour les erreurs anciennes qui n'ont
// pas encore de code.
//
// ⚠️ ET ON N'INVENTE JAMAIS. Un refus qu'on ne reconnaît pas rend une phrase
// qui l'avoue et qui donne la sortie. Traduire au jugé ferait dire à l'écran
// une cause qu'il ne connaît pas, et c'est pire qu'un message technique : ça
// envoie corriger ce qui n'est pas cassé.

// Le minimum imposé côté Supabase (relevé le 12/09 : 6 → 10). Il est écrit ici
// pour que l'écran l'annonce AVANT la saisie, au lieu de le faire découvrir par
// un refus. ⚠️ S'il change dans la console, il change ici.
export const MDP_MIN = 10

// ⚠️ LA LONGUEUR SE COMPTE EN CARACTÈRES RÉELS. Un mot de passe avec un accent
// ou un emoji ne doit pas être compté deux fois, sinon l'écran accepterait ce
// que le serveur refuse.
export function longueurMdp(mdp) {
  if (typeof mdp !== 'string') return 0
  return Array.from(mdp).length
}

export function mdpAssezLong(mdp) {
  return longueurMdp(mdp) >= MDP_MIN
}

// ⚠️ UNE VÉRIFICATION D'ÉCRAN, PAS UNE VALIDATION. Elle évite un aller-retour
// pour une adresse manifestement incomplète ; c'est Supabase qui tranche.
export function emailPlausible(email) {
  if (typeof email !== 'string') return false
  const v = email.trim()
  if (v.length < 6 || v.length > 254) return false
  if (/\s/.test(v)) return false
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(v)
}

// 🔴 « DIFFÉRENTE » SE JUGE SANS LA CASSE ET SANS LES ESPACES. Sinon
// « Alex@… » et « alex@… » passent pour deux adresses, et Supabase répond un
// refus que personne ne comprend.
export function memeEmail(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
}

const PAR_CODE = {
  // ⚠️ ON NE DIT JAMAIS LEQUEL DES DEUX EST FAUX. Répondre « cette adresse est
  // inconnue » laisserait n'importe qui vérifier, une adresse après l'autre,
  // qui a un compte chez Yoppaa. C'est pour ça que ce message reste vague là
  // où les autres sont précis : ici le flou est la protection.
  invalid_credentials:         'Email ou mot de passe incorrect.',
  weak_password:               'Ce mot de passe est trop facile à deviner, ou il figure dans des fuites connues. Prends-en un autre.',
  same_password:               'C’est déjà ton mot de passe actuel. Choisis-en un autre.',
  email_exists:                'Cette adresse est déjà utilisée par un autre compte Yoppaa.',
  email_address_invalid:       'Cette adresse ne ressemble pas à une adresse email.',
  email_address_not_authorized:'Cette adresse n’est pas acceptée par notre service d’envoi. Essaie-en une autre, ou écris-nous.',
  validation_failed:           'Il manque quelque chose, ou un champ n’est pas au bon format.',
  over_email_send_rate_limit:  'Trop de messages demandés d’affilée. Patiente une minute avant de réessayer.',
  over_request_rate_limit:     'Trop de tentatives d’affilée. Patiente une minute avant de réessayer.',
  otp_expired:                 'Ce code n’est plus valable. Demandes-en un nouveau.',
  reauthentication_needed:     'Pour changer ton mot de passe, il nous faut d’abord le code envoyé par email.',
  reauthentication_not_valid:  'Ce code ne correspond pas, ou il a expiré. Demandes-en un nouveau.',
  session_expired:             'Ta session a expiré. Reconnecte-toi, puis recommence.',
  user_not_found:              'Ce compte est introuvable. Reconnecte-toi, puis recommence.',
}

// Les refus qui n'ont pas encore de code : on vise un morceau STABLE du
// message, en minuscules, jamais la phrase entière.
const PAR_TEXTE = [
  [/new password should be different/i, PAR_CODE.same_password],
  [/password should be at least/i,      `Ton mot de passe doit faire au moins ${MDP_MIN} caractères.`],
  [/known to be weak/i,                 PAR_CODE.weak_password],
  [/already been registered/i,          PAR_CODE.email_exists],
  [/invalid.*nonce|nonce.*invalid/i,    PAR_CODE.reauthentication_not_valid],
  [/token has expired or is invalid/i,  PAR_CODE.reauthentication_not_valid],
  [/for security purposes/i,            PAR_CODE.over_request_rate_limit],
  [/rate limit/i,                       PAR_CODE.over_email_send_rate_limit],
  [/unable to validate email/i,         PAR_CODE.email_address_invalid],
  [/captcha/i,                          'La vérification anti-robot a échoué. Recharge la page et recommence.'],
  // ⚠️ LE MESSAGE HISTORIQUE DE GOTRUE, encore rendu sans code par certaines
  // versions. C'est le refus le plus fréquent d'un écran de connexion : sans
  // cette ligne il tomberait sur le repli, qui parle d'écrire au support.
  [/invalid login credentials/i,        PAR_CODE.invalid_credentials],
]

// Le repli. ⚠️ IL DIT CE QU'ON SAIT ET CE QU'ON NE SAIT PAS, et il donne la
// sortie. Le code HTTP y figure : c'est la seule chose qui permette de
// retrouver la trace quand un commerçant appelle.
function repli(statut) {
  const n = Number.isFinite(Number(statut)) && Number(statut) > 0 ? ` (erreur ${statut})` : ''
  return `Ça n’a pas pu se faire${n}. Réessaie dans un instant, et écris-nous à hello@yoppaa.app si ça se reproduit.`
}

// Rend TOUJOURS une phrase française. `erreur` est l'objet rendu par
// supabase-js ; il peut être null, sans code, ou sans message.
export function messageAuth(erreur) {
  if (!erreur) return null

  const code = typeof erreur.code === 'string' ? erreur.code : ''
  if (code && Object.hasOwn(PAR_CODE, code)) return PAR_CODE[code]

  // ⚠️ `Object.hasOwn` ET PAS UN ACCÈS DIRECT : `PAR_CODE['constructor']`
  // rendrait une fonction, et l'écran afficherait « function Object() { … } ».
  // Le projet s'est déjà fait prendre là-dessus sur la table des retours Stripe.

  const texte = typeof erreur.message === 'string' ? erreur.message : ''
  if (texte) {
    for (const [motif, phrase] of PAR_TEXTE) {
      if (motif.test(texte)) return phrase
    }
  }

  // 429 sans code : c'est une limitation de débit, quelle qu'en soit la source.
  if (Number(erreur.status) === 429) return PAR_CODE.over_request_rate_limit

  return repli(erreur.status)
}
