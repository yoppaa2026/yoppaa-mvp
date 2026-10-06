// POST /api/livraison/statut
//
// Notifie le Yopper (push OneSignal) quand le commerçant fait avancer le statut
// de livraison de sa commande : « en route » puis « livrée ».
//
// Best-effort et non bloquant : l'UI commerçant a déjà mis à jour le statut en DB
// (voir changerStatutLivraison dans app/dashboard/page.js). Cette route ne fait
// QUE le push ; un échec push ne doit jamais casser le flux.
//
// Body : { commande_id: UUID, statut_livraison: 'en_livraison' | 'livree' }
//
// Ciblage : par external_id OneSignal = clients.id, résolu depuis client_email de
// la commande (les commandes ne stockent pas de client_id).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refus } from '@/lib/api-auth'
import { gardeLigneEquipe } from '@/lib/equipe-server'
import { envoyerPushParExternalId } from '@/lib/onesignal'
import { envoyerAuCommercant, emailCommandeEnLivraison } from '@/lib/resend'
import { referenceCommande } from '@/lib/numero-commande'
// ⚠️ `commandes` N'A PAS DE COLONNE `client_prenom` : le nom complet vit
// dans `client_nom`. La demander faisait échouer TOUTE la requête, et la
// route annonçait « Commande introuvable » sur une commande bien présente.
import { prenomClient } from '@/lib/nom-client'
import { chezLeCommerce } from '@/lib/nom-commerce'
import { annonceConforme } from '@/lib/notif-statut'

