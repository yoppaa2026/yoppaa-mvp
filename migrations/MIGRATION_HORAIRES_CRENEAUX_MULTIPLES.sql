-- MIGRATION_HORAIRES_CRENEAUX_MULTIPLES.sql
-- ════════════════════════════════════════════════════════════════════
-- Migre horaires_detail vers le format multi-créneaux pour les fiches
-- existantes. Format :
--
--   Ancien : { lundi: { ouvert: true, debut: "08:30", fin: "16:00" } }
--   Nouveau: { lundi: { ouvert: true, creneaux: [["08:30","12:00"], ["13:00","16:00"]] } }
--
-- Le composant <ServiceDescription> + section horaires gèrent les deux
-- formats pour rétrocompatibilité, mais on migre toutes les fiches pour
-- propreté + gestion correcte de la pause midi.
--
-- Champ "note" pour les ouvertures spéciales (ex : 2e/4e samedis Mettet).
-- ════════════════════════════════════════════════════════════════════

-- Administration communale de Mettet : pause midi + samedis spéciaux
UPDATE services_publics
SET horaires_detail = jsonb_build_object(
  'lundi',    jsonb_build_object('ouvert', true,  'creneaux', jsonb_build_array(jsonb_build_array('08:30','12:00'), jsonb_build_array('13:00','16:00'))),
  'mardi',    jsonb_build_object('ouvert', true,  'creneaux', jsonb_build_array(jsonb_build_array('08:30','12:00'), jsonb_build_array('13:00','16:00'))),
  'mercredi', jsonb_build_object('ouvert', true,  'creneaux', jsonb_build_array(jsonb_build_array('08:30','12:00'), jsonb_build_array('13:00','16:00'))),
  'jeudi',    jsonb_build_object('ouvert', true,  'creneaux', jsonb_build_array(jsonb_build_array('08:30','12:00'), jsonb_build_array('13:00','16:00'))),
  'vendredi', jsonb_build_object('ouvert', true,  'creneaux', jsonb_build_array(jsonb_build_array('08:30','12:00'), jsonb_build_array('13:00','16:00'))),
  'samedi',   jsonb_build_object('ouvert', false, 'note', 'Ouvert exceptionnellement les 2e et 4e samedis du mois de 8h30 à 11h30 (Population et État civil uniquement)'),
  'dimanche', jsonb_build_object('ouvert', false)
)
WHERE slug = 'commune-mettet';

-- Sanity check
SELECT slug, jsonb_pretty(horaires_detail) AS horaires
FROM services_publics
WHERE slug = 'commune-mettet';
