-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION STOCK RACE — réservation de stock ATOMIQUE (Sprint 3 Sécurité MVP)
--
-- Problème : create-commande faisait un check "dispo" en JS PUIS un insert de
-- réservation, en 2 requêtes séparées (non atomique). Deux commandes simultanées
-- sur le dernier article passaient toutes deux le check → SURVENTE.
--
-- Fix : une fonction qui, dans UNE seule transaction, verrouille la ligne de
-- stock du jour (FOR UPDATE), recompte le consommé (commandes non annulées +
-- réservations actives), vérifie la dispo, et insère la réservation. Le verrou
-- sérialise les commandes concurrentes sur le même article/jour : la 2e attend
-- la 1re et voit sa réservation → plus de survente.
--
-- Sémantique IDENTIQUE à l'ancien check JS (mêmes exclusions de statut), juste
-- rendue atomique. Les articles sans stock géré ce jour-là sont ignorés (pas de
-- limite, pas de réservation), comme avant.
--
-- Anti-deadlock : les items sont verrouillés triés par article_id (ordre stable).
-- En cas d'échec (stock insuffisant ou article inactif), RAISE → toute la fonction
-- est annulée (aucune réservation partielle ne persiste).
--
-- Idempotent (CREATE OR REPLACE). À passer dans Supabase SQL Editor.
-- Date : 2026-07-06
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION reserver_stock_atomique(
  p_commande_id  uuid,
  p_commercant_id uuid,
  p_date         date,
  p_jour_semaine text,
  p_items        jsonb   -- [{"article_id":"uuid","quantite":N}, ...]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item        jsonb;
  v_article_id  uuid;
  v_qte         int;
  v_stock       int;
  v_actif       boolean;
  v_used        int;
  v_dispo       int;
BEGIN
  -- Verrous acquis dans un ordre déterministe (par article_id) pour éviter les deadlocks.
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_items)
    ORDER BY (value->>'article_id')
  LOOP
    v_article_id := (v_item->>'article_id')::uuid;
    v_qte        := (v_item->>'quantite')::int;

    -- Verrou de sérialisation sur le stock du jour pour cet article.
    SELECT stock, actif INTO v_stock, v_actif
    FROM article_stock_jour
    WHERE article_id = v_article_id AND jour_semaine = p_jour_semaine
    FOR UPDATE;

    -- Article sans stock géré ce jour-là : aucune limite, pas de réservation.
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_actif IS FALSE THEN
      RAISE EXCEPTION 'ARTICLE_INACTIF:%', v_article_id USING ERRCODE = 'P0001';
    END IF;

    -- Consommé = commandes non annulées du jour (hors la nôtre) + réservations actives (hors la nôtre).
    SELECT
      COALESCE((
        SELECT SUM(ca.quantite)
        FROM commande_articles ca
        JOIN commandes c ON c.id = ca.commande_id
        WHERE ca.article_id = v_article_id
          AND c.commercant_id = p_commercant_id
          AND c.date_commande = p_date
          AND c.statut NOT IN ('non_retire','annulee_paiement_ko','annulee_client_refund')
          AND c.id <> p_commande_id
      ), 0)
      +
      COALESCE((
        SELECT SUM(r.quantite)
        FROM commande_stock_reservation r
        WHERE r.article_id = v_article_id
          AND r.date_commande = p_date
          AND r.expires_at > now()
          AND r.commande_id <> p_commande_id
      ), 0)
    INTO v_used;

    v_dispo := COALESCE(v_stock, 0) - v_used;

    IF v_qte > v_dispo THEN
      RAISE EXCEPTION 'STOCK_INSUFFISANT:%:%', v_article_id, GREATEST(0, v_dispo) USING ERRCODE = 'P0001';
    END IF;

    -- Réservation (TTL via le défaut expires_at = now() + 5 min de la table).
    INSERT INTO commande_stock_reservation (commande_id, commercant_id, article_id, quantite, date_commande)
    VALUES (p_commande_id, p_commercant_id, v_article_id, v_qte, p_date);
  END LOOP;
END;
$$;

-- GRANT explicite (create-commande appelle en service_role ; authenticated par sécurité).
GRANT EXECUTE ON FUNCTION reserver_stock_atomique(uuid, uuid, date, text, jsonb)
  TO service_role, authenticated;