export async function POST(request) {
  try {
    const { commande_id, statut_livraison } = await request.json()
    if (!commande_id || !['en_livraison', 'livree'].includes(statut_livraison)) {
      return NextResponse.json({ ok: false, error: 'commande_id + statut_livraison valide requis' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ GARDE D AUTORISATION, POSEE LE 21/08 avec les dix autres, OUVERTE AU
    // LIVREUR le 01/10 (équipe, étape 4) : le patron et l'admin passent comme
    // avant, un membre avec la case « Livraisons » aussi. Le commerce se déduit
    // de la commande. Même route pour tous : le message au client ne se
    // recopie pas.
    const verdict = await gardeLigneEquipe(request, supabase, 'commandes', commande_id, ['commandes', 'livraisons'])
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: cmd, error } = await supabase
      .from('commandes')
      .select(`
        id, numero_commande, numero_prefixe, client_email, client_nom,
        adresse_livraison, statut_livraison, statut, mode_retrait,
        commercant:commercants(nom, slug),
        creneau_livraison:livraison_creneaux(heure_debut, heure_fin)
      `)
      .eq('id', commande_id)
      .single()

    if (error || !cmd) {
      console.error('[livraison/statut] commande introuvable', { commande_id, error })
      return NextResponse.json({ ok: false, error: 'Commande introuvable' }, { status: 404 })
    }

    // 🔴 ON NE PRÉVIENT QUE DE CE QUI EST ÉCRIT. Cette route ne fait que
    // raconter : sans cette garde, n'importe quel membre pouvait envoyer « ta
    // commande arrive » au client d'une commande encore en préparation, autant
    // de fois qu'il le voulait. Le statut se pose AVANT, par
    // `/api/livraison/livrer` ; ici on vérifie qu'il est bien en base.
    //
    // ⚠️ ET LE STATUT DE LA COMMANDE AUSSI (06/10, mineur de l'audit) : une
    // commande annulée pendant la tournée gardait `en_livraison`, et « ta
    // commande arrive » pouvait encore partir. La règle : lib/notif-statut.js.
    if (!annonceConforme(cmd, statut_livraison)) {
      return NextResponse.json({ ok: false, error: 'Le statut de livraison n’est pas celui-là : rien n’a été envoyé.' }, { status: 409 })
    }

    // ⚠️ L'EMAIL PART AVANT LE PUSH, ET INDÉPENDAMMENT DE LUI.
    // Ce changement de statut n'était notifié QUE par push. Or le push web ne
    // fonctionne pas partout — Chrome sur iPhone ne le supporte pas — et un
    // Yopper qui n'a jamais accepté les notifications n'était prévenu de RIEN.
    // C'est pourtant le message qu'il ne faut pas rater : celui qui dit de
    // rester joignable parce que le commerçant est parti.
    //
    // « Livrée » ne déclenche pas d'email : le client vient de recevoir sa
    // commande en main propre, lui écrire pour le lui apprendre n'apporte rien.
    // 🟡 LE RÉSULTAT DE L'ENVOI EST LU (06/10) : `envoyer` ne lève jamais, et
    // la route répondait « ok » même quand l'email n'était pas parti. Le Poste
    // et le tableau de bord croyaient le client prévenu.
    let emailDu = false, emailParti = false
    if (statut_livraison === 'en_livraison' && cmd.client_email) {
      emailDu = true
      try {
        const envoi = await envoyerAuCommercant({
          to: cmd.client_email,
          subject: `🛵 Ta commande #${referenceCommande(cmd) || ''} arrive`,
          html: emailCommandeEnLivraison({
            yopper_prenom: prenomClient(cmd) || 'Yopper',
            commercant_nom: cmd.commercant?.nom || 'ton commerçant',
            numero_commande: referenceCommande(cmd),
            adresse_livraison: cmd.adresse_livraison,
            heure_debut: cmd.creneau_livraison?.heure_debut,
            heure_fin: cmd.creneau_livraison?.heure_fin,
          }),
        })
        emailParti = !!envoi?.ok
        if (!emailParti) console.error('[livraison/statut] email en route non parti', envoi?.error)
      } catch (e) {
        console.error('[livraison/statut] email en route KO', e?.message)
      }
    }
    const reponseEmail = (corps) => (emailDu && !emailParti)
      ? NextResponse.json({ ...corps, ok: false, email: false, error: 'Le client n’a pas reçu l’email « ta commande arrive ».' }, { status: 502 })
      : NextResponse.json(emailDu ? { ...corps, email: true } : corps)

    // Résolution external_id = clients.id via l'email de la commande.
    if (!cmd.client_email) {
      return reponseEmail({ ok: true, skipped: 'no_email' })
    }
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('email', cmd.client_email)
      .single()

    if (!client?.id) {
      return reponseEmail({ ok: true, skipped: 'no_client' })
    }

    const nomCommerce = cmd.commercant?.nom || 'ton commerçant'
    // Clic → onglet Commandes de l'app (où le Yopper confirme la réception).
    const url = '/commander?onglet=commandes'

    // ⚠️ LA NOTIFICATION SAUTAIT LE MODULE que l'email de ce même fichier
    // utilise pourtant deux lignes plus haut. Le préfixe était déjà chargé,
    // `referenceCommande` déjà importé : le client recevait « #12 » sur son
    // écran verrouillé et « LI12 » dans sa boîte mail, pour la même commande.
    const ref = referenceCommande(cmd) || ''
    const contenu = statut_livraison === 'en_livraison'
      ? {
          headings: '🛵 Ta commande arrive',
          contents: `${nomCommerce} est parti te livrer ta commande #${ref}. Prépare-toi à la réceptionner et confirme la réception dans l’app.`,
          data: { kind: 'livraison_en_route', commande_id: cmd.id },
        }
      : {
          headings: '✅ Commande livrée',
          contents: `Ta commande #${ref} de ${chezLeCommerce(nomCommerce)} a été livrée. Bon appétit !`,
          data: { kind: 'livraison_livree', commande_id: cmd.id },
        }

    const res = await envoyerPushParExternalId(client.id, { ...contenu, url, high_priority: true })

    // Le push est best-effort ; l'email, lui, est dit (voir plus haut).
    return reponseEmail({ ok: true, push: res })

  } catch (e) {
    console.error('[livraison/statut] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
