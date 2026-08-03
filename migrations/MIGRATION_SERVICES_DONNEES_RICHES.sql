-- MIGRATION_SERVICES_DONNEES_RICHES.sql
-- ════════════════════════════════════════════════════════════════════
-- Ajoute une colonne `donnees_riches JSONB` à services_publics.
--
-- Structure typée selon le type de service :
--   police   → { agents_quartier: [{nom, fonction, telephone, mobile, email, villages[]}] }
--   commune  → { sous_services: [{nom, telephones[]}], numeros_utiles: [...] }
--   salles   → { salles: [{nom, capacite, caution, equipements[]}] }  (futur)
--   foodtruck → { planning: [...], position_actuelle: {lat,lng} }      (futur)
--
-- Champ générique pour éviter une migration par type de donnée riche.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE services_publics
  ADD COLUMN IF NOT EXISTS donnees_riches JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN services_publics.donnees_riches IS
  'Données structurées additionnelles selon le type de service (agents de quartier pour police, sous-services pour commune, salles à louer, etc.). Schéma libre par type.';

-- Index GIN pour pouvoir requêter dans le JSONB si besoin un jour
CREATE INDEX IF NOT EXISTS services_publics_donnees_riches_gin
  ON services_publics USING GIN (donnees_riches);
