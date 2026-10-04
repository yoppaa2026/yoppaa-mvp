// POST /api/yopper/supprimer-compte
//
// Droit à l'effacement (RGPD art. 17) et exigence des stores : Apple comme
// Google refusent toute app qui permet de créer un compte sans permettre de le
// supprimer DEPUIS l'app. Sans cette route, la soumission est rejetée avant
// même la revue humaine.
//
// Trois principes, arbitrés avec Alex le 03/08 :
//   1. Seul le compte YOPPER est concerné. Le commerçant a un contrat et un
//      abonnement, sa résiliation reste un échange humain.
//   2. Ce qui appartient à l'utilisateur est DÉTRUIT (favoris, préférences,
//      avis, cartes de fidélité, suggestions, préinscriptions).
//      Ce qui est une pièce comptable est CONSERVÉ mais ANONYMISÉ : la loi
//      belge impose sept ans de conservation des commandes et des rendez-vous.
//   3. On BLOQUE tant qu'un engagement est en cours (commande à préparer,
//      rendez-vous à venir, bon cadeau avec du solde), en expliquant pourquoi.
//      Un commerçant ne doit jamais se retrouver avec une commande fantôme.
//
// Body : { confirmation: 'SUPPRIMER' }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normaliserTelephone } from '@/lib/fidelite'
import { jourBruxelles } from '@/lib/timezone'
import { casquettesDuCompte } from '@/lib/casquettes-server'
import { connexionEffacable, raisonDeGarder, preinscriptionsAEffacer } from '@/lib/casquettes'
import { abonnementsQuiBloquentLaSuppression } from '@/lib/abonnements'

// Statuts qui signifient « le commerçant attend encore quelque chose de moi ».
const COMMANDES_EN_COURS = ['paiement_en_attente', 'en_attente', 'en_preparation', 'pret']

