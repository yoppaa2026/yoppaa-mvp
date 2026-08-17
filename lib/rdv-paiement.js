// CE QUE LE COMMERÇANT DOIT SAVOIR QUAND LE CLIENT SE PRÉSENTE : est-ce payé ?
//
// ⚠️ RIEN NE LE DISAIT (Alex, 17/08 : « rien n'indique au commerçant si payé ou
// pas, pas très clair tout ça »). L'agenda affichait un montant nu, et un
// montant nu ne répond pas à la seule question qui se pose au comptoir : « je
// lui demande de l'argent, ou pas ? »
//
// Quatre situations, et elles n'appellent pas le même geste :
//
//   • séance d'ABONNEMENT  → ne rien demander, c'est payé depuis l'achat
//   • acompte PAYÉ         → encaisser le SOLDE, pas le prix complet
//   • acompte EN ATTENTE   → encaisser le tout, l'acompte n'est jamais arrivé
//   • aucun acompte        → encaisser le prix
//
// ⚠️ ET LE PIÈGE DU ZÉRO, POUR LA QUATRIÈME FOIS SUR CE PROJET. Une séance
// d'abonnement porte `prix_estime: 0`, pour ne pas multiplier le chiffre
// d'affaires du commerçant par trente-six. L'agenda affichait donc « 0€ »,
// exactement le mensonge déjà corrigé côté cliente et jamais côté commerçant :
// ce n'est pas gratuit, c'est compris. On interroge l'ABSENCE de contrat, pas
// le nombre.

const euros = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`

export function etatPaiementRdv(rdv = {}) {
  if (!rdv) return null

  // ⚠️ Le contrat d'abord, avant tout calcul de montant : il rend la question
  // du prix sans objet.
  if (rdv.abonnement_id) {
    return { ton: 'paye', libelle: 'Abonnement', detail: 'Rien à encaisser, la séance est déjà payée.' }
  }

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

  if (aUnAcompte && rdv.acompte_paye) {
    // ⚠️ ON DIT LE SOLDE, PAS LE PRIX. Le commerçant qui lit « 35 € » sur un
    // rendez-vous dont l'acompte est déjà versé encaisse 35 € de trop, et
    // c'est le client qui s'en aperçoit.
    const reste = prix !== null ? Math.max(0, prix - acompte) : null
    return {
      ton: 'partiel',
      libelle: reste !== null ? `${euros(reste)} à encaisser` : 'Solde à encaisser',
      detail: `Acompte de ${euros(acompte)} déjà payé en ligne.`,
    }
  }

  if (aUnAcompte) {
    return {
      ton: 'attente',
      libelle: prix !== null ? `${euros(prix)} à encaisser` : 'À encaisser',
      detail: `L’acompte de ${euros(acompte)} n’a pas été payé.`,
    }
  }

  // Sans prix connu (prestation sur devis), on ne fabrique pas un montant : on
  // dit qu'il y a quelque chose à encaisser, et le commerçant sait quoi.
  if (prix === null) {
    return { ton: 'attente', libelle: 'À encaisser', detail: 'Prix à convenir sur place.' }
  }

  return { ton: 'attente', libelle: `${euros(prix)} à encaisser`, detail: null }
}
