-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION pre_inscriptions — Landing Teasing + Reveal
-- À passer dans Supabase SQL Editor.
-- Date : 2026-06-08
--
-- Table qui stocke les emails captures via la landing page :
--   • mode_landing='teasing' : capture pendant la phase mysterieuse (8/06 → 7/07)
--   • mode_landing='reveal'  : capture apres le grand reveal (7/07 09h+)
--
-- Les inscriptions sont synchronisees avec Brevo (3 listes : Teasing, Yoppers,
-- Commercants) via API REST cote serveur.
-- ════════════════════════════════════════════════════════════════════════════


CREATE TABLE IF NOT EXISTS pre_inscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Donnees capturees
  email           TEXT NOT NULL,
  code_postal     TEXT NOT NULL,
  type_utilisateur TEXT NOT NULL CHECK (type_utilisateur IN ('yopper', 'commercant', 'curieux')),
  message         TEXT,  -- Message optionnel (mode teasing surtout)

  -- Mode de capture
  mode_landing    TEXT NOT NULL DEFAULT 'reveal'
    CHECK (mode_landing IN ('teasing', 'reveal')),

  -- Metadonnees marketing/UTM
  source          TEXT,  -- 'facebook' | 'instagram' | 'linkedin' | 'direct' | 'press' | 'teasing'
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  user_agent      TEXT,

  -- Brevo sync
  brevo_contact_id TEXT,
  brevo_sync_at    TIMESTAMPTZ,

  -- Notification reveal (pour les pre-inscrits Teasing : email envoye le 7/07 09h)
  notification_reveal_envoyee     BOOLEAN NOT NULL DEFAULT FALSE,
  notification_reveal_envoyee_at  TIMESTAMPTZ,

  -- RGPD
  consentement_marketing BOOLEAN NOT NULL DEFAULT TRUE,
  date_consentement      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Audit
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pre_inscriptions_email       ON pre_inscriptions(email);
CREATE INDEX IF NOT EXISTS idx_pre_inscriptions_type        ON pre_inscriptions(type_utilisateur);
CREATE INDEX IF NOT EXISTS idx_pre_inscriptions_mode        ON pre_inscriptions(mode_landing, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pre_inscriptions_source      ON pre_inscriptions(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pre_inscriptions_code_postal ON pre_inscriptions(code_postal);

-- Contrainte unique : un email ne peut s'inscrire qu'une fois par type
-- (ex: jean@a.com peut etre yopper ET commercant, mais pas 2x yopper)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pre_inscriptions_email_type
  ON pre_inscriptions(LOWER(email), type_utilisateur);


-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE pre_inscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin Yoppaa FULL" ON pre_inscriptions;
CREATE POLICY "Admin Yoppaa FULL" ON pre_inscriptions
  FOR ALL TO authenticated
  USING (public.is_yoppaa_admin())
  WITH CHECK (public.is_yoppaa_admin());

-- Insertion publique impossible direct (service_role uniquement via API route)
-- => pas de policy INSERT pour anon/authenticated

GRANT SELECT, INSERT, UPDATE, DELETE ON pre_inscriptions TO service_role;
GRANT SELECT ON pre_inscriptions TO authenticated;  -- pour admin dashboard


-- ─── Verif ───────────────────────────────────────────────────────────────────
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'pre_inscriptions'
ORDER BY ordinal_position;

SELECT policyname, cmd FROM pg_policies WHERE tablename = 'pre_inscriptions';
