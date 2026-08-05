-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_SITE_WEB_COMMERCANT.sql
--
-- Le site web du commerçant, saisi à l'inscription.
--
-- POURQUOI. L'assistant de rédaction de la présentation (05/08) lit le site
-- déclaré pour en tirer de la matière : sans cette colonne, il ne travaille que
-- sur les quelques mots tapés dans le formulaire, et les textes se ressemblent
-- tous. La colonne existait déjà sur `services_publics`, jamais sur
-- `commercants`.
--
-- Aucune donnée personnelle : c'est une adresse publique, que le commerçant
-- communique déjà partout.
--
-- Vérification attendue en fin de script : colonne_creee = 1
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.commercants
  ADD COLUMN IF NOT EXISTS site_web text;

COMMENT ON COLUMN public.commercants.site_web IS
  'Site web public du commerce, saisi à l''inscription. Lu par l''assistant de rédaction de la présentation. Jamais affiché sans validation du commerçant.';

-- Pas de GRANT ni de policy à ajouter : on n'ajoute qu'une colonne à une table
-- existante, qui garde ses droits et ses politiques RLS actuelles.

-- ─── Vérification ──────────────────────────────────────────────────────────
SELECT COUNT(*) AS colonne_creee
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'commercants'
  AND column_name = 'site_web';
