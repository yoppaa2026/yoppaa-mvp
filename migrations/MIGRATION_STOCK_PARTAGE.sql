-- ═══════════════════════════════════════════════════════════════════════════
-- LE STOCK QUI BAISSE, PARTAGÉ ENTRE TOUS LES JOURS (Alex, 08/10)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- « Le pot de confiture doit pouvoir partir avec une commande pour samedi,
-- tant qu'il y en a. » Un stock qui baisse (`stock_mode = 'magasin'`) n'est
-- fabriqué pour aucun jour : il est sur l'étagère.
--
-- 🔴 LE TROU DU 30/09, JAMAIS FERMÉ : la réservation comptait ce stock JOUR PAR
-- JOUR. Avec 8 pots, elle acceptait 8 pots pour aujourd'hui ET 8 pour samedi.
-- Même trou en boutique (vêtements, accessoires).
--
-- LA RÈGLE (tranchée au tableau le 08/10) :
--   reste = quantité saisie (`stock_jour`)
--         − tout ce qui est vendu DEPUIS LA SAISIE (`stock_maj_le`), quel que
--           soit le jour de retrait, hors annulées et non retirées
--         − les réservations en cours (paiement en cours), tous jours.
-- Aucun circuit : le pot se commande pour tout jour du calendrier.
-- Alimentaire ET boutique ET service.
--
-- ⚠️ UN ARTICLE À VARIANTES N'EST PAS COMPTÉ ICI : le stock de chaque variante
-- fait foi (5 articles sur l'essai, lu le 08/10).
-- ⚠️ `commandes.created_at` est SANS fuseau, en UTC (lu le 08/10) ;
-- `stock_maj_le` est AVEC fuseau. On compare `created_at AT TIME ZONE 'UTC'`.
-- ⚠️ À LANCER SUR L'ESSAI MAINTENANT ; EN PROD, APRÈS
-- MIGRATION_TEMPS3_DEUX_CIRCUITS.sql (cette fonction en reprend le texte).
--
-- ⚠️ RELEVÉ DU 08/10 : `decrement_stock` et `passer_commande_stock` écrivent
-- encore `articles.stock_jour`, mais AUCUN code ne les appelle. On n'y touche
-- pas ici ; le contrôle 10 dit qui peut les exécuter (nettoyage des droits).

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
  v_mode        text;
  v_stock_mag   int;
  v_maj         timestamptz;
  v_var         boolean;
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
    v_mode       := NULL;
    v_stock_mag  := NULL;
    v_maj        := NULL;
    v_var        := NULL;

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

    -- ═══ LE STOCK QUI BAISSE (08/10) : UN SEUL COMPTEUR, TOUS LES JOURS ═══
    -- Avant les circuits : il n'appartient à aucun jour. Verrouillé, la ligne
    -- de l'article porte la quantité saisie.
    SELECT stock_mode, stock_jour, stock_maj_le, COALESCE(gere_variantes, false)
      INTO v_mode, v_stock_mag, v_maj, v_var
    FROM articles
    WHERE id = v_article_id
    FOR UPDATE;

    IF v_mode = 'magasin' THEN
      -- Les variantes ont leur propre stock, qui fait foi.
      IF v_var THEN
        CONTINUE;
      END IF;
      -- Consommé = vendu DEPUIS LA SAISIE, tous jours de retrait, hors la nôtre
      -- + paiements en cours, tous jours, hors la nôtre.
      SELECT
        COALESCE((
          SELECT SUM(ca.quantite)
          FROM commande_articles ca
          JOIN commandes c ON c.id = ca.commande_id
          WHERE ca.article_id = v_article_id
            AND c.commercant_id = p_commercant_id
            AND c.statut NOT IN ('non_retire','annulee_paiement_ko','annulee_client_refund', 'annulee_commercant')
            AND c.id <> p_commande_id
            AND (c.created_at AT TIME ZONE 'UTC') >= v_maj
        ), 0)
        +
        COALESCE((
          SELECT SUM(r.quantite)
          FROM commande_stock_reservation r
          WHERE r.article_id = v_article_id
            AND r.expires_at > now()
            AND r.commande_id <> p_commande_id
        ), 0)
      INTO v_used;

      v_dispo := COALESCE(v_stock_mag, 0) - v_used;
      IF v_qte > v_dispo THEN
        RAISE EXCEPTION 'STOCK_INSUFFISANT:%:%', v_article_id, GREATEST(0, v_dispo) USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO commande_stock_reservation (commande_id, commercant_id, article_id, quantite, date_commande)
      VALUES (p_commande_id, p_commercant_id, v_article_id, v_qte, p_date);
      CONTINUE;
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

-- ─── CE QUI EST VENDU DEPUIS LA SAISIE, POUR LA FICHE ET LE TABLEAU DE BORD ──
-- Même compte que la réservation (sans les paiements en cours).
CREATE OR REPLACE FUNCTION public.ventes_stock_magasin(p_commercant_id uuid)
 RETURNS TABLE(article_id uuid, quantite bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ca.article_id, SUM(ca.quantite)::bigint
    FROM commande_articles ca
    JOIN commandes c ON c.id = ca.commande_id
    JOIN articles a ON a.id = ca.article_id
   WHERE c.commercant_id = p_commercant_id
     AND a.commercant_id = p_commercant_id
     AND a.stock_mode = 'magasin'
     AND c.statut NOT IN ('non_retire', 'annulee_paiement_ko', 'annulee_client_refund', 'annulee_commercant')
     AND (c.created_at AT TIME ZONE 'UTC') >= a.stock_maj_le
   GROUP BY ca.article_id;
$function$;

REVOKE ALL ON FUNCTION public.ventes_stock_magasin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ventes_stock_magasin(uuid) TO anon, authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — une seule requête, une ligne par vérification, valeur ET attendu
-- ═══════════════════════════════════════════════════════════════════════════

SELECT '01 la reservation compte le stock qui baisse sur tous les jours'::text AS controle,
       (SELECT CASE WHEN prosrc LIKE '%IF v_mode = ''magasin'' THEN%'
                     AND prosrc LIKE '%(c.created_at AT TIME ZONE ''UTC'') >= v_maj%'
                THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text AS valeur,
       'oui'::text AS attendu
UNION ALL
SELECT '02 les variantes restent hors de ce compte',
       (SELECT CASE WHEN prosrc LIKE '%IF v_var THEN%' THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       'oui'::text
UNION ALL
SELECT '03 deux circuits, fuseau et invendu toujours la',
       (SELECT CASE WHEN prosrc LIKE '%v_circuit_b := v_ab AND p_date > v_aujourdhui;%'
                     AND prosrc LIKE '%(c.created_at AT TIME ZONE ''UTC'' AT TIME ZONE ''Europe/Brussels'')::date = p_date%'
                     AND prosrc LIKE '%(v_item->>''invendu'') = ''true''%'
                THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       'oui'::text
UNION ALL
SELECT '04 correctif I5 et comptoir gardes',
       (SELECT CASE WHEN prosrc LIKE '%annulee_commercant%' AND prosrc LIKE '%stock_comptoir_le = p_date%' THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       'oui'::text
UNION ALL
SELECT '05 cinq lectures verrouillees (grille, article, B, comptoir, repli)',
       (SELECT ((LENGTH(prosrc) - LENGTH(REPLACE(prosrc, 'FOR UPDATE', ''))) / 10)
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       '5'::text
UNION ALL
SELECT '06 variables du stock qui baisse rearmees a chaque tour',
       (SELECT CASE WHEN prosrc LIKE '%v_mode       := NULL;%' AND prosrc LIKE '%v_maj        := NULL;%' THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       'oui'::text
UNION ALL
SELECT '07 droits d execution (reservation : service_role + authenticated)',
       (SELECT count(*) FROM information_schema.routine_privileges
         WHERE routine_name = 'reserver_stock_atomique' AND grantee IN ('service_role', 'authenticated') AND privilege_type = 'EXECUTE')::text,
       '2'::text
UNION ALL
SELECT '08 ventes depuis la saisie : la fonction existe et compte en UTC',
       (SELECT CASE WHEN prosrc LIKE '%(c.created_at AT TIME ZONE ''UTC'') >= a.stock_maj_le%' AND prosecdef THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'ventes_stock_magasin')::text,
       'oui'::text
UNION ALL
SELECT '09 droits sur ventes_stock_magasin (anon + authenticated, pas PUBLIC)',
       (SELECT count(*) FILTER (WHERE grantee IN ('anon', 'authenticated')) || ' / PUBLIC ' || count(*) FILTER (WHERE grantee = 'PUBLIC')
          FROM information_schema.routine_privileges
         WHERE routine_name = 'ventes_stock_magasin' AND privilege_type = 'EXECUTE')::text,
       '2 / PUBLIC 0'::text
UNION ALL
SELECT '10 qui peut executer decrement_stock et passer_commande_stock',
       (SELECT COALESCE(string_agg(DISTINCT routine_name || ':' || grantee, ', '), 'personne')
          FROM information_schema.routine_privileges
         WHERE routine_name IN ('decrement_stock', 'passer_commande_stock') AND privilege_type = 'EXECUTE')::text,
       'a lire (nettoyage des droits, a part)'::text;
