// CE QU'UN LIEN « CONFIRME TA TABLE » OUVRE, ÉCRIT UNE SEULE FOIS.
//
// Deux routes partent du même jeton : celle qui DIT au client ce qu'il garantit
// (`/api/rdv/empreinte-details`) et celle qui ouvre la saisie de carte
// (`/api/stripe/checkout/empreinte-lien`).
//
// 🔴 ET C'EST EXACTEMENT POUR ÇA QU'ELLES NE RECALCULENT PAS CHACUNE LEUR
// MONTANT. Deux copies de la même règle, c'est le jour où l'écran annonce 120 €
// et où le mandat part sur 160 : le client conteste, et il a raison. Le montant
// lu et le montant signé sortent d'ici, ensemble, ou ils ne sortent pas.
//
// ⚠️ LE JETON EST UNE CLÉ, PAS UNE PREUVE D'IDENTITÉ. Il est tiré au sort par le
// serveur et gardé haché en base, donc il est incopiable depuis la base ; mais
// il se transfère, se lit par-dessus une épaule et reste dans un historique. Ce
// qu'il ouvre se limite donc à ce que son porteur sait déjà.
//
// ⚠️ D'OÙ `avecClient`, ET C'EST TOUTE SA RAISON D'ÊTRE : seule la route qui
// crée le client Stripe a besoin du nom, de l'email et du téléphone. La route
// qui affiche ne les demande même pas à la base. Une colonne qui n'est pas lue
// ne peut pas fuir dans une réponse, pas même par une retouche distraite.

import { createHash } from 'node:crypto'
import { empreinteRequise, montantEmpreinte, lienValide, raisonDemandeImpossible } from './empreinte-table'

// Le jeton fait 24 octets en base64url, soit 32 caractères. Le plancher ne sert
// qu'à écarter les appels vides sans aller jusqu'à la base.
export const JETON_LONGUEUR_MIN = 16

// ⚠️ `deleted_at` EST FILTRÉ PAR L'APPELANT, comme partout ailleurs dans le
// dépôt : cette liste ne décrit que les colonnes.
const COLONNES_TABLE = `
        id, statut, date_rdv, heure_debut, couverts,
        empreinte_statut, empreinte_demande_expire_at, prestation_id, commercant_id,
        prestation:rdv_prestations(id, nom, par_couverts, couverts_min, couverts_max),
        commercant:commercants(id, nom, slug, categorie, stripe_account_id, stripe_account_charges_enabled,
          rdv_empreinte_actif, rdv_empreinte_seuil_couverts, rdv_empreinte_par_personne,
          rdv_delai_annulation_heures)`

// Ce que seule la création du client Stripe réclame.
const COLONNES_CLIENT = 'client_prenom, client_nom, client_email, client_telephone'

export async function chargerLienEmpreinte(supabase, jeton, { avecClient = false } = {}, maintenant = new Date()) {
  if (!jeton || String(jeton).length < JETON_LONGUEUR_MIN) {
    return { ok: false, code: 'invalide', status: 400, error: 'Lien invalide.' }
  }

  const hash = createHash('sha256').update(String(jeton)).digest('hex')
  const { data: rdv, error } = await supabase
    .from('rdv_reservations')
    .select(avecClient ? `${COLONNES_TABLE}, ${COLONNES_CLIENT}` : COLONNES_TABLE)
    .eq('empreinte_demande_jeton_hash', hash)
    .is('deleted_at', null)
    .maybeSingle()

  // 🔴 UNE LECTURE EN ERREUR N'EST PAS UN JETON INCONNU. L'ancienne route jetait
  // l'erreur (`const { data: rdv } = await …`) : une colonne absente ou une base
  // indisponible se lisait « ce lien n'est pas valable », et le client rappelait
  // le restaurant pour un lien parfaitement bon. Le silence qui s'empile, encore.
  if (error) {
    console.error('[empreinte-lien] lecture KO', { message: error.message })
    return { ok: false, code: 'lecture', status: 503, error: 'Réessaie dans un instant.' }
  }
  // ⚠️ ON NE DIT JAMAIS QU'UNE TABLE EXISTE À QUI N'A PAS LE BON JETON, et
  // « inconnu » et « périmé » restent deux réponses distinctes : le client ne
  // sait pas s'il doit rappeler ou attendre si on les confond.
  if (!rdv) return { ok: false, code: 'inconnu', status: 404, error: 'Ce lien n’est pas valable.' }

  // 🔴 « DÉJÀ GARANTIE » SE DIT AVANT « EXPIRÉ » (16/09, essai F5 d'Alex).
  // Le client qui rouvre son lien après avoir posé sa carte lisait « ce lien
  // n'est plus valable » : il pouvait croire que sa table n'était pas garantie
  // et rappeler le restaurant. Or sa carte EST enregistrée, et c'est la seule
  // chose qu'il veut savoir. L'échéance du lien ne l'intéresse plus une fois
  // qu'il a servi.
  const raison = raisonDemandeImpossible(rdv, maintenant)
  if (raison === 'deja_garantie') {
    return { ok: false, code: 'deja_garantie', status: 409, error: 'Ta carte est déjà enregistrée pour cette table.' }
  }

  if (!lienValide(rdv, maintenant)) {
    return {
      ok: false, code: 'expire', status: 410,
      error: 'Ce lien a expiré. Ta table reste réservée : appelle le restaurant si tu veux la garantir.',
    }
  }

  if (raison) {
    return { ok: false, code: raison, status: 409, error: 'Cette table ne peut plus être garantie.' }
  }

  const commercant = rdv.commercant
  if (!commercant?.stripe_account_id || !commercant.stripe_account_charges_enabled) {
    return {
      ok: false, code: 'stripe_absent', status: 400,
      error: 'Le restaurant ne peut pas enregistrer de carte pour le moment.',
    }
  }

  // 🔴 LA RÈGLE EST REJOUÉE À CHAQUE OUVERTURE. Le réglage du restaurateur a pu
  // changer entre l'envoi du lien et le clic : demander une carte sur une table
  // qui n'en demande plus serait une garantie sans base.
  const montant = montantEmpreinte(commercant, rdv.prestation, rdv.couverts)
  if (!empreinteRequise(commercant, rdv.prestation, rdv.couverts) || !(montant > 0)) {
    return { ok: false, code: 'plus_demandee', status: 409, error: 'Cette table ne demande plus d’empreinte.' }
  }

  return { ok: true, rdv, commercant, montant }
}
