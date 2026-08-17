// CE QUE LE COMMERÇANT DOIT SAVOIR QUAND LE CLIENT SE PRÉSENTE : est-ce payé ?
//
// ⚠️ RIEN NE LE DISAIT (Alex, 17/08 : « rien n'indique au commerçant si payé ou
// pas, pas très clair tout ça »). L'agenda affichait un montant nu, et un
// montant nu ne répond pas à la seule question qui se pose au comptoir : « je
// lui demande de l'argent, ou pas ? »
//
// ⚠️ ET LE MONTANT NE SUFFIT PAS NON PLUS : IL FAUT LE STATUT. Deuxième passe le
// 17/08, sur une capture d'Alex où un rendez-vous marqué « ✓ Honoré » portait
// encore « 15,00 € à encaisser ». Le module ne lisait QUE l'argent, jamais le
// statut, donc il parlait au futur sur un rendez-vous déjà passé, il réclamait
// de l'argent sur un rendez-vous ANNULÉ, et il n'a jamais fait le lien avec le
// chiffre d'affaires alors que c'est le même euro. Une phrase juste hier
// devient fausse demain si elle ignore le temps.
//
// Le rendez-vous a donc TROIS temps, et chacun appelle une phrase différente :
//
//   • à venir (confirmé)      → ce qu'il faudra demander
//   • fait (honoré)           → ce qui est entré en caisse, et dans le CA
//   • sans suite (no-show,
//     annulé)                 → ce qu'il ne faut PLUS demander
//
// Et dans chacun, quatre situations d'argent : séance d'ABONNEMENT (payée à
// l'achat), acompte PAYÉ (le solde seulement), acompte EN ATTENTE (le tout),
// aucun acompte (le prix).
//
// ⚠️ LE PIÈGE DU ZÉRO, POUR LA QUATRIÈME FOIS SUR CE PROJET. Une séance
// d'abonnement porte `prix_estime: 0`, pour ne pas multiplier le chiffre
// d'affaires du commerçant par trente-six. L'agenda affichait donc « 0€ »,
// exactement le mensonge déjà corrigé côté cliente et jamais côté commerçant :
// ce n'est pas gratuit, c'est compris. On interroge l'ABSENCE de contrat, pas
// le nombre.

