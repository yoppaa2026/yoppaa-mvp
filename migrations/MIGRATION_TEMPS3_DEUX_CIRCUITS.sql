-- ═══════════════════════════════════════════════════════════════════════════
-- TEMPS 3 DE LA BOULANGERIE (Alex, 08/10) : DEUX CIRCUITS DE VENTE PAR ARTICLE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Modèle validé par Alex le 08/10 (tableau) :
--   A « VENDU AUJOURD'HUI » (`vente_jour`) : ce qui se retire LE JOUR MÊME.
--     Se compte comme avant : se renouvelle chaque jour (grille, quantité),
--     stock qui baisse, sans limite ; « Il en reste » (comptoir) aujourd'hui.
--   B « SUR COMMANDE » (`commande_active`) : ce qui se retire UN AUTRE JOUR.
--     Délai J+1 à J+14 (`delai_minutes`), maximum par jour
--     (`commande_max_jour`, NULL = sans limite), jours de vente (grille ✕).
--
-- 🔴 UN CROISSANT POUR SAMEDI PREND DANS LES 40 DE B, JAMAIS DANS LES 5 DE A.
-- Le jour J, une commande PASSÉE UN JOUR D'AVANT compte dans B (préparée à
-- part), une commande passée LE JOUR MÊME compte dans A (servie au comptoir).
-- On le sait par la date de la commande et le jour (belge) de sa création.
--
-- ⚠️ L'ALIMENTAIRE SEULEMENT. Une boutique ou un service garde son stock
-- partagé entre les jours (jour de retrait souhaité) : rien ne change pour eux.
--
-- ✅ L'EXISTANT NE CHANGE PAS DE COMPORTEMENT (Alex, tableau 08/10) :
--   • un article à délai (≥ 1 jour) passe en B seul, avec son délai ;
--   • un article sans délai garde A, et reçoit AUSSI B à J+1 si l'horizon du
--     commerce est d'au moins 2 jours (le défaut) : demain reste commandable,
--     avec la même quantité par jour comme maximum (ou sans limite) ;
--   • un « stock qui baisse » (magasin) ne reçoit pas B : un bocal ne se
--     réserve pas dans une fournée.
--
-- ⚠️ LES DEUX FONCTIONS SONT REPRISES DE LEUR TEXTE RÉEL EN BASE (lu le 07/10),
-- correctif I5 (`'annulee_commercant'`) et comptoir du temps 2 compris.

BEGIN;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS vente_jour        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS commande_active   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commande_max_jour integer;

ALTER TABLE public.articles DROP CONSTRAINT IF EXISTS articles_commande_max_jour_borne;
ALTER TABLE public.articles ADD CONSTRAINT articles_commande_max_jour_borne
  CHECK (commande_max_jour IS NULL OR commande_max_jour >= 1);

GRANT SELECT (vente_jour, commande_active, commande_max_jour) ON public.articles TO anon, authenticated;
GRANT INSERT (vente_jour, commande_active, commande_max_jour),
      UPDATE (vente_jour, commande_active, commande_max_jour) ON public.articles TO authenticated;

-- ─── L'EXISTANT ─────────────────────────────────────────────────────────────
-- 1) Les articles à délai : B seul, avec leur délai. Leur quantité par jour
--    (s'il y en avait une) devient le maximum par jour de B.
UPDATE public.articles a
   SET vente_jour = false,
       commande_active = true,
       commande_max_jour = CASE WHEN a.stock_mode = 'jour' AND COALESCE(a.stock_jour, 0) > 0 THEN a.stock_jour ELSE NULL END
  FROM public.commercants c
 WHERE c.id = a.commercant_id
   AND COALESCE(c.categorie, 'alimentaire') NOT IN ('detail', 'vitrine')
   AND COALESCE(a.delai_minutes, 0) >= 1440;

-- 2) Les articles sans délai d'un commerce qui prenait les commandes pour
--    demain : A (inchangé) + B à J+1, même quantité comme maximum.
UPDATE public.articles a
   SET commande_active = true,
       delai_minutes = 1440,
       commande_max_jour = CASE WHEN a.stock_mode = 'jour' AND COALESCE(a.stock_jour, 0) > 0 THEN a.stock_jour ELSE NULL END
  FROM public.commercants c
 WHERE c.id = a.commercant_id
   AND COALESCE(c.categorie, 'alimentaire') NOT IN ('detail', 'vitrine')
   AND COALESCE(a.delai_minutes, 0) < 1440
   AND a.stock_mode <> 'magasin'
   AND a.est_vitrine IS NOT TRUE
   AND COALESCE(c.horizon_commande, 2) >= 2;

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

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — une seule requête, une ligne par vérification, valeur ET attendu
-- ═══════════════════════════════════════════════════════════════════════════

