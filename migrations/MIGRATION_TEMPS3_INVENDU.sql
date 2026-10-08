-- ═══════════════════════════════════════════════════════════════════════════
-- TEMPS 3, CORRECTIF DE L'ESSAI : L'INVENDU DE FIN DE JOURNÉE (08/10)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 POUR L'ESSAI SEULEMENT. La prod recevra MIGRATION_TEMPS3_DEUX_CIRCUITS.sql,
-- déjà corrigé (contrôle 10b).
--
-- LE DÉFAUT : une tarte « sur commande seulement » (B seul, J+2) restée sur le
-- comptoir à 17 h, mise en offre de fin de journée, était refusée par la
-- réservation (ARTICLE_PAS_AUJOURDHUI). Règle du 04/09 : l'invendu est FAIT,
-- il ignore le délai, et donc le circuit ; son offre le plafonne.
--
-- LE REMÈDE : le serveur marque l'article `invendu: true` dans `p_items` quand
-- TOUTE sa consommation du panier vient d'une offre de fin de journée. La
-- réservation laisse alors passer un article qui ne se vend pas le jour même.
--
-- Seule la réservation change. Rien n'est touché dans les articles.

BEGIN;

CREATE OR REPLACE FUNCTION public.reserver_stock_atomique(p_commande_id uuid, p_commercant_id uuid, p_date date, p_jour_semaine text, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item        jsonb;
  v_article_id  uuid;
  v_qte         int;
  v_stock       int;
  v_actif       boolean;
  v_used        int;
  v_dispo       int;
  v_grille      boolean;
  v_comptoir    int;
  v_ab          boolean;
  v_aujourdhui  date;
  v_circuit_b   boolean;
  v_vente_jour  boolean;
  v_cmd_active  boolean;
  v_cmd_max     int;
BEGIN
  -- 🔴 DEUX CIRCUITS EN ALIMENTAIRE (08/10) : aujourd'hui = A, un autre jour = B.
  SELECT COALESCE(categorie, 'alimentaire') NOT IN ('detail', 'vitrine') INTO v_ab
    FROM commercants WHERE id = p_commercant_id;
  v_ab := COALESCE(v_ab, true);
  v_aujourdhui := (now() AT TIME ZONE 'Europe/Brussels')::date;
  v_circuit_b := v_ab AND p_date > v_aujourdhui;

  -- Verrous acquis dans un ordre déterministe (par article_id) pour éviter les deadlocks.
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_items)
    ORDER BY (value->>'article_id')
  LOOP
    v_article_id := (v_item->>'article_id')::uuid;
    v_qte        := (v_item->>'quantite')::int;

    -- ⚠️ ON RÉARME LES VARIABLES À CHAQUE TOUR. En plpgsql elles SURVIVENT d'une
    -- itération à l'autre : un article sans entrée hériterait sinon du `v_actif`
    -- de l'article précédent, et pourrait être refusé pour la mauvaise raison.
    v_stock      := NULL;
    v_actif      := NULL;
    v_comptoir   := NULL;
    v_vente_jour := NULL;
    v_cmd_active := NULL;
    v_cmd_max    := NULL;

    -- Verrou de sérialisation sur le stock du jour pour cet article.
    SELECT stock, actif INTO v_stock, v_actif
    FROM article_stock_jour
    WHERE article_id = v_article_id AND jour_semaine = p_jour_semaine
    FOR UPDATE;
    v_grille := FOUND;

    -- Un jour rendu indisponible le reste, dans les deux circuits.
    IF v_actif IS FALSE THEN
      RAISE EXCEPTION 'ARTICLE_INACTIF:%', v_article_id USING ERRCODE = 'P0001';
    END IF;

    IF v_circuit_b THEN
      -- ═══ B : SUR COMMANDE, POUR UN AUTRE JOUR ═══
      SELECT commande_active, commande_max_jour INTO v_cmd_active, v_cmd_max
      FROM articles
      WHERE id = v_article_id
      FOR UPDATE;
      IF v_cmd_active IS NOT TRUE THEN
        RAISE EXCEPTION 'ARTICLE_PAS_SUR_COMMANDE:%', v_article_id USING ERRCODE = 'P0001';
      END IF;
      -- Sans maximum : rien à compter.
      IF v_cmd_max IS NULL THEN
        CONTINUE;
      END IF;
      v_stock := v_cmd_max;

      -- Consommé = TOUTES les commandes de ce jour (toutes passées avant lui)
      -- + réservations actives, hors la nôtre.
      SELECT
        COALESCE((
          SELECT SUM(ca.quantite)
          FROM commande_articles ca
          JOIN commandes c ON c.id = ca.commande_id
          WHERE ca.article_id = v_article_id
            AND c.commercant_id = p_commercant_id
            AND c.date_commande = p_date
            AND c.statut NOT IN ('non_retire','annulee_paiement_ko','annulee_client_refund', 'annulee_commercant')
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
    ELSE
      -- ═══ A : VENDU AUJOURD'HUI (ou boutique : comme avant) ═══
      IF v_ab THEN
        SELECT vente_jour INTO v_vente_jour FROM articles WHERE id = v_article_id;
        IF v_vente_jour IS FALSE THEN
          -- 🔴 L'INVENDU DE FIN DE JOURNÉE (08/10) : la tarte à J+2 restée sur
          -- le comptoir à 17 h est FAITE, et son offre la plafonne. Le serveur
          -- marque l'article quand TOUTE sa consommation vient d'une offre.
          IF (v_item->>'invendu') = 'true' THEN
            CONTINUE;
          END IF;
          RAISE EXCEPTION 'ARTICLE_PAS_AUJOURDHUI:%', v_article_id USING ERRCODE = 'P0001';
        END IF;
      END IF;

      -- 🔴 LE COMPTOIR DU JOUR (temps 2) : saisi pour CETTE date, il fait foi à
      -- la place de la quantité par jour. Verrouillé, comme le repli.
      SELECT stock_comptoir INTO v_comptoir
      FROM articles
      WHERE id = v_article_id AND stock_comptoir_le = p_date AND stock_comptoir IS NOT NULL
      FOR UPDATE;

      IF FOUND THEN
        v_stock := v_comptoir;
      ELSIF NOT v_grille THEN
        -- 🔴 LE REPLI : le stock global du champ « défaut », verrouillé.
        SELECT stock_jour INTO v_stock
        FROM articles
        WHERE id = v_article_id
        FOR UPDATE;

        -- Aucun stock global positif : l'article n'est vraiment pas géré.
        IF v_stock IS NULL OR v_stock <= 0 THEN
          CONTINUE;
        END IF;
      END IF;

      -- Consommé = commandes de ce jour (hors la nôtre) + réservations actives.
      -- 🔴 EN ALIMENTAIRE, SEULES LES COMMANDES PASSÉES CE JOUR-LÀ : celles
      -- passées avant pour aujourd'hui sont du circuit B, préparées à part.
      SELECT
        COALESCE((
          SELECT SUM(ca.quantite)
          FROM commande_articles ca
          JOIN commandes c ON c.id = ca.commande_id
          WHERE ca.article_id = v_article_id
            AND c.commercant_id = p_commercant_id
            AND c.date_commande = p_date
            AND c.statut NOT IN ('non_retire','annulee_paiement_ko','annulee_client_refund', 'annulee_commercant')
            AND c.id <> p_commande_id
            AND (NOT v_ab OR (c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Brussels')::date = p_date)
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
    END IF;

    v_dispo := COALESCE(v_stock, 0) - v_used;

    IF v_qte > v_dispo THEN
      RAISE EXCEPTION 'STOCK_INSUFFISANT:%:%', v_article_id, GREATEST(0, v_dispo) USING ERRCODE = 'P0001';
    END IF;

    -- Réservation (TTL via le défaut expires_at = now() + 5 min de la table).
    INSERT INTO commande_stock_reservation (commande_id, commercant_id, article_id, quantite, date_commande)
    VALUES (p_commande_id, p_commercant_id, v_article_id, v_qte, p_date);
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reserver_stock_atomique(uuid, uuid, date, text, jsonb)
  TO service_role, authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — une seule requête, une ligne par vérification, valeur ET attendu
-- ═══════════════════════════════════════════════════════════════════════════

SELECT '01 l invendu passe (offre de fin de journee)'::text AS controle,
       (SELECT CASE WHEN prosrc LIKE '%(v_item->>''invendu'') = ''true''%' THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text AS valeur,
       'oui'::text AS attendu
UNION ALL
SELECT '02 les deux circuits sont toujours la (fuseau compris)',
       (SELECT CASE WHEN prosrc LIKE '%v_circuit_b := v_ab AND p_date > v_aujourdhui;%'
                     AND prosrc LIKE '%ARTICLE_PAS_SUR_COMMANDE%'
                     AND prosrc LIKE '%ARTICLE_PAS_AUJOURDHUI%'
                     AND prosrc LIKE '%(c.created_at AT TIME ZONE ''UTC'' AT TIME ZONE ''Europe/Brussels'')::date = p_date%'
                THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       'oui'::text
UNION ALL
SELECT '03 correctif I5 et comptoir gardes',
       (SELECT CASE WHEN prosrc LIKE '%annulee_commercant%' AND prosrc LIKE '%stock_comptoir_le = p_date%' THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       'oui'::text
UNION ALL
SELECT '04 quatre lectures verrouillees (grille, B, comptoir, repli)',
       (SELECT ((LENGTH(prosrc) - LENGTH(REPLACE(prosrc, 'FOR UPDATE', ''))) / 10)
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       '4'::text
UNION ALL
SELECT '05 droits d execution (service_role + authenticated)',
       (SELECT count(*) FROM information_schema.routine_privileges
         WHERE routine_name = 'reserver_stock_atomique' AND grantee IN ('service_role', 'authenticated') AND privilege_type = 'EXECUTE')::text,
       '2'::text;
