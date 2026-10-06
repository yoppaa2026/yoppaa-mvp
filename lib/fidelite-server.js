// lib/fidelite-server.js — crédit fidélité côté serveur (service_role only).
// Partagé entre /api/fidelite/crediter (commandes) et /api/cron/fidelite-rdv
// (RDV honorés de la veille). Idempotent : l'index unique de
// fidelite_mouvements (carte_id + commande_id / rdv_id) absorbe les doublons.

import { normaliserTelephone, appliquerCredit, retirerCredit, montantFidelisable, libelleRecompense } from '@/lib/fidelite'
import { STATUTS_COMMANDE_ANNULEE } from '@/lib/statuts-commande'
import { STATUTS_RDV_ANNULES } from '@/lib/remboursements'
import { smsCarteCreee, smsRecompenseDebloquee } from '@/lib/fidelite-sms'
import { creerRecompensesDebloquees } from '@/lib/fidelite-recompense-server'
import { envoyerAuCommercant, emailFideliteRecompenseDebloquee } from '@/lib/resend'
import { canDo, planEffectif } from '@/lib/plans'
import { prenomClient } from '@/lib/nom-client'
import { chezLeCommerce } from './nom-commerce'

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
        ? `Tu as débloqué ${nombre} récompenses ${chezLeCommerce(commercant.nom)}`
        : `Tu as débloqué une récompense ${chezLeCommerce(commercant.nom)}`,
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

