-- ============================================================================
-- LE CATALOGUE D'UN COMMERCE NON PUBLIÉ NE SORT PLUS DE L'API (12/09/2026)
--
-- ⚠️ NE PAS PASSER SANS LE GO D'ALEX. Elle touche le cœur visible de l'app.
--
-- LE DÉFAUT. Dix tables de catalogue se lisaient avec `USING true` : articles,
-- photos, variantes, options, stock du jour, créneaux, blocages, lieux et
-- prestations de créneaux. Leur contenu sortait donc de l'API pour N'IMPORTE
-- QUEL commerce, publié ou non. L'écran bloque bien la fiche non publiée
-- (`app/commander/[slug]/page.js:1828`), mais c'est une garde d'écran, et une
-- garde d'écran n'est jamais une réponse : il suffit d'interroger l'API
-- directement pour lire le catalogue d'un commerce en préparation, d'une fiche
-- refusée, ou d'un commerce parti.
--
-- Aucune donnée personnelle là-dedans. Mais c'est incohérent avec
-- `commercants_public`, qui filtre, lui, sur `statut_publication = 'publie'` :
-- on protégeait la façade et pas ce qu'il y a derrière.
--
-- LA RÈGLE, EN UN SEUL ENDROIT. Quatre petites fonctions, toutes
-- `STABLE SECURITY DEFINER` avec `search_path` épinglé, disent qui peut lire :
-- le commerce est PUBLIÉ, ou j'en suis le PROPRIÉTAIRE, ou je suis l'ADMIN.
-- Les dix policies les appellent. Une seule règle à lire, à corriger, et à
-- appliquer à la onzième table le jour où elle arrivera.
--
-- ⚠️ POURQUOI `SECURITY DEFINER` ICI. Ces fonctions lisent `commercants` et
-- `articles`, qui sont elles-mêmes protégées par la RLS. Sans `SECURITY
-- DEFINER`, la réponse dépendrait des policies de CES tables-là, donc d'un
-- enchaînement subtil que personne ne pourra plus dérouler dans six mois. Avec,
-- la règle ne dépend que d'elle-même. `search_path` est épinglé, sans quoi la
-- fonction serait détournable (c'est la correction du matin même).
--
-- 🔴 LE PIÈGE QUI A FAILLI PASSER. Chaque table possède déjà une policy
-- propriétaire en `FOR ALL`, qui couvre donc aussi la lecture : la branche
-- « ou je suis le propriétaire » paraissait superflue. SAUF POUR
-- `creneaux_blocages`, qui n'a que des policies INSERT, UPDATE et DELETE et
-- AUCUNE en SELECT : sa seule lecture était la publique. S'appuyer sur les
-- policies voisines aurait vidé les blocages de créneaux de tout commerçant
-- non publié. La règle porte donc la branche propriétaire elle-même, partout.
--
-- CE QUI NE CHANGE PAS. Les écritures, les policies de gestion du propriétaire,
-- l'admin, `zz_commerce_ouvert` (RESTRICTIVE), et tout ce qui passe par les
-- routes serveur en clé de service, qui ignore la RLS.
--
-- HORS PÉRIMÈTRE : `tva_taux_reference`, table de référence globale sans
-- commerçant, publique par nature.
--
-- ✅ ESSAYÉE SUR UN POSTGRES EN MÉMOIRE avant d'être envoyée (PGlite, base
-- fabriquée, aucune donnée réelle) : 33 essais conformes. Avant, `anon` voyait
-- les deux commerces sur les dix tables ; après, il n'en voit plus qu'un. Le
-- propriétaire du commerce NON PUBLIÉ voit toujours ses dix tables, blocages de
-- créneaux compris, l'admin voit tout, et les écritures fonctionnent encore.
-- ⚠️ Cela prouve la syntaxe, l'ordre et la logique. Pas l'état de la production.
--
-- État au 12/09 : 12 commerces publiés, 2 en attente.
-- Idempotent. Transactionnel : en cas d'échec, RIEN ne reste à moitié fait.
-- ============================================================================

BEGIN;

