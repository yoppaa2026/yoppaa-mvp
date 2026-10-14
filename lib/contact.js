// lib/contact.js
//
// Les chemins de contact de la landing, à UN seul endroit (Alex, 14/10 : « un
// contact s'ils ont des questions, tu veux une démo ? »).
//
// ⚠️ LE NUMÉRO EST CELUI DE L'ENTREPRISE, DÉJÀ PUBLIC (fiche Avcotech, Google,
// Altares). On n'affiche aucun numéro privé. S'il change, il change ici.

export const TELEPHONE_AFFICHE = '+32 492 73 08 69'

// Format international SANS « + » ni espace : c'est ce que `wa.me` attend.
export const WHATSAPP_NUMERO = '32492730869'

export function lienWhatsApp(message = 'Salut Yoppaa ! J’ai un commerce et une question :') {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(message)}`
}

// ─── L'ENCODAGE OFFERT (Alex, 14/10) ────────────────────────────────────────
// « Pour l'instant je fais l'encodage des articles, menus, cartes moi-même et
// gratuitement ; on l'affiche ? » → oui, comme OFFRE DU MOMENT. Le jour où
// Alex est débordé, ce drapeau passe à `false` et la mention disparaît de la
// landing (haut de page, FAQ, formulaire) sans toucher une phrase.
export const ENCODAGE_OFFERT = true

// Les motifs du formulaire « On te rappelle ». La route serveur n'accepte que
// ceux-ci : un motif inventé par l'appelant ne passe pas.
export const MOTIFS_RAPPEL = [
  { cle: 'demo', libelle: 'Je veux une démo' },
  { cle: 'question', libelle: 'J’ai une question' },
  { cle: 'encodage', libelle: 'Encodez ma carte' },
]

export function motifsActifs() {
  return MOTIFS_RAPPEL.filter(m => m.cle !== 'encodage' || ENCODAGE_OFFERT)
}