// ⚠️ L'ÉLIGIBILITÉ VIT ICI ET NULLE PART AILLEURS. Elle était recopiée mot pour
// mot dans le crédit d'une commande et dans celui d'un rendez-vous, et le cron
// en portait une TROISIÈME version, fausse : il lisait `commercant.plan` au lieu
// de `planEffectif`, donc il refusait en silence la fidélité à tout commerçant
// EN ESSAI de Vendre, chaque nuit, alors que son tableau de bord la lui ouvrait.
//
// ⚠️ `planEffectif`, JAMAIS `commercant.plan` : l'essai est un plan, pas une
// promesse. Et `peut()` est interdit ici, il appliquerait la CATÉGORIE.
function fideliteAutoOuverte(commercant) {
  return Boolean(commercant?.fidelite_actif) && canDo(planEffectif(commercant), 'fidelite_auto')
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
      .select('id, statut, commercant_id, client_telephone, client_email, client_nom, total, bon_cadeau_montant, fidelite_remise')
      .eq('id', commandeId)
      .maybeSingle()
    if (!cmd) return { ok: false, reason: 'commande_introuvable' }
    // 🔴 LA RÈGLE VIT ICI, PAS CHEZ L'APPELANT (audit livraison, 05/10). Une
    // seule des quatre routes vérifiait le statut : les autres créditaient ce
    // qu'on leur donnait. Tous les chemins écrivent « récupérée » AVANT
    // d'appeler, une commande qui ne l'est pas ne remplit aucune carte.
    if (cmd.statut !== 'recupere') return { ok: false, reason: 'commande_non_finalisee' }

    const { data: commercant } = await supabase
      .from('commercants').select('*').eq('id', cmd.commercant_id).maybeSingle()
    // ⚠️ `planEffectif`, PAS `commercant.plan`. Depuis le 26/08 un commerçant
    // peut être EN ESSAI de Vendre : son tableau de bord lui ouvre la fidélité
    // automatique, et cette garde la lui refusait en silence. Sa carte ne se
    // remplissait pas, aucune erreur nulle part, et il aurait conclu que
    // l'essai ne sert à rien.
    // ⚠️ Le `select('*')` juste au-dessus rapporte bien `essai_plan` et
    // `created_at`, dont `planEffectif` a besoin.
    if (!fideliteAutoOuverte(commercant)) {
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

// ─── LE RETRAIT DU CRÉDIT D'UNE COMMANDE (décision d'Alex, 06/10) ────────────
//
// Appelé quand une commande créditée cesse de l'être : « ↩ Annuler la
// livraison / le retrait » (`retourArriere`) et toute annulation
// (`effetsAnnulationCommande`). La règle et son pourquoi : `retirerCredit`
// (lib/fidelite.js).
//
// ⚠️ IDEMPOTENT : sans ligne de crédit pour cette commande, rien ne se passe.
// La ligne est SUPPRIMÉE (l'index unique (carte_id, commande_id) laisserait
// sinon une nouvelle livraison sans crédit) et un `ajustement` négatif, sans
// `commande_id`, garde la trace dans l'historique de la carte.
//
// ⚠️ UNE RÉCOMPENSE RÉSERVÉE N'EST JAMAIS RETIRÉE : celle qu'une commande ou un
// rendez-vous en cours a déjà posée reste au client (il l'a choisie, le prix
// en dépend). On retire les plus récentes parmi les disponibles libres.
export async function retirerFideliteCommande(supabase, commandeId, journal = '[fidelite]') {
  try {
    const { data: mvt, error: errMvt } = await supabase
      .from('fidelite_mouvements')
      .select('id, carte_id, type, valeur')
      .eq('commande_id', commandeId)
      .in('type', ['passage', 'cagnotte'])
      .maybeSingle()
    if (errMvt) throw new Error(errMvt.message)
    if (!mvt) return { ok: true, rien: true }

    const { data: carte, error: errCarte } = await supabase
      .from('fidelite_cartes').select('*').eq('id', mvt.carte_id).maybeSingle()
    if (errCarte) throw new Error(errCarte.message)
    if (!carte) return { ok: false, reason: 'carte_introuvable' }
    const { data: commercant, error: errCom } = await supabase
      .from('commercants')
      .select('id, fidelite_mecanique, fidelite_seuil_passages, fidelite_taux_cagnotte, fidelite_seuil_cagnotte')
      .eq('id', carte.commercant_id).maybeSingle()
    if (errCom) throw new Error(errCom.message)
    if (!commercant) return { ok: false, reason: 'commerce_introuvable' }

    const { patch, aRetirer, manque, retire } = retirerCredit(commercant, carte, mvt)

    // La ligne de crédit part AVANT la carte : si deux retraits se croisent,
    // un seul la supprime, et c'est lui seul qui touche la carte.
    const { data: supprimee, error: errDel } = await supabase
      .from('fidelite_mouvements').delete().eq('id', mvt.id).select('id')
    if (errDel) throw new Error(errDel.message)
    if (!supprimee || supprimee.length === 0) return { ok: true, rien: true }

    const { error: errUp } = await supabase.from('fidelite_cartes').update(patch).eq('id', carte.id)
    if (errUp) throw new Error(errUp.message)

    if (aRetirer > 0) {
      const { data: libres, error: errLib } = await supabase
        .from('fidelite_recompenses').select('id')
        .eq('carte_id', carte.id).is('utilisee_at', null)
        .order('debloquee_at', { ascending: false }).limit(aRetirer + 10)
      if (errLib) throw new Error(errLib.message)
      const ids = (libres || []).map(r => r.id)
      let reservees = new Set()
      if (ids.length > 0) {
        const [{ data: cmds }, { data: rdvs }] = await Promise.all([
          supabase.from('commandes').select('fidelite_recompense_id').in('fidelite_recompense_id', ids)
            .not('statut', 'in', `(${STATUTS_COMMANDE_ANNULEE.join(',')})`),
          supabase.from('rdv_reservations').select('fidelite_recompense_id').in('fidelite_recompense_id', ids)
            .not('statut', 'in', `(${STATUTS_RDV_ANNULES.join(',')})`),
        ])
        reservees = new Set([...(cmds || []), ...(rdvs || [])].map(x => x.fidelite_recompense_id))
      }
      const aSupprimer = ids.filter(id => !reservees.has(id)).slice(0, aRetirer)
      if (aSupprimer.length > 0) {
        const { error: errSup } = await supabase.from('fidelite_recompenses').delete().in('id', aSupprimer)
        if (errSup) console.error(`${journal} récompense non retirée`, errSup.message, { carte_id: carte.id })
      }
      if (aSupprimer.length < aRetirer) {
        console.warn(`${journal} récompense réservée ou introuvable, laissée au client`, { carte_id: carte.id, attendu: aRetirer, retire: aSupprimer.length })
      }
    }

    // La trace : un ajustement négatif, sans commande (l'index unique).
    await supabase.from('fidelite_mouvements').insert({
      carte_id: carte.id, type: 'ajustement', source: 'system',
      valeur: mvt.type === 'passage' ? -1 : -retire,
    })
    if (manque > 0) {
      console.warn(`${journal} récompense déjà utilisée, non reprise (carte laissée à zéro)`, { carte_id: carte.id, manque })
    }
    return { ok: true, retire, recompenses_retirees: aRetirer, deja_utilisees: manque }
  } catch (e) {
    console.error(`${journal} retrait fidélité KO (non bloquant)`, e?.message)
    return { ok: false, reason: 'exception' }
  }
}

// ─── Le crédit d'UN RENDEZ-VOUS honoré ───────────────────────────────────────
//
// ⚠️ ÉCRIT LE 27/08 POUR QUE LA RÈGLE N'EXISTE QU'UNE FOIS. Elle vivait dans le
// cron quotidien, et il a fallu en ajouter un second appelant : la route que le
// tableau de bord appelle quand le commerçant clôture. Deux copies auraient
// divergé, exactement comme les deux systèmes de fidélité qu'on vient de
// supprimer le même jour.
//
// ⚠️ ET LE CRON LISAIT `commercant.plan`, PAS `planEffectif`. Un commerçant EN
// ESSAI de Vendre voyait donc son tableau de bord lui ouvrir la fidélité
// automatique, et le cron la lui refuser en silence chaque nuit. Le défaut avait
// déjà été trouvé sur les commandes le 26/08 ; il vivait encore ici.
//
// ⚠️ ON ACCEPTE `confirme` ET `honore`. Le commerçant n'est pas obligé de
// clôturer ses rendez-vous : celui qui ne touche à rien laisse `confirme`, et
// son client doit être crédité pareil. Rejouer est sans risque, l'index unique
// (carte_id, rdv_id) de `fidelite_mouvements` absorbe les doublons — c'est ce
// qui permet au cron de repasser derrière la route en filet.
export async function crediterFideliteRdv(supabase, rdvId, journal = '[fidelite]') {
  try {
    const { data: rdv, error: errRdv } = await supabase
      .from('rdv_reservations')
      .select('id, commercant_id, statut, deleted_at, client_telephone, client_email, client_prenom, prestation:rdv_prestations(prix)')
      .eq('id', rdvId)
      .maybeSingle()
    if (errRdv) throw new Error(errRdv.message)
    if (!rdv) return { ok: false, reason: 'rdv_introuvable' }
    if (rdv.deleted_at) return { ok: false, reason: 'rdv_supprime' }
    // ⚠️ JAMAIS un `no_show` ni une annulation : ces rendez-vous n'ont pas eu lieu.
    if (rdv.statut !== 'confirme' && rdv.statut !== 'honore') {
      return { ok: false, reason: 'rdv_non_honore' }
    }

    const { data: commercant } = await supabase
      .from('commercants').select('*').eq('id', rdv.commercant_id).maybeSingle()
    if (!fideliteAutoOuverte(commercant)) {
      return { ok: false, reason: 'fidelite_inactive' }
    }

    const credit = commercant.fidelite_mecanique === 'cagnotte'
      ? { montant: Number(rdv.prestation?.prix || 0) }
      : { passages: 1 }
    // Une cagnotte sans prix de prestation n'a rien à créditer.
    if (commercant.fidelite_mecanique === 'cagnotte' && !credit.montant) {
      return { ok: false, reason: 'prestation_sans_prix' }
    }

    return await crediterFidelite(supabase, commercant, rdv.client_telephone, credit, {
      source: 'rdv', rdv_id: rdv.id,
      client_email:  rdv.client_email || null,
      client_prenom: rdv.client_prenom || null,
    })
  } catch (e) {
    console.error(`${journal} credit fidelite RDV KO (non bloquant)`, e?.message)
    return { ok: false, reason: 'exception' }
  }
}
