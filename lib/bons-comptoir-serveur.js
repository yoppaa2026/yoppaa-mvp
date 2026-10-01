// ENCAISSER UN BON CADEAU AU COMPTOIR, CÔTÉ SERVEUR (équipe, étape 5, 01/10).
//
// Le patron le faisait DEPUIS SON NAVIGATEUR, en deux écritures sans lien :
// le mouvement, puis le solde recalculé à partir de ce que l'écran avait lu.
// Deux clics rapprochés, ou le patron et un membre sur deux appareils,
// débitaient donc deux fois le même argent. Et un membre de l'équipe n'a
// aucun accès aux bons : il fallait de toute façon passer par le serveur.
//
// Une seule fonction, pour le patron ET la case « Comptoir » :
//   • `chercherBonComptoir` : le code tapé → le bon, s'il est utilisable ;
//   • `debiterBonComptoir`  : retire un montant du solde, UNE fois.
//
// 🔴 L'ÉCRITURE NE PASSE QUE SI LE SOLDE EST ENCORE CELUI QU'ON A LU. Le
// second débit simultané trouve un solde qui a bougé et il est refusé : il
// doit relire, et le caissier voit le vrai reste.
//
// ⚠️ LE SOLDE D'ABORD, LE MOUVEMENT ENSUITE : si le mouvement échoue, le solde
// est remis tel qu'il était (même garde), et l'erreur remonte. Le pire cas
// est un débit refusé, jamais un débit sans trace.

import { normaliserCodeBon } from './bons-cadeaux'

export const COLONNES_BON_COMPTOIR = 'id, commercant_id, code, montant_initial, solde, statut, expires_at, beneficiaire_prenom, acheteur_prenom'

export const REFUS_BON = {
  format: 400, introuvable: 404, expire: 409, epuise: 409, montant: 400, depasse: 409, deja_fait: 409,
}

const arrondi = (n) => Math.round(Number(n) * 100) / 100
const expire = (bon, maintenant) => !!bon.expires_at && new Date(bon.expires_at) < maintenant

function verifierUtilisable(bon, maintenant) {
  if (!bon || bon.statut !== 'actif') return { ok: false, code: 'introuvable', message: 'Aucun bon actif avec ce code chez toi.' }
  if (expire(bon, maintenant)) {
    return { ok: false, code: 'expire', message: `Ce bon a expiré le ${new Date(bon.expires_at).toLocaleDateString('fr-BE')}.` }
  }
  if (!(Number(bon.solde) > 0)) return { ok: false, code: 'epuise', message: 'Ce bon est entièrement utilisé.' }
  return { ok: true }
}

/** Le bon d'un code, s'il appartient à ce commerce et peut encore servir. */
export async function chercherBonComptoir(admin, { commercantId, code, maintenant = new Date() }) {
  const normalise = normaliserCodeBon(code)
  if (!normalise) return { ok: false, code: 'format', message: 'Format attendu : BC-XXXX-XXXX' }
  const { data: bon, error } = await admin.from('bons_cadeaux').select(COLONNES_BON_COMPTOIR)
    .eq('commercant_id', commercantId).eq('code', normalise).maybeSingle()
  if (error) throw new Error(`lecture du bon : ${error.message}`)
  const v = verifierUtilisable(bon, maintenant)
  if (!v.ok) return v
  return { ok: true, bon }
}

/** Retire `montant` du solde, une seule fois. Rend le bon relu. */
export async function debiterBonComptoir(admin, { commercantId, bonId, montant, maintenant = new Date() }) {
  const m = arrondi(String(montant ?? '').replace(',', '.'))
  if (!Number.isFinite(m) || m <= 0) return { ok: false, code: 'montant', message: 'Indique le montant de l’achat à déduire.' }

  const { data: bon, error } = await admin.from('bons_cadeaux').select(COLONNES_BON_COMPTOIR)
    .eq('id', bonId).eq('commercant_id', commercantId).maybeSingle()
  if (error) throw new Error(`lecture du bon : ${error.message}`)
  const v = verifierUtilisable(bon, maintenant)
  if (!v.ok) return v
  const solde = arrondi(bon.solde)
  if (m > solde) return { ok: false, code: 'depasse', message: `Le solde du bon est de ${solde.toFixed(2).replace('.', ',')} €.` }

  const nouveau = arrondi(solde - m)
  const { data: ecrit, error: errUp } = await admin.from('bons_cadeaux')
    .update({ solde: nouveau, updated_at: maintenant.toISOString() })
    .eq('id', bon.id).eq('commercant_id', commercantId).eq('statut', 'actif').eq('solde', bon.solde)
    .select('id').maybeSingle()
  if (errUp) throw new Error(`solde non mis à jour : ${errUp.message}`)
  if (!ecrit) return { ok: false, code: 'deja_fait', message: 'Ce bon vient d’être utilisé ailleurs. Cherche-le à nouveau pour voir son solde.' }

  const { error: errMvt } = await admin.from('bons_cadeaux_mouvements').insert({ bon_id: bon.id, montant: -m, source: 'comptoir' })
  if (errMvt) {
    // On remet le solde, seulement s'il est encore celui qu'on vient d'écrire.
    await admin.from('bons_cadeaux').update({ solde: bon.solde }).eq('id', bon.id).eq('solde', nouveau)
    throw new Error(`mouvement non écrit, débit annulé : ${errMvt.message}`)
  }
  return { ok: true, bon: { ...bon, solde: nouveau }, debite: m }
}
