// La déclaration sur l'honneur du commerçant : le texte, sa version, et ce qui
// dit si elle est faite.
//
// 🔴 ELLE REMPLACE LA CARTE D'IDENTITÉ (décision d'Alex, 09/10, « socle
// minimal »). La carte ne prouvait rien : personne ne la comparait à rien, elle
// faisait abandonner des inscriptions, et elle nous obligeait à garder des
// pièces d'identité. Ce qui protège réellement :
//   1. le numéro BCE, contrôlé (modulo 97) puis vérifié par Yoppaa sur le
//      registre public ;
//   2. cette déclaration, PROUVÉE : le serveur garde le texte exact, le numéro
//      et les noms déclarés, l'heure, l'adresse IP et le navigateur
//      (`declarations_honneur`, MIGRATION_VERIFICATION_1) ;
//   3. Stripe, qui vérifie l'identité de quiconque encaisse en ligne.
//
// ⚠️ CHANGER LE TEXTE = CHANGER LA VERSION. Tous les commerçants devront alors
// déclarer de nouveau à leur prochaine connexion : une déclaration vaut pour
// le texte qu'on a montré, pas pour celui qu'on a écrit ensuite.
//
// ⚠️ LE TEXTE EST CONSTRUIT ICI, ET NULLE PART AILLEURS : l'écran l'affiche, le
// serveur l'enregistre, à partir de la même fonction. Deux textes écrits à
// deux endroits finiraient par ne plus dire la même chose, et la preuve
// porterait sur un texte que personne n'a lu.

import { validerBCE, formaterBCECompact } from './kyb'

export const DECLARATION_VERSION = '2026-10-09'

export const LIEN_BCE_PUBLIC = 'https://kbopub.economie.fgov.be/kbopub/zoeknummerform.html?lang=fr'

/** La fiche du registre public pour ce numéro, ou null s'il n'est pas valide. */
export function lienFicheBCE(bce) {
  const v = validerBCE(typeof bce === 'string' ? bce : '')
  if (!v.valide) return null
  return `https://kbopub.economie.fgov.be/kbopub/toonondernemingps.html?ondernemingsnummer=${v.raw}&lang=fr`
}

/**
 * Le texte exact de la déclaration, avec les noms et le numéro déclarés.
 * Rend null tant qu'il manque quelque chose : on ne fait pas déclarer un texte
 * à trous.
 */
export function texteDeclaration({ prenom, nom, bce, commerce }) {
  const p = (prenom || '').trim()
  const n = (nom || '').trim()
  const c = (commerce || '').trim()
  const v = validerBCE(typeof bce === 'string' ? bce : '')
  if (p.length < 2 || n.length < 2 || !c || !v.valide) return null
  return `Je déclare sur l’honneur être ${p} ${n}, représentant légal de l’entreprise `
    + `inscrite à la Banque-Carrefour des Entreprises sous le numéro ${formaterBCECompact(v.raw)}, `
    + `ou être mandaté par elle pour inscrire le commerce « ${c} » sur Yoppaa. `
    + `Je déclare que les informations de ce compte sont exactes. Je sais qu’une fausse `
    + `déclaration entraîne la fermeture du compte et peut faire l’objet de poursuites.`
}

/** Ce commerçant a-t-il fait la déclaration en vigueur ? */
export function declarationAJour(commercant) {
  return commercant?.declaration_version === DECLARATION_VERSION
}

/**
 * L'adresse IP et le navigateur de l'appelant, tels que Vercel les transmet.
 * ⚠️ LE PREMIER ÉLÉMENT de `x-forwarded-for` est le client ; les suivants sont
 * les relais. Bornés en longueur : ce sont des en-têtes que l'appelant écrit.
 */
export function origineRequete(headers) {
  const lire = (k) => (typeof headers?.get === 'function' ? headers.get(k) : null) || ''
  const ip = (lire('x-forwarded-for').split(',')[0] || lire('x-real-ip')).trim().slice(0, 64) || null
  const navigateur = lire('user-agent').trim().slice(0, 400) || null
  return { ip, navigateur }
}
