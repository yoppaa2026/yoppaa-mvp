// OÙ ALLER APRÈS LA CONNEXION : UNE ADRESSE DE YOPPAA, ET RIEN D'AUTRE (29/09).
//
// 🔴 LE `?next=` N'ÉTAIT JAMAIS VÉRIFIÉ. `/login` et `/auth/session` y
// envoyaient tels quels : un lien « yoppaa.app/auth/session?next=https://… »,
// ouvert par quelqu'un de connecté, le menait sur un autre site, avec la
// confiance que donne une adresse yoppaa.app. Trouvé en branchant
// l'invitation de l'équipe sur ce chemin.
//
// ✅ SEUL UN CHEMIN INTERNE PASSE : il commence par un seul « / ». Tout le
// reste retombe sur l'adresse par défaut :
//   • « https://… » et « //site » (adresse sans protocole, même effet) ;
//   • « /\site » : certains navigateurs lisent la barre oblique inverse comme
//     une barre normale, donc comme « //site » ;
//   • « javascript:… » et toute adresse qui n'est pas un chemin ;
//   • les caractères de contrôle, qu'un navigateur peut ignorer en silence.

/**
 * @param {string|null|undefined} demande  la valeur de `?next=`
 * @param {string} defaut                  où aller si elle ne convient pas
 * @returns {string} un chemin interne
 */
export function cheminInterne(demande, defaut = '/dashboard') {
  const s = typeof demande === 'string' ? demande : ''
  if (!s.startsWith('/')) return defaut
  if (s.startsWith('//') || s.startsWith('/\\')) return defaut
  for (const c of s) {
    const n = c.charCodeAt(0)
    if (n < 32 || n === 127) return defaut
  }
  return s
}
