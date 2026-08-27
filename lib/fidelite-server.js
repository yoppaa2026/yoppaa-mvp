// lib/fidelite-server.js — crédit fidélité côté serveur (service_role only).
// Partagé entre /api/fidelite/crediter (commandes) et /api/cron/fidelite-rdv
// (RDV honorés de la veille). Idempotent : l'index unique de
// fidelite_mouvements (carte_id + commande_id / rdv_id) absorbe les doublons.

import { normaliserTelephone, appliquerCredit, montantFidelisable, libelleRecompense } from '@/lib/fidelite'
import { smsCarteCreee, smsRecompenseDebloquee } from '@/lib/fidelite-sms'
import { creerRecompensesDebloquees } from '@/lib/fidelite-recompense-server'
import { envoyerAuCommercant, emailFideliteRecompenseDebloquee } from '@/lib/resend'
import { canDo, planEffectif } from '@/lib/plans'
import { prenomClient } from '@/lib/nom-client'

// L'annonce par email d'une récompense qui vient d'être débloquée.
//
// ⚠️ ELLE NE PART QUE S'IL Y A UNE ADRESSE, et il n'y en a pas toujours. Le
// comptoir ne connaît qu'un numéro de téléphone : une récompense ouverte par un
// « +1 passage » reste annoncée par SMS seul. C'est assumé, pas un oubli
// (arbitrage d'Alex du 27/08). Une commande et un rendez-vous, eux, portent
// l'adresse de leur client.
//
// ⚠️ ON LIT LE RETOUR. `envoyer()` n'échoue jamais bruyamment : il attrape
// l'erreur Resend et rend `{ ok: false }`. Un `await` dont personne ne lit le
// résultat est un espoir, pas un envoi. C'est ce silence qui a caché pendant des
// mois des emails jamais partis (27/08).
async function annoncerRecompenseParEmail(commercant, carte, refs, nombre) {
  const to = String(refs?.client_email || '').trim()
  if (!to) return { ok: false, raison: 'sans_email' }
  try {
    const html = emailFideliteRecompenseDebloquee({
      prenom:         refs.client_prenom || 'Yopper',
      commercant_nom: commercant.nom,
      libelle:        libelleRecompense(commercant),
      nombre,
      carte_token:    carte?.token || null,
    })
    const res = await envoyerAuCommercant({
      to,
      subject: nombre > 1
        ? `Tu as débloqué ${nombre} récompenses chez ${commercant.nom}`
        : `Tu as débloqué une récompense chez ${commercant.nom}`,
      html,
    })
    if (!res?.ok) {
      console.error('[fidelite] email récompense NON PARTI', { commercant: commercant.id, erreur: res?.error })
    }
    return res
  } catch (e) {
    console.error('[fidelite] email récompense KO', e?.message)
    return { ok: false, erreur: e?.message }
  }
}

// Crédite une carte (créée à la volée si besoin) de façon idempotente.
// commercant = row complète (fidelite_*), credit = { passages? , montant? },
// refs = { source: 'commande'|'rdv'|'bon_cadeau', commande_id?, rdv_id?,
//          bon_cadeau_id?, client_email? }.
//
// client_email sert uniquement au SMS de bienvenue : il permet de savoir si la
// personne a déjà un compte, donc déjà sa carte sous les yeux.
export async function crediterFidelite(supabase, commercant, telephoneBrut, credit, refs) {
  const tel = normaliserTelephone(telephoneBrut)
  if (!tel) return { ok: false, reason: 'telephone_invalide' }

  // Carte existante ou création à la volée (23505 = course, on relit)
  let { data: carte, error: errSel } = await supabase
    .from('fidelite_cartes').select('*')
    .eq('commercant_id', commercant.id).eq('telephone', tel).maybeSingle()
  if (errSel) throw new Error(errSel.message)
  if (!carte) {
    const { data: nouvelle, error: errIns } = await supabase
      .from('fidelite_cartes')
      .insert({ commercant_id: commercant.id, telephone: tel })
      .select().single()
    if (errIns && errIns.code !== '23505') throw new Error(errIns.message)
    if (errIns) {
      const { data: relue } = await supabase.from('fidelite_cartes').select('*')
        .eq('commercant_id', commercant.id).eq('telephone', tel).maybeSingle()
      carte = relue
    } else {
      carte = nouvelle
    }
    if (!carte) return { ok: false, reason: 'carte_introuvable' }
    // SMS de bienvenue : le client n'a rien demandé, ce SMS est ce qui rend
    // sa carte VISIBLE (lien vers sa page). Best-effort, jamais bloquant.
    try { await smsCarteCreee(supabase, commercant, carte, refs.client_email || null) } catch { /* non bloquant */ }
  }

  // Anti-doublon AVANT le crédit : le mouvement porte la référence unique
  const estCagnotte = commercant.fidelite_mecanique === 'cagnotte'
  const { error: errMvt } = await supabase.from('fidelite_mouvements').insert({
    carte_id: carte.id,
    type: estCagnotte ? 'cagnotte' : 'passage',
    valeur: estCagnotte ? (credit.montant || 0) : 1,
    source: refs.source,
    commande_id: refs.commande_id || null,
    rdv_id: refs.rdv_id || null,
    // L'ancre d'idempotence des bons cadeaux : un webhook Stripe rejoué doit
    // rebondir sur l'index unique, jamais créditer deux fois.
    bon_cadeau_id: refs.bon_cadeau_id || null,
  })
  if (errMvt) {
    if (errMvt.code === '23505') return { ok: true, deja_credite: true }
    throw new Error(errMvt.message)
  }

  const { patch, debloquees } = appliquerCredit(commercant, carte, credit)
  const { error: errUp } = await supabase.from('fidelite_cartes').update(patch).eq('id', carte.id)
  if (errUp) throw new Error(errUp.message)

  if (debloquees > 0) {
    const mvts = Array.from({ length: debloquees }, () => ({
      carte_id: carte.id, type: 'recompense_debloquee', source: 'system',
    }))
    await supabase.from('fidelite_mouvements').insert(mvts)
    // 🔴 LA RÉCOMPENSE N'EXISTAIT QU'EN COMPTEUR, et ce branchement-ci n'avait
    // jamais été fait. La fiche l'annonçait au client en lisant
    // `recompenses_disponibles`, le SMS partait, mais le tunnel de paiement
    // cherche une LIGNE dans `fidelite_recompenses` et n'en trouvait aucune.
    // Le client voyait donc une récompense qu'il ne pouvait jamais dépenser.
    await creerRecompensesDebloquees(supabase, { carte, commercant, nombre: debloquees })
    // SMS « récompense débloquée » : le message qui fait revenir le client.
    // ⚠️ APRÈS la création : il annonce quelque chose qui doit exister quand le
    // client clique sur le lien.
    // ⚠️ ET IL DIT COMBIEN. Un crédit de cagnotte peut en ouvrir plusieurs d'un
    // coup, et le message restait au singulier.
    try { await smsRecompenseDebloquee(supabase, commercant, carte, debloquees) } catch { /* non bloquant */ }
    // ⚠️ ET L'EMAIL, POSÉ ICI ET NULLE PART AILLEURS. La fidélité unifiée
    // n'annonçait rien par email depuis la refonte du 24/08 : ni pour une
    // commande, ni pour un rendez-vous. Le poser au point de crédit couvre les
    // trois segments d'un seul geste, au lieu d'une route par tunnel.
    await annoncerRecompenseParEmail(commercant, carte, refs, debloquees)
  }
  return { ok: true, debloquees }
}

