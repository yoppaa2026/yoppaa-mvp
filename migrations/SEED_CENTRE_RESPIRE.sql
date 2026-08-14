-- ════════════════════════════════════════════════════════════
-- SEED COMMERÇANT TEST : Centre Respire — yoga (Mettet 5640)
--
-- ⚠️ CE COMMERCE DE TEST EXISTE POUR UNE RAISON PRÉCISE : il est le SEUL à
-- exercer les trois modules les plus récents en même temps.
--
--   • LIEUX MULTIPLES  : chez elle, plus deux salles louées à jour fixe. Le
--                        siège social n'est pas le lieu de l'activité.
--   • COURS COLLECTIFS : un créneau accueille douze personnes, pas une.
--   • ABONNEMENTS      : période scolaire ET carnet, les deux formes.
--
-- Inspiré du fonctionnement réel d'une professeure de yoga rencontrée en
-- août 2026. Les données ci-dessous sont FICTIVES : adresses, téléphone et
-- prix sont inventés pour un bac à sable.
--
-- À passer dans Supabase SQL Editor en une fois. Idempotent.
--
-- ⚠️ À MASQUER AVANT LA SOUMISSION AUX STORES, comme les autres commerces de
-- test : un validateur qui tombe dessus conclut à une application non finie.
-- ════════════════════════════════════════════════════════════


