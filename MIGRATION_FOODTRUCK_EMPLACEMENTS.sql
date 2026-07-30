-- ============================================================
-- MIGRATION_FOODTRUCK_EMPLACEMENTS.sql
-- M5 Food truck : « emplacement du jour » + tournée hebdomadaire.
--
-- Deux types d'emplacement pour un commerçant food truck :
--   ponctuel : une DATE précise (prime sur la tournée ce jour-là)
--   hebdo    : un jour de semaine récurrent (la tournée type)
-- La fiche client remplace l'adresse affichée par l'emplacement
-- résolu du jour (ponctuel > hebdo > fallback « annoncé bientôt »).
-- ============================================================

CREATE TABLE IF NOT EXISTS foodtruck_emplacements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('ponctuel', 'hebdo')),
  date_jour     date,   -- ponctuel uniquement
  jour_semaine  text CHECK (jour_semaine IN ('lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche')),
  libelle       text NOT NULL,   -- « Place du Marché », nom convivial affiché
  adresse       text NOT NULL,   -- adresse complète (bouton Maps)
  heure_debut   time,
  heure_fin     time,
  actif         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (type = 'ponctuel' AND date_jour IS NOT NULL)
    OR (type = 'hebdo' AND jour_semaine IS NOT NULL)
  )
);

-- Un seul ponctuel par date, une seule ligne hebdo par jour de semaine
CREATE UNIQUE INDEX IF NOT EXISTS uidx_ft_emp_ponctuel
  ON foodtruck_emplacements (commercant_id, date_jour) WHERE type = 'ponctuel';
CREATE UNIQUE INDEX IF NOT EXISTS uidx_ft_emp_hebdo
  ON foodtruck_emplacements (commercant_id, jour_semaine) WHERE type = 'hebdo';
CREATE INDEX IF NOT EXISTS idx_ft_emp_commercant
  ON foodtruck_emplacements (commercant_id);

-- RLS : lecture publique (la fiche client affiche l'emplacement),
-- écriture par le commerçant propriétaire uniquement
ALTER TABLE foodtruck_emplacements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ft_emp_select_public ON foodtruck_emplacements;
CREATE POLICY ft_emp_select_public ON foodtruck_emplacements
  FOR SELECT USING (true);

DROP POLICY IF EXISTS ft_emp_write_own ON foodtruck_emplacements;
CREATE POLICY ft_emp_write_own ON foodtruck_emplacements
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM commercants c
            WHERE c.id = foodtruck_emplacements.commercant_id AND c.auth_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM commercants c
            WHERE c.id = foodtruck_emplacements.commercant_id AND c.auth_user_id = auth.uid())
  );

-- GRANT explicites (règle projet depuis 2026-10-30)
GRANT SELECT ON foodtruck_emplacements TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON foodtruck_emplacements TO authenticated;
GRANT ALL ON foodtruck_emplacements TO service_role;
