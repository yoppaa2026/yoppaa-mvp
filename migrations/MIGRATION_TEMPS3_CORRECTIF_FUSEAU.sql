-- ═══════════════════════════════════════════════════════════════════════════
-- CORRECTIF DU TEMPS 3, POUR L'ESSAI SEULEMENT (08/10)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Le contrôle 17 de MIGRATION_TEMPS3_DEUX_CIRCUITS l'a montré : sur l'essai,
-- `commandes.created_at` est un timestamp SANS fuseau, enregistré en UTC. La
-- règle du jour J le lisait comme une heure belge : une commande passée la
-- veille à 23 h 30 passait pour une commande du jour (circuit A au lieu de B).
--
-- Ce correctif ne refait QUE les deux fonctions, avec la conversion en deux
-- temps (`AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Brussels'`). Les colonnes et
-- le rangement des articles sont déjà passés, on n'y touche pas.
--
-- ⚠️ LA PROD N'EN A PAS BESOIN : elle recevra MIGRATION_TEMPS3_DEUX_CIRCUITS
-- déjà corrigée.

BEGIN;

-- ─── LA RÉSERVATION, QUI PROTÈGE LA COURSE ──────────────────────────────────
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

-- ─── LE STOCK AFFICHÉ SUR LA FICHE ──────────────────────────────────────────
-- 🔴 MÊME RÈGLE : aujourd'hui, en alimentaire, seules les commandes PASSÉES
-- aujourd'hui entament le stock du jour ; un autre jour, toutes comptent (B).
CREATE OR REPLACE FUNCTION public.stock_commande_par_article(p_commercant_id uuid, p_date date)
 RETURNS TABLE(article_id uuid, quantite bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ca.article_id, SUM(ca.quantite)::bigint
    FROM commande_articles ca
    JOIN commandes c ON c.id = ca.commande_id
   WHERE c.commercant_id = p_commercant_id
     AND c.date_commande = p_date
     AND c.statut NOT IN ('non_retire', 'annulee_paiement_ko', 'annulee_client_refund', 'annulee_commercant')
     AND (
       p_date <> (now() AT TIME ZONE 'Europe/Brussels')::date
       OR (SELECT COALESCE(categorie, 'alimentaire') FROM commercants WHERE id = p_commercant_id) IN ('detail', 'vitrine')
       OR (c.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Brussels')::date = p_date
     )
   GROUP BY ca.article_id;
$function$;

REVOKE ALL ON FUNCTION public.stock_commande_par_article(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.stock_commande_par_article(uuid, date) TO anon, authenticated;

COMMIT;

-- CONTRÔLE — une seule requête, une ligne par vérification, valeur ET attendu

SELECT '10 la reservation separe les deux circuits (conversion UTC puis Bruxelles)'::text AS controle,
       (SELECT CASE WHEN prosrc LIKE '%v_circuit_b := v_ab AND p_date > v_aujourdhui;%'
                     AND prosrc LIKE '%commande_max_jour%'
                     AND prosrc LIKE '%ARTICLE_PAS_SUR_COMMANDE%'
                     AND prosrc LIKE '%ARTICLE_PAS_AUJOURDHUI%'
                     AND prosrc LIKE '%(c.created_at AT TIME ZONE ''UTC'' AT TIME ZONE ''Europe/Brussels'')::date = p_date%'
                THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text AS valeur,
       'oui'::text AS attendu
UNION ALL
SELECT '11 correctif I5 et comptoir gardes (reservation)',
       (SELECT CASE WHEN prosrc LIKE '%annulee_commercant%' AND prosrc LIKE '%stock_comptoir_le = p_date%' THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       'oui'::text
UNION ALL
SELECT '12 quatre lectures verrouillees (grille, B, comptoir, repli)',
       (SELECT ((LENGTH(prosrc) - LENGTH(REPLACE(prosrc, 'FOR UPDATE', ''))) / 10)
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       '4'::text
UNION ALL
SELECT '13 variables rearmees a chaque tour',
       (SELECT CASE WHEN prosrc LIKE '%v_cmd_max    := NULL;%' AND prosrc LIKE '%v_vente_jour := NULL;%' THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       'oui'::text
UNION ALL
SELECT '14 le stock affiche suit la meme regle',
       (SELECT CASE WHEN prosrc LIKE '%(c.created_at AT TIME ZONE ''UTC'' AT TIME ZONE ''Europe/Brussels'')::date = p_date%' AND prosrc LIKE '%annulee_commercant%' THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'stock_commande_par_article')::text,
       'oui'::text
UNION ALL
SELECT '15 droits d execution (reservation : service_role + authenticated)',
       (SELECT count(*) FROM information_schema.routine_privileges
         WHERE routine_name = 'reserver_stock_atomique' AND grantee IN ('service_role', 'authenticated') AND privilege_type = 'EXECUTE')::text,
       '2'::text
UNION ALL
SELECT '16 droits d execution (stock affiche : anon + authenticated)',
       (SELECT count(*) FROM information_schema.routine_privileges
         WHERE routine_name = 'stock_commande_par_article' AND grantee IN ('anon', 'authenticated') AND privilege_type = 'EXECUTE')::text,
       '2'::text
-- 🔴 LU SUR L'ESSAI LE 08/10 : `created_at` est un timestamp SANS fuseau,
-- enregistré en UTC (fuseau de la base). La règle du jour J le convertit donc
-- en deux temps : `AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Brussels'`. Lu comme
-- s'il était déjà belge, une commande de 23 h 30 la veille passait pour une
-- commande du jour.
UNION ALL
SELECT '17 type de commandes.created_at',
       (SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commandes' AND column_name = 'created_at')::text,
       'timestamp without time zone'::text
UNION ALL
SELECT '18 fuseau de la base (celui des created_at)',
       current_setting('TimeZone')::text,
       'UTC'::text;
