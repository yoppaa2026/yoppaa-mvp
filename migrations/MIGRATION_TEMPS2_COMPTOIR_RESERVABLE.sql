-- ═══════════════════════════════════════════════════════════════════════════
-- TEMPS 2 DE LA BOULANGERIE (Alex, 07/10) : « Réservable jusqu'à » et le
-- stock du COMPTOIR, séparé de la quantité SUR COMMANDE.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Décisions d'Alex (tableau, 07/10) :
--   • « Réservable jusqu'à » par article (A+B) : vide = automatique (une
--     semaine après le délai), sinon il ALLONGE le calendrier, jamais ne le
--     raccourcit.
--   • « Aujourd'hui au comptoir » séparé de « Par jour sur commande », au
--     choix, rien ne change pour les articles existants.
--
-- ⚠️ LE COMPTOIR NE VAUT QUE POUR LE JOUR OÙ IL A ÉTÉ SAISI (`stock_comptoir_le`).
-- Le lendemain, sans nouvelle saisie, c'est la quantité par jour qui revient :
-- un chiffre de mardi ne doit jamais plafonner mercredi.
--
-- ⚠️ LA FONCTION DE RÉSERVATION EST REPRISE DE SON TEXTE RÉEL EN BASE (lu le
-- 07/10), correctif I5 compris (`'annulee_commercant'`). Réécrite de mémoire,
-- elle aurait effacé ce correctif.
--
-- ⚠️ DROITS : la table a des droits COLONNE PAR COLONNE. Sans GRANT, un
-- `select('*')` de la fiche publique serait refusé EN BLOC. `anon` reçoit la
-- LECTURE seule (constat du 07/10 : il a INSERT/UPDATE sur les anciennes
-- colonnes, à nettoyer à part ; on ne reproduit pas l'erreur ici).
--
-- ⚠️ `delai_minutes` N'EST PAS TOUCHÉ : sa contrainte accepte déjà 0 à 20 160
-- minutes (14 jours), J+5, J+7 et J+14 compris.

BEGIN;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS horizon_jours     integer,
  ADD COLUMN IF NOT EXISTS stock_comptoir    integer,
  ADD COLUMN IF NOT EXISTS stock_comptoir_le date;

ALTER TABLE public.articles DROP CONSTRAINT IF EXISTS articles_horizon_jours_borne;
ALTER TABLE public.articles ADD CONSTRAINT articles_horizon_jours_borne
  CHECK (horizon_jours IS NULL OR (horizon_jours >= 1 AND horizon_jours <= 60));

ALTER TABLE public.articles DROP CONSTRAINT IF EXISTS articles_stock_comptoir_borne;
ALTER TABLE public.articles ADD CONSTRAINT articles_stock_comptoir_borne
  CHECK (stock_comptoir IS NULL OR stock_comptoir >= 0);

GRANT SELECT (horizon_jours, stock_comptoir, stock_comptoir_le) ON public.articles TO anon, authenticated;
GRANT INSERT (horizon_jours, stock_comptoir, stock_comptoir_le),
      UPDATE (horizon_jours, stock_comptoir, stock_comptoir_le) ON public.articles TO authenticated;

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
BEGIN
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
    v_stock    := NULL;
    v_actif    := NULL;
    v_comptoir := NULL;

    -- Verrou de sérialisation sur le stock du jour pour cet article.
    SELECT stock, actif INTO v_stock, v_actif
    FROM article_stock_jour
    WHERE article_id = v_article_id AND jour_semaine = p_jour_semaine
    FOR UPDATE;
    v_grille := FOUND;

    -- Un jour rendu indisponible le reste, comptoir ou pas.
    IF v_actif IS FALSE THEN
      RAISE EXCEPTION 'ARTICLE_INACTIF:%', v_article_id USING ERRCODE = 'P0001';
    END IF;

    -- 🔴 LE COMPTOIR DU JOUR (07/10) : saisi pour CETTE date, il fait foi à la
    -- place de la quantité par jour. Verrouillé, comme le repli.
    SELECT stock_comptoir INTO v_comptoir
    FROM articles
    WHERE id = v_article_id AND stock_comptoir_le = p_date AND stock_comptoir IS NOT NULL
    FOR UPDATE;

    IF FOUND THEN
      v_stock := v_comptoir;
    ELSIF NOT v_grille THEN
      -- 🔴 LE REPLI QUI MANQUAIT : le stock global du champ « défaut ».
      -- Verrouillé lui aussi, sinon deux commandes simultanées liraient la même
      -- valeur et passeraient toutes les deux.
      SELECT stock_jour INTO v_stock
      FROM articles
      WHERE id = v_article_id
      FOR UPDATE;

      -- Aucun stock global positif : l'article n'est vraiment pas géré.
      IF v_stock IS NULL OR v_stock <= 0 THEN
        CONTINUE;
      END IF;
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

-- ⚠️ GRANT REPOSÉ : un `CREATE OR REPLACE` conserve les droits, mais on ne parie
-- pas là-dessus. Une fonction sans droit se refuse au moment du paiement.
GRANT EXECUTE ON FUNCTION public.reserver_stock_atomique(uuid, uuid, date, text, jsonb)
  TO service_role, authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — une seule requête, une ligne par vérification, valeur ET attendu
-- ═══════════════════════════════════════════════════════════════════════════

SELECT '01 colonnes ajoutees'::text AS controle,
       (SELECT string_agg(column_name || ':' || data_type, ', ' ORDER BY column_name)
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'articles'
           AND column_name IN ('horizon_jours', 'stock_comptoir', 'stock_comptoir_le'))::text AS valeur,
       'horizon_jours:integer, stock_comptoir:integer, stock_comptoir_le:date'::text AS attendu
UNION ALL
SELECT '02 borne horizon_jours',
       (SELECT pg_get_constraintdef(oid) FROM pg_constraint
         WHERE conrelid = 'public.articles'::regclass AND conname = 'articles_horizon_jours_borne')::text,
       'CHECK (horizon_jours IS NULL OR 1..60)'::text
UNION ALL
SELECT '03 borne stock_comptoir',
       (SELECT pg_get_constraintdef(oid) FROM pg_constraint
         WHERE conrelid = 'public.articles'::regclass AND conname = 'articles_stock_comptoir_borne')::text,
       'CHECK (stock_comptoir IS NULL OR >= 0)'::text
UNION ALL
SELECT '04 anon LIT les 3 colonnes',
       (SELECT count(*) FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'articles' AND grantee = 'anon'
           AND privilege_type = 'SELECT'
           AND column_name IN ('horizon_jours', 'stock_comptoir', 'stock_comptoir_le'))::text,
       '3'::text
UNION ALL
SELECT '05 anon N ECRIT PAS les 3 colonnes',
       (SELECT count(*) FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'articles' AND grantee = 'anon'
           AND privilege_type IN ('INSERT', 'UPDATE')
           AND column_name IN ('horizon_jours', 'stock_comptoir', 'stock_comptoir_le'))::text,
       '0'::text
UNION ALL
SELECT '06 le commercant les ecrit (authenticated INSERT + UPDATE)',
       (SELECT count(*) FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'articles' AND grantee = 'authenticated'
           AND privilege_type IN ('INSERT', 'UPDATE')
           AND column_name IN ('horizon_jours', 'stock_comptoir', 'stock_comptoir_le'))::text,
       '6'::text
UNION ALL
SELECT '07 la reservation lit le comptoir du jour',
       (SELECT CASE WHEN prosrc LIKE '%stock_comptoir_le = p_date%' THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       'oui'::text
UNION ALL
SELECT '08 le correctif I5 est garde (annulee_commercant)',
       (SELECT CASE WHEN prosrc LIKE '%annulee_commercant%' THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       'oui'::text
UNION ALL
SELECT '09 trois lectures verrouillees (grille, comptoir, repli)',
       (SELECT ((LENGTH(prosrc) - LENGTH(REPLACE(prosrc, 'FOR UPDATE', ''))) / 10)
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       '3'::text
UNION ALL
SELECT '10 variables rearmees a chaque tour',
       (SELECT CASE WHEN prosrc LIKE '%v_comptoir := NULL;%' AND prosrc LIKE '%v_actif    := NULL;%' THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       'oui'::text
UNION ALL
SELECT '11 droits d execution de la reservation',
       (SELECT count(*) FROM information_schema.routine_privileges
         WHERE routine_name = 'reserver_stock_atomique'
           AND grantee IN ('service_role', 'authenticated') AND privilege_type = 'EXECUTE')::text,
       '2'::text
UNION ALL
SELECT '12 aucun article existant touche (comptoir et horizon vides)',
       (SELECT count(*) FROM public.articles
         WHERE horizon_jours IS NOT NULL OR stock_comptoir IS NOT NULL OR stock_comptoir_le IS NOT NULL)::text,
       '0'::text;
