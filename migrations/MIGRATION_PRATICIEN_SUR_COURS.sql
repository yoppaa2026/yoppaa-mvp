-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_PRATICIEN_SUR_COURS.sql
--
-- LES INSCRITES D'UN COURS N'AVAIENT PAS TOUTES LA MÊME PRATICIENNE.
--
-- Relevé par Alex le 16/08 sur Centre Respire : un cours de douze affichait
-- « 2/12 » alors qu'il était plein. Dix inscrites portaient la praticienne,
-- deux avaient réservé « sans préférence », et l'agenda en faisait DEUX
-- séances. Le tunnel de réservation, lui, comptait bien douze.
--
-- ⚠️ LE DÉFAUT D'AFFICHAGE EST DÉJÀ CORRIGÉ DANS LE CODE, et il l'est pour de
-- bon : une séance se définit désormais par la date, l'heure et la prestation,
-- sans le praticien, exactement comme le fait le comptage des places. Cette
-- migration ne répare donc RIEN de fonctionnel.
--
-- Ce qu'elle apporte, et c'est tout : la couleur du bloc dans l'agenda vient
-- du PREMIER inscrit. Si celui-ci n'a pas de praticienne, le cours s'affiche
-- dans la couleur par défaut au lieu de celle d'Emily.
--
-- ⚠️ ELLE NE TOUCHE QUE LES COURS COLLECTIFS (`capacite_creneau > 1`), et
-- c'est délibéré. Un rendez-vous INDIVIDUEL sans praticien est parfaitement
-- légitime, et la contrainte d'exclusion anti double-booking ne s'active que
-- sur `praticien_id IS NOT NULL AND capacite_creneau = 1` : lui assigner une
-- praticienne réveillerait cette contrainte sur des lignes qui y échappaient,
-- et deux rendez-vous qui se chevauchent feraient échouer la migration entière
-- pour un gain nul.
--
-- ⚠️ ET SEULEMENT CHEZ QUI N'A QU'UNE SEULE PRATICIENNE ACTIVE. Avec deux, on
-- ne peut pas deviner laquelle donnait le cours, et écrire un nom au hasard
-- serait pire que de laisser vide : le commerçant croirait une information que
-- personne n'a jamais saisie.
--
-- Aucune table, aucune colonne, aucune fonction créée : rien à GRANT.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⚠️ `array_agg`, ET SURTOUT PAS `min()` : PostgreSQL n'a pas de `min(uuid)`,
-- et la migration échouait sur « function min(uuid) does not exist ». Le
-- `HAVING count(*) = 1` garantit une seule praticienne par groupe, donc prendre
-- le premier élément du tableau EST le bon identifiant, sans conversion.
UPDATE rdv_reservations r
SET praticien_id = seul.id
FROM (
  SELECT p.commercant_id, (array_agg(p.id))[1] AS id
  FROM rdv_praticiens p
  WHERE p.actif = true
    AND p.deleted_at IS NULL
  GROUP BY p.commercant_id
  HAVING count(*) = 1
) AS seul
WHERE r.commercant_id = seul.commercant_id
  AND r.praticien_id IS NULL
  AND r.capacite_creneau > 1
  AND r.deleted_at IS NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à exécuter APRÈS, dans une requête séparée.
--
-- Résultat attendu : `cours_sans_praticien` à 0 pour les commerces à une seule
-- praticienne. La seconde colonne compte ce qui reste légitimement vide, chez
-- ceux qui en ont plusieurs : elle n'a pas à valoir zéro.
-- ═══════════════════════════════════════════════════════════════════════════
-- select
--   (select count(*) from rdv_reservations r
--      join (select p.commercant_id from rdv_praticiens p
--              where p.actif and p.deleted_at is null
--              group by p.commercant_id having count(*) = 1) s
--        on s.commercant_id = r.commercant_id
--     where r.praticien_id is null and r.capacite_creneau > 1
--       and r.deleted_at is null)                            as cours_sans_praticien,
--   (select count(*) from rdv_reservations r
--     where r.praticien_id is null and r.capacite_creneau > 1
--       and r.deleted_at is null)                            as total_cours_sans_praticien;
