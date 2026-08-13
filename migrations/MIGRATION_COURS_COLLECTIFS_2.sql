-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_COURS_COLLECTIFS_2.sql
--
-- LA CONTRAINTE D'EXCLUSION BLOQUAIT LE DEUXIÈME INSCRIT.
--
-- `rdv_no_overlap_praticien` interdit deux rendez-vous actifs dont les PLAGES
-- se chevauchent pour un même praticien nommé :
--
--   EXCLUDE USING gist (praticien_id WITH =, tsrange(...) WITH &&)
--     WHERE praticien_id IS NOT NULL
--       AND statut IN ('confirme','honore') AND deleted_at IS NULL
--
-- C'est une bonne protection, et elle couvre un cas que l'index unique ne voit
-- pas : deux rendez-vous à HEURES DIFFÉRENTES qui se chevauchent, 9h-10h et
-- 9h30-10h30, l'index ne comparant que des heures de début identiques.
--
-- ⚠️ MAIS UN COURS COLLECTIF EST, PAR DÉFINITION, DIX RENDEZ-VOUS QUI SE
-- CHEVAUCHENT. Dix personnes de 10h à 11h avec la même professeure, c'est
-- exactement ce que cette contrainte refuse. Elle bloquerait donc le deuxième
-- inscrit de chaque cours, et le premier chantier serait sans effet.
--
-- ⚠️ ON NE LA SUPPRIME PAS. Rouvrir en silence un trou de double-booking pour
-- tous les salons de coiffure du parc afin de servir les studios de yoga
-- serait un très mauvais échange. On la REND CONDITIONNELLE : elle continue de
-- s'appliquer intégralement aux rendez-vous individuels, et se retire pour les
-- seuls créneaux qui accueillent plusieurs personnes.
--
-- Pour cela il faut que la contrainte puisse LIRE la capacité, or elle vit sur
-- la prestation, dans une autre table, et une contrainte ne peut pas
-- interroger une table voisine. On la copie donc DANS la réservation.
--
-- ⚠️ Ce n'est pas une entorse au modèle, c'est le style de cette table : elle
-- fige déjà le prix estimé, le taux de TVA, le nom et le téléphone du client,
-- et depuis ce matin le lieu. Une réservation raconte ce qu'elle était au
-- moment où elle a été prise, sans dépendre de ce qui a changé depuis.
--
-- ⚠️ LA LIMITE, ÉCRITE NOIR SUR BLANC : deux COURS COLLECTIFS qui se
-- chevauchent à heures différentes sur le même praticien, l'un de 10h à 11h et
-- l'autre de 10h30 à 11h30, ne seront plus refusés par la base. C'est une
-- erreur de saisie du commerçant dans son propre agenda, pas une course entre
-- deux clients : personne d'autre que lui ne crée ses cours, et l'application
-- peut donc la refuser au moment de la saisie. Le risque qui justifiait une
-- garantie atomique, lui, ne concerne que les rendez-vous individuels, et il
-- reste couvert.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1) LA CAPACITÉ, COPIÉE DANS LA RÉSERVATION ────────────────────────────
-- ⚠️ DÉFAUT 1 : toutes les lignes existantes deviennent « individuelles »,
-- c'est-à-dire exactement ce qu'elles sont. La contrainte recréée plus bas les
-- couvre donc toutes, comme avant, et sa création ne peut pas échouer.
ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS capacite_creneau int NOT NULL DEFAULT 1;

ALTER TABLE rdv_reservations DROP CONSTRAINT IF EXISTS rdv_reservations_capacite_creneau_check;
ALTER TABLE rdv_reservations
  ADD CONSTRAINT rdv_reservations_capacite_creneau_check CHECK (capacite_creneau > 0);

COMMENT ON COLUMN rdv_reservations.capacite_creneau IS
  'Capacité de la prestation AU MOMENT de la réservation, copiée depuis rdv_prestations.capacite. 1 = rendez-vous individuel. Sert à la contrainte d''exclusion, qui ne peut pas lire une table voisine.';


-- ─── 2) LA CONTRAINTE, RECRÉÉE AVEC SA CONDITION ───────────────────────────
-- Identique à l'originale, plus `capacite_creneau = 1`.
--
-- ⚠️ `btree_gist` est déjà installé, puisque la contrainte d'origine existe et
-- compare `praticien_id WITH =`. Rien à ajouter.
ALTER TABLE rdv_reservations DROP CONSTRAINT IF EXISTS rdv_no_overlap_praticien;

ALTER TABLE rdv_reservations
  ADD CONSTRAINT rdv_no_overlap_praticien
  EXCLUDE USING gist (
    praticien_id WITH =,
    tsrange((date_rdv + heure_debut), (date_rdv + heure_fin)) WITH &&
  )
  WHERE (
    praticien_id IS NOT NULL
    AND capacite_creneau = 1
    AND statut = ANY (ARRAY['confirme'::text, 'honore'::text])
    AND deleted_at IS NULL
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à exécuter APRÈS, dans une requête séparée.
-- Résultat attendu, exactement :  1, 1, 1
-- ═══════════════════════════════════════════════════════════════════════════
-- select
--   (select count(*) from information_schema.columns
--      where table_name = 'rdv_reservations' and column_name = 'capacite_creneau')  as colonne_capacite,
--   (select count(*) from pg_constraint c
--      join pg_class t on t.oid = c.conrelid
--      where t.relname = 'rdv_reservations' and c.contype = 'x')                    as exclusion_toujours_la,
--   (select count(*) from pg_constraint c
--      join pg_class t on t.oid = c.conrelid
--      where t.relname = 'rdv_reservations' and c.contype = 'x'
--        and pg_get_constraintdef(c.oid) like '%capacite_creneau%')                 as exclusion_conditionnelle;
