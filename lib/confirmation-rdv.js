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

import {
  resteAEncaisser, retoursAnnulation, libelleRetours, libelleRetoursFaits,
  restitutionNoShow, libelleNoShow,
} from './rdv-paiement'
import { euros } from './montants'
import { libelleBon } from './bons-cadeaux'

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
// ⚠️ `categorie` VIENT DU COMMERÇANT CONNECTÉ : c’est lui qui lit la
// question, et c’est son métier qui nomme le bon (31/08).
export function questionRdv(action, rdv, categorie = null) {
  const qui = nomClient(rdv)
  const quand = quandRdv(rdv)
  const details = quand ? `${qui} · ${quand}` : qui
  // Ce qui reste à encaisser au comptoir : le solde si un acompte est déjà
  // payé, le prix sinon, zéro sur une séance d'abonnement. Le calcul vit dans
  // `rdv-paiement`, avec le reste des règles d'argent.
  const aEncaisser = resteAEncaisser(rdv)

  if (action === 'annule_commercant') {
    // 🔴 CETTE PHRASE NE PARLAIT QUE DE L'ACOMPTE, AU CONDITIONNEL (Alex,
    // 30/08 au soir). Elle couvrait un clic qui rembourse la carte, recrédite
    // le bon, rend la récompense et remet les produits en rayon. Le commerçant
    // engageait quatre gestes d'argent en en lisant un seul, hypothétique.
    //
    // ⚠️ ET LES PRODUITS SE NOMMENT À PART, parce qu'ils ne se remboursent pas
    // comme le reste : c'est de la marchandise mise de côté pour un jour
    // précis, qui repart en rayon. Le commerçant a pu la préparer.
    const r = retoursAnnulation(rdv)
    const liste = libelleRetours(r, categorie)
    const message = liste
      ? `Le client sera prévenu par email, et tout ce qu’il a engagé lui revient : ${liste}.${
        r.produits > 0
          ? ` ${r.articles > 1 ? 'Ses produits' : 'Son produit'} ne ${r.articles > 1 ? 'seront' : 'sera'} pas mis de côté : ${r.articles > 1 ? 'ils repartent' : 'il repart'} en stock.`
          : ''}`
      : 'Le client sera prévenu par email. Il n’a rien avancé pour ce rendez-vous.'
    return {
      titre: 'Annuler ce rendez-vous ?',
      message,
      details,
      actions: [
        // ⚠️ LA PORTE DE SORTIE CONSTRUCTIVE, EN PREMIER. Relevé par Alex le
        // 15/08 : il cherchait à DÉPLACER un rendez-vous et se retrouvait dans
        // la fenêtre d'annulation. Le bouton « Déplacer ce RDV » existe pourtant
        // juste au-dessus dans la fiche, mais quand quelqu'un se trompe de
        // porte, on ne lui répond pas qu'il s'est trompé : on ouvre la bonne.
        // Neuf fois sur dix, un commerçant qui annule veut en réalité décaler.
        { valeur: 'deplacer', ton: 'principal', label: 'Plutôt le déplacer à une autre date' },
        // ⚠️ LES DEUX ANNULATIONS COMMENCENT PAR LE MOT « ANNULER ». Elles ne se
        // ressemblent pas : déplacer son emplacement oblige à libérer les
        // rendez-vous, mais le client n'est pas éconduit, il est invité à
        // reprendre sa place ailleurs. C'est le TEXTE REÇU qui décide laquelle.
        // Ma première version commençait par « Je change d'endroit », et elle se
        // lisait comme un déplacement de rendez-vous : le verbe qui ouvre la
        // phrase doit être celui du geste, jamais celui de la raison.
        { valeur: 'annuler', ton: 'danger', label: 'Annuler, et prévenir le client' },
        { valeur: 'lieu', ton: 'danger', label: 'Annuler, en lui disant que je change d’adresse' },
        { valeur: 'rien', ton: 'neutre', label: 'Ne rien faire' },
      ],
    }
  }
  if (action === 'no_show') {
    // 🔴 « TU GARDES SON ACOMPTE » ÉTAIT FAUX, et deux fois plutôt qu'une.
    //
    // Faux d'abord parce que l'acompte peut valoir zéro pendant que 40 € de bon
    // cadeau ont payé la prestation : le commerçant gardait surtout le bon, et
    // ne le savait pas. Cinquième écran de la famille qui ne parlait que de
    // l'acompte.
    //
    // Faux ensuite parce qu'il ne garde plus tout (décision d'Alex, 30/08 au
    // soir) : **la garantie ne porte que sur l'acompte dû, le reste est
    // restitué**. Quarante euros retenus pour un service non rendu quand la
    // garantie n'en valait que vingt-cinq, ce n'était pas une garantie, c'était
    // une pénalité.
    const part = restitutionNoShow(rdv)
    const { garde, rend } = libelleNoShow(part, categorie)
    const produits = retoursAnnulation(rdv).produits
    const phrases = ['Il sera prévenu']
    if (garde) phrases.push(garde)
    const debut = `${phrases.join(', ')}.`
    // ⚠️ « ON NE SAIT PAS » SE DIT. Un rendez-vous antérieur à la colonne ne
    // porte pas son acompte dû : on ne garde alors que l'argent encaissé, et le
    // commerçant doit comprendre pourquoi le bon repart en entier plutôt que de
    // croire à une erreur.
    const inconnu = !part.connu && part.bonRestitue > 0
      ? ' Ce rendez-vous est antérieur au calcul de la garantie : dans le doute, seul l’argent encaissé reste chez toi.'
      : ''
    const message = garde || rend
      ? `${debut}${rend ? ` En revanche ${rend}.` : ''}${inconnu}${
        produits > 0 ? ' Ses produits restent vendus : ils l’attendent au comptoir.' : ''
      } Le créneau est resté bloqué pour lui.`
      : 'Il sera prévenu. Il n’avait rien avancé, et le créneau est resté bloqué pour lui.'
    return {
      titre: 'Ce client n’est pas venu ?',
      message,
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
  // ⚠️ 'honore' NE DEMANDE PLUS RIEN, IL DEMANDE COMMENT. Le geste normal de
  // fin de rendez-vous n'a jamais mérité une confirmation, et ça n'a pas
  // changé : le faire confirmer douze fois par jour à une professeure de yoga
  // en ferait un réflexe, donc rien du tout.
  //
  // Mais il portait une AFFIRMATION FAUSSE : « Payé 15,00 € » sur la seule foi
  // du bouton vert, sans que personne n'ait dit ni si ni comment l'argent était
  // entré (Alex, 17/08). On ne demande donc pas de confirmer, on demande
  // l'information manquante, et seulement quand il y a de l'argent en jeu.
  if (action === 'honore') {
    return questionEncaissement({ montant: aEncaisser, nom: qui })
  }
  return null
}

// ─── COMMENT L'ARGENT EST ENTRÉ ─────────────────────────────────────────────
//
// ⚠️ « HONORÉ » ET « PAYÉ » ÉTAIENT LE MÊME CLIC (Alex, 17/08 : « le RDV passe
// en payé mais il ne clique sur rien, il devrait cocher quelque chose, cash,
// Bancontact, Payconiq »). Venir n'est pas payer, et le tableau de bord
// affirmait le second sur la foi du premier.
//
// ⚠️ CE N'EST PAS UN FORMULAIRE, C'EST UN TAP. Le montant est déjà connu, il
// n'y a rien à saisir : on choisit par quel moyen. Le geste reste aussi court
// qu'avant, et c'est la condition pour qu'il soit fait douze fois par jour.
//
// ⚠️ ET LA QUESTION NE SE POSE QUE S'IL Y A QUELQUE CHOSE À ENCAISSER. Sur une
// séance d'abonnement, déjà payée à l'achat, la poser serait absurde : elle ne
// se pose pas, et le rendez-vous est simplement honoré.
export function questionEncaissement({ montant = null, nom = null } = {}) {
  const n = Number(montant)
  if (!Number.isFinite(n) || n <= 0) return null
  const somme = `${n.toFixed(2).replace('.', ',')} €`
  return {
    titre: `Comment as-tu encaissé les ${somme} ?`,
    message: 'Yoppaa ne traite pas ce paiement, il l’enregistre : c’est ce qui te permettra de recouper ta caisse et ton terminal en fin de journée.',
    details: nom ? `${nom} · ${somme}` : null,
    actions: [
      { valeur: 'terminal', ton: 'principal', label: `Terminal · ${somme}` },
      { valeur: 'especes', ton: 'principal', label: `Espèces · ${somme}` },
      // ⚠️ CETTE SORTIE-CI HONORE QUAND MÊME. Le client est venu, la séance a
      // eu lieu, et il n'a pas payé : sans ce bouton, le commerçant devrait
      // mentir sur le moyen de paiement pour pouvoir clôturer.
      // ⚠️ SA VALEUR N'EST PAS `rien`, qui veut dire « ne rien faire » PARTOUT
      // ailleurs dans ce module. Deux sorties voisines qui portent le même mot
      // finissent par être confondues dans le code, et l'une des deux écrit en
      // base quand l'autre referme la fenêtre.
      { valeur: 'sans_paiement', ton: 'neutre', label: 'Il n’a rien payé pour l’instant' },
      // La sortie sans aucun effet, toujours en dernier.
      { valeur: 'rien', ton: 'neutre', label: 'Ne rien faire' },
    ],
  }
}

export function confirmationEncaissement(mode, { montant = null, nom = null } = {}) {
  const qui = nom || 'Ce rendez-vous'
  const somme = Number.isFinite(Number(montant))
    ? `${Number(montant).toFixed(2).replace('.', ',')} €`
    : null
  if (mode === 'terminal') return `${qui} est honoré, et ${somme} sont notés sur ton terminal.`
  if (mode === 'especes') return `${qui} est honoré, et ${somme} sont notés en espèces.`
  if (mode === 'rien') return `${qui} est honoré. Rien n’a été encaissé : le montant reste dû, et sa ligne reste en orange pour que tu le retrouves.`
  return `${qui} est honoré.`
}

// ─── CLÔTURER UN COURS ENTIER ───────────────────────────────────────────────
//
// ⚠️ « DANS LA BASE IL FAUT HONORER CHAQUE RDV SÉPARÉMENT, OK OU PAS ? » (Alex,
// 17/08). En base, oui, et il ne faut surtout pas y toucher : chacun est venu ou
// non, et un absent doit rester un absent, sans quoi le no-show, l'acompte
// conservé et le décompte d'abonnement perdent tout leur sens. Mais LE GESTE
// n'a aucune raison de se répéter douze fois en douze fenêtres.
//
// ⚠️ ET CELUI-CI SE DEMANDE, contrairement au geste unitaire juste au-dessus.
// Honorer ne se défait pas (`STATUTS_RDV.honore` n'ouvre aucune action de
// retour), et douze personnes d'un coup n'est plus un réflexe de fin de
// rendez-vous : c'est un acte, il mérite sa question. Une seule, pas douze.
export function questionSeanceHonoree(nb, { montant = 0 } = {}) {
  const n = Number(nb)
  if (!Number.isFinite(n) || n < 1) return null
  const titre = n === 1 ? 'Marquer cette personne comme venue ?' : `Marquer ces ${n} personnes comme venues ?`
  const details = 'Quelqu’un manquait ? Ferme cette fenêtre et note son absence sur sa ligne : les autres resteront à clôturer.'

  // ⚠️ QUAND IL N'Y A RIEN À ENCAISSER, ON NE DEMANDE PAS COMMENT. Un cours de
  // yoga rempli d'abonnées est déjà payé depuis l'achat des contrats : poser la
  // question du moyen de paiement y serait absurde.
  const aEncaisser = Number(montant)
  if (!Number.isFinite(aEncaisser) || aEncaisser <= 0) {
    return {
      titre,
      message: 'Chacune reçoit son email de fin de séance, et son montant entre dans ton chiffre d’affaires. Ce geste ne se défait pas.',
      details,
      actions: [
        { valeur: 'honore', ton: 'principal', label: n === 1 ? 'Oui, elle était là' : 'Oui, tout le monde était là' },
        { valeur: 'rien', ton: 'neutre', label: 'Ne rien faire' },
      ],
    }
  }

  // ⚠️ UN SEUL MOYEN POUR TOUT LE COURS, ET C'EST ÉCRIT. Douze personnes
  // peuvent payer de douze façons ; leur poser la question une par une
  // ramènerait les douze fenêtres qu'on vient de supprimer. Celui qui a payé
  // autrement se corrige sur sa ligne, et la phrase le dit plutôt que de le
  // laisser découvrir.
  const somme = `${aEncaisser.toFixed(2).replace('.', ',')} €`
  return {
    titre,
    message: `Chacune reçoit son email de fin de séance. Il reste ${somme} à encaisser en tout : le moyen que tu choisis vaut pour tout le cours, et se corrige ensuite ligne par ligne si quelqu’un a payé autrement.`,
    details,
    actions: [
      { valeur: 'terminal', ton: 'principal', label: `Oui, et tout au terminal · ${somme}` },
      { valeur: 'especes', ton: 'principal', label: `Oui, et tout en espèces · ${somme}` },
      { valeur: 'sans_paiement', ton: 'neutre', label: 'Oui, mais personne n’a encore payé' },
      { valeur: 'rien', ton: 'neutre', label: 'Ne rien faire' },
    ],
  }
}

// ⚠️ ON NE CONFIRME QUE CE QUI A EU LIEU, ET ON COMPTE. Sur douze écritures,
// deux peuvent échouer : annoncer « c'est fait » ferait fermer l'écran à
// quelqu'un qui croit son cours clôturé alors que deux lignes attendent encore.
export function confirmationSeanceHonoree({ faits = 0, echecs = 0 } = {}) {
  if (faits < 1) return 'Rien n’a pu être enregistré. Vérifie ta connexion et recommence.'
  const debut = faits === 1
    ? '1 personne est marquée comme venue.'
    : `${faits} personnes sont marquées comme venues.`
  if (echecs > 0) {
    return `${debut} En revanche ${echecs === 1 ? '1 ligne n’a pas pu être enregistrée' : `${echecs} lignes n’ont pas pu être enregistrées`} : rouvre le cours pour les reprendre.`
  }
  return `${debut} Leur montant entre dans ton chiffre d’affaires du jour.`
}

// Ce qu'on lit APRÈS. « C'est noté ! » est la formule des rendez-vous sur tout
// le projet, « Yoppé ! » étant réservée au Click and Collect.
// ⚠️ `categorie` VIENT DU COMMERÇANT CONNECTÉ, pas du rendez-vous : c'est lui
// qui lit cette confirmation, et c'est son métier qui nomme le bon (31/08).
export function confirmationRdv(action, { rdv, raison, retours = null, categorie = null } = {}) {
  const qui = nomClient(rdv)
  if (action === 'annule_commercant') {
    // 🔴 CETTE PHRASE NE PARLAIT PAS D'ARGENT DU TOUT (Alex, 30/08 au soir).
    // Le commerçant venait de déclencher 26,90 € de remboursement, 40 € de bon
    // recrédité et 10 € de récompense rendue, et lisait « il vient d'en être
    // prévenu par email ». Les montants viennent de la ROUTE : elle seule sait
    // ce que Stripe a réellement repris, et si le remboursement a échoué.
    const base = raison === 'lieu'
      ? `Le rendez-vous de ${qui} est annulé. Il reçoit un message lui disant que tu changes d’endroit et l’invitant à reprendre sa place.`
      : `Le rendez-vous de ${qui} est annulé. Il vient d’en être prévenu par email.`
    return `${base}${retours ? libelleRetoursFaits({ ...retours, categorie }) : ''}`
  }
  // 🔴 ET APRÈS LE CLIC, CE QUI EST RÉELLEMENT PARTI. « Tu gardes son acompte »
  // annonçait un geste qui n'a plus lieu tel quel : depuis le 30/08 au soir, ce
  // qui dépasse la garantie retourne au client, et c'est la ROUTE qui sait
  // combien.
  if (action === 'no_show') {
    const base = `${qui} est noté absent, et le créneau est libéré.`
    if (!retours) return base
    const bon = Number(retours.bon_restitue) || 0
    const rec = Number(retours.recompense_rendue) || 0
    const bouts = []
    if (bon > 0) bouts.push(`${euros(bon)} retournent sur son ${libelleBon(categorie)}`)
    if (rec > 0) bouts.push(`${euros(rec)} sur sa carte de fidélité`)
    const garde = Number(retours.garantie) || 0
    const debut = garde > 0 ? ` Tu gardes ${euros(garde)} de garantie.` : ''
    return bouts.length
      ? `${base}${debut} ${bouts.length > 1 ? `${bouts.slice(0, -1).join(', ')} et ${bouts[bouts.length - 1]}` : bouts[0]}.`
      : `${base}${debut}`
  }
  if (action === 'confirme') return `Le rendez-vous de ${qui} est de nouveau confirmé.`
  if (action === 'honore') return `Le rendez-vous de ${qui} est marqué comme honoré.`
  if (action === 'deplace') return `Le rendez-vous de ${qui} est déplacé. Il reçoit la nouvelle date et son calendrier se met à jour tout seul.`
  return ''
}

// Le choix de la fenêtre, traduit en ce que le tableau de bord sait faire.
// `null` veut dire « ne rien faire », et c'est un résultat comme un autre.
export function statutDepuisChoix(action, choix) {
  if (choix === 'rien') return null
  // ⚠️ DÉPLACER N'ÉCRIT RIEN ICI. C'est une SORTIE de la fenêtre d'annulation
  // vers l'écran de déplacement : rendre un statut ferait annuler le rendez-vous
  // au moment précis où le commerçant demande à le garder.
  if (choix === 'deplacer') return null
  if (action === 'annule_commercant') {
    return { statut: 'annule_commercant', raison: choix === 'lieu' ? 'lieu' : 'commercant' }
  }
  if (action === 'no_show' && choix === 'no_show') return { statut: 'no_show', raison: 'commercant' }
  if (action === 'confirme' && choix === 'confirme') return { statut: 'confirme', raison: 'commercant' }
  // ⚠️ HONORER ÉCRIT MAINTENANT DEUX CHOSES EN UNE SEULE FOIS : le statut, et
  // comment l'argent est entré. Deux écritures séparées laisseraient une
  // fenêtre où le rendez-vous est honoré sans son encaissement, et c'est
  // exactement l'état qu'on cherche à faire disparaître.
  //
  // `sans_paiement` honore aussi : le client est venu et n'a pas payé.
  if (action === 'honore') {
    if (choix === 'terminal' || choix === 'especes') {
      return { statut: 'honore', raison: 'commercant', encaisse: choix }
    }
    if (choix === 'sans_paiement') {
      return { statut: 'honore', raison: 'commercant', encaisse: 'rien' }
    }
    return null
  }
  return null
}
