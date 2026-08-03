-- ============================================================
-- MIGRATION_BOUTIQUE_VARIANTES.sql
-- BOUTIQUE Module 2 : matrice de variantes + modes de vente.
--  1) Axes de variantes sur les articles (Taille, Couleur...).
--  2) Table article_variantes : une ligne par combinaison (stock/prix/photo).
--  3) Modes de vente par boutique (retrait / expedition) sur commercants.
-- ============================================================

-- 1. Axes de variantes sur les articles
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS gere_variantes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS axe1_nom     text,
  ADD COLUMN IF NOT EXISTS axe1_valeurs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS axe2_nom     text,
  ADD COLUMN IF NOT EXISTS axe2_valeurs jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Variantes (combinaisons axe1 x axe2). axe2_valeur NULL si un seul axe.
CREATE TABLE IF NOT EXISTS article_variantes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  axe1_valeur text,
  axe2_valeur text,
  sku         text,
  prix        numeric(8,2),          -- override du prix article si renseigne
  stock       int  NOT NULL DEFAULT 0,
  photo_url   text,
  actif       boolean NOT NULL DEFAULT true,
  ordre       int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Une seule ligne par combinaison d'un article (COALESCE gere les NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uidx_article_variantes_combo
  ON article_variantes (article_id, COALESCE(axe1_valeur, ''), COALESCE(axe2_valeur, ''));

CREATE INDEX IF NOT EXISTS idx_article_variantes_article
  ON article_variantes (article_id, ordre);

-- 3. RLS variantes
ALTER TABLE article_variantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS article_variantes_select_public ON article_variantes;
CREATE POLICY article_variantes_select_public ON article_variantes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS article_variantes_write_own ON article_variantes;
CREATE POLICY article_variantes_write_own ON article_variantes
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM articles a JOIN commercants c ON c.id = a.commercant_id
            WHERE a.id = article_variantes.article_id AND c.auth_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM articles a JOIN commercants c ON c.id = a.commercant_id
            WHERE a.id = article_variantes.article_id AND c.auth_user_id = auth.uid())
  );

-- 4. GRANT variantes
GRANT SELECT ON article_variantes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON article_variantes TO authenticated;
GRANT ALL ON article_variantes TO service_role;

-- 5. Modes de vente boutique (par commercant = par boutique)
--    boutique_mode_vente       : retrait | expedition | les_deux
--    boutique_retrait_paiement : en_ligne | magasin (paiement au retrait, au choix)
--    boutique_frais_port       : frais d'expedition fixes
--    boutique_gratuit_des      : seuil panier pour port offert (NULL = jamais offert)
--    boutique_expedition_cp    : codes postaux desservis (NULL = toute la Belgique)
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS boutique_mode_vente text NOT NULL DEFAULT 'retrait'
    CHECK (boutique_mode_vente IN ('retrait', 'expedition', 'les_deux')),
  ADD COLUMN IF NOT EXISTS boutique_retrait_paiement text NOT NULL DEFAULT 'en_ligne'
    CHECK (boutique_retrait_paiement IN ('en_ligne', 'magasin')),
  ADD COLUMN IF NOT EXISTS boutique_frais_port  numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS boutique_gratuit_des numeric(8,2),
  ADD COLUMN IF NOT EXISTS boutique_expedition_cp text[];
