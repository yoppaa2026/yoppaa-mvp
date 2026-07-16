-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION Ch2 — Mobilisation préinscription (gating hybride + compteur + ref)
-- Décisions 16/07 : gating hybride (active admin + seuil public), attribution ?ref.
-- Aucune dénormalisation : le compteur est une VUE agrégée (zéro dérive).
-- ════════════════════════════════════════════════════════════════════════════

-- 1. pre_inscriptions : rattachement commune (résolu à la capture) + attribution
--    commerçant (slug capté depuis ?ref= sur la landing).
ALTER TABLE pre_inscriptions
  ADD COLUMN IF NOT EXISTS commune_id     UUID REFERENCES communes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ref_commercant TEXT;

CREATE INDEX IF NOT EXISTS idx_pre_inscriptions_commune ON pre_inscriptions(commune_id);
CREATE INDEX IF NOT EXISTS idx_pre_inscriptions_ref     ON pre_inscriptions(ref_commercant);

-- 2. communes : seuil de mobilisation (cible de la barre de progression publique).
--    L'atteinte du seuil NE met PAS la commune live : `active` reste le switch admin.
ALTER TABLE communes
  ADD COLUMN IF NOT EXISTS seuil_preinscrits INT NOT NULL DEFAULT 50;

-- 3. Backfill : rattache les préinscriptions déjà capturées à leur commune via le
--    code postal (les futures seront résolues à la capture par la route).
UPDATE pre_inscriptions p
SET commune_id = c.id
FROM communes c
WHERE p.commune_id IS NULL
  AND c.codes_postaux @> ARRAY[p.code_postal];

-- 4. Vue agrégée publique : compteurs par commune. N'expose AUCUN PII (que des
--    COUNT). Vue en SECURITY DEFINER (défaut) -> l'agrégat contourne la RLS de
--    pre_inscriptions sans jamais exposer les lignes brutes.
CREATE OR REPLACE VIEW commune_stats AS
SELECT
  c.id              AS commune_id,
  c.nom,
  c.province,
  c.active,
  c.seuil_preinscrits,
  COUNT(p.id)                                                   AS nb_preinscrits,
  COUNT(p.id) FILTER (WHERE p.type_utilisateur = 'commercant') AS nb_commercants,
  COUNT(p.id) FILTER (WHERE p.type_utilisateur = 'yopper')     AS nb_yoppers
FROM communes c
LEFT JOIN pre_inscriptions p ON p.commune_id = c.id
GROUP BY c.id, c.nom, c.province, c.active, c.seuil_preinscrits;

-- 5. GRANT : la vue ne renvoie que des agrégats non-PII -> lecture publique OK.
GRANT SELECT ON commune_stats TO anon, authenticated, service_role;
