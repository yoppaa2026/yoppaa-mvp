-- SEED_SERVICES_GARDE_METTET_DESCRIPTIONS_V2.sql
-- ════════════════════════════════════════════════════════════════════
-- Réécriture des descriptions des 3 fiches garde médicale Mettet
-- pour utiliser la convention Markdown light :
--   ## Titre              → titre de section (h3 violet uppercase + ligne séparateur)
--   ⚠ Texte               → callout warning ambre
--   🚨 Texte              → callout danger rouge
--   • Item                → puce de liste violet
--   ligne vide            → séparateur entre blocs
--   sinon                 → paragraphe normal
--
-- Le composant <ServiceDescription> dans app/commander/services/[slug]/page.js
-- parse ce format et le rend en blocs visuels aérés.
-- ════════════════════════════════════════════════════════════════════

UPDATE services_publics
SET description = E'Le Poste Médical de Garde CEGENO regroupe plus de 100 médecins généralistes de Mettet et des communes voisines.\n\n## Horaires de garde\n• En semaine : 18h → 8h le lendemain matin\n• Le weekend : 24h/24 (du vendredi 18h au lundi 8h)\n• Les jours fériés : 24h/24\n\n⚠ Accès uniquement sur rendez-vous via le 1733\n\nUn opérateur évalue la priorité puis fixe un rendez-vous au poste ou organise une visite à domicile selon le besoin.\n\n## À apporter\n• Carte d''identité ou carte ISI+\n\n## Paiement sur place\n• Terminal bancaire uniquement\n• Cartes de crédit non acceptées\n\n## Communes couvertes\nFlorennes, Fosses-la-Ville, Jemeppe-sur-Sambre, Mettet, Sambreville, Sombreffe et partie d''Anhée.'
WHERE slug = 'pmg-cegeno';

UPDATE services_publics
SET description = E'🚨 En cas d''urgence vitale, composez immédiatement le 112\n\nMalaise grave, accident, incendie, agression : le 112 est le numéro européen d''urgence unique. Ambulance, pompiers et police réunis, 24h/24, partout en Europe.\n\n## Pour un problème non vital\nComposez plutôt le 1733 (garde médicale) pour fièvre, blessure légère ou conseil médical.'
WHERE slug = 'urgences-112';

UPDATE services_publics
SET description = E'Deux options pour trouver la pharmacie de garde la plus proche de chez vous.\n\n## Option 1 — Site web (gratuit)\nPharmacie.be indique en temps réel quelle pharmacie est de garde dans votre zone.\n\n## Option 2 — Téléphone (24h/24)\nLe 0903 99 000 vous oriente vocalement vers la pharmacie de garde.\n\n⚠ Numéro surtaxé : 1,50 €/minute\n\nPrivilégiez le site web si possible.'
WHERE slug = 'pharmacie-garde';

-- Sanity check : voir le nouveau contenu
SELECT slug, LEFT(description, 100) || '…' AS extrait
FROM services_publics
WHERE slug IN ('pmg-cegeno','urgences-112','pharmacie-garde')
ORDER BY type;
