// Signaux envoyés par les habitants : signalement d'un problème, suggestion
// d'un commerce absent, envie d'une fonctionnalité chez un commerçant.
//
// POURQUOI CETTE ROUTE. Les trois tables acceptaient l'insertion libre depuis
// le navigateur. Sans compte, aucune policy SQL ne peut distinguer un habitant
// d'un robot : la seule protection possible est côté serveur, avec une
// limitation de débit et une validation du contenu.
//
// POST { type: 'signalement' | 'suggestion' | 'envie', ...champs }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { identiteProuvee } from '@/lib/yopper-auth'
import { globalLimiter, formulairesLimiter, checkLimit, clientIp } from '@/lib/ratelimit'
import { envieConnue, motifAvisConnu, motifFicheConnu, libelleMotifAvis } from '@/lib/signaux'
import { envoyerAuAdmin, emailSuggestionCommerce, emailSignalementFiche, emailSignalementAvis } from '@/lib/resend'

// Prévenir l'administration, SANS jamais faire échouer le geste de l'habitant.
//
// ⚠️ SA SUGGESTION EST DÉJÀ ENREGISTRÉE quand on arrive ici : si notre email ne
// part pas, c'est notre problème, pas le sien, et l'écran /admin reste la
// source de vérité. Mais on LIT le résultat : un envoi dont personne ne lit la
// réponse est un espoir, pas une action, et c'est exactement ce silence qui a
// fait qu'aucune des suggestions déjà reçues n'a jamais été annoncée.
async function prevenirLAdmin(sujet, html) {
  try {
    const r = await envoyerAuAdmin({ subject: sujet, html })
    if (!r?.ok) console.error('[signaux] alerte admin NON partie', { sujet, erreur: r?.error })
    return r?.ok === true
  } catch (e) {
    console.error('[signaux] alerte admin en exception', { sujet, e: e?.message || String(e) })
    return false
  }
}

const TYPES = ['signalement', 'suggestion', 'envie']

function texte(v, max) {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}

