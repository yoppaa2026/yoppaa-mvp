-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_RLS_SIGNALEMENTS.sql
-- Dernière porte d'entrée anonyme en écriture.
--
-- Après MIGRATION_RLS_ECRITURES_YOPPER.sql, une sonde a montré que l'insertion
-- de signalements passait encore avec la clé publique. La policy restante,
-- `yopper_insert_own_signalement`, porte la condition :
--
--     (yopper_id IS NULL) OR (yopper_id appartient à l'utilisateur connecté)
--
-- La première branche autorise donc TOUT signalement dont l'auteur n'est pas
-- renseigné. C'était voulu à l'origine, pour permettre de signaler une fiche
-- sans compte. Mais depuis que /api/signaux gère ces envois en service_role,
-- avec limitation de débit et validation, cette policy ne sert plus qu'à
-- laisser un robot remplir la table.
--
-- Les policies de LECTURE sont conservées : le commerçant doit voir les
-- signalements qui le concernent, et le Yopper les siens.
--
-- Idempotente : ré-exécutable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "yopper_insert_own_signalement" ON signalements;

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Il ne doit plus rester aucune policy INSERT sur signalements, hors
-- administration. L'écriture passe exclusivement par /api/signaux.
SELECT tablename, policyname, cmd, roles::text,
       COALESCE(with_check, '—') AS with_check_clause
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename = 'signalements'
 ORDER BY cmd, policyname;
