-- DIAGNOSTIC 2 : QUEL CRÉNEAU ACCEPTE QUELLE PRESTATION (18/09)
--
-- 🔴 CE QUE LE PREMIER DIAGNOSTIC A MONTRÉ, et qui n'était pas attendu :
--   • le pilates est lié à Carole ET à Emily, pas à Carole seule ;
--   • le MERCREDI est le seul jour où Emily n'a pas de plage ;
--   • aucune plage commune, aucune plage orpheline, aucune praticienne
--     inactive. Rien de ce que je soupçonnais.
--
-- ⚠️ IL RESTE UNE TABLE QUE JE N'AI PAS REGARDÉE : `rdv_creneau_prestations`.
-- Elle dit ce qu'une plage accepte. Un cours que personne ne vise nommément
-- n'est même pas proposé (`coursSansHoraire`), et une plage qui ne vise pas le
-- pilates est écartée de sa grille — silencieusement, dans les deux cas.
--
-- ⚠️ AUCUNE DONNÉE DE CLIENT. Configuration seule. LECTURE SEULE.

WITH c AS (
  SELECT id FROM commercants WHERE nom ILIKE '%amandine%' LIMIT 1
)
SELECT 'A. liaisons plage -> prestation'::text AS controle,
       COALESCE((SELECT string_agg('j' || cr.jour_semaine::text || ' ' || cr.heure_debut::text
                                   || ' [' || COALESCE(p.prenom, 'COMMUN') || '] -> ' || pr.nom, ' | '
                                   ORDER BY cr.jour_semaine, cr.heure_debut, pr.nom)
                 FROM rdv_creneau_prestations l
                 JOIN rdv_creneaux cr    ON cr.id = l.creneau_id
                 JOIN rdv_prestations pr ON pr.id = l.prestation_id
                 LEFT JOIN rdv_praticiens p ON p.id = cr.praticien_id
                 WHERE cr.commercant_id = (SELECT id FROM c)
                   AND cr.actif IS TRUE AND cr.deleted_at IS NULL),
                'AUCUNE LIAISON (toutes les plages acceptent tout)')::text AS valeur,
       'dire quelles plages visent le pilates'::text AS attendu

UNION ALL
-- 🔴 UNE PLAGE SANS AUCUNE LIAISON ACCEPTE TOUT. Mélanger les deux régimes
-- chez un même commerce est le cas qui trompe : certaines plages se
-- restreignent, les autres restent ouvertes à tout, et la grille change de
-- logique d'un jour à l'autre sans que rien ne l'explique.
SELECT 'B. plages SANS aucune liaison (donc ouvertes a tout)'::text,
       COALESCE((SELECT string_agg('j' || cr.jour_semaine::text || ' ' || cr.heure_debut::text
                                   || ' [' || COALESCE(p.prenom, 'COMMUN') || ']', ' | '
                                   ORDER BY cr.jour_semaine, cr.heure_debut)
                 FROM rdv_creneaux cr
                 LEFT JOIN rdv_praticiens p ON p.id = cr.praticien_id
                 WHERE cr.commercant_id = (SELECT id FROM c)
                   AND cr.actif IS TRUE AND cr.deleted_at IS NULL
                   AND NOT EXISTS (SELECT 1 FROM rdv_creneau_prestations l WHERE l.creneau_id = cr.id)),
                'aucune : toutes les plages sont restreintes')::text,
       'informatif, mais decisif si le regime est melange'::text

UNION ALL
-- 🔴 LA QUESTION QUI TRANCHE : quelles plages acceptent le pilates, et chez
-- qui. Si aucune plage de CAROLE ne le vise, ses creneaux ne viennent pas de
-- la, et je cherche au mauvais endroit depuis le debut.
SELECT 'C. plages qui acceptent le PILATES'::text,
       COALESCE((SELECT string_agg('j' || cr.jour_semaine::text || ' ' || cr.heure_debut::text
                                   || '-' || cr.heure_fin::text || ' [' || COALESCE(p.prenom, 'COMMUN') || ']', ' | '
                                   ORDER BY cr.jour_semaine, cr.heure_debut)
                 FROM rdv_creneau_prestations l
                 JOIN rdv_creneaux cr    ON cr.id = l.creneau_id
                 JOIN rdv_prestations pr ON pr.id = l.prestation_id
                 LEFT JOIN rdv_praticiens p ON p.id = cr.praticien_id
                 WHERE cr.commercant_id = (SELECT id FROM c)
                   AND cr.actif IS TRUE AND cr.deleted_at IS NULL
                   AND pr.nom ILIKE '%pilates%'), 'AUCUNE')::text,
       'les jours et les praticiennes qui le portent'::text

UNION ALL
-- ⚠️ LES FERMETURES EXCEPTIONNELLES. Une fermeture GLOBALE bloque tout le
-- monde, y compris « sans preference » ; celle d'une praticienne ne bloque que
-- son propre choix. Si une fermeture globale couvre les jours testes, le
-- symptome n'a rien a voir avec le praticien.
SELECT 'D. fermetures en cours ou a venir'::text,
       COALESCE((SELECT string_agg(f.date_debut::text || ' -> ' || f.date_fin::text
                                   || ' [' || COALESCE(p.prenom, 'GLOBALE') || ']', ' | '
                                   ORDER BY f.date_debut)
                 FROM rdv_fermetures f
                 LEFT JOIN rdv_praticiens p ON p.id = f.praticien_id
                 WHERE f.commercant_id = (SELECT id FROM c)
                   AND f.date_fin >= CURRENT_DATE), 'aucune')::text,
       'une fermeture GLOBALE expliquerait tout, sans praticien'::text

ORDER BY 1;