export async function POST(request) {
  try {
    // Limitation par adresse : ces formulaires sont ouverts aux visiteurs sans
    // compte, ils sont donc la porte d'entrée naturelle du spam.
    const limite = await checkLimit(globalLimiter, clientIp(request))
    if (!limite.success) {
      return NextResponse.json({ ok: false, error: 'Trop de requêtes, réessaie dans un instant.' }, { status: 429 })
    }

    const body = await request.json().catch(() => ({}))
    const { type } = body
    if (!TYPES.includes(type)) {
      return NextResponse.json({ ok: false, error: 'type invalide' }, { status: 400 })
    }

    // 🔴 UN SIGNAL NE S'ATTRIBUE QU'À UNE IDENTITÉ PROUVÉE (15/09). Cette route
    // lisait le cookie déclaré, que `POST /api/yopper/session` signe pour
    // quiconque le demande : n'importe qui déposait un signalement, une
    // suggestion ou une envie AU NOM d'un autre Yopper, et contournait l'anti-spam
    // d'une envie par semaine en changeant de nom. Sans jeton vérifié, le signal
    // part quand même, ANONYME : ces formulaires restent ouverts aux visiteurs.
    const identite = await identiteProuvee(request)
    const clientId = identite?.client_id || null

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ LES DEUX FORMULAIRES ONT LEUR PROPRE BORNE. Chacun déclenche un email
    // vers l'administration : la limite large de l'API laisserait un robot
    // remplir une boîte mail aussi vite qu'une table. Les envies, qui sont des
    // clics sans email, gardent la borne générale.
    if (type === 'signalement' || type === 'suggestion') {
      const borne = await checkLimit(formulairesLimiter, clientIp(request),
        { cle: 'form', max: 5, fenetreMs: 600000 })
      if (!borne.success) {
        return NextResponse.json({ ok: false, error: 'Trop d’envois d’un coup, réessaie dans un moment.' }, { status: 429 })
      }
    }

    if (type === 'signalement') {
      if (!body.commercant_id && !body.service_id && !body.avis_id) {
        return NextResponse.json({ ok: false, error: 'cible manquante' }, { status: 400 })
      }

      // 🔴 LES DEUX LISTES SONT FERMÉES, ET LA BASE EN EST LA RAISON. Le motif
      // d'une fiche était du texte libre borné à soixante caractères, alors que
      // `signalements_type_check` n'autorise que huit valeurs : un appel direct
      // à l'API avec un motif inventé rendait 500. Ce n'était pas exploité,
      // puisque la modale ne propose que ces huit, mais « pas exploité » n'est
      // pas « fermé », et c'était une garde d'écran qui tenait toute seule.
      // Trouvé le 20/09 en cherchant pourquoi un signalement d'avis échouait.
      //
      // ⚠️ L'ABSENCE DE MOTIF RESTE TOLÉRÉE SUR UNE FICHE et retombe sur
      // « autre » : c'est le comportement d'avant, et le refuser casserait un
      // appel qui marche aujourd'hui sans rien protéger de plus. Sur un avis,
      // le motif décide du traitement en modération : il est exigé.
      const surUnAvis = !!body.avis_id
      const motifDemande = texte(body.motif, 60)
      const connu = surUnAvis ? motifAvisConnu(motifDemande) : motifFicheConnu(motifDemande)
      if (motifDemande && !connu) {
        return NextResponse.json({ ok: false, error: 'motif de signalement inconnu' }, { status: 400 })
      }
      if (surUnAvis && !motifDemande) {
        return NextResponse.json({ ok: false, error: 'motif de signalement requis' }, { status: 400 })
      }

      const motif = motifDemande || 'autre'
      const description = texte(body.description, 1000)
      const { error } = await supabase.from('signalements').insert({
        type: motif,
        description,
        yopper_id: clientId,
        commercant_id: body.commercant_id || null,
        service_id: body.service_id || null,
        avis_id: body.avis_id || null,
      })
      if (error) throw error

      // ⚠️ DEUX CIBLES, DEUX EMAILS, ET CE N'EST PAS DE LA COQUETTERIE. Sur une
      // fiche on corrige une donnée ; sur un avis on arbitre un CONTENU, et la
      // décision est de le retirer ou de le laisser. Envoyer « Signalement sur
      // une fiche » pour un avis ferait juger la mauvaise chose, et le gabarit
      // des fiches ne porte pas le texte incriminé.
      if (surUnAvis) {
        // Le contenu à juger. Son absence n'empêche rien : le gabarit dit alors
        // qu'il s'agit d'une note seule, ce qui est une information en soi.
        const { data: avis } = await supabase
          .from('avis')
          .select('id, note, commentaire, commercant:commercants(nom)')
          .eq('id', body.avis_id)
          .maybeSingle()

        // 🔴 UN AVIS INTROUVABLE N'EST PAS UNE ERREUR À TAIRE. Il a pu être
        // supprimé entre l'affichage et le signalement : la ligne est déjà
        // partie en base (la clé étrangère l'aurait refusée sinon), donc on
        // prévient quand même, en le disant.
        await prevenirLAdmin(
          `Signalement d’un avis · ${avis?.commercant?.nom || 'commerce inconnu'}`,
          emailSignalementAvis({
            motif_libelle: libelleMotifAvis(motif),
            description,
            commerce_nom: avis?.commercant?.nom || null,
            avis_texte: avis?.commentaire || null,
            avis_note: avis?.note ?? null,
            avis_id: body.avis_id,
          }),
        )
        return NextResponse.json({ ok: true })
      }

      // Le nom de la fiche visée, pour que l'email dise de qui on parle. Son
      // absence ne doit rien empêcher : le gabarit s'en passe.
      let cibleNom = null
      if (body.commercant_id) {
        const { data } = await supabase.from('commercants').select('nom').eq('id', body.commercant_id).maybeSingle()
        cibleNom = data?.nom || null
      }
      await prevenirLAdmin(
        `Signalement · ${cibleNom || 'une fiche'}`,
        emailSignalementFiche({ motif, description, cible_nom: cibleNom, commercant_id: body.commercant_id, service_id: body.service_id }),
      )
      return NextResponse.json({ ok: true })
    }

    if (type === 'suggestion') {
      const nom = texte(body.nom_commerce, 120)
      if (!nom) return NextResponse.json({ ok: false, error: 'nom du commerce requis' }, { status: 400 })
      const champs = {
        adresse: texte(body.adresse, 200),
        type_commerce: texte(body.type_commerce, 80),
        commentaire: texte(body.commentaire, 500),
      }
      const { error } = await supabase.from('suggestions_commercants').insert({
        client_id: clientId,
        nom_commerce: nom,
        ...champs,
      })
      if (error) throw error

      // Combien de fois ce commerce a-t-il déjà été réclamé, celle-ci comprise ?
      // C'est l'ordre de prospection : le plus demandé se visite en premier.
      //
      // ⚠️ `eq` ET NON `ilike` : un nom contenant « % » ou « _ » deviendrait un
      // motif à jokers et compterait des enseignes qui n'ont rien à voir.
      const { count } = await supabase
        .from('suggestions_commercants')
        .select('id', { count: 'exact', head: true })
        .eq('nom_commerce', nom)
      await prevenirLAdmin(
        `Commerce réclamé · ${nom}`,
        emailSuggestionCommerce({ nom_commerce: nom, ...champs, deja: count || 1 }),
      )
      return NextResponse.json({ ok: true })
    }

    // type === 'envie' : demande d'activation d'une fonctionnalité.
    // Anti-spam métier : une seule envie par personne, par commerce et par
    // type sur sept jours. C'était fait dans le navigateur, donc contournable.
    const feature = texte(body.feature, 40)
    if (!body.commercant_id || !feature) {
      return NextResponse.json({ ok: false, error: 'paramètres manquants' }, { status: 400 })
    }
    // ⚠️ LISTE BLANCHE, posée le 26/08. Cette route acceptait N'IMPORTE QUELLE
    // chaîne de 40 caractères comme type de signal : un appelant pouvait donc
    // inventer autant de catégories qu'il voulait dans `upgrade_requests`, et
    // le commerçant lisait des statistiques polluées pour décider s'il change
    // de formule. La liste vit dans `lib/signaux.js`, avec les libellés qu'elle
    // sert : une seule source, jamais deux.
    if (!envieConnue(feature)) {
      return NextResponse.json({ ok: false, error: 'envie inconnue' }, { status: 400 })
    }
    if (clientId) {
      const ilYa7Jours = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
      const { data: deja } = await supabase
        .from('upgrade_requests')
        .select('id')
        .eq('client_id', clientId)
        .eq('commercant_id', body.commercant_id)
        .eq('type', feature)
        .gte('created_at', ilYa7Jours)
        .maybeSingle()
      if (deja) return NextResponse.json({ ok: true, deja: true })
    }
    const { error } = await supabase.from('upgrade_requests').insert({
      client_id: clientId,
      commercant_id: body.commercant_id,
      type: feature,
    })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    // ⚠️ LE DÉTAIL RESTE ICI. Le message d'une erreur de base nomme des tables,
    // des colonnes et des contraintes : cette route est ouverte aux visiteurs
    // sans compte, et ces trois formulaires sont la porte d'entrée du spam.
    // Le navigateur reçoit un refus, la cause reste dans le journal serveur.
    console.error('[signaux]', e)
    return NextResponse.json({ ok: false, error: 'envoi impossible' }, { status: 500 })
  }
}
