-- ════════════════════════════════════════════════════════════
-- SEED COMMERÇANT TEST : Dermaé - institut de beauté (Mettet 5640)
-- Données alignées sur la fiche Planity réelle.
-- À passer dans Supabase SQL Editor en une fois.
-- Tout est idempotent : tu peux re-run sans planter.
-- ════════════════════════════════════════════════════════════


-- ─── 0. CLEANUP DES TESTS PRÉCÉDENTS (si tu avais lancé l'ancien SEED) ───
-- Supprime l'ancienne entrée 'dermae-biesme' si présente.
-- Le CASCADE sur les FK supprime auto les prestations/créneaux/reservations liées.
DELETE FROM commercants WHERE slug IN ('dermae-biesme');


-- ─── 1. COMMERÇANT ─────────────────────────────────────────────────
-- Plan PRO, RDV activé, fidélité 10 prestations → -10%.

INSERT INTO commercants (
  email, nom, slug, type, categorie, description, telephone,
  adresse, latitude, longitude,
  statut, statut_publication, plan,
  rdv_actif, rdv_acompte_global, rdv_delai_annulation_heures,
  rdv_paiement_cash, rdv_paiement_ligne,
  rdv_fidelite_actif, rdv_fidelite_seuil, rdv_fidelite_pourcent,
  horaires_detail
) VALUES (
  'dermae@yoppaa-test.be',
  'Dermaé - institut de beauté',
  'dermae-mettet',
  'Institut de beauté',
  'vitrine',
  'Institut de beauté à Mettet — dermopigmentation, sourcils, soins du visage et du corps, épilations, beauté des mains et pieds. Spécialiste en permanent C/S & sourcils, training pour pros.',
  '+32 71 00 00 00',
  '8 Rue du Mont, 5640 Mettet',
  50.3193, 4.6688,
  'valide', 'publie', 'pro',
  true, 0, 24, true, false,
  true, 10, 10,
  '{
    "lundi":    {"ouvert": false, "debut": null,    "fin": null},
    "mardi":    {"ouvert": true,  "debut": "09:00", "fin": "18:00"},
    "mercredi": {"ouvert": true,  "debut": "09:00", "fin": "18:00"},
    "jeudi":    {"ouvert": true,  "debut": "09:00", "fin": "20:00"},
    "vendredi": {"ouvert": true,  "debut": "09:00", "fin": "18:00"},
    "samedi":   {"ouvert": true,  "debut": "09:00", "fin": "16:00"},
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
  rdv_actif = EXCLUDED.rdv_actif,
  rdv_fidelite_actif = EXCLUDED.rdv_fidelite_actif,
  rdv_fidelite_seuil = EXCLUDED.rdv_fidelite_seuil,
  rdv_fidelite_pourcent = EXCLUDED.rdv_fidelite_pourcent,
  statut_publication = EXCLUDED.statut_publication,
  plan = EXCLUDED.plan,
  horaires_detail = EXCLUDED.horaires_detail;


-- ─── 2. PRESTATIONS (8 services réels visibles sur Planity + extensions logiques) ──
-- ON CONFLICT DO NOTHING : si tu re-run, n'écrase pas les modifs manuelles éventuelles.

INSERT INTO rdv_prestations (commercant_id, nom, description, duree_minutes, prix, prix_min, prix_max, acompte_pourcent, ordre)
SELECT c.id, t.nom, t.description, t.duree_minutes, t.prix, t.prix_min, t.prix_max, t.acompte_pourcent, t.ordre
FROM commercants c, (VALUES
  -- Beauté des mains & pieds (vu sur Planity)
  ('Pose complète en gel chablon',           'Pose gel avec chablon pour rallongement. Finition au choix.',                 120, 60.00, NULL, NULL, 20, 1),
  ('Pose complète en gel sur ongles naturels','Pose gel sur ongles naturels. Tenue 3-4 semaines.',                           90,  50.00, NULL, NULL, 20, 2),
  ('Manucure express',                       'Cuticules, lime, polissage, vernis classique.',                                30,  22.00, NULL, NULL, 0,  3),
  -- Soins visage
  ('Soin du visage classique',               'Démaquillage, gommage, masque hydratant, sérum.',                              60,  55.00, NULL, NULL, 0,  4),
  ('Soin du visage anti-âge',                'Massage liftant, sérum spécifique, masque tenseur.',                           75,  75.00, NULL, NULL, 20, 5),
  -- Dermopigmentation (spécialité Dermaé)
  ('Dermopigmentation sourcils',             'Maquillage permanent sourcils. Retouche incluse à 4-6 semaines.',              120, NULL,  280.00, 350.00, 30, 6),
  ('Dermopigmentation lèvres',               'Maquillage permanent lèvres. Retouche incluse.',                               120, NULL,  300.00, 400.00, 30, 7),
  -- Épilation
  ('Épilation jambes complètes',             'Cire chaude orientale, soin apaisant.',                                        45,  35.00, NULL, NULL, 0,  8)
) AS t(nom, description, duree_minutes, prix, prix_min, prix_max, acompte_pourcent, ordre)
WHERE c.slug = 'dermae-mettet'
ON CONFLICT DO NOTHING;


-- ─── 3. CRÉNEAUX RDV (jours ouvrés, pas 30 min, pause 12h00–13h30) ─

INSERT INTO rdv_creneaux (commercant_id, jour_semaine, heure_debut, heure_fin, pas_minutes, pause_debut, pause_fin, actif)
SELECT c.id, t.jour, '09:00'::time, t.fin::time, 30, '12:00'::time, '13:30'::time, true
FROM commercants c, (VALUES
  ('mardi',    '18:00'),
  ('mercredi', '18:00'),
  ('jeudi',    '20:00'),
  ('vendredi', '18:00'),
  ('samedi',   '16:00')
) AS t(jour, fin)
WHERE c.slug = 'dermae-mettet'
ON CONFLICT DO NOTHING;


-- ─── VÉRIFICATION ──────────────────────────────────────────────────
SELECT
  c.id, c.nom, c.slug, c.plan, c.rdv_actif, c.statut_publication,
  (SELECT count(*) FROM rdv_prestations p WHERE p.commercant_id = c.id) AS prestations,
  (SELECT count(*) FROM rdv_creneaux cr WHERE cr.commercant_id = c.id) AS creneaux
FROM commercants c
WHERE c.slug = 'dermae-mettet';


-- ════════════════════════════════════════════════════════════
-- POUR SUPPRIMER LE COMMERÇANT TEST (cleanup complet) :
--
--   DELETE FROM commercants WHERE slug = 'dermae-mettet';
-- ════════════════════════════════════════════════════════════
