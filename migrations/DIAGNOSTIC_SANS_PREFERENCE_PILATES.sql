-- DIAGNOSTIC : « SANS PRÉFÉRENCE » NE PROPOSE AUCUN CRÉNEAU (18/09)
--
-- 🔴 CE QU'ALEX A VU chez Studio Amandine, sur une séance de pilates donnée par
-- Carole seule :
--     • sur Carole            → les créneaux sont là          ✅
--     • sur Emily             → rien, et c'est normal         ✅
--     • sur « sans préférence » → RIEN, et ça ne devrait pas  🔴
--
-- ⚠️ LE CODE DU FILTRE A L'AIR JUSTE, ET C'EST BIEN LE PROBLÈME. En « sans
-- préférence », `page.js:1513` garde TOUS les créneaux vivants, donc ceux de
-- Carole devraient y être. Si l'écran n'en propose aucun, c'est qu'un autre
-- filtre mord, et seule la configuration réelle peut dire lequel.
--
-- ⚠️ AUCUNE DONNÉE DE CLIENT ICI. Ni `rdv_reservations`, ni `clients`, ni
-- `commandes`. Seulement la configuration : praticiens, prestations, créneaux.
-- Les prénoms des praticiennes apparaissent, c'est indispensable au diagnostic.
--
-- LECTURE SEULE. Rien n'est écrit, rien n'est modifié.

WITH c AS (
  SELECT id, nom
  FROM commercants
  WHERE nom ILIKE '%amandine%'
  LIMIT 1
)
SELECT 'A. le commerce'::text AS controle,
       COALESCE((SELECT nom || ' / ' || id::text FROM c), 'INTROUVABLE')::text AS valeur,
       'Studio Amandine, avec son id'::text AS attendu

UNION ALL
SELECT 'B. praticiens actifs'::text,
       COALESCE((SELECT string_agg(p.prenom || ' (actif=' || p.actif::text || ')', ', ' ORDER BY p.prenom)
                 FROM rdv_praticiens p
                 WHERE p.commercant_id = (SELECT id FROM c) AND p.deleted_at IS NULL), 'AUCUN')::text,
       'Carole ET Emily, toutes deux actif=true'::text

UNION ALL
-- 🔴 SI UNE PRATICIENNE EST INACTIVE OU SUPPRIMÉE, SES CRÉNEAUX SONT ÉCARTÉS
-- (`page.js:1509`), et ce filtre-là s'applique AUSSI en « sans préférence ».
SELECT 'C. praticiens supprimes ou inactifs'::text,
       COALESCE((SELECT string_agg(p.prenom || ' (actif=' || p.actif::text
                                   || ', supprime=' || (p.deleted_at IS NOT NULL)::text || ')', ', ' ORDER BY p.prenom)
                 FROM rdv_praticiens p
                 WHERE p.commercant_id = (SELECT id FROM c)
                   AND (p.actif IS NOT TRUE OR p.deleted_at IS NOT NULL)), 'aucun')::text,
       'aucun, sinon ses creneaux sont ecartes partout'::text

UNION ALL
SELECT 'D. prestations actives'::text,
       COALESCE((SELECT string_agg(pr.nom || ' (capacite=' || COALESCE(pr.capacite, 1)::text
                                   || ', duree=' || COALESCE(pr.duree_minutes, 0)::text || 'min)', ' | ' ORDER BY pr.ordre, pr.nom)
                 FROM rdv_prestations pr
                 WHERE pr.commercant_id = (SELECT id FROM c)
                   AND pr.actif IS TRUE AND pr.deleted_at IS NULL), 'AUCUNE')::text,
       'le pilates doit y etre, capacite > 1'::text

UNION ALL
-- 🔴 LA JUNCTION DÉCIDE QUI EST « ÉLIGIBLE ». Vide pour une prestation = TOUS
-- les praticiens. Avec UN SEUL nom, l'écran auto-selectionne et n'affiche même
-- pas « sans préférence » (`page.js:1489`).
SELECT 'E. qui fait quoi (junction)'::text,
       COALESCE((SELECT string_agg(pr.nom || ' -> ' || p.prenom, ' | ' ORDER BY pr.nom, p.prenom)
                 FROM rdv_prestation_praticiens j
                 JOIN rdv_prestations pr ON pr.id = j.prestation_id
                 JOIN rdv_praticiens p ON p.id = j.praticien_id
                 WHERE pr.commercant_id = (SELECT id FROM c)), 'VIDE (donc tous eligibles partout)')::text,
       'dire si le pilates est liste, et a qui'::text

UNION ALL
SELECT 'F. creneaux RDV actifs'::text,
       COALESCE((SELECT string_agg('j' || cr.jour_semaine::text || ' ' || cr.heure_debut::text || '-' || cr.heure_fin::text
                                   || ' [' || COALESCE(p.prenom, 'COMMUN') || ']'
                                   || ' pas=' || COALESCE(cr.pas_minutes, 0)::text, ' | '
                                   ORDER BY cr.jour_semaine, cr.heure_debut)
                 FROM rdv_creneaux cr
                 LEFT JOIN rdv_praticiens p ON p.id = cr.praticien_id
                 WHERE cr.commercant_id = (SELECT id FROM c)
                   AND cr.actif IS TRUE AND cr.deleted_at IS NULL), 'AUCUN')::text,
       'au moins une plage portant Carole'::text

UNION ALL
-- ⚠️ UN CRÉNEAU DONT LE `praticien_id` POINTE VERS QUELQU'UN D'ABSENT est
-- écarté sans un mot : c'est le défaut du 07/09, et il frappe tous les choix.
SELECT 'G. creneaux pointant un praticien absent'::text,
       (SELECT COUNT(*)::text
        FROM rdv_creneaux cr
        WHERE cr.commercant_id = (SELECT id FROM c)
          AND cr.actif IS TRUE AND cr.deleted_at IS NULL
          AND cr.praticien_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM rdv_praticiens p
                          WHERE p.id = cr.praticien_id AND p.actif IS TRUE AND p.deleted_at IS NULL))::text,
       '0'::text

UNION ALL
SELECT 'H. creneaux communs (sans praticien)'::text,
       (SELECT COUNT(*)::text
        FROM rdv_creneaux cr
        WHERE cr.commercant_id = (SELECT id FROM c)
          AND cr.actif IS TRUE AND cr.deleted_at IS NULL
          AND cr.praticien_id IS NULL)::text,
       'informatif : ceux-la valent pour tout le monde'::text

ORDER BY 1;
