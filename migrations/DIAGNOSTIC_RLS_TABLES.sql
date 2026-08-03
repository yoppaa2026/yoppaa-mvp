-- ════════════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC RLS TRANSVERSE — État réel des tables sensibles Yoppaa
-- À passer dans Supabase SQL Editor pour photographier l'état RLS live.
-- Ne modifie rien, uniquement des SELECT.
--
-- L'audit workflow du 01/07 a rapporté que MIGRATION_ADMIN_RLS.sql ajoute
-- des policies "Admin FULL" mais SANS ENABLE ROW LEVEL SECURITY sur les
-- tables critiques. Certaines tables peuvent avoir été activées via le
-- dashboard Supabase sans être trackées dans le repo.
--
-- Ce SQL liste pour chaque table sensible :
--   1. Si RLS est ENABLE
--   2. Combien de policies existent
--   3. Les policies (SELECT/INSERT/UPDATE/DELETE) et leurs targets (anon/auth/service_role)
--
-- Sur base de ce diagnostic, on décidera Sprint 3 Sécurité MVP :
--   - Activer RLS partout où manquant
--   - Ajouter policies SELECT publiques restrictives (via view ou colonne)
--   - Verrouiller INSERT/UPDATE/DELETE au commerçant propriétaire
--
-- Date : 2026-07-01
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. RLS activé oui/non par table ───────────────────────────────────────
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_active,
  CASE WHEN rowsecurity THEN '✅' ELSE '⚠️  NON ACTIVE' END AS statut
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'commercants', 'articles', 'creneaux', 'commandes', 'commande_articles',
    'commande_stock_reservation', 'clients', 'yoppers', 'favoris', 'actualites',
    'yoppaa_deals', 'avis', 'options_articles', 'article_stock_jour',
    'onboarding_commercants', 'signalements', 'signalements_citoyens',
    'rdv_prestations', 'rdv_praticiens', 'rdv_prestation_praticiens',
    'rdv_creneaux', 'rdv_reservations', 'rdv_fermetures', 'rdv_fidelite_progression',
    'pre_inscriptions', 'services_publics', 'admin_impersonations',
    'stripe_webhook_events', 'billing_relances_log', 'success_packs'
  )
ORDER BY rowsecurity ASC, tablename ASC;
-- Tables affichées en premier = RLS non activée (⚠️)


-- ─── 2. Nombre de policies par table ───────────────────────────────────────
SELECT
  schemaname,
  tablename,
  COUNT(*) AS nb_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'commercants', 'articles', 'creneaux', 'commandes', 'commande_articles',
    'clients', 'yoppers', 'favoris', 'actualites', 'yoppaa_deals', 'avis',
    'options_articles', 'article_stock_jour', 'onboarding_commercants',
    'signalements', 'services_publics'
  )
GROUP BY schemaname, tablename
ORDER BY nb_policies DESC, tablename;


-- ─── 3. Détail des policies sur commercants (table la plus sensible) ───────
SELECT
  policyname,
  cmd,
  roles,
  qual  AS using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'commercants'
ORDER BY cmd, policyname;


-- ─── 4. Détail des policies sur yoppaa_deals ────────────────────────────────
SELECT
  policyname,
  cmd,
  roles,
  qual  AS using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'yoppaa_deals'
ORDER BY cmd, policyname;


-- ─── 5. Détail des policies sur actualites ──────────────────────────────────
SELECT
  policyname,
  cmd,
  roles,
  qual  AS using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'actualites'
ORDER BY cmd, policyname;


-- ─── 6. Test de fuite (à lancer en mode anon si possible) ──────────────────
-- Vérifie qu'un utilisateur anon (Yopper non connecté) ne peut PAS lire
-- telephone / email / stripe_account_id d'un commerçant.
-- À lancer depuis le SQL Editor en changeant "Source > postgres" en "anon"
-- si ta version Supabase le permet, sinon depuis un shell curl avec la
-- clé anon key.
--
-- Attendu : ces colonnes retournent NULL ou la requête est refusée.
-- Actuellement : elles retournent probablement la valeur en clair (BUG).

-- SELECT id, nom, telephone, email, stripe_account_id
-- FROM commercants
-- WHERE statut_publication = 'publie'
-- LIMIT 3;
