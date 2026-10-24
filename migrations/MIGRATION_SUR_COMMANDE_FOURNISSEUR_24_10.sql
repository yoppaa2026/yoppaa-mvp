-- SUR COMMANDE CHEZ LE FOURNISSEUR, 24/10. À LANCER SUR TEST, PUIS SUR PROD AVANT LE CODE.
--
-- Demande d'Alex pour Caprice : la boutique a ses articles en stock magasin,
-- mais elle peut aussi les recommander chez son fournisseur, en X jours. Une
-- taille à 0 ne doit plus dire « Épuisé » mais « Sur commande, prête en X
-- jours », et se commander.
--
-- ✅ DÉCISIONS D'ALEX (tableau, 23/10) :
--   • une CASE par article à variantes + le délai X jours (elle sait ce que
--     son fournisseur a) ;
--   • colis : on LE DIT (« expédié sous X jours »), on ne bloque pas ;
--   • annulation : ce qui venait du fournisseur n'est PAS rajouté au stock,
--     sauf « pas venu la chercher » (la pièce est arrivée, elle revient).
--
-- Trois choses :
--   1. articles.fournisseur_jours : vide = pas de commande fournisseur (tout
--      le parc aujourd'hui) ; 1 à 30 = recommandable, prête en X jours.
--   2. commande_articles.quantite_fournisseur : combien de pièces de la ligne
--      viennent du fournisseur. 0 par défaut = tout sort du stock, comme
--      aujourd'hui. C'est elle qui dit au commerçant quoi commander, et qui
--      empêche de rendre au stock une pièce qui n'y a jamais été.
--   3. prelever_stock_variante(variante, quantité) : retire du stock sous
--      verrou, jamais sous zéro, et rend le nombre de pièces MANQUANTES
--      (NULL si la variante n'existe pas). Deux clients sur la dernière pièce
--      à la même seconde : le second sait qu'elle vient du fournisseur.
--      Le serveur seul l'appelle (clé de service) : personne d'autre ne
--      peut vider un rayon par l'API.
--
-- ⚠️ L'APP EST EN SERVICE : CETTE MIGRATION NE CHANGE RIEN POUR PERSONNE. Deux
-- colonnes vides ou à 0, une fonction que rien n'appelle encore ; aucune
-- donnée réécrite.
--
-- Une seule transaction ; contrôles en bas, une ligne par contrôle, valeur ET
-- attendu.

BEGIN;

-- ── 1. L'article : recommandable chez le fournisseur, en X jours ──
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS fournisseur_jours integer;

ALTER TABLE public.articles DROP CONSTRAINT IF EXISTS articles_fournisseur_jours_bornes;
ALTER TABLE public.articles
  ADD CONSTRAINT articles_fournisseur_jours_bornes CHECK (fournisseur_jours IS NULL OR fournisseur_jours BETWEEN 1 AND 30);

COMMENT ON COLUMN public.articles.fournisseur_jours IS
  'Sur commande chez le fournisseur (24/10) : vide = non ; 1 à 30 = une variante sans stock se commande et est prête en ce nombre de jours. Articles à variantes.';

-- La fiche lit les articles directement (`select *`) : sans ces droits, la
-- lecture entière des articles serait refusée à anon.
GRANT SELECT (fournisseur_jours) ON public.articles TO anon, authenticated;
GRANT INSERT (fournisseur_jours),
      UPDATE (fournisseur_jours) ON public.articles TO authenticated;

-- ── 2. La ligne de commande : la part qui vient du fournisseur ──
ALTER TABLE public.commande_articles
  ADD COLUMN IF NOT EXISTS quantite_fournisseur integer NOT NULL DEFAULT 0;

ALTER TABLE public.commande_articles DROP CONSTRAINT IF EXISTS commande_articles_quantite_fournisseur_positive;
ALTER TABLE public.commande_articles
  ADD CONSTRAINT commande_articles_quantite_fournisseur_positive CHECK (quantite_fournisseur >= 0);

COMMENT ON COLUMN public.commande_articles.quantite_fournisseur IS
  'Pièces de la ligne à commander chez le fournisseur (24/10). 0 = tout sort du stock. Jamais rendues au stock à l''annulation, sauf « pas venu la chercher ».';

-- Le commerçant et le client lisent leurs lignes ; seul le serveur les écrit.
GRANT SELECT (quantite_fournisseur) ON public.commande_articles TO anon, authenticated;

-- ── 3. Le prélèvement sous verrou ──
CREATE OR REPLACE FUNCTION public.prelever_stock_variante(p_variante_id uuid, p_quantite integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_avant integer;
  v_q integer := greatest(coalesce(p_quantite, 0), 0);
BEGIN
  SELECT coalesce(stock, 0) INTO v_avant
    FROM public.article_variantes
   WHERE id = p_variante_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  UPDATE public.article_variantes
     SET stock = greatest(v_avant - v_q, 0)
   WHERE id = p_variante_id;
  RETURN greatest(v_q - v_avant, 0);
END;
$function$;

COMMENT ON FUNCTION public.prelever_stock_variante(uuid, integer) IS
  'Retire p_quantite du stock de la variante sous verrou, jamais sous zéro ; rend le nombre de pièces manquantes (à commander chez le fournisseur), NULL si la variante n''existe pas. Serveur seul (24/10).';

-- 🔴 Une fonction neuve est exécutable par PUBLIC, et Supabase l'ouvre en plus
-- à anon et authenticated : on ferme tout, puis on ouvre au seul serveur.
REVOKE ALL ON FUNCTION public.prelever_stock_variante(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prelever_stock_variante(uuid, integer) TO service_role;

COMMIT;

-- ─── CONTRÔLES ──────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS n, 'F1. colonne articles.fournisseur_jours' AS controle,
    coalesce((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'articles' AND column_name = 'fournisseur_jours'), 'ABSENTE')::text AS valeur,
    'integer' AS attendu
  UNION ALL
  SELECT 2, 'F2. elle accepte le vide (pas de commande fournisseur)',
    coalesce((SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'articles' AND column_name = 'fournisseur_jours'), 'ABSENTE')::text,
    'YES'
  UNION ALL
  SELECT 3, 'F3. 1 à 30 jours (contrainte présente)',
    (SELECT count(*) FROM pg_constraint WHERE conname = 'articles_fournisseur_jours_bornes'
       AND conrelid = 'public.articles'::regclass)::text,
    '1'
  UNION ALL
  SELECT 4, 'F4. anon lit fournisseur_jours (la fiche lit les articles en entier)',
    has_column_privilege('anon', 'public.articles', 'fournisseur_jours', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 5, 'F5. le commerçant connecté l''écrit (création et modification)',
    (has_column_privilege('authenticated', 'public.articles', 'fournisseur_jours', 'INSERT')
     AND has_column_privilege('authenticated', 'public.articles', 'fournisseur_jours', 'UPDATE'))::text, 'true'
  UNION ALL
  SELECT 6, 'F6. colonne commande_articles.quantite_fournisseur, obligatoire',
    coalesce((SELECT data_type || ' ' || is_nullable FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'commande_articles' AND column_name = 'quantite_fournisseur'), 'ABSENTE')::text,
    'integer NO'
  UNION ALL
  SELECT 7, 'F7. elle vaut 0 par défaut (tout sort du stock)',
    coalesce((SELECT column_default FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'commande_articles' AND column_name = 'quantite_fournisseur'), 'AUCUN')::text,
    '0'
  UNION ALL
  SELECT 8, 'F8. jamais négative (contrainte présente)',
    (SELECT count(*) FROM pg_constraint WHERE conname = 'commande_articles_quantite_fournisseur_positive'
       AND conrelid = 'public.commande_articles'::regclass)::text,
    '1'
  UNION ALL
  SELECT 9, 'F9. le commerçant connecté lit la part fournisseur de ses lignes',
    has_column_privilege('authenticated', 'public.commande_articles', 'quantite_fournisseur', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 10, 'F10. la fonction de prélèvement existe',
    (SELECT count(*) FROM pg_proc WHERE proname = 'prelever_stock_variante'
       AND pronamespace = 'public'::regnamespace)::text,
    '1'
  UNION ALL
  SELECT 11, 'F11. le serveur peut l''appeler',
    has_function_privilege('service_role', 'public.prelever_stock_variante(uuid, integer)', 'EXECUTE')::text, 'true'
  UNION ALL
  -- 🔴 Sinon n'importe quel visiteur viderait un rayon par l'API.
  SELECT 12, 'F12. 🔴 anon ne peut PAS l''appeler',
    has_function_privilege('anon', 'public.prelever_stock_variante(uuid, integer)', 'EXECUTE')::text, 'false'
  UNION ALL
  SELECT 13, 'F13. 🔴 le connecté ne peut PAS l''appeler',
    has_function_privilege('authenticated', 'public.prelever_stock_variante(uuid, integer)', 'EXECUTE')::text, 'false'
  UNION ALL
  SELECT 14, 'F14. une variante inconnue rend vide (rien n''est touché)',
    coalesce(public.prelever_stock_variante('00000000-0000-0000-0000-000000000000'::uuid, 1)::text, 'VIDE'),
    'VIDE'
  UNION ALL
  -- 🔴 L'APP EST EN SERVICE : rien ne doit avoir été écrit.
  SELECT 15, 'F15. articles déjà recommandables chez le fournisseur',
    (SELECT count(*) FROM public.articles WHERE fournisseur_jours IS NOT NULL)::text,
    '0'
  UNION ALL
  SELECT 16, 'F16. lignes de commande avec une part fournisseur',
    (SELECT count(*) FROM public.commande_articles WHERE quantite_fournisseur <> 0)::text,
    '0'
) t ORDER BY n;
