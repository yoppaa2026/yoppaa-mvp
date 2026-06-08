// lib/turnstile.js — Validation Cloudflare Turnstile cote serveur.
//
// Flow :
//   1. Le widget Turnstile cote client genere un token apres verification du visiteur
//   2. Ce token est envoye dans le body d'un POST a notre API
//   3. On valide le token cote serveur via cette fonction (necessite secret_key)
//   4. Si valide → on traite la requete. Sinon → 401.

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Verifie un token Turnstile.
 * @param {string} token   - Le token recu du widget client
 * @param {string} [ip]    - L'IP du visiteur (optionnel, recommande pour audit)
 * @returns {Promise<{ success: boolean, errorCodes?: string[] }>}
 */
export async function verifyTurnstileToken(token, ip = null) {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    // En dev sans cle configuree, on accepte tout pour ne pas bloquer.
    // En prod la cle DOIT etre presente.
    console.warn('[turnstile] TURNSTILE_SECRET_KEY manquante, validation skip')
    return { success: true, skipped: true }
  }

  if (!token) {
    return { success: false, errorCodes: ['missing-input-response'] }
  }

  const body = new URLSearchParams()
  body.set('secret', secret)
  body.set('response', token)
  if (ip) body.set('remoteip', ip)

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const data = await res.json()
    return {
      success: !!data.success,
      errorCodes: data['error-codes'] || [],
      hostname: data.hostname,
      cdata: data.cdata,
    }
  } catch (e) {
    console.error('[turnstile] verification error', e)
    return { success: false, errorCodes: ['network-error'] }
  }
}
