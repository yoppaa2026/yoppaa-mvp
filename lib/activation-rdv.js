// ─── Ouvrir la prise de rendez-vous aux clients ──────────────────────────────
//
// ⚠️ LE DÉFAUT D'ORIGINE, TROUVÉ PAR ALEX LE 15/08 : `rdv_actif` n'était écrit
// QUE depuis `/admin`. Ni le signup, ni aucune route, ni le profil ne le
// posaient jamais. Un commerçant vitrine pouvait encoder ses prestations, ses
// praticiens et ses créneaux jusqu'au bout, et sa fiche continuait d'annoncer
// à ses clients qu'il « n'a pas encore activé la prise de RDV », en les
// invitant à téléphoner. Aucun écran ne lui disait qu'il manquait un
// interrupteur, et aucun écran ne le lui proposait : une impasse complète, qui
// aurait frappé chaque vrai commerçant à l'ouverture.
//
// ⚠️ ET L'ACTIVATION RESTE UN GESTE VOLONTAIRE (décision d'Alex, 15/08). On
// encode souvent bien avant d'être prêt à recevoir : ouvrir tout seul dès la
// première prestation exposerait un agenda que personne n'a relu.

// Ce qu'il faut avoir posé avant d'ouvrir. La règle est courte parce que le
// mal qu'elle évite est simple : une page de réservation vide est PIRE qu'une
// page fermée. Fermée, le client téléphone ; vide, il croit qu'il n'y a jamais
// de place et il s'en va.
//
// La forme `!(n > 0)` dit ce qu'on veut savoir : « sait-on qu'il y en a au
// moins un ? ». Un compte absent, `null` ou `undefined`, bloque donc
// l'ouverture au même titre qu'un compte à zéro, ce qui est le bon réflexe
// quand l'inventaire n'est pas encore revenu de la base.
//
// ⚠️ Mesuré : sur le domaine réel de cette fonction, `null` ou un entier
// positif ou nul, `!n` se comporterait EXACTEMENT pareil. La mutation a été
// jouée et n'a rien cassé. On garde la forme longue parce qu'elle exprime la
// question, pas parce qu'elle protège de quelque chose : le banc ne prétend
// donc rien tenir de plus ici.
export function peutActiverRdv({ prestationsActives, creneaux } = {}) {
  const manque = []
  if (!(prestationsActives > 0)) manque.push('prestation')
  if (!(creneaux > 0)) manque.push('creneau')
  return { ok: manque.length === 0, manque, message: messageActivationRdv(manque) }
}

// Le message nomme CE QUI MANQUE, jamais « configuration incomplète ». Un
// commerçant qui lit « il manque quelque chose » referme l'écran.
export function messageActivationRdv(manque = []) {
  const sansPrestation = manque.includes('prestation')
  const sansCreneau = manque.includes('creneau')
  if (sansPrestation && sansCreneau) {
    return 'Ajoute au moins une prestation et une plage de rendez-vous avant d’ouvrir les réservations.'
  }
  if (sansPrestation) return 'Ajoute au moins une prestation avant d’ouvrir les réservations.'
  if (sansCreneau) return 'Ajoute au moins une plage de rendez-vous avant d’ouvrir les réservations.'
  return ''
}

// Ce que la bannière raconte, selon le moment où le commerçant tombe dessus.
// Trois états et pas deux : « prêt à ouvrir » et « il te manque encore quelque
// chose » n'appellent pas du tout le même geste.
export function etatActivationRdv({ rdvActif, prestationsActives, creneaux } = {}) {
  if (rdvActif === true) return { etat: 'ouvert', titre: '', message: '', peutOuvrir: false }
  const { ok, manque, message } = peutActiverRdv({ prestationsActives, creneaux })
  if (ok) {
    return {
      etat: 'pret',
      titre: 'Tes clients ne peuvent pas encore réserver',
      message: 'Tout est prêt de ton côté. Ouvre les réservations pour que ta fiche accepte les rendez-vous.',
      peutOuvrir: true,
      manque: [],
    }
  }
  return {
    etat: 'incomplet',
    titre: 'Tes clients ne peuvent pas encore réserver',
    message,
    peutOuvrir: false,
    manque,
  }
}
