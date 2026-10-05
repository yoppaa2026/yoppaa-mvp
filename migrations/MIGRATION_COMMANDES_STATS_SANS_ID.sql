-- ════════════════════════════════════════════════════════════════════════════
-- La vue publique `commandes_stats` ne publie plus l'identifiant des commandes
-- Audit livraison, C1 (05/10)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 🔴 CE QUI SE PASSAIT. La vue est lisible par `anon` (clé publique) et
-- rendait l'`id` de TOUTES les commandes de TOUS les commerces. Avec cet `id`,
-- la relecture `get-one` de /api/yopper/commandes, qui répond sans identité,
-- rendait le NOM du client et le TOTAL. Le code (commit C1-C5) a retiré ces
-- deux champs de la relecture ; cette migration retire l'`id` de la vue.
--
-- ⚠️ À PASSER APRÈS LE DÉPLOIEMENT DU CODE, jamais avant. L'ancien écran de
-- retrait lisait la vue PAR SON `id` (app/commander/page.js) : une colonne
-- absente fait échouer TOUTE la requête. Le nouveau code passe par la route
-- serveur, et `npm run verif:livraison` vérifie qu'aucun code ne lit plus la
-- vue par son `id`. Restent deux lecteurs, qui n'en ont pas besoin :
--   app/commander/page.js        commercant_id, creneau_id, statut, date_commande
--   app/commander/[slug]/page.js creneau_livraison_id, date_commande (+ filtres
--                                commercant_id, mode_retrait, statut)
--
-- ⚠️ DROP PUIS CREATE, PAS `CREATE OR REPLACE` : Postgres sait ajouter une
-- colonne à une vue, jamais en retirer une.
--
-- ⚠️ ET UNE VUE RECRÉÉE NAÎT ÉCRIVABLE (27/08, MIGRATION_VUES_PUBLIQUES_
-- LECTURE_SEULE) : les privilèges par défaut de Supabase lui donnent INSERT,
-- UPDATE, DELETE pour `anon`. Sans `security_invoker`, une écriture passerait
-- dans `commandes` en contournant la RLS. Le REVOKE ci-dessous est donc
-- obligatoire, et le contrôle le vérifie.
--
-- Pas de CASCADE : si un autre objet dépend de la vue, le DROP échoue, et
-- l'éditeur (une seule transaction) n'applique RIEN. Colle-moi alors l'erreur.
--
-- À passer dans Supabase SQL Editor, d'abord sur TEST, puis sur PROD.
-- Date : 2026-10-05
-- ════════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.commandes_stats;

CREATE VIEW public.commandes_stats AS
SELECT
  commercant_id,
  creneau_id,
  creneau_livraison_id,
  statut,
  mode_retrait,
  date_commande,
  numero_commande,
  created_at,
  numero_prefixe,
  numero_semaine
FROM public.commandes;

-- GRANT systématique, et SURTOUT le REVOKE des écritures (voir plus haut).
REVOKE ALL ON public.commandes_stats FROM anon, authenticated;
GRANT SELECT ON public.commandes_stats TO anon, authenticated;

-- ─── Contrôle : une ligne par vérification, valeur ET attendu ───────────────
SELECT 'C1 la vue ne publie plus id' AS controle,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commandes_stats' AND column_name = 'id')::text AS valeur,
       '0' AS attendu
UNION ALL
SELECT 'C1 la vue a ses 10 colonnes',
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commandes_stats')::text,
       '10'
UNION ALL
SELECT 'C1 aucune colonne personnelle',
       (SELECT COALESCE(string_agg(column_name::text, ', ' ORDER BY column_name::text), 'AUCUNE')
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commandes_stats'
           AND column_name ~* '(email|telephone|client_|adresse|note|total|lat|lng)'),
       'AUCUNE'
UNION ALL
SELECT 'C1 anon lit la vue',
       has_table_privilege('anon', 'public.commandes_stats', 'SELECT')::text,
       'true'
UNION ALL
SELECT 'C1 authenticated lit la vue',
       has_table_privilege('authenticated', 'public.commandes_stats', 'SELECT')::text,
       'true'
UNION ALL
SELECT '🔴 C1 aucune ecriture pour anon ou authenticated',
       (SELECT COALESCE(string_agg(DISTINCT grantee || ':' || privilege_type, ', '), 'AUCUNE')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'commandes_stats'
           AND grantee IN ('anon', 'authenticated') AND privilege_type <> 'SELECT'),
       'AUCUNE'
UNION ALL
SELECT 'C1 la vue rend toujours des lignes',
       ((SELECT count(*) FROM public.commandes_stats) > 0)::text,
       'true';
