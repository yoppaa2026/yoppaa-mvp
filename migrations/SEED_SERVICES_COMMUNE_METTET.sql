-- SEED_SERVICES_COMMUNE_METTET.sql
-- ════════════════════════════════════════════════════════════════════
-- 3 fiches officielles administration Mettet pour la démo conseil 15/06 :
--   1. Administration communale (type=commune)
--   2. CPAS (type=cpas)
--   3. Police — Zone Entre Sambre et Meuse (type=police, avec 5 agents)
--
-- ⚠ Exécuter d'abord MIGRATION_SERVICES_DONNEES_RICHES.sql (ajoute la colonne JSONB)
--
-- Sources :
--   - Mettet Z'infos (magazine officiel commune) — annuaire + agents quartier
--   - https://www.police.be/5306/commissariats/poste-de-proximite-de-mettet
--   - https://www.mettet.be (Place Joseph Meunier 1 et 31)
-- ════════════════════════════════════════════════════════════════════

INSERT INTO services_publics (
  slug, statut, nom, type, national, description,
  telephone, adresse, site_web, email_public,
  codes_postaux, horaires_detail, donnees_riches
) VALUES

-- 1) ADMINISTRATION COMMUNALE METTET ───────────────────────────────
(
  'commune-mettet',
  'valide',
  'Administration communale de Mettet',
  'commune',
  false,
  E'L''Hôtel de Ville de Mettet vous accueille pour toutes vos démarches administratives : population, état civil, urbanisme, environnement, enseignement et bien plus.\n\n## Horaires d''ouverture\n• Lundi → Vendredi : 8h30 → 12h00 et 13h00 → 16h00\n• 2e et 4e samedis du mois : 8h30 → 11h30 (Population et État civil uniquement)\n\n## Accueil général\nUn seul numéro pour être orienté : 071 72 00 70\n\n## Services internes (numéros directs)\n• Bibliothèque : 071 72 50 72\n• Cimetière : 071 71 04 57\n• Culture : 071 72 00 75\n• Enseignement : 071 72 01 83\n• Environnement : 071 72 01 84\n• État civil : 071 72 00 87\n• Extra-scolaire : 071 72 00 79\n• Finances : 071 72 00 84\n• Habitat permanent : 071 72 00 98\n• Hall des sports : 071 72 72 92\n• Jeunesse : 071 71 04 53\n• Passeport / Permis de conduire : 071 71 00 86\n• Patrimoine : 071 72 00 77\n• Plan de cohésion sociale : 071 71 04 51\n• Population : 071 72 00 56\n• Recettes : 071 72 00 85\n• Secrétariat du bourgmestre : 071 72 00 96\n• Service technique : 071 72 03 32\n• Taxi social : 0475 71 00 11\n• Urbanisme : 071 72 00 88\n• Voirie : 071 72 01 81\n\n## Numéros utiles\n• Parc à conteneurs : 071 72 96 46\n• Point pension : 1765\n\n## ALE (Agence Locale pour l''Emploi)\nTéléphone : 0470 06 02 06',
  '071 72 00 70',
  'Place Joseph Meunier 1, 5640 Mettet',
  'https://www.mettet.be',
  NULL,
  ARRAY['5640','5641','5642','5644','5646']::text[],
  jsonb_build_object(
    'lundi',    jsonb_build_object('ouvert', true,  'debut', '08:30', 'fin', '16:00'),
    'mardi',    jsonb_build_object('ouvert', true,  'debut', '08:30', 'fin', '16:00'),
    'mercredi', jsonb_build_object('ouvert', true,  'debut', '08:30', 'fin', '16:00'),
    'jeudi',    jsonb_build_object('ouvert', true,  'debut', '08:30', 'fin', '16:00'),
    'vendredi', jsonb_build_object('ouvert', true,  'debut', '08:30', 'fin', '16:00'),
    'samedi',   jsonb_build_object('ouvert', false),
    'dimanche', jsonb_build_object('ouvert', false)
  ),
  '{}'::jsonb
),

-- 2) CPAS METTET ───────────────────────────────────────────────────
(
  'cpas-mettet',
  'valide',
  'CPAS de Mettet',
  'cpas',
  false,
  E'Le Centre Public d''Action Sociale (CPAS) de Mettet accompagne les habitants face aux difficultés sociales, financières ou administratives.\n\n## Missions principales\n• Aide sociale et revenu d''intégration\n• Aide médicale urgente\n• Médiation de dettes\n• Service insertion socio-professionnelle\n• Aide aux personnes âgées\n• Service logement\n\n## Prendre contact\nLe CPAS reçoit sur rendez-vous. Appelez le 071 71 01 40 pour fixer un entretien avec un travailleur social.\n\n⚠ Toutes les démarches sont confidentielles et gratuites.',
  '071 71 01 40',
  'Place Joseph Meunier 31, 5640 Mettet',
  'https://www.mettet.be/cpas',
  NULL,
  ARRAY['5640','5641','5642','5644','5646']::text[],
  NULL,
  '{}'::jsonb
),