-- ─── 1. LA RÈGLE ────────────────────────────────────────────────────────────

-- Le commerce est publié, ou je suis celui qui le tient, ou je suis l'admin.
CREATE OR REPLACE FUNCTION public.commerce_lisible(cid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.commercants c
    WHERE c.id = cid
      AND (c.statut_publication = 'publie' OR c.auth_user_id = auth.uid())
  ) OR public.is_yoppaa_admin()
$$;

-- Les tables qui pendent à un article : photos, variantes, groupes d'options.
CREATE OR REPLACE FUNCTION public.article_lisible(aid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.articles a
    WHERE a.id = aid AND public.commerce_lisible(a.commercant_id)
  )
$$;

-- Les valeurs d'options pendent à un groupe, qui pend à un article.
CREATE OR REPLACE FUNCTION public.option_groupe_lisible(gid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.article_options_groupes g
    WHERE g.id = gid AND public.article_lisible(g.article_id)
  )
$$;

-- Les prestations d'un créneau de rendez-vous pendent au créneau.
CREATE OR REPLACE FUNCTION public.rdv_creneau_lisible(kid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rdv_creneaux k
    WHERE k.id = kid AND public.commerce_lisible(k.commercant_id)
  )
$$;

-- ⚠️ GRANT EXPLICITE. Une policy qui appelle une fonction que l'appelant n'a
-- pas le droit d'exécuter refuse TOUT, et le message d'erreur ne dit pas ça.
GRANT EXECUTE ON FUNCTION public.commerce_lisible(uuid)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.article_lisible(uuid)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.option_groupe_lisible(uuid)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rdv_creneau_lisible(uuid)     TO anon, authenticated;

-- ─── 2. LES DIX LECTURES PUBLIQUES DEVIENNENT CONDITIONNELLES ───────────────
--
-- ⚠️ DOUZE POLICIES POUR DIX TABLES : `article_options_groupes` et
-- `article_options_valeurs` en portaient DEUX chacune, qui disaient la même
-- chose (« Lecture publique » et « Tout le monde lit… »). Un doublon qui
-- ouvre : en retirer une seule n'aurait rien fermé du tout.

-- articles
DROP POLICY IF EXISTS "Lecture publique" ON public.articles;
CREATE POLICY articles_lecture_publique ON public.articles
  FOR SELECT TO public
  USING (public.commerce_lisible(commercant_id));

-- article_photos
DROP POLICY IF EXISTS article_photos_select_public ON public.article_photos;
CREATE POLICY article_photos_lecture_publique ON public.article_photos
  FOR SELECT TO public
  USING (public.article_lisible(article_id));

-- article_variantes
DROP POLICY IF EXISTS article_variantes_select_public ON public.article_variantes;
CREATE POLICY article_variantes_lecture_publique ON public.article_variantes
  FOR SELECT TO public
  USING (public.article_lisible(article_id));

-- article_options_groupes (les DEUX doublons)
DROP POLICY IF EXISTS "Lecture publique" ON public.article_options_groupes;
DROP POLICY IF EXISTS "Tout le monde lit les groupes options" ON public.article_options_groupes;
CREATE POLICY article_options_groupes_lecture_publique ON public.article_options_groupes
  FOR SELECT TO public
  USING (public.article_lisible(article_id));

-- article_options_valeurs (les DEUX doublons)
DROP POLICY IF EXISTS "Lecture publique" ON public.article_options_valeurs;
DROP POLICY IF EXISTS "Tout le monde lit les valeurs options" ON public.article_options_valeurs;
CREATE POLICY article_options_valeurs_lecture_publique ON public.article_options_valeurs
  FOR SELECT TO public
  USING (public.option_groupe_lisible(groupe_id));

-- article_stock_jour
DROP POLICY IF EXISTS "lecture publique stock jour" ON public.article_stock_jour;
CREATE POLICY article_stock_jour_lecture_publique ON public.article_stock_jour
  FOR SELECT TO public
  USING (public.commerce_lisible(commercant_id));

