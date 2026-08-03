-- MIGRATION_RDV_NO_OVERLAP.sql   (DRAFT — à revoir + tester avant prod)
--
-- Ferme le dernier trou de double-booking RDV : le CHEVAUCHEMENT à horaires
-- différents sur un même praticien nommé.
--
-- ─── ÉTAT ACTUEL (rappel) ────────────────────────────────────────────────────
-- Il existe déjà un garde-fou atomique dans MIGRATION_RDV.sql :
--   CREATE UNIQUE INDEX rdv_no_double_book ON rdv_reservations(
--     commercant_id, COALESCE(praticien_id, sentinel), date_rdv, heure_debut)
--   WHERE statut IN ('confirme','honore') AND deleted_at IS NULL;
-- Le code d'insertion (app/commander/rdv/[slug]/page.js) attrape déjà l'erreur
-- 23505 (unique_violation) et affiche « Ce créneau vient d'être pris ».
--
-- LIMITE : cet index ne matche que le MÊME heure_debut EXACT. Deux RDV qui se
-- chevauchent à horaires différents (ex. 9h00-10h00 et 9h30-10h30 sur le même
-- praticien) passent tous les deux -> double-booking possible en cas de course.
--
-- ─── CE QUE FAIT CETTE MIGRATION ─────────────────────────────────────────────
-- Ajoute une contrainte d'EXCLUSION qui interdit deux RDV actifs dont les PLAGES
-- horaires se CHEVAUCHENT pour un même praticien NOMMÉ. Atomique -> race-proof.
-- Coexiste avec l'unique index existant (qui, lui, couvre le cas praticien NULL
-- via le sentinel). AUCUN changement de sémantique pour les RDV « Sans préférence »
-- (praticien_id NULL) : ils restent gérés comme aujourd'hui.
--
-- ⚠️ HORS PÉRIMÈTRE / QUESTION OUVERTE (à trancher ensemble) :
-- Le cas « Sans préférence » (praticien_id NULL) sur un salon multi-praticiens
-- suit une logique de CAPACITÉ (N chaises), pas un simple verrou. L'unique index
-- actuel le traite en capacité-1 (sentinel), ce qui est déjà plus strict que la
-- logique d'affichage capacity-aware du front. On ne touche PAS à ça ici : c'est
-- un chantier produit distinct (modèle de capacité pour le sans-préférence).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 1 — DIAGNOSTIC (lancer EN PREMIER)
-- Une contrainte d'exclusion échoue à la création si des lignes existantes la
-- violent déjà. On liste d'abord les chevauchements praticien-nommé actuels.
-- Résultat attendu : 0 ligne. Sinon, me les envoyer : on nettoie/rebooke avant.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT a.id AS rdv_a, b.id AS rdv_b, a.praticien_id, a.date_rdv,
       a.heure_debut AS a_debut, a.heure_fin AS a_fin,
       b.heure_debut AS b_debut, b.heure_fin AS b_fin
FROM rdv_reservations a
JOIN rdv_reservations b
  ON a.praticien_id = b.praticien_id
 AND a.date_rdv = b.date_rdv
 AND a.id < b.id
WHERE a.praticien_id IS NOT NULL
  AND a.statut IN ('confirme','honore') AND a.deleted_at IS NULL
  AND b.statut IN ('confirme','honore') AND b.deleted_at IS NULL
  AND (a.heure_debut, a.heure_fin) OVERLAPS (b.heure_debut, b.heure_fin);

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 2 — CONTRAINTE (seulement si l'étape 1 renvoie 0 ligne)
-- ─────────────────────────────────────────────────────────────────────────────

-- btree_gist : requis pour combiner l'égalité (=) sur praticien_id (uuid) avec
-- l'opérateur de chevauchement (&&) sur la plage, dans un index gist.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE rdv_reservations
  ADD CONSTRAINT rdv_no_overlap_praticien
  EXCLUDE USING gist (
    praticien_id WITH =,
    tsrange(date_rdv + heure_debut, date_rdv + heure_fin) WITH &&
  )
  WHERE (praticien_id IS NOT NULL AND statut IN ('confirme','honore') AND deleted_at IS NULL);

-- Note : une violation de cette contrainte remonte en SQLSTATE 23P01
-- (exclusion_violation). Le code front l'attrape désormais au même titre que le
-- 23505 pour afficher « Ce créneau vient d'être pris ».
