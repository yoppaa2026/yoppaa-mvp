// GET /api/yopper/abonnements
//
// « Combien de séances me reste-t-il, et jusqu'à quand ? »
//
// ⚠️ CE MANQUE ÉTAIT COMPLET. Depuis le 15/08 une cliente peut acheter une
// formule en ligne, et il n'existait NULLE PART où voir ce qu'elle avait
// acheté. Elle payait 150 €, recevait un email, et l'application ne lui en
// reparlait plus jamais : ni le solde, ni la validité, ni la liste des séances
// déjà posées. Signalé par Alex.
//
// Sécurité, et c'est le cœur de cette route :
//   • la table `abonnements` est FERMÉE à l'anonyme, comme toutes celles qui
//     portent des données personnelles. On y accède en service_role, donc c'est
//     ICI, et nulle part ailleurs, que se décide qui a le droit de voir quoi ;
//   • l'identité doit être PROUVÉE (décision du 03/08). Le cookie ne suffit
//     pas : il se posait en saisissant simplement un email dans le tunnel, donc
//     saisir celui d'une autre cliente montrerait SON abonnement, son nom et
//     son téléphone. Il faut le jeton délivré après vérification de l'adresse ;
//   • l'email vient de l'identité, JAMAIS du corps de la requête. Sinon
//     n'importe qui énumère les clientes d'un commerce.

import { NextResponse } from 'next/server'
import { identiteProuvee } from '@/lib/yopper-auth'
import { createClient } from '@supabase/supabase-js'
import { etatAbonnement } from '@/lib/abonnements'
import { jourLocalISO } from '@/lib/timezone'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function GET(request) {
  const yopper = await identiteProuvee(request)
  if (!yopper?.email) {
    return NextResponse.json({ ok: false, error: 'non_authentifie' }, { status: 401 })
  }

  const db = admin()

  // ⚠️ TOUTES LES COLONNES QUE L'ÉCRAN LIT, y compris celles qu'il ne fait que
  // traverser. Une colonne absente d'un `select` vaut `undefined`, ne lève
  // aucune erreur, et le repli bien conçu qui vit derrière finit le travail en
  // silence : c'est le défaut le plus fréquent de ce projet. `etatAbonnement`
  // lit type, mode, statut, prix, seances_total, date_debut et date_fin ; sans
  // `seances_total`, elle rendrait « solde inconnu » à une cliente qui a
  // pourtant payé 36 séances.
  const { data: contrats, error } = await db
    .from('abonnements')
    //
    // ⚠️ `prestation_id` ET `formule_id` sont là POUR L'ÉCRAN, pas pour le
    // calcul : le premier dit QUEL COURS ce contrat couvre, le second permet
    // d'en afficher le nom. Sans eux, l'écran de confirmation d'achat annonce
    // « ton abonnement » sans jamais dire lequel, et la fiche ne peut pas
    // reconnaître le cours que la cliente a déjà payé.
    .select('id, commercant_id, formule_id, prestation_id, type, mode, statut, prix, seances_total, seances_par_semaine, date_debut, date_fin, created_at')
    // L'email est stocké en minuscules partout où il s'écrit (contrat en ligne
    // comme inscription à la main), et `identiteProuvee` le rend en minuscules.
    // Les deux se rencontrent donc toujours.
    .eq('client_email', yopper.email)
    .order('date_debut', { ascending: false })

  if (error) {
    console.error('[api/yopper/abonnements]', error)
    return NextResponse.json({ ok: false, error: 'lecture_impossible' }, { status: 500 })
  }
  if (!contrats?.length) return NextResponse.json({ ok: true, abonnements: [] })

  const ids = contrats.map(c => c.id)
  const commercantIds = [...new Set(contrats.map(c => c.commercant_id).filter(Boolean))]

  // Les séances consommées SE COMPTENT, elles ne se décrémentent pas. Un
  // compteur stocké dérive au premier accident, et plus personne ne sait
  // ensuite quel chiffre est le bon.
  const formuleIds = [...new Set(contrats.map(c => c.formule_id).filter(Boolean))]

  const [{ data: reservations }, { data: commercants }, { data: formules }] = await Promise.all([
    db.from('rdv_reservations')
      .select('id, abonnement_id, statut, date_rdv, heure_debut')
      .in('abonnement_id', ids),
    db.from('commercants')
      .select('id, nom, slug, logo_url')
      .in('id', commercantIds),
    // Le nom de la formule est ce que la cliente a lu au moment de payer. C'est
    // sous ce nom-là qu'elle reconnaît son contrat, pas sous « 36 séances ».
    formuleIds.length
      ? db.from('abonnement_formules').select('id, libelle, prestation_id').in('id', formuleIds)
      : Promise.resolve({ data: [] }),
  ])

  const parCommercant = Object.fromEntries((commercants || []).map(c => [c.id, c]))
  const parFormule = Object.fromEntries((formules || []).map(f => [f.id, f]))
  const aujourdhui = jourLocalISO()

  const abonnements = contrats.map(contrat => {
    const etat = etatAbonnement(contrat, reservations || [], { aujourdhui })
    const commercant = parCommercant[contrat.commercant_id] || null
    const formule = parFormule[contrat.formule_id] || null
    return {
      ...etat,
      seancesParSemaine: contrat.seances_par_semaine ?? null,
      // ⚠️ LE COURS COUVERT PEUT VENIR DE LA FORMULE. Les contrats vendus en
      // ligne avant le 17/08 n'ont pas de `prestation_id` : leur formule, elle,
      // l'a toujours eu. Prendre le contrat d'abord garde le choix figé à la
      // signature, et le repli sur la formule évite de rendre muets les
      // contrats déjà vendus.
      prestationId: contrat.prestation_id ?? formule?.prestation_id ?? null,
      formule: formule ? { id: formule.id, libelle: formule.libelle } : null,
      acheteLe: contrat.created_at ?? null,
      commercant: commercant
        ? { id: commercant.id, nom: commercant.nom, slug: commercant.slug, logo_url: commercant.logo_url }
        : null,
    }
  })

  return NextResponse.json({ ok: true, abonnements })
}