// ─── Le crédit d'UNE COMMANDE devenue récupérée ──────────────────────────────
//
// ⚠️ CE BLOC ÉTAIT RECOPIÉ, et il allait l'être une troisième fois. Une commande
// qui passe à « récupérée » remplit la carte de fidélité de son client, et
// jusqu'ici cela n'arrivait QUE par le geste du Yopper sur son écran de retrait.
// Le jour où un autre chemin mène au même statut, il doit créditer pareil, sinon
// le client perd un passage selon la façon dont sa commande a été clôturée. Et
// il ne le saura jamais.
//
// Best-effort et idempotent : l'index unique de `fidelite_mouvements` absorbe
// les doublons, et une erreur ici ne doit jamais empêcher la commande de se
// clôturer.
export async function crediterFideliteCommande(supabase, commandeId, journal = '[fidelite]') {
  try {
    const { data: cmd } = await supabase
      .from('commandes')
      // ⚠️ `fidelite_remise` EST INDISPENSABLE ICI. `montantFidelisable` la
      // retire du montant fidélisable ; absente du select, elle vaudrait
      // `undefined`, donc zéro, et la remise offerte remplirait la carte
      // suivante. Une colonne oubliée dans un select ne lève aucune erreur.
      // ⚠️ `client_nom` SERT L'EMAIL DE RÉCOMPENSE, et `commandes` ne porte PAS
      // de `client_prenom` : la colonne n'existe que sur les rendez-vous et les
      // abonnements. La demander ici ferait échouer la requête ENTIÈRE, pas
      // seulement le prénom (dix routes cassées le 27/08 pour cette raison).
      // `prenomClient` taille le prénom dans le nom complet.
      .select('id, commercant_id, client_telephone, client_email, client_nom, total, bon_cadeau_montant, fidelite_remise')
      .eq('id', commandeId)
      .maybeSingle()
    if (!cmd) return { ok: false, reason: 'commande_introuvable' }

    const { data: commercant } = await supabase
      .from('commercants').select('*').eq('id', cmd.commercant_id).maybeSingle()
    // ⚠️ `planEffectif`, PAS `commercant.plan`. Depuis le 26/08 un commerçant
    // peut être EN ESSAI de Vendre : son tableau de bord lui ouvre la fidélité
    // automatique, et cette garde la lui refusait en silence. Sa carte ne se
    // remplissait pas, aucune erreur nulle part, et il aurait conclu que
    // l'essai ne sert à rien.
    // ⚠️ Le `select('*')` juste au-dessus rapporte bien `essai_plan` et
    // `created_at`, dont `planEffectif` a besoin.
    if (!commercant?.fidelite_actif || !canDo(planEffectif(commercant), 'fidelite_auto')) {
      return { ok: false, reason: 'fidelite_inactive' }
    }

    // Hors part payée par bon cadeau : elle a déjà rempli la carte de celui qui
    // a acheté le bon.
    const credit = commercant.fidelite_mecanique === 'cagnotte'
      ? { montant: montantFidelisable(cmd) }
      : { passages: 1 }

    return await crediterFidelite(supabase, commercant, cmd.client_telephone, credit, {
      source: 'commande', commande_id: cmd.id, client_email: cmd.client_email || null,
      client_prenom: prenomClient(cmd),
    })
  } catch (e) {
    console.error(`${journal} credit fidelite KO (non bloquant)`, e?.message)
    return { ok: false, reason: 'exception' }
  }
}
