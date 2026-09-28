// POST /api/admin/publier
// Body : { commercant_id }
//
// LE CLIC D'ALEX QUI MET UNE FICHE EN LIGNE (28/09).
//
// Avant, la publication partait avec la validation, sur un dossier dont le
// catalogue était forcément vide. Désormais, valider ouvre l'espace, et
// publier est un second geste, fait sur une fiche complète.
//
// 🔴 LA FICHE EST RECALCULÉE ICI, AU MOMENT DU CLIC. Ni l'écran de l'admin ni
// la demande du commerçant ne font foi : entre les deux, un article a pu être
// désactivé ou une photo retirée. Une fiche incomplète est REFUSÉE, et la
// réponse nomme ce qui manque.
//
// Effets : statut_publication = 'publie', la demande est effacée, l'action est
// journalisée, et les deux emails « ta page est en ligne » et « ton kit »
// partent, puisque c'est enfin vrai.

import { NextResponse } from 'next/server'
import { utilisateurAppelant, estAdminYoppaa, clientAdmin } from '@/lib/api-auth'
import { bilanDeLaFiche } from '@/lib/fiche-complete-server'
import { phraseManquants } from '@/lib/fiche-complete'
import { STATUTS_ACCES_AUTORISE, fichePubliee } from '@/lib/statut-commercant'
import { envoyerAuCommercant, emailValidationCommercant, emailKitBienvenue } from '@/lib/resend'
import { avantLancement } from '@/lib/lancement'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const user = await utilisateurAppelant(request)
    if (!user) return NextResponse.json({ ok: false, error: 'session expirée, reconnecte-toi' }, { status: 401 })
    if (!estAdminYoppaa(user)) return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })

    const { commercant_id } = await request.json().catch(() => ({}))
    if (!commercant_id) return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })

    const admin = clientAdmin()
    const { commercant, bilan } = await bilanDeLaFiche(admin, commercant_id)
    if (!commercant) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })

    // Publier un compte qui n'est pas validé ouvrirait la fiche d'un commerçant
    // dont l'espace est fermé : il serait visible sans pouvoir rien y gérer.
    if (!STATUTS_ACCES_AUTORISE.includes(commercant.statut)) {
      return NextResponse.json({ ok: false, error: 'valide d’abord ce compte : son espace est encore fermé' }, { status: 409 })
    }
    if (fichePubliee(commercant)) {
      return NextResponse.json({ ok: true, deja: true })
    }
    if (!bilan.complet) {
      return NextResponse.json({
        ok: false,
        error: `fiche incomplète : il manque ${phraseManquants(bilan.manquants)}`,
        manquants: bilan.manquants.map(m => m.cle),
      }, { status: 409 })
    }

    const { error: errMaj } = await admin
      .from('commercants')
      .update({ statut_publication: 'publie', publication_demandee_at: null })
      .eq('id', commercant_id)
    if (errMaj) return NextResponse.json({ ok: false, error: `publication impossible : ${errMaj.message}` }, { status: 500 })

    // Le journal ne bloque pas la publication, mais son échec se lit.
    const { error: errLog } = await admin.from('admin_validations').insert({
      commercant_id, action: 'publie', motif: null, validated_by_email: user.email,
    })
    if (errLog) console.error('[admin/publier] journal non écrit', errLog.message)

    // La fiche lue pour le bilan porte déjà le nom, l'adresse et le lien : on
    // ne la relit pas.
    const fiche = commercant
    let email = 'pas d’adresse'
    if (fiche?.email) {
      // ⚠️ UNE SEULE PHASE POUR LES DEUX EMAILS, qui arrivent à la seconde près
      // dans la même boîte : sinon l'un annonce une ouverture à venir pendant
      // que l'autre la déclare déjà faite.
      const phaseAvantLancement = avantLancement()
      const envoi = await envoyerAuCommercant({
        to: fiche.email,
        subject: `Ta page Yoppaa est en ligne, ${fiche.nom}`,
        html: emailValidationCommercant({ nom: fiche.nom, slug: fiche.slug, avant_lancement: phaseAvantLancement }),
      })
      email = envoi?.ok ? 'envoyé' : `échec : ${envoi?.error || 'inconnu'}`
      // Le kit suit : lien, QR code, messages à partager. Il n'avait aucun sens
      // tant que la page n'était visible par personne.
      const kit = await envoyerAuCommercant({
        to: fiche.email,
        subject: 'Ton kit Yoppaa 🟣',
        html: emailKitBienvenue({ nom_commercant: fiche.nom, slug: fiche.slug, avant_lancement: phaseAvantLancement }),
      })
      if (!kit?.ok) console.error('[admin/publier] kit non envoyé', kit?.error)
    }

    return NextResponse.json({ ok: true, email })
  } catch (e) {
    console.error('[admin/publier] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
