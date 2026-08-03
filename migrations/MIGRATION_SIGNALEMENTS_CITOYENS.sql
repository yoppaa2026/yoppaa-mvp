-- MIGRATION_SIGNALEMENTS_CITOYENS.sql
-- ════════════════════════════════════════════════════════════════════
-- Table dédiée aux signalements citoyens (problèmes commune : nid de
-- poule, dépôt sauvage, égout bouché, etc.).
--
-- ⚠ Distincte de la table `signalements` existante qui sert au
--   signalement de fiche erronée (utilisée par <ModalSignalement>).
--   Les 2 cas d'usage sont différents :
--     - signalements        : "cette fiche contient une erreur"
--     - signalements_citoyens : "j'ai vu un problème dans la commune"
--
-- Cette migration REMPLACE MIGRATION_SIGNALEMENTS.sql (qui n'a rien
-- créé car la table existait déjà avec un schéma différent).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS signalements_citoyens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id      UUID NOT NULL REFERENCES services_publics(id) ON DELETE CASCADE,
  yopper_id       UUID NULL REFERENCES clients(id) ON DELETE SET NULL,
  yopper_email    TEXT NOT NULL,
  yopper_prenom   TEXT,
  type            TEXT NOT NULL CHECK (type IN ('nid_poule','depot_sauvage','egout','autre')),
  latitude        NUMERIC(10, 7),
  longitude       NUMERIC(10, 7),
  adresse         TEXT,
  photo_url       TEXT,
  description     TEXT,
  statut          TEXT NOT NULL DEFAULT 'nouveau'
                  CHECK (statut IN ('nouveau','en_cours','traite','ferme')),
  email_envoye_at TIMESTAMPTZ,
  traite_par      TEXT,
  traite_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signalements_citoyens_service_id_idx  ON signalements_citoyens(service_id);
CREATE INDEX IF NOT EXISTS signalements_citoyens_statut_idx      ON signalements_citoyens(statut);
CREATE INDEX IF NOT EXISTS signalements_citoyens_created_at_idx  ON signalements_citoyens(created_at DESC);

CREATE OR REPLACE FUNCTION update_signalements_citoyens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS signalements_citoyens_updated_at_trigger ON signalements_citoyens;
CREATE TRIGGER signalements_citoyens_updated_at_trigger
  BEFORE UPDATE ON signalements_citoyens
  FOR EACH ROW
  EXECUTE FUNCTION update_signalements_citoyens_updated_at();

-- GRANTs explicites (memory: feedback_supabase_grants)
GRANT SELECT, INSERT, UPDATE, DELETE ON signalements_citoyens TO service_role;
GRANT SELECT, INSERT                  ON signalements_citoyens TO authenticated;
GRANT INSERT                          ON signalements_citoyens TO anon;

-- RLS
ALTER TABLE signalements_citoyens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signalements_citoyens_insert_tous" ON signalements_citoyens;
CREATE POLICY "signalements_citoyens_insert_tous"
  ON signalements_citoyens
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "signalements_citoyens_select_yopper" ON signalements_citoyens;
CREATE POLICY "signalements_citoyens_select_yopper"
  ON signalements_citoyens
  FOR SELECT
  USING (
    yopper_id IS NOT NULL
    AND yopper_id = (SELECT id FROM clients WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "signalements_citoyens_admin_yoppaa_full" ON signalements_citoyens;
CREATE POLICY "signalements_citoyens_admin_yoppaa_full"
  ON signalements_citoyens
  FOR ALL
  USING (is_yoppaa_admin())
  WITH CHECK (is_yoppaa_admin());

-- Reload du schema cache PostgREST pour que la nouvelle table soit
-- immédiatement visible côté API REST
NOTIFY pgrst, 'reload schema';

-- Sanity check
SELECT
  (SELECT COUNT(*) FROM signalements_citoyens) AS nb_signalements_citoyens,
  (SELECT public FROM storage.buckets WHERE id = 'signalements-photos') AS bucket_public;
