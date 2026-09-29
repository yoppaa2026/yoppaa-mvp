// POST /api/admin/relancer-fiche
// Body : { commercant_id }
//
// LA RELANCE QU'ALEX ENVOIE À LA MAIN (28/09).
//
// Un commerçant validé dont la fiche n'avance pas reçoit un email qui NOMME ce
// qui lui manque, calculé ici, au moment de l'envoi : une relance qui
// réclamerait un logo déjà mis ferait plus de tort que pas de relance.
//
// ⚠️ PAS DE CRON, ET C'EST LA DEMANDE D'ALEX. Il connaît chacun de ses
// commerçants : c'est lui qui décide qui relancer et quand. La route ne fait
// que compter les envois, pour qu'il voie d'un coup d'œil qui a déjà été
// relancé, et combien de fois.

import { NextResponse } from 'next/server'
import { utilisateurAppelant, adminVerifie, clientAdmin } from '@/lib/api-auth'
import { bilanDeLaFiche } from '@/lib/fiche-complete-server'
import { ficheAPublier, phraseManquants } from '@/lib/fiche-complete'
import { envoyerAuCommercant, emailRelanceFiche } from '@/lib/resend'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const user = await utilisateurAppelant(request)
    if (!user) return NextResponse.json({ ok: false, error: 'session expirée, reconnecte-toi' }, { status: 401 })
    if (!(await adminVerifie(request, user))) return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })

    const { commercant_id } = await request.json().catch(() => ({}))
    if (!commercant_id) return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })

    const admin = clientAdmin()
    const { commercant, bilan } = await bilanDeLaFiche(admin, commercant_id)
    if (!commercant) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })

    if (!ficheAPublier(commercant)) {
      return NextResponse.json({ ok: false, error: 'cette fiche n’attend pas de mise en ligne' }, { status: 409 })
    }
    // Rien ne manque : le relancer lui demanderait ce qu'il a déjà fait. C'est
    // à Alex de publier.
    if (bilan.complet) {
      return NextResponse.json({ ok: false, error: 'rien ne manque sur cette fiche : tu peux la publier' }, { status: 409 })
    }
    if (!commercant.email) {
      return NextResponse.json({ ok: false, error: 'aucune adresse email sur cette fiche' }, { status: 409 })
    }

    const resteAFaire = phraseManquants(bilan.manquants)
    const envoi = await envoyerAuCommercant({
      to: commercant.email,
      subject: `Ta fiche Yoppaa est presque prête, ${commercant.nom}`,
      html: emailRelanceFiche({ nom: commercant.nom, criteres: bilan.criteres, resteAFaire }),
    })
    // ⚠️ ON NE COMPTE QUE CE QUI EST PARTI. Un échec compté comme un envoi
    // ferait croire à Alex qu'il a relancé quelqu'un qui n'a rien reçu.
    if (!envoi?.ok) {
      return NextResponse.json({ ok: false, error: `email non envoyé : ${envoi?.error || 'inconnu'}` }, { status: 502 })
    }

    const maintenant = new Date().toISOString()
    const nb = (Number(commercant.relances_fiche_nb) || 0) + 1
    const { error: errMaj } = await admin
      .from('commercants')
      .update({ relance_fiche_envoyee_at: maintenant, relances_fiche_nb: nb })
      .eq('id', commercant_id)
    // L'email est parti : on ne le cache pas derrière un échec d'écriture,
    // mais on le dit, sinon la ligne afficherait « jamais relancé ».
    if (errMaj) {
      return NextResponse.json({ ok: true, envoye_le: maintenant, relances: nb, avertissement: `email envoyé, mais le compteur n’a pas été mis à jour : ${errMaj.message}` })
    }

    return NextResponse.json({ ok: true, envoye_le: maintenant, relances: nb, resteAFaire })
  } catch (e) {
    console.error('[admin/relancer-fiche] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