export async function POST(request) {
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })

    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'session invalide' }, { status: 401 })

    const { confirmation } = await request.json().catch(() => ({}))
    if (confirmation !== 'SUPPRIMER') {
      return NextResponse.json({ ok: false, error: 'confirmation manquante' }, { status: 400 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // 🔴 UNE CONNEXION, PLUSIEURS CASQUETTES (29/09, proposition A d'Alex).
    // Lues AVANT tout effacement : un patron, un membre d'équipe ou l'admin
    // qui supprime son profil Yopper garde sa connexion, qui sert ailleurs.
    // Sans ça, la base refusait l'effacement de la connexion d'un patron APRÈS
    // que ses données Yopper eurent été effacées : suppression à moitié faite.
    const casquettes = await casquettesDuCompte(admin, user)

    const email = String(user.email || '').trim().toLowerCase()

    // Un même email a pu créer plusieurs lignes clients au fil du temps
    // (commande invité puis compte). On les traite toutes.
    const { data: parAuth } = await admin.from('clients').select('id, email, telephone').eq('auth_user_id', user.id)
    const { data: parEmail } = email
      ? await admin.from('clients').select('id, email, telephone').eq('email', email)
      : { data: [] }
    const lignes = [...(parAuth || []), ...(parEmail || [])]
    const ids = [...new Set(lignes.map(c => c.id))]
    const telephones = [...new Set(lignes.map(c => normaliserTelephone(c.telephone)).filter(Boolean))]

    // ── 1. Garde-fous : rien ne doit rester en suspens ──────────────────────
    const blocages = []

    const { count: nbCommandes } = await admin
      .from('commandes')
      .select('id', { count: 'exact', head: true })
      .eq('client_email', email)
      .in('statut', COMMANDES_EN_COURS)
    if (nbCommandes > 0) {
      blocages.push(nbCommandes > 1
        ? `${nbCommandes} commandes sont encore en cours chez des commerçants.`
        : 'Une commande est encore en cours chez un commerçant.')
    }

    const aujourdhui = jourBruxelles()
    let requeteRdv = admin
      .from('rdv_reservations')
      .select('id', { count: 'exact', head: true })
      .eq('statut', 'confirme')
      .gte('date_rdv', aujourdhui)
    requeteRdv = ids.length > 0
      ? requeteRdv.or(`client_email.eq.${email},client_id.in.(${ids.join(',')})`)
      : requeteRdv.eq('client_email', email)
    const { count: nbRdv } = await requeteRdv
    if (nbRdv > 0) {
      blocages.push(nbRdv > 1
        ? `${nbRdv} rendez-vous sont encore à venir.`
        : 'Un rendez-vous est encore à venir.')
    }

    const { data: bonsActifs } = await admin
      .from('bons_cadeaux')
      .select('id, solde')
      .eq('statut', 'actif')
      .gt('solde', 0)
      .or(`acheteur_email.eq.${email},beneficiaire_email.eq.${email}`)
    if (bonsActifs?.length > 0) {
      // ⚠️ MULTI-COMMERCES, DONC PAS DE MÉTIER À NOMMER. Un Yopper qui supprime
      // son compte peut porter un bon de sa boulangerie et un de son coiffeur :
      // aucun des deux mots ne conviendrait. Règle d'Alex du 31/08, la même que
      // pour la liste « Mes bons » de l'accueil.
      blocages.push(bonsActifs.length > 1
        ? `${bonsActifs.length} bons ont encore du solde à utiliser.`
        : 'Un bon a encore du solde à utiliser.')
    }

    // 🔴 UN ABONNEMENT EN COURS BLOQUE AUSSI (Abo-I10, 04/10, décision d'Alex).
    // Le contrat est relié par l'email seul : il n'a pas de `client_id`.
    // ⚠️ UNE LECTURE RATÉE BLOQUE : on ne supprime pas un compte sur un « on ne
    // sait pas », la personne réessaie.
    if (email) {
      const { data: contrats, error: errAbo } = await admin
        .from('abonnements')
        .select('id, statut, type, date_debut, date_fin, seances_total, seances_deja_faites, deleted_at')
        .eq('client_email', email)
        .is('deleted_at', null)
      const idsContrats = (contrats || []).map(a => a.id)
      const { data: seancesAbo, error: errSeances } = idsContrats.length > 0
        ? await admin.from('rdv_reservations').select('abonnement_id, statut')
            .in('abonnement_id', idsContrats).is('deleted_at', null)
        : { data: [], error: null }
      if (errAbo || errSeances) {
        return NextResponse.json({ ok: false, error: 'Tes abonnements n’ont pas pu être vérifiés. Réessaie dans un instant.' }, { status: 500 })
      }
      const enCours = abonnementsQuiBloquentLaSuppression(contrats, seancesAbo, { aujourdhui })
      if (enCours.length > 0) {
        blocages.push(enCours.length > 1
          ? `${enCours.length} abonnements sont encore en cours. Demande au commerce de les résilier, ou attends leur fin.`
          : 'Un abonnement est encore en cours. Demande au commerce de le résilier, ou attends sa fin.')
      }
    }

    if (blocages.length > 0) {
      return NextResponse.json({
        ok: false,
        bloque: true,
        raisons: blocages,
        error: 'Ton compte ne peut pas encore être supprimé.',
      }, { status: 409 })
    }

    // ── 2. Destruction de ce qui appartient à l'utilisateur ─────────────────
    if (ids.length > 0) {
      await admin.from('favoris').delete().in('client_id', ids)
      await admin.from('client_preferences').delete().in('client_id', ids)
      await admin.from('suggestions_commercants').delete().in('client_id', ids)
      await admin.from('avis').delete().in('client_id', ids)
      await admin.from('fidelite_cartes').delete().in('client_id', ids)
      // 🔴 ET LA LISTE D'ATTENTE, QUE LA CASCADE NE TOUCHERAIT JAMAIS. La ligne
      // `clients` est ANONYMISÉE plus bas, pas supprimée (les commandes la
      // référencent) : un `ON DELETE CASCADE` ne se déclenche donc pas, et
      // l'attente survivrait à l'effacement du compte. Elle n'a aucune valeur
      // comptable, rien ne justifie de la garder.
      await admin.from('rdv_attente').delete().in('client_id', ids)
      // signalements_citoyens : table retirée avec le module des services
      // publics (09/08). Laisser l'appel ici ferait échouer le droit à
      // l'effacement, ce qui serait un comble sur cette route précisément.
    }
    // Les cartes de fidélité créées au comptoir n'ont pas de client_id : elles
    // ne sont rattachées qu'au numéro de GSM, qui est lui-même une donnée
    // personnelle. On les supprime aussi, sinon l'effacement est incomplet.
    for (const tel of telephones) {
      await admin.from('fidelite_cartes').delete().eq('telephone', tel)
    }
    if (email) {
      await admin.from('demandes_commande').delete().eq('client_email', email)
      // ⚠️ Un patron garde sa préinscription de commerçant (sa page de kit, ses
      // parrainages vivent d'elle) : on n'efface que celle de Yopper.
      const types = preinscriptionsAEffacer(casquettes)
      if (types) await admin.from('pre_inscriptions').delete().eq('email', email).in('type_utilisateur', types)
      else await admin.from('pre_inscriptions').delete().eq('email', email)
    }

    // ── 3. Anonymisation de ce que la comptabilité impose de garder ─────────
    const EMAIL_ANONYME = 'compte-supprime@yoppaa.invalid'
    if (email) {
      await admin.from('commandes')
        .update({ client_nom: 'Compte supprimé', client_email: EMAIL_ANONYME, client_telephone: null })
        .eq('client_email', email)

      await admin.from('rdv_reservations')
        .update({ client_prenom: 'Compte', client_nom: 'supprimé', client_email: EMAIL_ANONYME, client_telephone: null, notes_client: null })
        .eq('client_email', email)

      // L'achat est soldé : on efface l'acheteur. Le bénéficiaire d'un bon
      // encore valable, lui, n'est pas forcément la personne qui part.
      await admin.from('bons_cadeaux')
        .update({ acheteur_email: EMAIL_ANONYME, acheteur_prenom: 'Compte supprimé' })
        .eq('acheteur_email', email)
      await admin.from('bons_cadeaux')
        .update({ beneficiaire_email: EMAIL_ANONYME, beneficiaire_prenom: 'Compte supprimé', message: null })
        .eq('beneficiaire_email', email)
        .lte('solde', 0)

      // 🔴 LES ABONNEMENTS TERMINÉS OU RÉSILIÉS (Abo-I10, 04/10) : gardés sept
      // ans pour la comptabilité, comme les commandes, mais ANONYMISÉS. Ceux en
      // cours ont bloqué plus haut : il ne reste ici que des contrats finis.
      // `notes` part aussi : c'est ce que le commerce a écrit sur la personne.
      await admin.from('abonnements')
        .update({ client_prenom: 'Compte', client_nom: 'supprimé', client_email: EMAIL_ANONYME, client_telephone: null, notes: null })
        .eq('client_email', email)
    }

    // La ligne clients est conservée mais vidée : les commandes et les
    // rendez-vous la référencent, la détruire casserait l'historique comptable.
    for (const id of ids) {
      await admin.from('clients').update({
        email: `supprime-${String(id).slice(0, 8)}@yoppaa.invalid`,
        nom: 'Compte supprimé',
        prenom: null,
        telephone: null,
        code_postal: null,
        commune_id: null,
        auth_user_id: null,
        notifs_actives: false,
      }).eq('id', id)
    }

    // ── 4. Le compte de connexion lui-même ──────────────────────────────────
    //
    // 🔴 SEULEMENT S'IL NE SERT PLUS À RIEN D'AUTRE, et jamais celui de l'admin.
    // Le profil Yopper est effacé dans tous les cas (étapes 2 et 3) : c'est ce
    // que la personne a demandé, et ce que le RGPD et les stores exigent.
    if (!connexionEffacable(casquettes, 'yopper')) {
      console.info('[yopper/supprimer-compte] profil Yopper supprimé, connexion conservée', { lignes: ids.length, casquettes })
      return NextResponse.json({
        ok: true,
        connexion_conservee: true,
        message: `Ton profil Yopper est supprimé. ${raisonDeGarder(casquettes, 'yopper')}`,
      })
    }
    const { error: errAuth } = await admin.auth.admin.deleteUser(user.id)
    if (errAuth) {
      console.error('[yopper/supprimer-compte] suppression auth échouée', errAuth)
      return NextResponse.json({
        ok: false,
        error: 'Tes données ont été effacées mais la fermeture du compte a échoué. Écris-nous à dpo@yoppaa.app.',
      }, { status: 500 })
    }

    console.info('[yopper/supprimer-compte] compte supprimé', { lignes: ids.length })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[yopper/supprimer-compte]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
