-- ════════════════════════════════════════════════════════════════════
-- LECTURE DES SERVICES DE TABLE (15/10) — LECTURE SEULE, rien n'est modifié.
--
-- Décision d'Alex (15/10) : pour une table, le service est la FENÊTRE
-- D'ARRIVÉE (« Première arrivée / Dernière arrivée »). Avant, la table devait
-- FINIR dans le service : certains services ont été prolongés pour ça (chez
-- Mathilde, 12h-16h pour accueillir une table de 2 h jusqu'à 14h). Avec la
-- nouvelle règle, ces services accepteraient des arrivées jusqu'à 16h.
--
-- Cette lecture liste TOUS les services des commerces qui prennent des tables,
-- avec la durée de table la plus longue, pour repérer ceux à raccourcir.
-- À coller en une fois, base de PRODUCTION (puis la même sur la base d'essai).
-- ════════════════════════════════════════════════════════════════════

WITH tables AS (
  SELECT commercant_id, max(duree_minutes) AS duree_max
    FROM public.rdv_prestations
   WHERE par_couverts = true AND coalesce(actif, true) = true AND deleted_at IS NULL
   GROUP BY commercant_id
)
SELECT c.nom                                       AS commerce,
       c.statut_publication                        AS publication,
       coalesce(cr.date_specifique::text, cr.jour_semaine) AS jour,
       to_char(cr.heure_debut, 'HH24:MI')          AS premiere_arrivee,
       to_char(cr.heure_fin, 'HH24:MI')            AS fin_actuelle,
       t.duree_max                                 AS table_la_plus_longue_min,
       -- Ce que le service donnait comme DERNIÈRE ARRIVÉE avec l'ancienne
       -- règle (fin moins la table la plus longue) : c'est souvent la bonne
       -- valeur à remettre comme « Dernière arrivée ».
       to_char(cr.heure_fin - make_interval(mins => t.duree_max), 'HH24:MI') AS derniere_arrivee_avant,
       CASE WHEN cr.actif THEN 'actif' ELSE 'éteint' END AS etat
  FROM public.rdv_creneaux cr
  JOIN tables t           ON t.commercant_id = cr.commercant_id
  JOIN public.commercants c ON c.id = cr.commercant_id
 WHERE cr.deleted_at IS NULL
 ORDER BY c.nom, jour, cr.heure_debut;