-- creneaux
DROP POLICY IF EXISTS "Lecture publique" ON public.creneaux;
CREATE POLICY creneaux_lecture_publique ON public.creneaux
  FOR SELECT TO public
  USING (public.commerce_lisible(commercant_id));

-- creneaux_blocages
-- ⚠️ C'EST ELLE, LA TABLE SANS FILET : aucune policy SELECT pour le
-- propriétaire. Sans la branche « ou je suis le propriétaire » portée par
-- `commerce_lisible`, ses blocages disparaîtraient de son tableau de bord.
DROP POLICY IF EXISTS blocages_lecture_publique ON public.creneaux_blocages;
CREATE POLICY creneaux_blocages_lecture_publique ON public.creneaux_blocages
  FOR SELECT TO public
  USING (public.commerce_lisible(commercant_id));

-- commercant_lieux
DROP POLICY IF EXISTS lieux_select_public ON public.commercant_lieux;
CREATE POLICY commercant_lieux_lecture_publique ON public.commercant_lieux
  FOR SELECT TO public
  USING (public.commerce_lisible(commercant_id));

-- rdv_creneau_prestations
DROP POLICY IF EXISTS rdv_cp_lecture_publique ON public.rdv_creneau_prestations;
CREATE POLICY rdv_creneau_prestations_lecture_publique ON public.rdv_creneau_prestations
  FOR SELECT TO public
  USING (public.rdv_creneau_lisible(creneau_id));

-- ─── 3. ON VÉRIFIE POUR DE VRAI, AVANT DE VALIDER ───────────────────────────
--
-- ⚠️ ON PREND LE RÔLE `anon` ET ON REGARDE CE QU'IL VOIT. Lire les policies ne
-- prouve rien : c'est l'exécution qui tranche. Si l'un des deux contrôles
-- échoue, l'exception annule TOUTE la transaction et la base reste comme avant.
DO $$
DECLARE
  ids_caches  uuid[];
  ids_publies uuid[];
  nb_publies  integer;
  vus_caches  integer;
  vus_publies integer;
BEGIN
  SELECT array_agg(id) INTO ids_caches
    FROM public.commercants WHERE statut_publication IS DISTINCT FROM 'publie';
  SELECT array_agg(id) INTO ids_publies
    FROM public.commercants WHERE statut_publication = 'publie';

  SELECT count(*) INTO nb_publies
    FROM public.articles WHERE commercant_id = ANY(COALESCE(ids_publies, '{}'));

  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO vus_caches
    FROM public.articles WHERE commercant_id = ANY(COALESCE(ids_caches, '{}'));
  SELECT count(*) INTO vus_publies
    FROM public.articles WHERE commercant_id = ANY(COALESCE(ids_publies, '{}'));
  EXECUTE 'RESET ROLE';

  -- Ce qu'on voulait fermer est-il fermé ?
  IF vus_caches > 0 THEN
    RAISE EXCEPTION 'CATALOGUE_ENCORE_OUVERT : % articles de commerces non publies restent lisibles par anon', vus_caches;
  END IF;

  -- 🔴 ET SURTOUT : a-t-on cassé les fiches en ligne ? Une migration de
  -- fermeture qui ferme TOUT passerait tous les contrôles de fermeture.
  IF nb_publies > 0 AND vus_publies = 0 THEN
    RAISE EXCEPTION 'CATALOGUE_TOUT_FERME : plus aucun article de commerce publie n est visible (% attendus)', nb_publies;
  END IF;

  RAISE NOTICE 'Catalogue : % articles publies visibles, % caches masques.', vus_publies, nb_publies;
END $$;

COMMIT;


-- ============================================================================
-- CONTRÔLE — une ligne par vérification, avec sa valeur ET l'attendu.
-- ============================================================================

WITH cibles(nom) AS (
  VALUES ('articles'), ('article_photos'), ('article_variantes'),
         ('article_options_groupes'), ('article_options_valeurs'),
         ('article_stock_jour'), ('creneaux'), ('creneaux_blocages'),
         ('commercant_lieux'), ('rdv_creneau_prestations')
)
SELECT 'Z01'::text AS ordre,
       'Lectures encore ouvertes (USING true) sur le catalogue'::text AS controle,
       COALESCE(string_agg(p.tablename || '/' || p.policyname, ', '), 'aucune')::text AS valeur,
       'aucune'::text AS attendu,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE '>>> ECHEC' END::text AS verdict
