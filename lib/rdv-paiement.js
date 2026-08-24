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

// ⚠️ CE QUI RESTE À ENCAISSER AU COMPTOIR, ET RIEN D'AUTRE.
//
// Le solde quand un acompte a déjà été payé en ligne, le prix complet sinon,
// zéro quand un contrat couvre la séance. `null` veut dire « on ne sait pas »
// (prestation sur devis) : c'est différent de zéro, et on ne le confond jamais.
export function resteAEncaisser(rdv = {}) {
  if (!rdv) return null
  if (rdv.abonnement_id) return 0
  const nombre = (v) => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const prix = nombre(rdv.prix_estime)
  if (prix === null) return null

  // ⚠️ LA RÉCOMPENSE DE FIDÉLITÉ BAISSE LE PRIX AVANT TOUT LE RESTE (24/08).
  // `prix_estime` reste le tarif de la prestation, celui qui a été affiché et
  // qui ne doit pas être réécrit ; la remise s'en retranche ici, une seule
  // fois, pour tout le monde. Sans ça, le commerçant réclamerait au comptoir
  // un montant que le Yopper a déjà vu barré au moment de réserver.
  const remise = nombre(rdv.fidelite_remise) || 0
  const prixNet = Math.round(Math.max(0, prix - remise) * 100) / 100

  const acompte = nombre(rdv.acompte_montant)
  if (acompte !== null && acompte > 0 && rdv.acompte_paye) {
    return Math.round(Math.max(0, prixNet - acompte) * 100) / 100
  }
  return prixNet
}

// Comment le commerçant DÉCLARE avoir été payé au comptoir. Yoppaa ne traite
// aucun de ces paiements : il les enregistre, pour le récapitulatif du jour et
// pour la réconciliation bancaire.
//
// ⚠️ DEUX MODES, PAS TROIS : le terminal et les espèces. Pas de chèque, ça
// n'existe plus en Belgique (Alex, 17/08). Bancontact et Payconiq au comptoir
// passent par le terminal ou le QR du commerçant, donc par « terminal ».
//
// ⚠️ `rien` N'EST PAS UN MOYEN DE PAIEMENT, C'EST UNE RÉPONSE. Le client est
// venu et n'a pas payé : ça arrive, et il faut pouvoir le dire. Sans cette
// valeur, « rien encaissé » et « question jamais posée » seraient tous deux à
// NULL, et l'écran ne saurait plus distinguer une dette d'un oubli de saisie.
export const MODES_ENCAISSEMENT = {
  terminal: { label: 'Terminal', detail: 'Bancontact, carte ou Payconiq sur ton terminal.' },
  especes:  { label: 'Espèces',  detail: 'Réglé en liquide, à compter dans ta caisse.' },
  // ⚠️ LE VIREMENT NE SE PROPOSE PAS AU COMPTOIR, et c'est voulu : personne ne
  // fait un virement en sortant d'un cours de yoga. Il existe pour les
  // ABONNEMENTS, où un contrat à trois chiffres se règle couramment ainsi, et
  // l'écran d'inscription à la main le proposait déjà avant tout ça.
  virement: { label: 'Virement', detail: 'Reçu par virement sur ton compte.' },
  rien:     { label: 'Rien encaissé', detail: 'La prestation a eu lieu, l’argent n’est pas entré.' },
}

// Les seuls modes qui font entrer de l'argent chez le commerçant. `rien` n'en
// est pas : c'est une réponse, pas un moyen de paiement.
export const MODES_QUI_ENCAISSENT = ['terminal', 'especes', 'virement']

// ⚠️ CE QUI RESTE À ENCAISSER SUR UNE COMMANDE, et le même défaut qu'ailleurs :
// une commande payée sur place partait au comptoir SANS SON MOYEN, si bien
// qu'un Click and Collect réglé en liquide et un autre au terminal se
// ressemblaient comme deux gouttes d'eau dans le journal. Règle posée par Alex
// le 17/08 : une amélioration qui touche d'autres endroits s'y applique aussi.
//
// Un bon cadeau a déjà été payé en ligne à son achat : il ne se réencaisse pas.
export function resteAEncaisserCommande(commande = {}) {
  if (!commande) return null
  if (commande.paye_en_ligne) return 0
  const total = Number(commande.total)
  if (!Number.isFinite(total)) return null
  const bon = Number(commande.bon_cadeau_montant)
  const net = total - (Number.isFinite(bon) ? bon : 0)
  return Math.round(Math.max(0, net) * 100) / 100
}

