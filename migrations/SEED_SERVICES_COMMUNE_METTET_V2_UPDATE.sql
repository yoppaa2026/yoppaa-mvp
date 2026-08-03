-- SEED_SERVICES_COMMUNE_METTET_V2_UPDATE.sql
-- ════════════════════════════════════════════════════════════════════
-- UPDATE chirurgical des 3 fiches existantes (commune-mettet, cpas-mettet,
-- police-florennes-mettet) sans toucher au téléphone/adresse/codes_postaux
-- d'Alex (qui sont plus à jour).
--
-- On enrichit UNIQUEMENT :
--   - description (structurée avec ## titres, ⚠ callouts, • puces)
--   - horaires_detail (commune seulement, police a horaires variables)
--   - donnees_riches (5 agents de quartier pour la police)
--
-- ⚠ Pré-requis : MIGRATION_SERVICES_DONNEES_RICHES.sql exécutée avant.
-- ════════════════════════════════════════════════════════════════════

-- 1) ADMINISTRATION COMMUNALE METTET ───────────────────────────────
UPDATE services_publics
SET
  description = E'L''Hôtel de Ville de Mettet vous accueille pour toutes vos démarches administratives : population, état civil, urbanisme, environnement, enseignement et bien plus.\n\n## Horaires d''ouverture\n• Lundi → Vendredi : 8h30 → 12h00 et 13h00 → 16h00\n• 2e et 4e samedis du mois : 8h30 → 11h30 (Population et État civil uniquement)\n\n## Services internes (numéros directs)\n• Bibliothèque : 071 72 50 72\n• Cimetière : 071 71 04 57\n• Culture : 071 72 00 75\n• Enseignement : 071 72 01 83\n• Environnement : 071 72 01 84\n• État civil : 071 72 00 87\n• Extra-scolaire : 071 72 00 79\n• Finances : 071 72 00 84\n• Habitat permanent : 071 72 00 98\n• Hall des sports : 071 72 72 92\n• Jeunesse : 071 71 04 53\n• Passeport / Permis de conduire : 071 71 00 86\n• Patrimoine : 071 72 00 77\n• Plan de cohésion sociale : 071 71 04 51\n• Population : 071 72 00 56\n• Recettes : 071 72 00 85\n• Secrétariat du bourgmestre : 071 72 00 96\n• Service technique : 071 72 03 32\n• Taxi social : 0475 71 00 11\n• Urbanisme : 071 72 00 88\n• Voirie : 071 72 01 81\n\n## Numéros utiles\n• Accueil administration générale : 071 72 00 70\n• Parc à conteneurs : 071 72 96 46\n• Point pension : 1765\n\n## ALE (Agence Locale pour l''Emploi)\nTéléphone : 0470 06 02 06',
  horaires_detail = jsonb_build_object(
    'lundi',    jsonb_build_object('ouvert', true,  'debut', '08:30', 'fin', '16:00'),
    'mardi',    jsonb_build_object('ouvert', true,  'debut', '08:30', 'fin', '16:00'),
    'mercredi', jsonb_build_object('ouvert', true,  'debut', '08:30', 'fin', '16:00'),
    'jeudi',    jsonb_build_object('ouvert', true,  'debut', '08:30', 'fin', '16:00'),
    'vendredi', jsonb_build_object('ouvert', true,  'debut', '08:30', 'fin', '16:00'),
    'samedi',   jsonb_build_object('ouvert', false),
    'dimanche', jsonb_build_object('ouvert', false)
  )
WHERE slug = 'commune-mettet';

-- 2) CPAS METTET ───────────────────────────────────────────────────
UPDATE services_publics
SET
  description = E'Le Centre Public d''Action Sociale (CPAS) de Mettet accompagne les habitants face aux difficultés sociales, financières ou administratives.\n\n## Missions principales\n• Aide sociale et revenu d''intégration\n• Aide médicale urgente\n• Médiation de dettes\n• Service insertion socio-professionnelle\n• Aide aux personnes âgées\n• Service logement\n\n## Prendre contact\nLe CPAS reçoit sur rendez-vous. Appelez le standard pour fixer un entretien avec un travailleur social.\n\n⚠ Toutes les démarches sont confidentielles et gratuites.'
WHERE slug = 'cpas-mettet';

-- 3) POLICE FLORENNES-METTET (zone) + agents Mettet ─────────────────
UPDATE services_publics
SET
  description = E'Le commissariat central de la zone Florennes-Mettet est situé à Florennes. La zone fait partie de la police locale Entre Sambre et Meuse (n° 5306) qui couvre également Fosses-la-Ville, Profondeville et Walcourt.\n\n## Poste de proximité de Mettet\n📍 Rue du Try Joly 1, 5640 Mettet\n🕐 Lundi → Vendredi : 8h00 → 12h00\n📞 Standard local : 071 72 70 10\n\n## Numéros utiles\n• Urgences (24h/24) : 101\n• Police Fosses-la-Ville : 071 72 02 30\n\n## Ton agent de quartier\nChaque village de Mettet a son inspecteur de quartier dédié. Sélectionne ton village ci-dessous pour identifier le tien et accéder directement à son numéro.\n\n⚠ Pour les habitants de Florennes, contactez le poste central au numéro affiché en haut de la fiche.',
  donnees_riches = jsonb_build_object(
    'agents_quartier', jsonb_build_array(
      jsonb_build_object(
        'nom',       'PIERENS Sylvie',
        'fonction',  'Chef de Poste — Mettet',
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
WHERE slug = 'police-florennes-mettet';

-- Sanity check : voir les 3 fiches mises à jour
SELECT
  slug, telephone, adresse,
  LEFT(description, 80) AS extrait_desc,
  horaires_detail IS NOT NULL AS a_horaires,
  jsonb_array_length(COALESCE(donnees_riches->'agents_quartier','[]'::jsonb)) AS nb_agents
FROM services_publics
WHERE slug IN ('commune-mettet','cpas-mettet','police-florennes-mettet')
ORDER BY type;
