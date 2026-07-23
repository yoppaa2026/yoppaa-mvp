-- ============================================================
-- MIGRATION_CATALOGUE_SOCLE.sql
-- BOUTIQUE Module 1 : socle catalogue commun.
-- 1) Toggle d'affichage des photos du catalogue (par commercant).
-- 2) Galerie de photos par article (la couverture reste articles.photo_url).
-- L'ouverture du catalogue aux categories vitrine/detail se fait cote code
-- (lib/plans.js), pas ici.
-- ============================================================

-- 0. Photo de couverture de l'article (correctif 23/07 : la colonne n'existait
--    pas en prod contrairement a ce que la doc d'audit indiquait).
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS photo_url text;

-- 1. Toggle affichage des photos du catalogue (tous les commercants n'en veulent pas)
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS photos_catalogue_actif boolean NOT NULL DEFAULT true;

-- 2. Galerie de photos par article
CREATE TABLE IF NOT EXISTS article_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  url         text NOT NULL,
  ordre       int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_article_photos_article
  ON article_photos (article_id, ordre);

-- 3. RLS
ALTER TABLE article_photos ENABLE ROW LEVEL SECURITY;

-- Lecture publique : les photos s'affichent sur les fiches commercant.
DROP POLICY IF EXISTS article_photos_select_public ON article_photos;
CREATE POLICY article_photos_select_public ON article_photos
  FOR SELECT
  USING (true);

-- Ecriture reservee au commercant proprietaire de l'article.
DROP POLICY IF EXISTS article_photos_write_own ON article_photos;
CREATE POLICY article_photos_write_own ON article_photos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM articles a
      JOIN commercants c ON c.id = a.commercant_id
      WHERE a.id = article_photos.article_id
        AND c.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM articles a
      JOIN commercants c ON c.id = a.commercant_id
      WHERE a.id = article_photos.article_id
        AND c.auth_user_id = auth.uid()
    )
  );

-- 4. GRANT explicites (regle projet : toute nouvelle table)
GRANT SELECT ON article_photos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON article_photos TO authenticated;
GRANT ALL ON article_photos TO service_role;
