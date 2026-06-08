// lib/brevo.js — Helper Brevo pour synchronisation des pre-inscriptions.
//
// Brevo = emailing marketing (newsletters, listes segmentees). Different de Resend
// qui gere le transactionnel (confirmations RDV/commande). Un email peut etre dans
// les deux : Resend pour confirmer un RDV, Brevo pour les newsletters de lancement.
//
// Pas de dependance npm : on appelle directement l'API REST Brevo (HTTPS).

const BREVO_API_URL = 'https://api.brevo.com/v3'

function getApiKey() {
  const key = process.env.BREVO_API_KEY
  if (!key) throw new Error('BREVO_API_KEY manquante')
  return key
}

// Cree ou met a jour un contact dans Brevo + l'ajoute a une liste.
// Si le contact existe deja (409 duplicate), on le met juste a jour et on
// l'ajoute a la liste. Tolerant aux re-inscriptions.
//
// Params :
//   email       : adresse email du contact (cle unique Brevo)
//   listId      : ID numerique de la liste (BREVO_LIST_TEASING_ID, etc.)
//   attributes  : { CODE_POSTAL, TYPE_UTILISATEUR, MESSAGE, SOURCE, MODE_LANDING }
//
// Returns : { id: <brevo_contact_id>, isCreated: bool } ou throw si erreur.
export async function syncContactToBrevo({ email, listId, attributes = {} }) {
  const apiKey = getApiKey()

  if (!email) throw new Error('email requis')
  const listIds = listId ? [Number(listId)] : []

  // Tente la creation. Brevo upsert si on ajoute updateEnabled=true.
  const res = await fetch(`${BREVO_API_URL}/contacts`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      'accept': 'application/json',
    },
    body: JSON.stringify({
      email,
      attributes,
      listIds,
      updateEnabled: true,   // si email existe, on met a jour au lieu de 409
    }),
  })

  // 201 = cree, 204 = mis a jour
  if (res.status === 201) {
    const data = await res.json()
    return { id: data?.id, isCreated: true }
  }
  if (res.status === 204) {
    // Mis a jour, pas de body. On peut fetch le contact pour avoir son id.
    const get = await fetch(`${BREVO_API_URL}/contacts/${encodeURIComponent(email)}`, {
      headers: { 'api-key': apiKey, 'accept': 'application/json' },
    })
    if (get.ok) {
      const data = await get.json()
      return { id: data?.id || null, isCreated: false }
    }
    return { id: null, isCreated: false }
  }

  const errBody = await res.text().catch(() => '')
  throw new Error(`Brevo API ${res.status} : ${errBody}`)
}

// Choisit la liste Brevo selon le mode landing + le type d'utilisateur.
// Teasing → toujours la liste Teasing (unique pour cette phase mysterieuse).
// Reveal  → liste Yoppers OU liste Commercants selon type.
export function pickBrevoListId({ mode_landing, type_utilisateur }) {
  if (mode_landing === 'teasing') {
    return process.env.BREVO_LIST_TEASING_ID || null
  }
  if (type_utilisateur === 'yopper') {
    return process.env.BREVO_LIST_YOPPERS_ID || null
  }
  if (type_utilisateur === 'commercant') {
    return process.env.BREVO_LIST_COMMERCANTS_ID || null
  }
  return null
}
