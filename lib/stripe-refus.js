// POURQUOI LA BANQUE A DIT NON, EN FRANÇAIS.
//
// 🔴 « YOUR CARD WAS DECLINED.. » (Alex, 16/09, essai G5 bis). Le message de
// Stripe partait tel quel dans la fenêtre du restaurateur : en anglais, avec le
// point de la phrase ajouté au point de Stripe. Un restaurateur belge lit ça au
// moment précis où il vient de perdre 120 €, et il ne sait pas s'il doit
// rappeler son client, réessayer plus tard, ou laisser tomber.
//
// ⚠️ ON TRADUIT LE CODE, PAS LA PHRASE. Stripe rend un `decline_code` stable et
// lisible par machine ; sa phrase anglaise, elle, change avec les versions. Et
// chaque traduction dit ce que le restaurateur PEUT FAIRE, parce qu'un refus
// sans suite est une inquiétude sans issue.

const PAR_CODE = {
  insufficient_funds: 'le compte du client n’est pas assez approvisionné. Tu peux réessayer plus tard : la table reste facturable jusqu’à la fin du lendemain.',
  expired_card: 'la carte du client a expiré depuis qu’il l’a enregistrée. Il faudra le contacter directement.',
  incorrect_cvc: 'le code de sécurité de la carte a été refusé. Il faudra contacter le client directement.',
  lost_card: 'la carte a été déclarée perdue. Contacte le client directement.',
  stolen_card: 'la carte a été déclarée volée. Contacte le client directement.',
  card_velocity_exceeded: 'la banque du client a bloqué la carte pour trop d’opérations rapprochées. Réessaie plus tard.',
  processing_error: 'la banque a eu un incident technique. Réessaie dans quelques minutes.',
  do_not_honor: 'la banque du client a refusé sans en dire la raison. Réessaie plus tard, ou contacte-le directement.',
  generic_decline: 'la banque du client a refusé sans en dire la raison. Réessaie plus tard, ou contacte-le directement.',
  // 🔴 CELUI-CI EST À PART : la banque réclame une authentification que
  // PERSONNE ne peut donner, puisque le client n'est pas devant son écran.
  authentication_required: 'la banque réclame que le client authentifie ce paiement, et il n’est pas devant son écran. Il faudra le contacter directement.',
}

// Rend la phrase française du refus, ou `null` si le code est inconnu : dans ce
// cas l'appelant garde le message de Stripe plutôt que d'inventer une raison.
export function raisonRefusFr(erreur) {
  const code = erreur?.decline_code || erreur?.code || null
  return (code && PAR_CODE[code]) || null
}

// Le message complet montré au restaurateur.
//
// ⚠️ DEUX CHOSES QUI NE SE DISCUTENT PAS, ET DANS CET ORDRE : rien n'a été
// facturé, et la table reste non honorée. C'est ce qu'il a besoin de savoir
// avant même la raison, parce que sa première crainte est d'avoir été débité
// pour rien ou d'avoir perdu sa trace.
export function messageRefus(erreur) {
  const traduite = raisonRefusFr(erreur)
  // ⚠️ LE POINT FINAL DE STRIPE EST RETIRÉ : sans ça la phrase se terminait par
  // « declined.. », et deux points de suite se lisent comme une coquille.
  const brut = String(erreur?.message || '').trim().replace(/\.+$/, '')
  const cause = traduite || (brut ? `la banque a répondu « ${brut} »` : 'la banque a refusé sans en dire la raison')
  return `Rien n’a été facturé : ${cause}`
}
