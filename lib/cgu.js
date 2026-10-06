// Les CGU commerçant : la version en vigueur, et ce qui dit si elle est acceptée.
//
// 🔴 ELLES N'ÉTAIENT JAMAIS ACCEPTÉES (relevé du 06/10, décision d'Alex) : ni
// case ni trace. Depuis, l'inscription demande de cocher, et un commerçant
// déjà inscrit accepte une fois à sa prochaine connexion. Le SERVEUR écrit
// l'acceptation (`/api/commercant/accepter-cgu`), avec son heure, et la garde
// dans un journal (MIGRATION_CGU_COMMERCANT.sql).
//
// ⚠️ CHANGER LES CGU COMMERÇANT = CHANGER CETTE VERSION. Tous les commerçants
// devront alors les accepter de nouveau à leur prochaine connexion : c'est
// voulu, une modification opposable doit être acceptée. La valeur suit la
// date « Dernière mise à jour » de la page légale.

export const CGU_COMMERCANT_VERSION = '2026-10-06'
export const LIEN_CGU_COMMERCANT = '/legal#cgu-commercant'

/** Ce commerçant a-t-il accepté la version en vigueur ? */
export function cguAJour(commercant) {
  return commercant?.cgu_version === CGU_COMMERCANT_VERSION
}
