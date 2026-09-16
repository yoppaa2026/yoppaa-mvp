-- ════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE : POURQUOI LA TABLE GARANTIE N'EST PAS NÉE (16/09, essai E4 d'Alex)
--
-- Symptôme : E2 et E3 sont bons (la carte s'enregistre, Stripe ne débite rien),
-- mais la réservation n'apparaît PAS dans l'agenda et aucun email n'arrive.
--
-- Sur le chemin de l'empreinte, la table naît DANS LE WEBHOOK, après Stripe.
-- Trois causes possibles, et cette requête les sépare :
--   A. l'événement `checkout.session.completed` n'est jamais arrivé
--      → l'endpoint Stripe n'écoute pas cet événement POUR LES COMPTES CONNECTÉS ;
--   B. il est arrivé et le traitement a ÉCHOUÉ → `status = 'error'`, message lu ici ;
--   C. il est arrivé, il est en 'ok', et la table existe quand même → autre chose.
--
-- 🔴 AUCUNE DONNÉE PERSONNELLE N'EST LUE. La colonne `payload` contient
-- l'événement Stripe complet, donc l'email et le téléphone du client : elle
-- n'est JAMAIS sélectionnée ici. Les réservations ne sont que COMPTÉES.
-- ⚠️ `error_msg` est un message technique (identifiants Stripe), pas une fiche
-- client ; s'il contenait autre chose, ne le recopie pas tel quel.
--
-- Lecture seule. Rien n'est modifié.
-- ════════════════════════════════════════════════════════════════════════════

SELECT * FROM (

  -- ─── A. L'ÉVÉNEMENT EST-IL ARRIVÉ ? ─────────────────────────────────────
  SELECT 1 AS n,
    'A1. checkout.session.completed recus depuis 2 h' AS controle,
    count(*)::text AS valeur,
    'au moins 1 si tu viens de faire E2' AS attendu
  FROM stripe_webhook_events
  WHERE event_type = 'checkout.session.completed'
    AND processed_at > now() - interval '2 hours'

  UNION ALL
  -- Le compte : un événement de compte CONNECTÉ porte un `account_id`. S'il est
  -- vide, l'endpoint n'écoute que la plateforme, et la carte du restaurateur
  -- n'y arrivera jamais.
  SELECT 2,
    'A2. dont venant d un compte connecte (acct_)',
    count(*)::text,
    'au moins 1 ; zero = l endpoint n ecoute pas les evenements Connect'
  FROM stripe_webhook_events
  WHERE event_type = 'checkout.session.completed'
    AND processed_at > now() - interval '2 hours'
    AND account_id IS NOT NULL

  UNION ALL
  SELECT 3,
    'A3. dernier checkout.session.completed (heure · compte · statut)',
    coalesce((
      SELECT to_char(processed_at AT TIME ZONE 'Europe/Brussels', 'DD/MM HH24:MI')
             || ' · ' || coalesce(account_id, 'PLATEFORME') || ' · ' || status
      FROM stripe_webhook_events
      WHERE event_type = 'checkout.session.completed'
      ORDER BY processed_at DESC LIMIT 1
    ), 'AUCUN, JAMAIS'),
    'recent, un acct_, et statut ok'

  UNION ALL
  -- ─── B. LE TRAITEMENT A-T-IL ÉCHOUÉ ? ───────────────────────────────────
  SELECT 4,
    'B1. evenements en erreur depuis 2 h',
    count(*)::text,
    '0'
  FROM stripe_webhook_events
  WHERE status = 'error' AND processed_at > now() - interval '2 hours'

  UNION ALL
  SELECT 5,
    'B2. dernier message d erreur (la cause, en clair)',
    coalesce((
      SELECT left(coalesce(error_msg, 'sans message'), 180)
      FROM stripe_webhook_events
      WHERE status = 'error'
      ORDER BY processed_at DESC LIMIT 1
    ), 'AUCUNE ERREUR ENREGISTREE'),
    'aucune erreur'

  UNION ALL
  -- ─── TÉMOIN : le webhook fonctionne-t-il pour les autres flux ? ─────────
  SELECT 6,
    'C1. evenements recus toutes categories depuis 24 h',
    count(*)::text,
    'plusieurs ; zero = plus rien n arrive du tout'
  FROM stripe_webhook_events
  WHERE processed_at > now() - interval '24 hours'

  UNION ALL
  SELECT 7,
    'C2. types recus depuis 24 h',
    coalesce((
      SELECT string_agg(DISTINCT event_type, ', ')
      FROM stripe_webhook_events
      WHERE processed_at > now() - interval '24 hours'
    ), 'AUCUN'),
    'checkout.session.completed doit y figurer'

  UNION ALL
  -- ─── D. LA TABLE EXISTE-T-ELLE MALGRE TOUT ? (COMPTAGE SEUL) ────────────
  -- ⚠️ COMPTAGE, JAMAIS DE LIGNE : `rdv_reservations` porte des donnees
  -- personnelles, on ne lit ici que des nombres.
  SELECT 8,
    'D1. tables GARANTIES creees aujourd hui',
    count(*)::text,
    '1 si E2 a abouti, 0 si le webhook n a rien cree'
  FROM rdv_reservations
  WHERE date_rdv = (now() AT TIME ZONE 'Europe/Brussels')::date
    AND empreinte_statut = 'posee'
    AND deleted_at IS NULL

  UNION ALL
  SELECT 9,
    'D2. toutes reservations creees aujourd hui',
    count(*)::text,
    'celles de tes essais'
  FROM rdv_reservations
  WHERE created_at > now() - interval '6 hours'
    AND deleted_at IS NULL

) AS controle_webhook_empreinte
ORDER BY n;