-- ─── 1. LE COMMERÇANT ──────────────────────────────────────────────
-- ⚠️ `siege_social_est_lieu_activite` à FALSE : c'est tout l'intérêt de ce
-- commerce de test. Elle donne cours chez elle ET dans deux salles louées, et
-- l'accueil doit mesurer la distance jusqu'au BON endroit selon le jour.
INSERT INTO commercants (
  email, nom, slug, type, categorie, description, telephone,
  adresse, latitude, longitude,
  siege_social_est_lieu_activite,
  statut, statut_publication, plan,
  rdv_actif, rdv_acompte_global, rdv_delai_annulation_heures,
  rdv_paiement_cash, rdv_paiement_ligne,
  horaires_detail
) VALUES (
  'centre-respire@yoppaa-test.be',
  'Centre Respire',
  'centre-respire-mettet',
  'Cours - coaching',
  'vitrine',
  'Yoga doux, hatha et yoga sur chaise, en petits groupes de douze personnes maximum. Cours à l''année ou au semestre, hors congés scolaires. Carnets de dix séances pour celles et ceux qui préfèrent venir quand ils peuvent. Tapis et matériel fournis.',
  '+32 71 00 00 02',
  'Rue des Tilleuls 14, 5640 Mettet',
  50.3193, 4.6688,
  false,
  'valide', 'publie', 'pro',
  true, 0, 24, true, false,
  '{
    "lundi":    {"ouvert": true,  "debut": "09:00", "fin": "12:00"},
    "mardi":    {"ouvert": true,  "debut": "18:00", "fin": "21:00"},
    "mercredi": {"ouvert": false, "debut": null,    "fin": null},
    "jeudi":    {"ouvert": true,  "debut": "09:00", "fin": "12:00"},
    "vendredi": {"ouvert": true,  "debut": "18:00", "fin": "21:00"},
    "samedi":   {"ouvert": true,  "debut": "09:00", "fin": "12:00"},
    "dimanche": {"ouvert": false, "debut": null,    "fin": null}
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  nom = EXCLUDED.nom,
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  adresse = EXCLUDED.adresse,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  siege_social_est_lieu_activite = EXCLUDED.siege_social_est_lieu_activite,
  rdv_actif = EXCLUDED.rdv_actif,
  statut_publication = EXCLUDED.statut_publication,
  plan = EXCLUDED.plan,
  horaires_detail = EXCLUDED.horaires_detail;


-- ─── 2. LES LIEUX ──────────────────────────────────────────────────
-- Un lieu PERMANENT (sa salle à domicile) et deux HEBDOMADAIRES.
-- ⚠️ Les heures des lieux hebdomadaires sont ce qui permet à l'application de
-- répondre à « où es-tu à telle heure », donc de graver le bon endroit dans
-- chaque réservation.
DELETE FROM commercant_lieux WHERE commercant_id = (SELECT id FROM commercants WHERE slug = 'centre-respire-mettet');

INSERT INTO commercant_lieux (
  commercant_id, type, libelle, adresse, latitude, longitude,
  jour_semaine, heure_debut, heure_fin, principal, actif
)
SELECT c.id, t.type, t.libelle, t.adresse, t.lat, t.lon,
       t.jour, t.hd::time, t.hf::time, t.principal, true
FROM commercants c, (VALUES
  ('permanent', 'Ma salle à la maison', 'Rue des Tilleuls 14, 5640 Mettet',
   50.3193, 4.6688, NULL, '18:00', '21:00', true),
  ('hebdo',     'Salle communale de Flavion', 'Place de Flavion 3, 5620 Florennes',
   50.2733, 4.6019, 'lundi', '09:00', '12:00', false),
  ('hebdo',     'Maison de repos Les Tilleuls', 'Rue de Gozée 12, 6120 Nalinnes',
   50.3439, 4.4478, 'jeudi', '09:00', '12:00', false)
) AS t(type, libelle, adresse, lat, lon, jour, hd, hf, principal)
WHERE c.slug = 'centre-respire-mettet';


-- ─── 3. LES COURS ──────────────────────────────────────────────────
-- ⚠️ LA CAPACITÉ EST CE QUI FAIT LA DIFFÉRENCE. Douze places sur un créneau,
-- pas une : c'est ce réglage qui transforme un rendez-vous individuel en cours
-- collectif, et le seul commerce de test qui l'exerce.
INSERT INTO rdv_prestations (commercant_id, nom, description, duree_minutes, prix, acompte_pourcent, capacite, ordre, actif)
SELECT c.id, t.nom, t.description, t.duree, t.prix, 0, t.capacite, t.ordre, true
FROM commercants c, (VALUES
  ('Hatha yoga',        'Postures tenues, respiration, relaxation finale. Tous niveaux, tapis fourni.',        60, 15.00, 12, 1),
  ('Yoga doux',         'Rythme lent, adapté aux articulations sensibles et à la reprise après une pause.',    60, 15.00, 12, 2),
  ('Yoga sur chaise',   'Assis ou avec appui. Pensé pour les personnes qui ne descendent plus au sol.',        45, 12.00, 8,  3),
  ('Cours particulier', 'Une heure rien que pour toi, à domicile ou en salle. Programme sur mesure.',          60, 55.00, 1,  4)
) AS t(nom, description, duree, prix, capacite, ordre)
WHERE c.slug = 'centre-respire-mettet'
ON CONFLICT DO NOTHING;


-- ─── 4. LES CRÉNEAUX ───────────────────────────────────────────────
INSERT INTO rdv_creneaux (commercant_id, jour_semaine, heure_debut, heure_fin, pas_minutes, actif)
SELECT c.id, t.jour, t.hd::time, t.hf::time, 60, true
FROM commercants c, (VALUES
  ('lundi',    '09:00', '12:00'),
  ('mardi',    '18:00', '21:00'),
  ('jeudi',    '09:00', '12:00'),
  ('vendredi', '18:00', '21:00'),
  ('samedi',   '09:00', '12:00')
) AS t(jour, hd, hf)
WHERE c.slug = 'centre-respire-mettet'
ON CONFLICT DO NOTHING;


-- ─── 5. LES FORMULES D'ABONNEMENT ──────────────────────────────────
-- ⚠️ LES DEUX FORMES, pour que le module soit exercé en entier : trois
-- PÉRIODES calées sur l'année scolaire, et un CARNET.
--
-- ⚠️ LES SEMAINES SANS COURS SONT UN JEU DE TEST PLAUSIBLE, PAS UN CALENDRIER
-- OFFICIEL. Yoppaa n'en maintient aucun, c'est le commerçant qui coche. Ces
-- dates-là donnent 36 séances sur un lundi, ce qui permet de vérifier que
-- l'aperçu de l'écran affiche bien 36 avant de confirmer.
DELETE FROM abonnement_formules WHERE commercant_id = (SELECT id FROM commercants WHERE slug = 'centre-respire-mettet');

INSERT INTO abonnement_formules (
  commercant_id, prestation_id, libelle, type,
  date_debut, date_fin, seances_carnet, validite_jours,
  periodes_exclues, prix, seances_par_semaine, actif, ordre
)
SELECT c.id, p.id, t.libelle, t.type,
       t.debut::date, t.fin::date, t.carnet, t.validite,
       t.exclus::jsonb, t.prix, 1, true, t.ordre
FROM commercants c
JOIN rdv_prestations p ON p.commercant_id = c.id AND p.nom = 'Hatha yoga'
, (VALUES
  ('Année complète', 'periode', '2026-09-01', '2027-07-03', NULL::int, NULL::int,
   '[{"debut":"2026-10-26","fin":"2026-11-01","libelle":"Congé d''automne"},
     {"debut":"2026-12-21","fin":"2027-01-03","libelle":"Vacances d''hiver"},
     {"debut":"2027-02-15","fin":"2027-02-21","libelle":"Congé de détente"},
     {"debut":"2027-04-05","fin":"2027-04-18","libelle":"Congé de printemps"},
     {"debut":"2027-05-17","fin":"2027-05-17","libelle":"Lundi de Pentecôte"}]',
   380.00, 1),
  ('Semestre 1',     'periode', '2026-09-01', '2027-01-31', NULL, NULL,
   '[{"debut":"2026-10-26","fin":"2026-11-01","libelle":"Congé d''automne"},
     {"debut":"2026-12-21","fin":"2027-01-03","libelle":"Vacances d''hiver"}]',
   210.00, 2),
  ('Semestre 2',     'periode', '2027-02-01', '2027-07-03', NULL, NULL,
   '[{"debut":"2027-02-15","fin":"2027-02-21","libelle":"Congé de détente"},
     {"debut":"2027-04-05","fin":"2027-04-18","libelle":"Congé de printemps"},
     {"debut":"2027-05-17","fin":"2027-05-17","libelle":"Lundi de Pentecôte"}]',
   210.00, 3),
  ('Carnet de 10',   'carnet',  NULL,         NULL,         10,   180,
   '[]', 130.00, 4)
) AS t(libelle, type, debut, fin, carnet, validite, exclus, prix, ordre)
WHERE c.slug = 'centre-respire-mettet';


