-- MIGRATION_HORAIRES_ALWAYS_OPEN.sql
-- ════════════════════════════════════════════════════════════════════
-- Marque les services 24h/24 (urgences, garde médicale, pharmacie de
-- garde, futurs distributeurs auto, parkings 24/24, ...) avec :
--
--   horaires_detail = { "always_open": true }
--
-- Le composant <PillStatutOuverture> détecte ce flag et affiche une
-- pill 🟢 "Ouvert 24h/24" (verte avec pulse, sans sous-titre).
-- ════════════════════════════════════════════════════════════════════

UPDATE services_publics
SET horaires_detail = jsonb_build_object('always_open', true)
WHERE slug IN ('pmg-cegeno','urgences-112','pharmacie-garde');

-- Sanity check
SELECT slug, horaires_detail
FROM services_publics
WHERE slug IN ('pmg-cegeno','urgences-112','pharmacie-garde');
