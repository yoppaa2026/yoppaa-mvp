// ════════════════════════════════════════════════════════════════════
// Helpers KYB (Know Your Business) — Belgique
//
// validerBCE(input) : valide le format d'un numero d'entreprise belge
//   selon l'algorithme officiel (checksum modulo 97). Retourne :
//     { valide: boolean, formate: string|null, raw: string }
//   - "formate" est au format canonique "BE 0xxx.xxx.xxx"
//   - "raw" est la suite de 10 chiffres sans separateurs (utile pour la DB)
//
// Numero d'entreprise BE :
//   - 10 chiffres
//   - commence par 0 (personnes morales et la plupart des societes) ou
//     1 (recemment introduit pour les nouvelles personnes morales depuis
//     que les ranges 0xxx sont presque epuises)
//   - Les 2 derniers chiffres = 97 - (8 premiers chiffres modulo 97)
//
// Reference : https://economie.fgov.be/fr/themes/entreprises/banque-carrefour-des
// ════════════════════════════════════════════════════════════════════

export function validerBCE(input) {
  if (!input || typeof input !== 'string') {
    return { valide: false, formate: null, raw: '', raison: 'vide' }
  }
  // Retire tous caracteres non-numeriques (espaces, points, BE prefix...)
  const raw = input.replace(/\D/g, '')
  if (raw.length !== 10) {
    return { valide: false, formate: null, raw, raison: 'longueur' }
  }
  if (!/^[01]/.test(raw)) {
    return { valide: false, formate: null, raw, raison: 'prefixe' }
  }
  const debut = parseInt(raw.slice(0, 8), 10)
  const check = parseInt(raw.slice(8, 10), 10)
  const expected = 97 - (debut % 97)
  if (expected !== check) {
    return { valide: false, formate: null, raw, raison: 'checksum' }
  }
  // Format canonique : "BE 0xxx.xxx.xxx"
  const formate = `BE ${raw.slice(0, 4)}.${raw.slice(4, 7)}.${raw.slice(7, 10)}`
  return { valide: true, formate, raw, raison: null }
}

// Valide un IBAN belge (format BE + 14 chiffres, checksum mod 97)
// Utile pour S6 (Stripe Connect Express).
export function validerIBANBelge(input) {
  if (!input || typeof input !== 'string') return false
  const clean = input.replace(/\s+/g, '').toUpperCase()
  if (!/^BE\d{14}$/.test(clean)) return false
  // Reorganise : 4 derniers caracteres en debut + lettres -> chiffres
  const reorg = clean.slice(4) + clean.slice(0, 4)
  const numeric = reorg.replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55))
  // Modulo 97 en gros chiffres (string) car > 2^53
  let remainder = 0
  for (const d of numeric) {
    remainder = (remainder * 10 + parseInt(d, 10)) % 97
  }
  return remainder === 1
}

// ═══════════════════════════════════════
// LE NUMERO DE TVA, DEDUIT DU NUMERO D'ENTREPRISE (22/09)
// ═══════════════════════════════════════
//
// 🔴 EN BELGIQUE, LES DEUX NUMEROS SONT LE MEME. Le numero de TVA d'une
// entreprise belge assujettie, c'est son numero d'entreprise prefixe de "BE".
// Le demander une seconde fois au commercant, ce serait lui faire ressaisir ce
// qu'il a deja donne, et surtout ouvrir la porte a DEUX numeros qui se
// contredisent sans que personne ne le voie.
//
// ⚠️ ET CE NUMERO SORT DE YOPPAA. C est BILLIT qui emet les factures et les
// envoie par Peppol (decision d Alex, 10/09 : « Stripe encaisse, Billit
// facture ») : Yoppaa lui fournit les coordonnees, et une faute de frappe ici
// devient une facture que Billit envoie au mauvais identifiant.
//
// Decision d'Alex, 22/09 : deduit, jamais saisi. Aucune colonne, aucune
// migration, aucune divergence possible.
//
// ⚠️ ET ETRE ASSUJETTI EST UNE AUTRE QUESTION. Un commerce en franchise de TVA
// (petites entreprises) a un numero d'entreprise et PAS de numero de TVA a
// faire figurer. C'est `commercants.tva_assujetti` qui tranche, et cette
// fonction ne la lit pas : elle rend la FORME du numero, l'appelant decide s'il
// y a lieu de l'afficher. Melanger les deux ferait afficher une TVA a qui n'en
// a pas, ce qui est une mention fausse sur un document comptable.
//
// ⚠️ FORMAT COMPACT, SANS ESPACE NI POINT : c'est celui qu'attendent Peppol et
// Stripe. Pour l'ecran, `validerBCE().formate` rend "BE 0xxx.xxx.xxx", qui se
// lit mieux et ne sert qu'a etre lu.
export function numeroTvaBelge(bce) {
  const { valide, raw } = validerBCE(typeof bce === 'string' ? bce : '')
  if (!valide) return null
  return `BE${raw}`
}

// Format BCE pour affichage : "0xxx.xxx.xxx" sans BE prefix.
// Utile pour les inputs ou rendus compacts.
export function formaterBCECompact(raw) {
  if (!raw || raw.length !== 10) return raw || ''
  return `${raw.slice(0, 4)}.${raw.slice(4, 7)}.${raw.slice(7, 10)}`
}
