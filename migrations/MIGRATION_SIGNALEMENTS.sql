-- MIGRATION_SIGNALEMENTS.sql
-- ════════════════════════════════════════════════════════════════════
-- Système de signalements citoyens (nid de poule, dépôt sauvage, égout
-- bouché, etc.) envoyés depuis Yoppaa vers la commune via Resend.
--
-- Architecture :
--   - Table signalements (cette migration)
--   - Bucket Supabase Storage `signalements-photos` (voir bas du fichier)
--   - API route /api/signalements/create
--   - Composant <ModalSignalerProbleme> côté yopper
--
-- ⚠ Yopper anonyme autorisé (yopper_id NULL). Email obligatoire pour
--   que la commune puisse répondre directement.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS signalements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cible : fiche service public destinataire (commune-mettet, etc.)
  service_id      UUID NOT NULL REFERENCES services_publics(id) ON DELETE CASCADE,

  -- Émetteur : yopper connecté (NULL si anonyme)
  yopper_id       UUID NULL REFERENCES clients(id) ON DELETE SET NULL,
  yopper_email    TEXT NOT NULL,
  yopper_prenom   TEXT,

  -- Catégorie de problème
  type            TEXT NOT NULL CHECK (type IN ('nid_poule','depot_sauvage','egout','autre')),

  -- Localisation
  latitude        NUMERIC(10, 7),
  longitude       NUMERIC(10, 7),
  adresse         TEXT,

  -- Contenu
  photo_url       TEXT,                            -- URL publique Supabase Storage
  description     TEXT,                            -- commentaire libre, optionnel

  -- Workflow commune
  statut          TEXT NOT NULL DEFAULT 'nouveau'
                  CHECK (statut IN ('nouveau','en_cours','traite','ferme')),
  email_envoye_at TIMESTAMPTZ,                     -- traçabilité Resend
  traite_par      TEXT,                            -- nom de l'agent qui a traité
  traite_at       TIMESTAMPTZ,

  -- Horodatage
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour les requêtes du dashboard commune (filtre par service + statut, tri par date)
CREATE INDEX IF NOT EXISTS signalements_service_id_idx  ON signalements(service_id);
CREATE INDEX IF NOT EXISTS signalements_statut_idx      ON signalements(statut);
CREATE INDEX IF NOT EXISTS signalements_created_at_idx  ON signalements(created_at DESC);

-- Trigger updated_at automatique
CREATE OR REPLACE FUNCTION update_signalements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS signalements_updated_at_trigger ON signalements;
CREATE TRIGGER signalements_updated_at_trigger
  BEFORE UPDATE ON signalements
  FOR EACH ROW
  EXECUTE FUNCTION update_signalements_updated_at();

-- ───── GRANTs (memory: feedback_supabase_grants) ─────
GRANT SELECT, INSERT, UPDATE, DELETE ON signalements TO service_role;
GRANT SELECT, INSERT                  ON signalements TO authenticated;
GRANT INSERT                          ON signalements TO anon;  -- yopper anonyme peut créer

-- ───── RLS ─────
ALTER TABLE signalements ENABLE ROW LEVEL SECURITY;

-- INSERT : tout le monde peut créer (anon ou auth)
DROP POLICY IF EXISTS "signalements_insert_tous" ON signalements;
CREATE POLICY "signalements_insert_tous"
  ON signalements
  FOR INSERT
  WITH CHECK (true);

-- SELECT : yopper voit ses propres signalements (si connecté)
DROP POLICY IF EXISTS "signalements_select_yopper" ON signalements;
CREATE POLICY "signalements_select_yopper"
  ON signalements
  FOR SELECT
  USING (
    yopper_id IS NOT NULL
    AND yopper_id = (SELECT id FROM clients WHERE auth_user_id = auth.uid())
  );

-- SELECT / UPDATE / DELETE : admin Yoppaa voit et gère tout
DROP POLICY IF EXISTS "signalements_admin_yoppaa_full" ON signalements;
CREATE POLICY "signalements_admin_yoppaa_full"
  ON signalements
  FOR ALL
  USING (is_yoppaa_admin())
  WITH CHECK (is_yoppaa_admin());

-- ════════════════════════════════════════════════════════════════════
-- BUCKET SUPABASE STORAGE
-- À exécuter aussi (ou créer via Dashboard Supabase → Storage → New bucket)
-- ════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signalements-photos',
  'signalements-photos',
  true,                                     -- public en lecture (lien direct dans le mail commune)
  10485760,                                 -- 10 Mo max par fichier
  ARRAY['image/jpeg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Politiques RLS sur storage.objects pour ce bucket
DROP POLICY IF EXISTS "signalements_photos_upload" ON storage.objects;
CREATE POLICY "signalements_photos_upload"
  ON storage.objects
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (bucket_id = 'signalements-photos');

DROP POLICY IF EXISTS "signalements_photos_read" ON storage.objects;
CREATE POLICY "signalements_photos_read"
  ON storage.objects
  FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'signalements-photos');

-- Sanity check
SELECT
  (SELECT COUNT(*) FROM signalements)                              AS nb_signalements,
  (SELECT public FROM storage.buckets WHERE id = 'signalements-photos') AS bucket_public,
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'signalements-photos') AS max_size_bytes;
