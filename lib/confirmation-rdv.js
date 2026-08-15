// ─── Ce qu'on demande avant d'agir sur un rendez-vous, et ce qu'on répond ────
//
// ⚠️ CE QUE CE MODULE REMPLACE. Annuler un rendez-vous enchaînait DEUX
// `window.confirm()`. Le second demandait « Est-ce parce que tu déplaces cet
// endroit ? » avec pour seules réponses OK et Annuler, où « Annuler » voulait
// dire « annulation ordinaire », donc CONTINUER. Relevé par Alex le 15/08 :
// « ok pour déplacer, annuler pour annuler ». Un bouton dont le mot dit le
// contraire de ce qu'il fait est une fausse manœuvre qui attend son tour.
//
// Les textes vivent ICI, purs, pour que le banc les EXÉCUTE et les relise, au
// lieu de chercher des phrases dans du JSX.

// Le nom du client tel qu'on l'écrit partout, sans laisser « undefined ».
export function nomClient(rdv) {
  const complet = [rdv?.client_prenom, rdv?.client_nom].filter(Boolean).join(' ').trim()
  return complet || 'ce client'
}

// « le mardi 17 août à 10:00 ». Midi en dur dans la conversion : une date lue à
// minuit UTC recule d'un jour chez nous en hiver.
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function quandRdv(rdv) {
  const iso = rdv?.date_rdv
  const heure = (rdv?.heure_debut || '').slice(0, 5)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return heure || ''
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return heure || ''
  const jour = `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`
  return heure ? `${jour} à ${heure}` : jour
}

// ⚠️ AUCUN BOUTON NE S'APPELLE « OK » NI « ANNULER ». Sur un écran d'annulation,
// « Annuler » ne veut plus rien dire : on ne sait pas si l'on annule le
// rendez-vous ou la question. Chaque bouton porte la phrase de ce qu'il fait, et
// le geste qui ne touche à rien est toujours le dernier.
export function questionRdv(action, rdv) {
  const qui = nomClient(rdv)
  const quand = quandRdv(rdv)
  const details = quand ? `${qui} · ${quand}` : qui

  if (action === 'annule_commercant') {
    return {
      titre: 'Annuler ce rendez-vous ?',
      message: 'Le client sera prévenu par email, et son acompte lui sera remboursé s’il en avait payé un.',
      details,
      actions: [
        // ⚠️ LES DEUX ANNULATIONS SUR LE MÊME ÉCRAN, ET NOMMÉES. Elles ne se
        // ressemblent pas : déplacer son emplacement oblige à libérer les
        // rendez-vous, mais le client n'est pas éconduit, il est invité à
        // reprendre sa place ailleurs. C'est le TEXTE REÇU qui décide laquelle,
        // et c'était jusqu'ici caché derrière un « OK » de seconde fenêtre.
        { valeur: 'annuler', ton: 'danger', label: 'Oui, annuler ce rendez-vous' },
        { valeur: 'lieu', ton: 'principal', label: 'Je change d’endroit, invite-le à reprendre sa place' },
        { valeur: 'rien', ton: 'neutre', label: 'Ne rien faire' },
      ],
    }
  }
  if (action === 'no_show') {
    return {
      titre: 'Ce client n’est pas venu ?',
      message: 'Il sera prévenu, et tu gardes son acompte : le créneau est resté bloqué pour lui.',
      details,
      actions: [
        { valeur: 'no_show', ton: 'danger', label: 'Oui, il n’est pas venu' },
        { valeur: 'rien', ton: 'neutre', label: 'Ne rien faire' },
      ],
    }
  }
  if (action === 'confirme') {
    return {
      titre: 'Remettre ce rendez-vous en confirmé ?',
      message: 'Il redeviendra actif dans ton agenda, à sa date et à son heure.',
      details,
      actions: [
        { valeur: 'confirme', ton: 'principal', label: 'Oui, le remettre en confirmé' },
        { valeur: 'rien', ton: 'neutre', label: 'Ne rien faire' },
      ],
    }
  }
  // 'honore' ne demande rien : c'est le geste normal de fin de rendez-vous, et
  // le faire confirmer douze fois par jour à une professeure de yoga
  // transformerait la confirmation en réflexe, donc en rien du tout.
  return null
}

// Ce qu'on lit APRÈS. « C'est noté ! » est la formule des rendez-vous sur tout
// le projet, « Yoppé ! » étant réservée au Click and Collect.
export function confirmationRdv(action, { rdv, raison } = {}) {
  const qui = nomClient(rdv)
  if (action === 'annule_commercant') {
    return raison === 'lieu'
      ? `Le rendez-vous de ${qui} est annulé. Il reçoit un message lui disant que tu changes d’endroit et l’invitant à reprendre sa place.`
      : `Le rendez-vous de ${qui} est annulé. Il vient d’en être prévenu par email.`
  }
  if (action === 'no_show') return `${qui} est noté absent. Le créneau est libéré et tu gardes son acompte.`
  if (action === 'confirme') return `Le rendez-vous de ${qui} est de nouveau confirmé.`
  if (action === 'honore') return `Le rendez-vous de ${qui} est marqué comme honoré.`
  if (action === 'deplace') return `Le rendez-vous de ${qui} est déplacé. Il reçoit la nouvelle date et son calendrier se met à jour tout seul.`
  return ''
}

// Le choix de la fenêtre, traduit en ce que le tableau de bord sait faire.
// `null` veut dire « ne rien faire », et c'est un résultat comme un autre.
export function statutDepuisChoix(action, choix) {
  if (choix === 'rien') return null
  if (action === 'annule_commercant') {
    return { statut: 'annule_commercant', raison: choix === 'lieu' ? 'lieu' : 'commercant' }
  }
  if (action === 'no_show' && choix === 'no_show') return { statut: 'no_show', raison: 'commercant' }
  if (action === 'confirme' && choix === 'confirme') return { statut: 'confirme', raison: 'commercant' }
  return null
}