-- 3) POLICE METTET — Zone Entre Sambre et Meuse ────────────────────
(
  'police-mettet',
  'valide',
  'Police Mettet — Zone Entre Sambre et Meuse',
  'police',
  false,
  E'Le poste de proximité de Mettet fait partie de la zone de police Entre Sambre et Meuse (n° 5306).\n\n## Horaires du commissariat\n• Lundi → Vendredi : 8h00 → 12h00\n• En dehors de ces horaires : composez le 101 (urgences) ou rendez-vous au poste central\n\n## Numéros utiles\n• Standard Mettet : 071 72 70 10\n• Police Fosses-la-Ville : 071 72 02 30\n• Urgences : 101\n\n## Ton agent de quartier\nChaque village de l''entité a son inspecteur de quartier dédié. Sélectionne ton village ci-dessous pour identifier le tien.',
  '071 72 70 10',
  'Rue du Try Joly 1, 5640 Mettet',
  'https://www.police.be/5306/commissariats/poste-de-proximite-de-mettet',
  NULL,
  ARRAY['5640','5641','5642','5644','5646']::text[],
  jsonb_build_object(
    'lundi',    jsonb_build_object('ouvert', true,  'debut', '08:00', 'fin', '12:00'),
    'mardi',    jsonb_build_object('ouvert', true,  'debut', '08:00', 'fin', '12:00'),
    'mercredi', jsonb_build_object('ouvert', true,  'debut', '08:00', 'fin', '12:00'),
    'jeudi',    jsonb_build_object('ouvert', true,  'debut', '08:00', 'fin', '12:00'),
    'vendredi', jsonb_build_object('ouvert', true,  'debut', '08:00', 'fin', '12:00'),
    'samedi',   jsonb_build_object('ouvert', false),
    'dimanche', jsonb_build_object('ouvert', false)
  ),
  jsonb_build_object(
    'agents_quartier', jsonb_build_array(
      jsonb_build_object(
        'nom',       'PIERENS Sylvie',
        'fonction',  'Chef de Poste',
        'telephone', '071 710 283',
        'mobile',    '0498 543 975',
        'email',     NULL,
        'villages',  jsonb_build_array()
      ),
      jsonb_build_object(
        'nom',       'MEUTER Bruno',
        'fonction',  'Inspecteur de quartier',
        'telephone', '0498 91 75 53',
        'mobile',    NULL,
        'email',     'bruno.meuter@police.belgium.eu',
        'villages',  jsonb_build_array('Mettet centre','Biesmerée','Furnaux')
      ),
      jsonb_build_object(
        'nom',       'LEROT Cédric',
        'fonction',  'Inspecteur de quartier',
        'telephone', '0499 52 16 60',
        'mobile',    NULL,
        'email',     'cedric.lerot@police.belgium.eu',
        'villages',  jsonb_build_array('Biesme','Corroy','Oret','Stave')
      ),
      jsonb_build_object(
        'nom',       'LAURETIG Rachel',
        'fonction',  'Inspecteur de quartier',
        'telephone', '0499 52 16 59',
        'mobile',    NULL,
        'email',     'rachel.lauretig@police.belgium.eu',
        'villages',  jsonb_build_array('Devant-les-Bois','Pontaury','Scry','Saint-Gérard')
      ),
      jsonb_build_object(
        'nom',       'VERGNON Philippe',
        'fonction',  'Inspecteur de quartier',
        'telephone', '0499 52 16 61',
        'mobile',    NULL,
        'email',     'philippe.vergnon@police.belgium.eu',
        'villages',  jsonb_build_array('Bossière','Ermeton-sur-Biert','Graux','Maison')
      )
    )
  )
)

ON CONFLICT (slug) DO UPDATE SET
  statut          = EXCLUDED.statut,
  nom             = EXCLUDED.nom,
  type            = EXCLUDED.type,
  national        = EXCLUDED.national,
  description     = EXCLUDED.description,
  telephone       = EXCLUDED.telephone,
  adresse         = EXCLUDED.adresse,
  site_web        = EXCLUDED.site_web,
  email_public    = EXCLUDED.email_public,
  codes_postaux   = EXCLUDED.codes_postaux,
  horaires_detail = EXCLUDED.horaires_detail,
  donnees_riches  = EXCLUDED.donnees_riches;

-- Sanity check
SELECT
  slug, type, nom, telephone, adresse,
  jsonb_array_length(COALESCE(donnees_riches->'agents_quartier','[]'::jsonb)) AS nb_agents,
  horaires_detail IS NOT NULL AS a_horaires
FROM services_publics
WHERE slug IN ('commune-mettet','cpas-mettet','police-mettet')
ORDER BY type;
