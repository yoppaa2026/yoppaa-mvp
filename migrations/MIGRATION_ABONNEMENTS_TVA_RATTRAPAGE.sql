-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_ABONNEMENTS_TVA_RATTRAPAGE.sql
--
-- Suite de MIGRATION_ABONNEMENTS_COMPTABILITE.sql, qui a ajouté `tva_taux`.
-- Les contrats vendus AVANT elle n'en ont pas : le contrôle a compté
-- 4 payés, 4 sans taux figé.
--
-- Ils fonctionnent, l'export retombant sur le taux par défaut du commerce,
-- puis sur la colonne « Taux non renseigné ». Mais un contrat déjà vendu doit
-- porter SON taux, pas celui d'aujourd'hui : c'est toute la raison d'être du
-- figement.
--
-- ⚠️ ON NE DEVINE AUCUN TAUX. On recopie celui de la prestation que
-- l'abonnement paie, et RIEN quand cette prestation n'en a pas elle-même :
-- inventer une valeur ici la ferait passer inaperçue dans une déclaration,
-- alors que « non renseigné » se voit.
--
-- ⚠️ LE REPLI PAR LA FORMULE EST INDISPENSABLE : le premier contrat d'Alex a
-- été acheté avant le correctif du 16/08 au soir et a `prestation_id` VIDE.
-- Sans ce `COALESCE`, il serait le seul à rester sans taux.
--
-- Idempotente : elle ne touche que les lignes encore à NULL.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Avant ──────────────────────────────────────────────────────────────
SELECT
  count(*) FILTER (WHERE tva_taux IS NULL)     AS sans_taux,
  count(*) FILTER (WHERE tva_taux IS NOT NULL) AS avec_taux,
  count(*)                                     AS total
FROM abonnements;

-- ─── 2. Le rattrapage ──────────────────────────────────────────────────────
UPDATE abonnements a
SET tva_taux = p.tva_taux
FROM rdv_prestations p
WHERE a.tva_taux IS NULL
  AND p.tva_taux IS NOT NULL
  AND p.id = COALESCE(
        a.prestation_id,
        (SELECT f.prestation_id FROM abonnement_formules f WHERE f.id = a.formule_id)
      );

-- ─── 3. Après ──────────────────────────────────────────────────────────────
-- Attendu : `sans_taux` retombe à 0, sauf si la prestation elle-même n'a aucun
-- taux renseigné. Dans ce cas la bonne suite n'est pas ici, c'est le taux à
-- poser sur la prestation dans le tableau de bord.
SELECT
  count(*) FILTER (WHERE tva_taux IS NULL)     AS sans_taux,
  count(*) FILTER (WHERE tva_taux IS NOT NULL) AS avec_taux,
  count(*)                                     AS total
FROM abonnements;
