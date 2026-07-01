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

// Format BCE pour affichage : "0xxx.xxx.xxx" sans BE prefix.
// Utile pour les inputs ou rendus compacts.
export function formaterBCECompact(raw) {
  if (!raw || raw.length !== 10) return raw || ''
  return `${raw.slice(0, 4)}.${raw.slice(4, 7)}.${raw.slice(7, 10)}`
}
