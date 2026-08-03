-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION COMMANDES — étape 3/3 : fermeture des policies USING(true)
--
-- ⚠️ À LANCER SEULEMENT APRÈS :
--   1. MIGRATION_COMMANDES_STATS.sql passée (vue + policies commerçant),
--   2. déploiement du commit qui lit via `commandes_stats` + /api/yopper/commandes,
--      Vercel « Ready »,
--   3. tests OK (voir checklist plus bas).
-- Tant que le code direct est live, ces drops casseraient les lectures.
--
-- Diagnostic 13/07 — policies actuelles sur `commandes` :
--   • Admin Yoppaa FULL  (ALL, is_yoppaa_admin())        → CONSERVÉE (admin)
--   • Insert commande    (INSERT, public, WITH CHECK true) → DROP (voir note)
--   • Select commande    (SELECT, public, USING true)      → DROP (fuite lecture)
--   • Update commande    (UPDATE, public, USING true)      → DROP (n'importe qui
--                                                            modifiait n'importe
--                                                            quelle commande)
--
-- Après ce drop, les accès restants sont :
--   • Admin Yoppaa FULL            → tout (impersonation dashboard)
--   • commande_select_own_commercant / commande_update_own_commercant
--                                   → le commerçant sur SES commandes (dashboard)
--   • service_role (API serveur, webhooks, crons) → bypass RLS
--   • Yopper : lecture « mes commandes » + réception via /api/yopper/commandes
--   • Agrégats publics (dispo/capacité/n°) → vue `commandes_stats`
--
-- Idempotent. À passer dans Supabase SQL Editor.
-- Date : 2026-07-13
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Select commande" ON commandes;
DROP POLICY IF EXISTS "Update commande" ON commandes;

-- NOTE INSERT : aucune insertion navigateur sur `commandes` (vérifié 13/07 —
-- toute création passe par /api/stripe/checkout/create-commande en service_role,
-- qui bypass RLS). La policy `Insert commande` USING(true) {public} est donc un
-- trou de forge sans consommateur légitime. On la retire aussi.
DROP POLICY IF EXISTS "Insert commande" ON commandes;

-- Vérif : il ne doit rester que Admin Yoppaa FULL + les 2 policies own commerçant.
-- SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
-- WHERE schemaname='public' AND tablename='commandes' ORDER BY cmd, policyname;
