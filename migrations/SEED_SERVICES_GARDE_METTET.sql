-- SEED_SERVICES_GARDE_METTET.sql
-- ════════════════════════════════════════════════════════════════════
-- 3 fiches services publics pour la démo conseil communal Mettet 15/06/2026 :
--   1. PMG CEGENO (Bambois) — médecin de garde toute la zone CEGENO
--   2. 112 — Urgences vitales (national)
--   3. Pharmacie de garde Belgique (national, numéro surtaxé)
--
-- Approche : on ne stocke AUCUNE donnée médicale changeante. On relaye
-- juste les numéros officiels et infos pratiques. Zéro maintenance.
--
-- ⚠ Le numéro 0903 pharmacie est surtaxé (1,50€/min). Un modal
--   d'avertissement s'affiche grâce au champ telephone_notice (cf.
--   MIGRATION_SERVICES_TELEPHONE_NOTICE.sql à appliquer AVANT ce seed).
--
-- Sources :
--   https://cegeno.be/pmg/
--   https://www.pharmacie.be/
--
-- ⚠ Suppose une contrainte UNIQUE sur services_publics.slug.
-- ════════════════════════════════════════════════════════════════════

INSERT INTO services_publics (
  slug, statut, nom, type, national, description,
  telephone, telephone_notice, adresse, site_web,
  codes_postaux,
  horaires_detail
) VALUES

-- 1) PMG CEGENO ────────────────────────────────────────────────────
-- Couvre Mettet + 6 communes voisines de la zone CEGENO.
(
  'pmg-cegeno',
  'valide',
  'CEGENO — Poste médical de garde',
  'medecin_garde',
  false,
  E'Le Poste Médical de Garde CEGENO regroupe plus de 100 médecins généralistes de Mettet et des communes voisines.\n\n🕐 Quand y aller\n• En semaine : du soir 18h au lendemain matin 8h\n• Le weekend : 24h/24 (du vendredi 18h au lundi 8h)\n• Les jours fériés : 24h/24\n\n⚠ Accès uniquement sur rendez-vous via le 1733. Un opérateur évalue la priorité puis fixe un rendez-vous au poste ou organise une visite à domicile selon le besoin.\n\n📋 À apporter : carte d''identité ou carte ISI+\n💳 Paiement par terminal bancaire (cartes de crédit non acceptées)\n\nCommunes couvertes : Florennes, Fosses-la-Ville, Jemeppe-sur-Sambre, Mettet, Sambreville, Sombreffe et partie d''Anhée.',
  '1733',
  NULL,
  'Rue du Stierlinsart 39-41, 5070 Bambois',
  'https://cegeno.be/pmg/',
  ARRAY[
    '5060',  -- Sambreville (Auvelais, Tamines, Velaine-sur-Sambre, Falisolle, Arsimont, Moignelée)
    '5070',  -- Fosses-la-Ville (Aisemont, Le Roux, Sart-Eustache, Sart-Saint-Laurent, Vitrival)
    '5140',  -- Sombreffe (Boignée, Ligny, Tongrinne)
    '5190',  -- Jemeppe-sur-Sambre (Balâtre, Ham-sur-Sambre, Mornimont, Moustier-sur-Sambre, Onoz, Saint-Martin, Spy)
    '5537',  -- Anhée (partie : Anhée, Annevoie-Rouillon, Bioul, Denée, Haut-le-Wastia, Maredret, Salet, Sosoye, Warnant)
    '5620',  -- Florennes (entité + villages)
    '5640',  -- Mettet
    '5641',  -- Furnaux
    '5642',  -- Saint-Gérard
    '5644',  -- Ermeton-sur-Biert
    '5646'   -- Stave
  ]::text[],
  NULL  -- horaires nuit débordent (18h→8h) : présentés en bloc lisible dans la description
),

-- 2) 112 — Urgences vitales ────────────────────────────────────────
(
  'urgences-112',
  'valide',
  '112 — Urgences vitales',
  'urgence',
  true,
  E'🚨 En cas d''urgence vitale (malaise grave, accident, incendie, agression), composez immédiatement le 112.\n\nLe 112 est le numéro européen d''urgence unique : ambulance, pompiers et police. Disponible 24h/24, partout en Europe.\n\n❗ Pour un problème médical non vital (fièvre, blessure légère, conseil médical), utilisez plutôt le 1733 (garde médicale).',
  '112',
  NULL,
  NULL,
  NULL,
  ARRAY[]::text[],  -- codes_postaux NOT NULL en BDD : array vide pour les services nationaux
  NULL
),

-- 3) Pharmacie de garde Belgique (numéro national surtaxé) ─────────
(
  'pharmacie-garde',
  'valide',
  'Pharmacie de garde',
  'pharmacie_garde',
  true,
  E'Pour trouver la pharmacie de garde la plus proche de chez vous, deux options :\n\n📍 Consulter le site officiel (gratuit) : pharmacie.be vous indique en temps réel quelle pharmacie est de garde dans votre zone.\n\n📞 Appeler le 0903 99 000 si vous préférez. Ce numéro est ouvert 24h/24, 7j/7.\n\n⚠ Le numéro 0903 99 000 est un numéro surtaxé (1,50€/minute). Privilégiez le site web si possible.',
  '0903 99 000',
  E'⚠ Numéro surtaxé\n\nLe 0903 99 000 coûte 1,50 € par minute.\n\nSi vous le pouvez, utilisez plutôt le site officiel pharmacie.be qui est gratuit et indique la pharmacie de garde la plus proche.',
  NULL,
  'https://www.pharmacie.be/trouver-une-pharmacie-de-garde',
  ARRAY[]::text[],  -- codes_postaux NOT NULL en BDD : array vide pour les services nationaux
  NULL
)

ON CONFLICT (slug) DO UPDATE SET
  statut           = EXCLUDED.statut,
  nom              = EXCLUDED.nom,
  type             = EXCLUDED.type,
  national         = EXCLUDED.national,
  description      = EXCLUDED.description,
  telephone        = EXCLUDED.telephone,
  telephone_notice = EXCLUDED.telephone_notice,
  adresse          = EXCLUDED.adresse,
  site_web         = EXCLUDED.site_web,
  codes_postaux    = EXCLUDED.codes_postaux,
  horaires_detail  = EXCLUDED.horaires_detail;

-- Sanity check
SELECT slug, nom, type, national, statut, telephone, telephone_notice IS NOT NULL AS a_notice
FROM services_publics
WHERE slug IN ('pmg-cegeno','urgences-112','pharmacie-garde')
ORDER BY type;
