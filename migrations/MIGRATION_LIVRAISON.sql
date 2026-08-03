-- MIGRATION_LIVRAISON.sql   (Sprint 3 — Module Livraison alim Niveau B)
--
-- Fondation DB du module livraison. Décisions produit verrouillées 05/07 :
--   - Zones = codes postaux (liste par commerçant)
--   - Frais = fixe + gratuit dès X€
--   - Créneaux livraison GLOBAUX (mêmes fenêtres pour toute la zone), table dédiée
--     CALQUÉE sur `creneaux` C&C (mêmes champs de capacité)
--   - Capacité = même modèle que le C&C (mode_capacite : 'commandes' -> max_commandes
--     | 'temps' -> capacite_temps en minutes)
--   - Suivi = statut_livraison (preparee -> en_livraison -> livree) + ETA
--
-- Idempotent : IF NOT EXISTS partout + DROP POLICY avant CREATE. Re-runnable sans casse.
-- RLS + GRANT calqués sur MIGRATION_M4_FICHES_ENRICHIES.sql (ownership auth_user_id).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. livraison_config — 1 config par commerçant (zone + frais)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS livraison_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  codes_postaux text[] NOT NULL DEFAULT '{}',        -- zone desservie
  frais_fixe    numeric(6,2) NOT NULL DEFAULT 0,     -- prix de livraison fixe
  gratuit_des   numeric(8,2),                        -- seuil panier offert (NULL = jamais gratuit)
  actif         boolean DEFAULT true,
  created_at    timestamp DEFAULT now(),
  updated_at    timestamp DEFAULT now(),
  UNIQUE (commercant_id)
);

CREATE INDEX IF NOT EXISTS idx_livraison_config_commercant
  ON livraison_config(commercant_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. livraison_creneaux — calque de `creneaux` C&C + cutoff spécifique livraison
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS livraison_creneaux (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id  uuid REFERENCES commercants(id) ON DELETE CASCADE,
  heure_debut    time NOT NULL,
  heure_fin      time NOT NULL,
  max_commandes  integer DEFAULT 5,                  -- capacité mode 'commandes'
  capacite_temps numeric DEFAULT 30,                 -- capacité mode 'temps' (minutes)
  mode_capacite  text DEFAULT 'commandes',           -- 'commandes' | 'temps' (fallback commercants.mode_capacite)
  delta_minutes  integer DEFAULT 0,
  jour_semaine   text,                               -- jour de tournée (comme creneaux)
  cutoff_heures  integer DEFAULT 2,                  -- délai limite commande avant le créneau (prépa + trajet)
  actif          boolean DEFAULT true,
  created_at     timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_livraison_creneaux_commercant
  ON livraison_creneaux(commercant_id) WHERE actif = true;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. commandes — colonnes livraison (une commande = retrait OU livraison)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS mode_retrait text NOT NULL DEFAULT 'retrait'
    CHECK (mode_retrait IN ('retrait', 'livraison'));

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS adresse_livraison text;

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS frais_livraison numeric(6,2) DEFAULT 0;

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS creneau_livraison_id uuid REFERENCES livraison_creneaux(id);

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS statut_livraison text
    CHECK (statut_livraison IN ('preparee', 'en_livraison', 'livree'));

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS livraison_eta timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_commandes_creneau_livraison
  ON commandes(creneau_livraison_id) WHERE creneau_livraison_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RLS (calque M4 : lecture publique si actif + commerçant gère le sien)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE livraison_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE livraison_creneaux ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Config livraison visible publiquement" ON livraison_config;
CREATE POLICY "Config livraison visible publiquement" ON livraison_config
  FOR SELECT TO anon, authenticated
  USING (actif = TRUE);

DROP POLICY IF EXISTS "Commercant gere sa config livraison" ON livraison_config;
CREATE POLICY "Commercant gere sa config livraison" ON livraison_config
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commercants
      WHERE commercants.id = livraison_config.commercant_id
        AND commercants.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Creneaux livraison visibles publiquement" ON livraison_creneaux;
CREATE POLICY "Creneaux livraison visibles publiquement" ON livraison_creneaux
  FOR SELECT TO anon, authenticated
  USING (actif = TRUE);

DROP POLICY IF EXISTS "Commercant gere ses creneaux livraison" ON livraison_creneaux;
CREATE POLICY "Commercant gere ses creneaux livraison" ON livraison_creneaux
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commercants
      WHERE commercants.id = livraison_creneaux.commercant_id
        AND commercants.auth_user_id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 5. GRANT explicites (memory feedback-supabase-grants)
-- ════════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON livraison_config   TO authenticated, service_role;
GRANT SELECT                          ON livraison_config   TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON livraison_creneaux TO authenticated, service_role;
GRANT SELECT                          ON livraison_creneaux TO anon;
