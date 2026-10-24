-- SUR COMMANDE FOURNISSEUR, TAILLE PAR TAILLE, 24/10. À LANCER SUR TEST, PUIS SUR PROD AVANT LE CODE.
--
-- Suite de MIGRATION_SUR_COMMANDE_FOURNISSEUR_24_10 (articles.fournisseur_jours).
-- Alex, au test : « elle sait si une taille est dispo ou pas chez le
-- fournisseur. XS oui fournisseur, S plus dispo chez fournisseur, donc à zéro
-- il devient hors stock. »
--
-- ✅ DÉCISIONS (tableau, 24/10) : l'interrupteur et le délai restent sur
-- l'article ; chaque taille reçoit son interrupteur « Fournisseur », qui
-- DÉMARRE ACTIVÉ (elle coupe ce que son fournisseur n'a plus). Une taille
-- coupée, à 0, redevient « Épuisé ».
--
-- ⚠️ L'APP EST EN SERVICE : CETTE MIGRATION NE CHANGE RIEN POUR PERSONNE. La
-- colonne vaut « oui » partout, et elle n'a d'effet que sur un article qui se
-- recommande chez le fournisseur (aucun en PROD aujourd'hui).
--
-- Une seule transaction ; contrôles en bas, une ligne par contrôle, valeur ET
-- attendu.

BEGIN;

ALTER TABLE public.article_variantes
  ADD COLUMN IF NOT EXISTS fournisseur_dispo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.article_variantes.fournisseur_dispo IS
  'Cette taille se recommande-t-elle chez le fournisseur (24/10) ? Oui par défaut. N''agit que si l''article a un délai fournisseur (articles.fournisseur_jours).';

-- La fiche lit les tailles directement (`select *`) : sans ces droits, la
-- lecture entière des tailles serait refusée à anon.
GRANT SELECT (fournisseur_dispo) ON public.article_variantes TO anon, authenticated;
GRANT INSERT (fournisseur_dispo),
      UPDATE (fournisseur_dispo) ON public.article_variantes TO authenticated;

COMMIT;

-- ─── CONTRÔLES ──────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS n, 'T1. colonne article_variantes.fournisseur_dispo, obligatoire' AS controle,
    coalesce((SELECT data_type || ' ' || is_nullable FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'article_variantes' AND column_name = 'fournisseur_dispo'), 'ABSENTE')::text AS valeur,
    'boolean NO' AS attendu
  UNION ALL
  SELECT 2, 'T2. elle vaut « oui » par défaut (la taille se recommande)',
    coalesce((SELECT column_default FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'article_variantes' AND column_name = 'fournisseur_dispo'), 'AUCUN')::text,
    'true'
  UNION ALL
  SELECT 3, 'T3. anon la lit (la fiche lit les tailles en entier)',
    has_column_privilege('anon', 'public.article_variantes', 'fournisseur_dispo', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 4, 'T4. le connecté la lit',
    has_column_privilege('authenticated', 'public.article_variantes', 'fournisseur_dispo', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 5, 'T5. le commerçant connecté l''écrit (création et interrupteur)',
    (has_column_privilege('authenticated', 'public.article_variantes', 'fournisseur_dispo', 'INSERT')
     AND has_column_privilege('authenticated', 'public.article_variantes', 'fournisseur_dispo', 'UPDATE'))::text, 'true'
  UNION ALL
  SELECT 6, 'T6. le serveur la lit (service_role)',
    has_column_privilege('service_role', 'public.article_variantes', 'fournisseur_dispo', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 7, 'T7. article_variantes : la RLS est active (c''est elle qui protège)',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.article_variantes'::regclass)::text, 'true'
  UNION ALL
  -- 🔴 L'APP EST EN SERVICE : toutes les tailles existantes valent « oui ».
  SELECT 8, 'T8. tailles marquées « plus chez le fournisseur »',
    (SELECT count(*) FROM public.article_variantes WHERE fournisseur_dispo IS NOT TRUE)::text,
    '0'
) t ORDER BY n;
