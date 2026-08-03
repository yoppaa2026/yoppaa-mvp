// Notifications post-confirmation d'une commande C&C : email Yopper +
// email commerçant (si notif_mode='chaque') + rappel push 30 min avant le
// créneau. Extrait du webhook Stripe (23/07) pour être partagé entre :
//   - le webhook (paiement en ligne confirmé)
//   - /api/stripe/checkout/create-commande (paiement sur place : la commande
//     est confirmée immédiatement, sans passer par Stripe)
// Fire-and-forget : try/catch par envoi, une erreur Resend n'interrompt rien.

import { envoyerAuCommercant, emailCommandeConfirmee, emailNouvelleCommandeCommercant } from '@/lib/resend'
import { programmerRappelCommande } from '@/lib/rappels'
import { normaliser as normaliserTva, ventiler as ventilerTva } from '@/lib/tva'

export async function envoyerEmailsCommande(commandeId, supabase) {
  // NB : la table commandes a client_email/client_nom/client_telephone.
  // commande_articles a quantite/prix_unitaire/options (jsonb). PAS de
  // prix_total ni option_libelle (calculés ici côté JS pour les templates).
  const { data: cmd, error: errCmd } = await supabase
    .from('commandes')
    .select(`
      id, numero_commande, total, date_commande,
      client_email, client_nom, client_telephone,
      annulation_token, mode_retrait, adresse_livraison, frais_livraison, bon_cadeau_montant,
      commercant:commercants(id, nom, slug, adresse, email, notif_mode, delai_annulation_heures, categorie),
      creneau:creneaux(heure_debut, heure_fin),
      creneau_livraison:livraison_creneaux(heure_debut, heure_fin),
      articles:commande_articles(quantite, prix_unitaire, options, tva_taux, article:articles(nom))
    `)
    .eq('id', commandeId)
    .single()
  if (errCmd || !cmd) {
    console.error('[commande-notifs] commande introuvable', { commandeId, errCmd })
    return
  }

  // Split client_nom (= "Alexandre Verstappen") → prenom + nom pour l'email
  const parts = (cmd.client_nom || '').trim().split(/\s+/)
  const prenom = parts[0] || 'Yopper'
  const nom = parts.slice(1).join(' ')

  // Format les options jsonb [{groupe_nom, valeur_nom, prix_supplement}] en libellé
  function formatOptions(opts) {
    if (!Array.isArray(opts) || opts.length === 0) return null
    return opts.map(o => `${o.groupe_nom ? o.groupe_nom + ': ' : ''}${o.valeur_nom || ''}`).join(' · ')
  }

  const articlesFlat = (cmd.articles || []).map(a => ({
    nom:            a.article?.nom || '—',
    quantite:       a.quantite,
    option_libelle: formatOptions(a.options),
    prix_total:     Number(a.prix_unitaire || 0) * Number(a.quantite || 0),
  }))

  // Ventilation de TVA du ticket, à partir des taux FIGÉS sur les lignes. Une
  // commande antérieure au figement n'a aucun taux : on n'affiche alors rien
  // plutôt qu'un chiffre faux. Les frais de livraison ne sont pas ventilés ici,
  // faute de taux qui leur soit propre : ils restent dans le total.
  const parTauxTicket = {}
  for (const a of (cmd.articles || [])) {
    const taux = normaliserTva(a.tva_taux)
    if (taux === null) continue
    const ttc = Number(a.prix_unitaire || 0) * Number(a.quantite || 0)
    parTauxTicket[taux] = (parTauxTicket[taux] || 0) + ttc
  }
  const ventilationTva = Object.entries(parTauxTicket)
    .map(([taux, ttc]) => {
      const { base, tva } = ventilerTva(ttc, Number(taux))
      return { taux: Number(taux), base, tva, ttc: Math.round(ttc * 100) / 100 }
    })
    .sort((a, b) => a.taux - b.taux)

  // 1) Email Yopper
  if (cmd.client_email) {
    try {
      const cren = cmd.mode_retrait === 'livraison' ? cmd.creneau_livraison : cmd.creneau
      // En base, mode_retrait='retrait' couvre DEUX mondes (le CHECK SQL n'a pas
      // de valeur 'retrait_boutique') : C&C alimentaire à créneau ET retrait
      // boutique détail sans créneau. On redérive le monde ici, sinon la branche
      // « Retrait en boutique » du template ne s'exécute jamais et l'encadré
      // d'annulation « Xh avant ton créneau » s'affiche sur une commande sans créneau.
      const modeEmail = (cmd.mode_retrait === 'retrait' && ['detail', 'vitrine'].includes(cmd.commercant?.categorie))
        ? 'retrait_boutique'
        : cmd.mode_retrait
      // CTA "crée un mot de passe" : offert aux Yoppers sans mot de passe utilisable —
      // invité pur (auth_user_id NULL) OU compte magic-link (has_password absent). Pas
      // d'offre si le compte a déjà un mot de passe (has_password === true). Le flag est
      // fiabilisé par un auto-repair au login par mot de passe (cf. commander/auth +
      // login). En cas de doute (lookup KO) on ne nag pas.
      const { data: cli } = await supabase.from('clients').select('auth_user_id').eq('email', cmd.client_email).maybeSingle()
      let offrirMdp = !cli?.auth_user_id
      if (cli?.auth_user_id) {
        try {
          const { data: au } = await supabase.auth.admin.getUserById(cli.auth_user_id)
          offrirMdp = au?.user?.user_metadata?.has_password !== true
        } catch {
          offrirMdp = false
        }
      }
      const html = emailCommandeConfirmee({
        yopper_prenom:           prenom,
        commercant_nom:          cmd.commercant?.nom || '',
        commercant_adresse:      cmd.commercant?.adresse || '',
        commercant_slug:         cmd.commercant?.slug || '',
        numero_commande:         cmd.numero_commande,
        articles:                articlesFlat,
        ventilation_tva:         ventilationTva,
        total:                   cmd.total,
        date_retrait:            cmd.date_commande,
        heure_debut:             cren?.heure_debut,
        heure_fin:               cren?.heure_fin,
        mode_retrait:            modeEmail,
        commercant_categorie:    cmd.commercant?.categorie,
        adresse_livraison:       cmd.adresse_livraison,
        frais_livraison:         cmd.frais_livraison,
        bon_cadeau_montant:      cmd.bon_cadeau_montant,
        annulation_token:        cmd.annulation_token,
        delai_annulation_heures: cmd.commercant?.delai_annulation_heures ?? 2,
        offrir_mdp:              offrirMdp,
        offrir_mdp_email:        cmd.client_email,
      })
      await envoyerAuCommercant({
        to: cmd.client_email,
        subject: `Ta commande chez ${cmd.commercant?.nom || 'le commerçant'} est confirmée`,
        html,
      })
    } catch (e) {
      console.error('[commande-notifs] envoi email Yopper KO', e?.message)
    }
  }

  // 2) Email commerçant (si notif_mode='chaque')
  if (cmd.commercant?.notif_mode === 'chaque' && cmd.commercant?.email) {
    try {
      const html = emailNouvelleCommandeCommercant({
        nom_commercant:   cmd.commercant.nom,
        yopper_prenom:    prenom,
        yopper_nom:       nom,
        yopper_email:     cmd.client_email,
        yopper_telephone: cmd.client_telephone,
        numero_commande:  cmd.numero_commande,
        articles:         articlesFlat,
        total:            cmd.total,
        date_retrait:     cmd.date_commande,
        heure_debut:      cmd.creneau?.heure_debut,
        heure_fin:        cmd.creneau?.heure_fin,
        notes_client:     cmd.notes_client,
      })
      await envoyerAuCommercant({
        to: cmd.commercant.email,
        subject: `Nouvelle commande #${cmd.numero_commande || ''} · ${prenom}`,
        html,
      })
    } catch (e) {
      console.error('[commande-notifs] envoi email commerçant KO', e?.message)
    }
  }

  // 3) Rappel push programmé 30 min avant le créneau (retrait uniquement).
  //    Best-effort, non bloquant. Voir lib/rappels.js.
  await programmerRappelCommande(commandeId, supabase)
}