SELECT '01 colonnes ajoutees'::text AS controle,
       (SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable, ', ' ORDER BY column_name)
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'articles'
           AND column_name IN ('vente_jour', 'commande_active', 'commande_max_jour'))::text AS valeur,
       'commande_active:boolean:NO, commande_max_jour:integer:YES, vente_jour:boolean:NO'::text AS attendu
UNION ALL
SELECT '02 borne du maximum par jour',
       (SELECT pg_get_constraintdef(oid) FROM pg_constraint
         WHERE conrelid = 'public.articles'::regclass AND conname = 'articles_commande_max_jour_borne')::text,
       'CHECK (commande_max_jour IS NULL OR >= 1)'::text
UNION ALL
SELECT '03 anon LIT les 3 colonnes',
       (SELECT count(*) FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'articles' AND grantee = 'anon' AND privilege_type = 'SELECT'
           AND column_name IN ('vente_jour', 'commande_active', 'commande_max_jour'))::text,
       '3'::text
UNION ALL
SELECT '04 le commercant les ecrit (authenticated INSERT + UPDATE)',
       (SELECT count(*) FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'articles' AND grantee = 'authenticated' AND privilege_type IN ('INSERT', 'UPDATE')
           AND column_name IN ('vente_jour', 'commande_active', 'commande_max_jour'))::text,
       '6'::text
UNION ALL
SELECT '05 articles a delai passes en B seul',
       (SELECT count(*) FILTER (WHERE a.vente_jour = false AND a.commande_active = true) || ' sur ' || count(*)
          FROM public.articles a JOIN public.commercants c ON c.id = a.commercant_id
         WHERE COALESCE(c.categorie, 'alimentaire') NOT IN ('detail', 'vitrine')
           AND COALESCE(a.delai_minutes, 0) >= 2880)::text,
       'les deux chiffres egaux'::text
UNION ALL
SELECT '06 articles sans delai qui gardent A (alimentaire)',
       (SELECT count(*) FILTER (WHERE a.vente_jour = true) || ' sur ' || count(*)
          FROM public.articles a JOIN public.commercants c ON c.id = a.commercant_id
         WHERE COALESCE(c.categorie, 'alimentaire') NOT IN ('detail', 'vitrine')
           AND COALESCE(a.delai_minutes, 0) < 2880)::text,
       'les deux chiffres egaux'::text
UNION ALL
SELECT '07 articles qui recoivent B a J+1 (demain reste commandable)',
       (SELECT count(*) FROM public.articles a
         WHERE a.vente_jour = true AND a.commande_active = true AND a.delai_minutes = 1440)::text,
       'a lire (articles sans delai des commerces a horizon >= 2)'::text
UNION ALL
SELECT '08 boutiques et services non touches',
       (SELECT count(*) FROM public.articles a JOIN public.commercants c ON c.id = a.commercant_id
         WHERE c.categorie IN ('detail', 'vitrine') AND (a.commande_active = true OR a.vente_jour = false))::text,
       '0'::text
UNION ALL
SELECT '09 aucun stock qui baisse en B',
       (SELECT count(*) FROM public.articles WHERE stock_mode = 'magasin' AND commande_active = true)::text,
       '0'::text
UNION ALL
SELECT '10 la reservation separe les deux circuits',
       (SELECT CASE WHEN prosrc LIKE '%v_circuit_b := v_ab AND p_date > v_aujourdhui;%'
                     AND prosrc LIKE '%commande_max_jour%'
                     AND prosrc LIKE '%ARTICLE_PAS_SUR_COMMANDE%'
                     AND prosrc LIKE '%ARTICLE_PAS_AUJOURDHUI%'
                     AND prosrc LIKE '%(c.created_at AT TIME ZONE ''UTC'' AT TIME ZONE ''Europe/Brussels'')::date = p_date%'
                THEN 'oui' ELSE 'non' END
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       'oui'::text
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