FROM pg_policies p JOIN cibles c ON c.nom = p.tablename
WHERE p.schemaname = 'public' AND p.cmd = 'SELECT' AND COALESCE(p.qual, '') = 'true'

UNION ALL
SELECT 'Z02',
       'Nouvelles lectures conditionnelles posees',
       count(*)::text,
       'dix, une par table',
       CASE WHEN count(*) = 10 THEN 'OK' ELSE '>>> ECHEC' END
FROM pg_policies p JOIN cibles c ON c.nom = p.tablename
WHERE p.schemaname = 'public' AND p.policyname LIKE '%_lecture_publique'

-- ⚠️ LA VERIFICATION QUI COMPTE VRAIMENT : on a remplace des LECTURES, pas
-- touche aux ECRITURES. Sans cette ligne, un DROP trop large passerait pour une
-- reussite.
UNION ALL
SELECT 'Z03',
       'Policies de gestion du proprietaire encore en place',
       count(*)::text,
       'au moins dix (une par table au minimum)',
       CASE WHEN count(*) >= 10 THEN 'OK' ELSE '>>> ECHEC' END
FROM pg_policies p JOIN cibles c ON c.nom = p.tablename
WHERE p.schemaname = 'public' AND p.cmd <> 'SELECT'

UNION ALL
SELECT 'Z04',
       'Les quatre fonctions de la regle, avec search_path epingle',
       COALESCE(string_agg(pr.proname::text, ', ' ORDER BY pr.proname::text), 'AUCUNE'),
       'article_lisible, commerce_lisible, option_groupe_lisible, rdv_creneau_lisible',
       CASE WHEN count(*) = 4 THEN 'OK' ELSE '>>> ECHEC' END
FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
WHERE n.nspname = 'public'
  AND pr.proname IN ('commerce_lisible', 'article_lisible', 'option_groupe_lisible', 'rdv_creneau_lisible')
  AND EXISTS (SELECT 1 FROM unnest(COALESCE(pr.proconfig, '{}')) x WHERE x LIKE 'search_path=%')

UNION ALL
SELECT 'Z05',
       'La regle repond juste sur un commerce publie',
       COALESCE((SELECT public.commerce_lisible(id)::text FROM public.commercants
                 WHERE statut_publication = 'publie' LIMIT 1), 'aucun commerce publie'),
       'true',
       CASE WHEN (SELECT public.commerce_lisible(id) FROM public.commercants
                  WHERE statut_publication = 'publie' LIMIT 1) THEN 'OK' ELSE '>>> ECHEC' END

UNION ALL
SELECT 'Z06',
       'La regle repond juste sur un commerce non publie',
       COALESCE((SELECT public.commerce_lisible(id)::text FROM public.commercants
                 WHERE statut_publication IS DISTINCT FROM 'publie' LIMIT 1), 'aucun commerce cache'),
       'false',
       CASE WHEN NOT COALESCE((SELECT public.commerce_lisible(id) FROM public.commercants
                               WHERE statut_publication IS DISTINCT FROM 'publie' LIMIT 1), false)
            THEN 'OK' ELSE '>>> ECHEC' END

ORDER BY 1;


-- ============================================================================
-- À TESTER APRÈS, DANS CET ORDRE (le premier est le seul qui puisse surprendre)
--
--   1. 🔴 LE TABLEAU DE BORD D'UN COMMERCE NON PUBLIÉ (il y en a 2 en attente) :
--      ses articles, ses photos, ses variantes, ses créneaux et ses blocages
--      doivent TOUS être encore là. C'est l'écran de l'onboarding.
--   2. Une fiche publique : la carte, les photos, les créneaux s'affichent.
--   3. Le Good Morning : les articles du jour apparaissent.
--   4. Une fiche rendez-vous : prestations et produits.
--   5. Ciseaux et Soins, témoin de non-régression.
-- ============================================================================