const euros = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`

// ─── LE CODE COULEUR, ET IL EST FIXE ─────────────────────────────────────────
//
// ⚠️ « IL FAUT DISTINGUER DU PREMIER COUP D'ŒIL QUI EST EN ABO ET QUI DOIT
// PAYER, c'est essentiel, idem pour un coiffeur : payé, à payer ou
// partiellement payé. Ça doit lui prendre 1 seconde, Odoo mind » (Alex, 17/08).
//
// Une phrase se lit, une couleur se voit. Sur une liste de douze lignes, le
// commerçant ne lit pas : il balaie une colonne de pastilles et s'arrête sur
// celles qui appellent un geste. D'où CINQ états, jamais plus, chacun avec sa
// couleur et son MOT D'ÉTAT EN TÊTE du libellé — « À payer 15,00 € » et non
// « 15,00 € à encaisser », parce que le premier mot est le seul qu'on lit
// quand on va vite.
//
//   violet  ABONNEMENT   → réglé d'avance par contrat, ne rien demander
//   vert    PAYÉ         → l'argent est entré
//   ambre   PARTIEL      → une part seulement, il reste un solde
//   orange  À PAYER      → il faut encaisser, c'est le seul qui appelle un geste
//   gris    RIEN         → le rendez-vous n'aura pas lieu, on ne demande rien
//
// ⚠️ Le rouge n'est PAS utilisé : sur ce projet il est réservé à ce qui
// détruit. Un client qui doit payer n'est pas un incident.
export const COULEURS_PAIEMENT = {
  abonnement: { texte: '#6B35C4', fond: '#EDE0FF', bord: '#6B35C444' },
  paye:       { texte: '#065F46', fond: '#D1FAE5', bord: '#10B98144' },
  partiel:    { texte: '#78350F', fond: '#FEF3C7', bord: '#F59E0B55' },
  du:         { texte: '#9A3412', fond: '#FFEDD5', bord: '#EA580C55' },
  rien:       { texte: '#6B7280', fond: '#F3F4F6', bord: '#9CA3AF44' },
}

export function couleurPaiement(etat) {
  return COULEURS_PAIEMENT[etat?.cle] || COULEURS_PAIEMENT.rien
}

// Les trois temps d'un rendez-vous, lus sur son statut. `annule` tout court
// n'existe pas en base (le CHECK n'accepte que `annule_client` et
// `annule_commercant`) : on teste le PRÉFIXE, jamais l'égalité.
export function tempsDuRdv(rdv = {}) {
  const statut = String(rdv?.statut || 'confirme')
  if (statut === 'honore') return 'fait'
  if (statut === 'no_show' || statut.startsWith('annule')) return 'sans_suite'
  return 'a_venir'
}

export function etatPaiementRdv(rdv = {}) {
  if (!rdv) return null

  const temps = tempsDuRdv(rdv)
  const statut = String(rdv.statut || 'confirme')

  // ⚠️ ON TESTE L'ABSENCE, PAS LE NOMBRE. `Number(null)` vaut 0 et
  // `Number.isFinite(0)` vaut true : une prestation sur devis, dont le prix est
  // NULL, annonçait « 0,00 € à encaisser ». Troisième fois que ce piège se
  // présente sur ce projet, et il s'est présenté DANS LE MODULE ÉCRIT POUR
  // éviter ce genre de mensonge. Le banc l'a attrapé, pas moi.
  const nombreOuNull = (v) => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const prix = nombreOuNull(rdv.prix_estime)
  const acompte = nombreOuNull(rdv.acompte_montant)
  const aUnAcompte = acompte !== null && acompte > 0
  const acomptePaye = aUnAcompte && !!rdv.acompte_paye

  // ⚠️ Le contrat d'abord, avant tout calcul de montant : il rend la question
  // du prix sans objet, à tous les temps.
  if (rdv.abonnement_id) {
    if (temps === 'sans_suite') {
      return { cle: 'rien', ton: 'neutre', libelle: 'Abonnement', detail: 'Rien à encaisser, la séance était déjà payée.' }
    }
    return {
      cle: 'abonnement',
      ton: 'paye',
      libelle: 'Abonnement',
      detail: temps === 'fait'
        ? 'Séance payée à l’achat de l’abonnement, rien à encaisser.'
        : 'Rien à encaisser, la séance est déjà payée.',
    }
  }

  // ─── LE RENDEZ-VOUS QUI N'AURA PAS LIEU ─────────────────────────────────
  // ⚠️ IL RÉCLAMAIT DE L'ARGENT SUR UN RENDEZ-VOUS ANNULÉ. Le commerçant qui
  // lit « 15,00 € à encaisser » sur une ligne barrée ne sait plus s'il doit
  // relancer son client. La réponse est non, et elle doit être écrite.
  if (temps === 'sans_suite') {
    if (acomptePaye) {
      return {
        cle: 'partiel',
        ton: 'partiel',
        libelle: `Acompte encaissé ${euros(acompte)}`,
        // Le no-show et l'annulation ne se ressemblent pas : sur le premier
        // l'acompte reste au commerçant (c'est ce que dit déjà l'email envoyé
        // au client), sur la seconde il est remboursé.
        detail: statut === 'no_show'
          ? 'Acompte payé en ligne, il te reste acquis. Le solde n’est pas dû.'
          : 'Acompte payé en ligne, à rembourser depuis Stripe. Le solde n’est pas dû.',
      }
    }
    return { cle: 'rien', ton: 'neutre', libelle: 'Rien à encaisser', detail: null }
  }

  // ─── LE RENDEZ-VOUS HONORÉ ──────────────────────────────────────────────
  // ⚠️ ET C'EST ICI QUE SE JOUE LA QUESTION DU CHIFFRE D'AFFAIRES (Alex, deux
  // fois en deux jours). Marquer honoré, c'est déclarer que la séance a eu lieu
  // ET que son prix entre dans le CA du tableau de bord. Le dire sur la ligne,
  // c'est répondre d'avance à « pourquoi ce montant n'apparaît pas ».
  if (temps === 'fait') {
    if (prix === null) {
      return {
        cle: 'paye',
        ton: 'paye',
        libelle: 'Payé sur place',
        detail: 'Prix convenu sur place : ce rendez-vous n’entre pas dans ton chiffre d’affaires.',
      }
    }
    return {
      cle: 'paye',
      ton: 'paye',
      libelle: `Payé ${euros(prix)}`,
      detail: acomptePaye
        ? `Dont ${euros(acompte)} d’acompte payé en ligne. Compté dans ton chiffre d’affaires.`
        : 'Compté dans ton chiffre d’affaires.',
    }
  }

  // ─── LE RENDEZ-VOUS À VENIR ─────────────────────────────────────────────
  if (acomptePaye) {
    // ⚠️ ON DIT LE SOLDE, PAS LE PRIX. Le commerçant qui lit « 35 € » sur un
    // rendez-vous dont l'acompte est déjà versé encaisse 35 € de trop, et
    // c'est le client qui s'en aperçoit.
    const reste = prix !== null ? Math.max(0, prix - acompte) : null
    return {
      cle: 'partiel',
      ton: 'partiel',
      libelle: reste !== null ? `Partiel · ${euros(reste)} à payer` : 'Partiel · solde à payer',
      detail: `Acompte de ${euros(acompte)} déjà payé en ligne.`,
    }
  }

  if (aUnAcompte) {
    return {
      cle: 'du',
      ton: 'attente',
      libelle: prix !== null ? `À payer ${euros(prix)}` : 'À payer',
      detail: `L’acompte de ${euros(acompte)} n’a pas été payé.`,
    }
  }

  // Sans prix connu (prestation sur devis), on ne fabrique pas un montant : on
  // dit qu'il y a quelque chose à encaisser, et le commerçant sait quoi.
  if (prix === null) {
    return { cle: 'du', ton: 'attente', libelle: 'À payer', detail: 'Prix à convenir sur place.' }
  }

  return { cle: 'du', ton: 'attente', libelle: `À payer ${euros(prix)}`, detail: null }
}

// ─── CE QUE PÈSE UNE JOURNÉE, ET CE QU'ELLE PÈSERA ──────────────────────────
//
// ⚠️ « LE 21 À 15 €, ELLE N'APPARAÎT PAS DANS LE CA » (Alex, 16 puis 17/08). Le
// calcul était juste et la carte s'appelait « CA honoré » : elle ne compte que
// les rendez-vous HONORÉS. Un rendez-vous confirmé, à venir, n'y entre donc
// jamais, et rien à l'écran ne disait où était passé son montant.
//
// Un compteur qui a raison mais qui laisse chercher a tort quand même. On rend
// donc les DEUX nombres : ce qui est en caisse, et ce qui est attendu.
export function caDesRdvs(rdvs = []) {
  let encaisse = 0
  let attendu = 0
  for (const rdv of rdvs || []) {
    if (!rdv) continue
    // Une séance d'abonnement a été payée à l'achat de l'abonnement : la
    // compter ici la ferait entrer deux fois dans le chiffre d'affaires.
    if (rdv.abonnement_id) continue
    const montant = Number(rdv.prix_estime)
    if (!Number.isFinite(montant) || montant <= 0) continue
    const temps = tempsDuRdv(rdv)
    if (temps === 'fait') encaisse += montant
    else if (temps === 'a_venir') attendu += montant
  }
  return { encaisse, attendu }
}