export function libelleModeEncaissement(mode) {
  return MODES_ENCAISSEMENT[String(mode || '')]?.label || null
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
  // ⚠️ LE PRIX MANIPULÉ ICI EST LE NET DE RÉCOMPENSE, parce que chacune des
  // phrases écrites plus bas dit ce que le client DOIT ou A PAYÉ. `prix_estime`
  // garde le tarif de la prestation, qui ne se réécrit pas.
  //
  // ⚠️ ET ON PRÉSERVE LE NULL. `Number(null)` vaut 0 et passe les gardes : une
  // prestation sur devis annoncerait « 0,00 € à encaisser ». C'est le piège
  // déjà rencontré trois fois sur ce projet, et il est signalé dix lignes plus
  // haut. Ce n'est pas le moment de le refaire.
  const prixBrut = nombreOuNull(rdv.prix_estime)
  const remiseFid = nombreOuNull(rdv.fidelite_remise) || 0
  const prix = prixBrut === null
    ? null
    : Math.round(Math.max(0, prixBrut - remiseFid) * 100) / 100
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
    // ⚠️ « HONORÉ » ET « PAYÉ » ÉTAIENT LE MÊME CLIC (Alex, 17/08 : « le RDV
    // passe en payé mais il ne clique sur rien »). Venir n'est pas payer. La
    // pastille annonçait « Payé » sur la seule foi du bouton vert, sans que
    // personne n'ait jamais dit ni SI ni COMMENT l'argent était entré.
    // Maintenant elle lit ce qui a été DÉCLARÉ.
    const mode = String(rdv.encaisse_mode || '')

    // Le client est venu et n'a pas payé. C'est une dette, pas un oubli de
    // saisie, et les deux ne doivent surtout pas se ressembler.
    if (mode === 'rien') {
      return {
        cle: 'du',
        ton: 'attente',
        libelle: prix !== null ? `À payer ${euros(prix)}` : 'À payer',
        detail: 'La séance a eu lieu, rien n’a été encaissé.',
      }
    }

    if (MODES_QUI_ENCAISSENT.includes(mode)) {
      const encaisse = nombreOuNull(rdv.encaisse_montant)
      const libelleMode = MODES_ENCAISSEMENT[mode].label.toLowerCase()
      return {
        cle: 'paye',
        ton: 'paye',
        libelle: encaisse !== null ? `Payé ${euros(encaisse)}` : 'Payé',
        detail: acomptePaye
          ? `Encaissé au ${libelleMode}, en plus de ${euros(acompte)} d’acompte payé en ligne.`
          : `Encaissé au ${libelleMode}.`,
      }
    }

    // Rien de déclaré : les rendez-vous honorés AVANT que la question existe.
    // Le montant compte au chiffre d'affaires, mais la réconciliation, elle,
    // est incomplète, et le taire la rendrait fausse sans prévenir.
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
        ? `Dont ${euros(acompte)} d’acompte payé en ligne. Moyen de paiement non noté.`
        : 'Compté dans ton chiffre d’affaires. Moyen de paiement non noté.',
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

// ─── ET LA MÊME QUESTION SUR UNE COMMANDE ───────────────────────────────────
//
// ⚠️ « RIEN N'INDIQUE LE MONTANT À PAYER QUEL QUE SOIT LE STATUT » (Alex,
// 17/08). La carte d'une commande affiche son total en haut à droite, et un
// total n'est pas un état : le commerçant ne sait pas s'il doit tendre la main.
// Le rendez-vous avait sa pastille depuis le matin, la commande non — même
// défaut, même famille, et c'est la règle du jour qui veut qu'on l'applique
// partout.
export function etatPaiementCommande(commande = {}) {
  if (!commande) return null

  const nombre = (v) => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const total = nombre(commande.total)
  const bon = nombre(commande.bon_cadeau_montant) || 0

  if (commande.paye_en_ligne) {
    return {
      cle: 'paye', ton: 'paye',
      libelle: 'Payé en ligne',
      detail: bon > 0 ? `Dont ${euros(bon)} en bon cadeau.` : null,
    }
  }

  const reste = resteAEncaisserCommande(commande)
  const mode = String(commande.encaisse_mode || '')

  if (MODES_QUI_ENCAISSENT.includes(mode)) {
    const encaisse = nombre(commande.encaisse_montant)
    return {
      cle: 'paye', ton: 'paye',
      libelle: encaisse !== null ? `Payé ${euros(encaisse)}` : 'Payé',
      detail: `Encaissé au ${MODES_ENCAISSEMENT[mode].label.toLowerCase()}.`,
    }
  }

  // ⚠️ UN BON CADEAU QUI COUVRE TOUT LAISSE ZÉRO À ENCAISSER, et ce n'est pas
  // « rien à payer » : c'est payé, à l'achat du bon. Le confondre ferait
  // réclamer de l'argent, ou croire à une vente perdue.
  if (reste !== null && reste <= 0 && bon > 0) {
    return { cle: 'paye', ton: 'paye', libelle: 'Payé par bon cadeau', detail: `${euros(bon)} déjà réglés à l’achat du bon.` }
  }

  if (mode === 'rien') {
    return {
      cle: 'du', ton: 'attente',
      libelle: reste !== null ? `À payer ${euros(reste)}` : 'À payer',
      detail: 'Remise au client sans être payée.',
    }
  }

  return {
    cle: 'du', ton: 'attente',
    libelle: reste !== null ? `À payer ${euros(reste)}` : 'À payer',
    // ⚠️ ON DIT LE BON CADEAU, sinon le commerçant réclame le total affiché en
    // haut de la carte et le client s'en aperçoit.
    detail: bon > 0 && total !== null ? `Sur ${euros(total)}, dont ${euros(bon)} en bon cadeau.` : null,
  }
}

// ─── ET LA MÊME QUESTION, DU CÔTÉ DE CELUI QUI PAIE ─────────────────────────
//
// ⚠️ « DANS LES MAILS, RIEN NE DIT PAYÉ OU PAS PAYÉ, OU PARTIELLEMENT. DANS LES
// STATUTS DE COMMANDE NON PLUS » (Alex, 17/08, deux captures à l'appui : CC2
// payée au comptoir et CC3 payée en ligne étaient RIGOUREUSEMENT identiques).
//
// La pastille du commerçant existait depuis le matin. Celle du client, non : il
// voyait « 15,00 € » et devait deviner s'il lui fallait sa carte en partant.
// C'est la règle du jour appliquée au dernier endroit qui l'attendait.
//
// ⚠️ ET ON NE RÉUTILISE PAS LES MOTS DU COMMERÇANT. « Encaissé au terminal »,
// « Remise au client sans être payée » : ce sont ses mots à lui, pour sa
// caisse. Le client se pose UNE question, et une seule : « est-ce que je dois
// sortir de quoi payer ? » Le libellé y répond, et le mot d'état vient en tête,
// comme partout ailleurs.
export function etatPaiementClient(commande = {}) {
  if (!commande) return null

  const nombre = (v) => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const bon = nombre(commande.bon_cadeau_montant) || 0

  if (commande.paye_en_ligne) {
    return {
      cle: 'paye', ton: 'paye',
      libelle: 'Payé en ligne',
      detail: bon > 0
        ? `Dont ${euros(bon)} réglés avec ton bon cadeau. Rien à sortir au comptoir.`
        : 'Rien à sortir au comptoir.',
    }
  }

  const mode = String(commande.encaisse_mode || '')
  if (MODES_QUI_ENCAISSENT.includes(mode)) {
    const encaisse = nombre(commande.encaisse_montant)
    return {
      cle: 'paye', ton: 'paye',
      libelle: encaisse !== null ? `Payé ${euros(encaisse)}` : 'Payé sur place',
      detail: 'C’est réglé, merci 🟣',
    }
  }

  const reste = resteAEncaisserCommande(commande)

  // Un bon cadeau qui couvre tout ne laisse rien à payer, et ce n'est pas
  // « gratuit » : c'est payé, le jour où le bon a été acheté.
  if (reste !== null && reste <= 0 && bon > 0) {
    return {
      cle: 'paye', ton: 'paye',
      libelle: 'Payé avec ton bon cadeau',
      detail: `${euros(bon)} déjà réglés à l’achat du bon.`,
    }
  }

  // ⚠️ « SUR PLACE » NE VEUT RIEN DIRE QUAND ON SE FAIT LIVRER (Alex, 22/08).
  // Le Yopper qui commande une livraison lisait « À régler sur place » et « le
  // commerçant encaisse au moment de la remise » : quelle place, quelle remise ?
  // Il doit savoir qu'il aura à sortir de quoi payer QUAND ON SONNERA CHEZ LUI,
  // et prévoir la somme. C'est exactement la règle du 21/08 sur le paiement :
  // le client doit savoir s'il doit emporter de quoi payer.
  const auLivreur = commande.mode_retrait === 'livraison'
  return {
    cle: 'du', ton: 'attente',
    libelle: reste !== null
      ? `${auLivreur ? 'À régler au livreur' : 'À régler sur place'} ${euros(reste)}`
      : (auLivreur ? 'À régler au livreur' : 'À régler sur place'),
    detail: bon > 0
      ? `Ton bon cadeau de ${euros(bon)} est déjà déduit. ${auLivreur ? 'Tu règles le solde au livreur.' : 'Le commerçant encaisse à la remise.'}`
      : (auLivreur
          ? 'Prépare de quoi payer : le livreur encaisse à la remise du sac.'
          : 'Le commerçant encaisse au moment de la remise.'),
  }
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
    // ⚠️ NET DE RÉCOMPENSE, comme partout ailleurs : le commerçant a vendu
    // moins cher, son chiffre d'affaires doit le dire. Compter le tarif plein
    // gonflerait le CA d'un argent que personne ne lui a versé.
    const brut = Number(rdv.prix_estime)
    if (!Number.isFinite(brut) || brut <= 0) continue
    const remiseRdv = Number(rdv.fidelite_remise)
    const montant = Math.max(0, brut - (Number.isFinite(remiseRdv) ? remiseRdv : 0))
    if (montant <= 0) continue
    const temps = tempsDuRdv(rdv)
    if (temps === 'fait') encaisse += montant
    else if (temps === 'a_venir') attendu += montant
  }
  return { encaisse, attendu }
}
