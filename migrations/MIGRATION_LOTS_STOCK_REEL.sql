-- ════════════════════════════════════════════════════════════════════════════
-- LE STOCK RÉELLEMENT CONSOMMÉ PAR UNE LIGNE (lots et duos)
-- Trouvé à l'audit des articles au poids (11/10) ; décision d'Alex (tableau) :
-- chantier À PART, corrigé et poussé AVANT le poids.
-- ════════════════════════════════════════════════════════════════════════════
--
-- LE DÉFAUT : un lot « 3+1 » enregistrait `quantite` = 1 (un lot). La
-- consommation réelle (4) n'allait QUE dans la réservation de 5 minutes du
-- paiement. Ensuite, toutes les sommes de stock relisaient `quantite` : le
-- stock ne baissait que d'UNE unité, et le second article d'un duo jamais.
-- Lu en base le 11/10 (LECTURE_LOTS_OPTIONS_11_10.sql) : une offre en lot
-- active (essai et prod), aucun duo, AUCUNE ligne déjà vendue en lot. Rien à
-- rattraper dans le passé.
--
-- CE QUE FAIT CETTE MIGRATION :
--   A. deux colonnes FIGÉES sur la ligne, à la vente :
--      `quantite_stock` = les unités physiques retirées (lot : lots × unités) ;
--      `duo_article_id` = le second article d'un duo (il en retire `quantite`).
--      NULL pour toutes les lignes existantes : la vue retombe sur `quantite`.
--   B. la vue `consommation_stock` : UNE ligne par article retiré, quantité
--      réelle. Le second article d'un duo y a sa propre ligne.
--   C. les trois fonctions de stock lisent la vue au lieu de la table. Elles
--      sont RELUES EN BASE (`pg_get_functiondef`, empreintes vérifiées le
--      11/10 sur l'essai et la prod) : seule leur source change. Si le texte
--      attendu n'est pas trouvé le bon nombre de fois, tout s'arrête et RIEN
--      n'est modifié (une seule transaction).
--   `vendu_par_offre` ne change PAS : le plafond d'une offre compte des lots.
--
-- ⚠️ LA VUE EST EN `security_invoker` : lue par le tableau de bord, elle
-- applique la RLS de `commande_articles` (une vue sans cela l'ignore). Elle
-- n'est pas écrivable (UNION ALL), et fermée aux visiteurs (anon).
--
-- À passer sur l'ESSAI puis la PROD, AVANT le code. Idempotent. Date : 2026-10-11
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── A. LES COLONNES ───────────────────────────────────────────────────────
ALTER TABLE public.commande_articles
  ADD COLUMN IF NOT EXISTS quantite_stock integer,
  ADD COLUMN IF NOT EXISTS duo_article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL;

ALTER TABLE public.commande_articles DROP CONSTRAINT IF EXISTS commande_articles_quantite_stock_borne;
ALTER TABLE public.commande_articles
  ADD CONSTRAINT commande_articles_quantite_stock_borne CHECK (quantite_stock IS NULL OR quantite_stock >= 0);

COMMENT ON COLUMN public.commande_articles.quantite_stock IS
  'Unites physiques retirees du stock par cette ligne, figees a la vente (lot : lots x unites). NULL = quantite.';
COMMENT ON COLUMN public.commande_articles.duo_article_id IS
  'Second article d un duo, fige a la vente : il retire quantite unites de son propre stock.';

-- ─── B. LA VUE ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.consommation_stock WITH (security_invoker = true) AS
  SELECT ca.commande_id, ca.article_id, COALESCE(ca.quantite_stock, ca.quantite) AS quantite
    FROM public.commande_articles ca
  UNION ALL
  SELECT ca.commande_id, ca.duo_article_id AS article_id, ca.quantite
    FROM public.commande_articles ca
   WHERE ca.duo_article_id IS NOT NULL;

COMMENT ON VIEW public.consommation_stock IS
  'Ce que chaque ligne de commande retire reellement du stock, article par article (lots et duos compris).';

REVOKE ALL ON public.consommation_stock FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.consommation_stock TO authenticated, service_role;

-- ─── C. LES TROIS FONCTIONS DE STOCK LISENT LA VUE ─────────────────────────
DO $$
DECLARE
  r record;
  avant text;
  apres text;
  motif constant text := 'FROM commande_articles ca';
  n int;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname,
           CASE p.proname WHEN 'reserver_stock_atomique' THEN 3 ELSE 1 END AS attendu
      FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
     WHERE s.nspname = 'public'
       AND p.proname IN ('reserver_stock_atomique', 'stock_commande_par_article', 'ventes_stock_magasin')
  LOOP
    avant := pg_get_functiondef(r.oid);
    IF position('consommation_stock' IN avant) > 0 THEN CONTINUE; END IF;  -- déjà fait
    n := (length(avant) - length(replace(avant, motif, ''))) / length(motif);
    IF n <> r.attendu THEN
      RAISE EXCEPTION 'Fonction % : % lecture(s) de commande_articles trouvée(s), % attendue(s). Rien n''a été modifié.', r.proname, n, r.attendu;
    END IF;
    apres := replace(avant, motif, 'FROM public.consommation_stock ca');
    EXECUTE apres;
  END LOOP;
END $$;

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, valeur ET attendu ──────────────
SELECT * FROM (
  SELECT 1 AS n, 'colonnes quantite_stock et duo_article_id (type:nullable)'::text AS controle,
         (SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable, ', ' ORDER BY column_name)
            FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'commande_articles'
             AND column_name IN ('quantite_stock', 'duo_article_id'))::text AS valeur,
         'duo_article_id:uuid:YES, quantite_stock:integer:YES'::text AS attendu
  UNION ALL SELECT 2, 'contrainte quantite_stock',
         (SELECT pg_get_constraintdef(oid) FROM pg_constraint
           WHERE conrelid = 'public.commande_articles'::regclass AND conname = 'commande_articles_quantite_stock_borne')::text,
         'CHECK (((quantite_stock IS NULL) OR (quantite_stock >= 0)))'
  UNION ALL SELECT 3, 'authenticated lit les deux colonnes',
         (has_column_privilege('authenticated', 'public.commande_articles', 'quantite_stock', 'SELECT')
          AND has_column_privilege('authenticated', 'public.commande_articles', 'duo_article_id', 'SELECT'))::text, 'true'
  UNION ALL SELECT 4, 'vue en security_invoker',
         (SELECT coalesce(array_to_string(reloptions, ','), '-') FROM pg_class WHERE oid = 'public.consommation_stock'::regclass)::text,
         'security_invoker=true'
  UNION ALL SELECT 5, 'anon ne lit pas la vue',
         has_table_privilege('anon', 'public.consommation_stock', 'SELECT')::text, 'false'
  UNION ALL SELECT 6, 'authenticated lit la vue',
         has_table_privilege('authenticated', 'public.consommation_stock', 'SELECT')::text, 'true'
  UNION ALL SELECT 7, 'personne n ecrit dans la vue',
         (has_table_privilege('authenticated', 'public.consommation_stock', 'INSERT')
          OR has_table_privilege('authenticated', 'public.consommation_stock', 'UPDATE')
          OR has_table_privilege('authenticated', 'public.consommation_stock', 'DELETE'))::text, 'false'
  UNION ALL SELECT 8, 'les 3 fonctions de stock lisent la vue',
         (SELECT string_agg(p.proname || ':' || CASE WHEN p.prosrc LIKE '%consommation_stock ca%' AND p.prosrc NOT LIKE '%FROM commande_articles ca%' THEN 'oui' ELSE 'NON' END, ', ' ORDER BY p.proname)
            FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
           WHERE s.nspname = 'public' AND p.proname IN ('reserver_stock_atomique', 'stock_commande_par_article', 'ventes_stock_magasin'))::text,
         'reserver_stock_atomique:oui, stock_commande_par_article:oui, ventes_stock_magasin:oui'
  UNION ALL SELECT 9, 'les 3 fonctions restent SECURITY DEFINER',
         (SELECT bool_and(p.prosecdef) FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
           WHERE s.nspname = 'public' AND p.proname IN ('reserver_stock_atomique', 'stock_commande_par_article', 'ventes_stock_magasin'))::text,
         'true'
  UNION ALL SELECT 10, 'vendu_par_offre inchangee (compte des lots)',
         (SELECT md5(regexp_replace(p.prosrc, '\s+', '', 'g')) FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
           WHERE s.nspname = 'public' AND p.proname = 'vendu_par_offre')::text,
         '30f9a6390691143e65b54ac84c8c5491'
  UNION ALL SELECT 11, 'la vue rend autant de lignes que la table (aucun duo encore)',
         ((SELECT count(*) FROM public.consommation_stock) = (SELECT count(*) FROM public.commande_articles)
          + (SELECT count(*) FROM public.commande_articles WHERE duo_article_id IS NOT NULL))::text,
         'true'
  UNION ALL SELECT 12, 'droits d execution des fonctions inchanges (anon peut lire le stock affiche)',
         (has_function_privilege('anon', 'public.stock_commande_par_article(uuid, date)', 'EXECUTE')
          AND has_function_privilege('anon', 'public.ventes_stock_magasin(uuid)', 'EXECUTE'))::text,
         'true'
) t ORDER BY n;