-- ─── VÉRIFICATION ──────────────────────────────────────────────────
SELECT
  c.nom, c.slug, c.plan, c.rdv_actif, c.siege_social_est_lieu_activite,
  (SELECT count(*) FROM commercant_lieux l      WHERE l.commercant_id = c.id AND l.deleted_at IS NULL) AS lieux,
  (SELECT count(*) FROM rdv_prestations p       WHERE p.commercant_id = c.id AND p.deleted_at IS NULL) AS cours,
  (SELECT max(p.capacite) FROM rdv_prestations p WHERE p.commercant_id = c.id)                          AS plus_grande_capacite,
  (SELECT count(*) FROM rdv_creneaux cr         WHERE cr.commercant_id = c.id)                          AS creneaux,
  (SELECT count(*) FROM abonnement_formules f   WHERE f.commercant_id = c.id AND f.deleted_at IS NULL) AS formules
FROM commercants c
WHERE c.slug = 'centre-respire-mettet';

-- Attendu : Centre Respire · pro · true · false · 3 · 4 · 12 · 5 · 4


-- ════════════════════════════════════════════════════════════
-- POUR SUPPRIMER CE COMMERÇANT TEST :
--
--   DELETE FROM commercants WHERE slug = 'centre-respire-mettet';
--
-- Le CASCADE emporte lieux, prestations, créneaux, formules et abonnements.
-- ════════════════════════════════════════════════════════════
