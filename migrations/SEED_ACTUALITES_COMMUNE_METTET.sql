-- SEED_ACTUALITES_COMMUNE_METTET.sql
-- ════════════════════════════════════════════════════════════════════
-- 2 actualités pour la fiche commune-mettet (vraies données BDD, pas mock) :
--   1. Actu  : Marché du terroir dominical (durée longue, jusqu'à fin 2026)
--   2. Alerte: Travaux Place du Marché (urgence=true, période 22/06 → 5/07)
--
-- S'affichent automatiquement :
--   - Sur la fiche détail /commander/services/commune-mettet
--     (composant existant qui fetch actualites WHERE service_id + actif
--      + entre date_debut/date_fin, tri urgence DESC)
--   - Sur la card du hub /commander dans la section "Officiel" via les
--     nouvelles pills statut (alerte rouge pulse + actu violet)
--   - Sur le badge rouge de l'onglet "Officiel" du nav bottom (déjà en
--     place via setAlerteUrgenteActive)
--
-- Le futur dashboard commune (post-partenariat) pourra créer/éditer ces
-- rows directement via UI, c'est la même infra qui tourne.
-- ════════════════════════════════════════════════════════════════════

INSERT INTO actualites (service_id, titre, contenu, type, date_debut, date_fin, urgence, actif)
SELECT id,
       'Marché du terroir tous les dimanches matin',
       'Place Joseph Meunier · 8h-13h · Producteurs locaux, produits bio, ambiance conviviale.',
       'actu',
       '2026-06-01',
       '2026-12-31',
       false,
       true
FROM services_publics WHERE slug = 'commune-mettet'

UNION ALL

SELECT id,
       'Travaux Place du Marché — stationnement interdit',
       'Du lundi 22 juin au dimanche 5 juillet 2026. Déviation par la rue Saint-Donat. Merci de votre compréhension.',
       'alerte',
       '2026-06-22',
       '2026-07-05',
       true,
       true
FROM services_publics WHERE slug = 'commune-mettet';

-- Sanity check
SELECT a.id, a.titre, a.type, a.urgence, a.date_debut, a.date_fin, a.actif,
       s.slug AS service_slug
FROM actualites a
JOIN services_publics s ON s.id = a.service_id
WHERE s.slug = 'commune-mettet'
ORDER BY a.urgence DESC, a.date_debut DESC;
