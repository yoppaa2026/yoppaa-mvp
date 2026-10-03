-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_PLACE_PAR_COURS.sql (03/10)
-- UNE PLACE DE COURS NE SE DONNE QU'UNE FOIS, QUEL QUE SOIT LE PROFESSEUR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 LE DÉFAUT (audit du 03/10, avant l'arrivée de Centre Respire). L'index
-- `rdv_no_double_book` range les places PAR PROFESSEUR :
--   (commercant, COALESCE(praticien_id, 0), date, heure, place_no).
-- Une séance d'abonnement est posée sans professeur, une réservation normale
-- chez Emily en porte un : leurs places vivent dans deux espaces séparés.
-- Deux inscriptions simultanées à la dernière place d'un cours de douze
-- pouvaient donc toutes les deux passer, et le cours en comptait treize.
--
-- Le serveur refuse désormais un cours complet (lib/rdv-creation-server.js).
-- Cet index ferme la course entre deux écritures simultanées : la base, et
-- elle seule, sait départager deux requêtes qui arrivent ensemble.
--
-- ⚠️ IL S'AJOUTE, IL NE REMPLACE RIEN. L'ancien index garde son rôle pour les
-- rendez-vous individuels, et la contrainte d'exclusion le sien.
-- ⚠️ UN INDEX NE DEMANDE AUCUN DROIT : rien à accorder.
-- ⚠️ ELLE REFUSE DE S'APPLIQUER si des places sont déjà en double dans un
-- même cours, et les nomme : rien n'est changé, on décide ensemble.

BEGIN;

DO $$
DECLARE
  doublons text;
BEGIN
  SELECT string_agg(format('cours %s le %s a %s, place %s (%s fois)',
                           prestation_id, date_rdv, heure_debut, place_no, n), ' ; ')
    INTO doublons
    FROM (
      SELECT commercant_id, prestation_id, date_rdv, heure_debut, place_no, count(*) AS n
        FROM public.rdv_reservations
       WHERE statut IN ('confirme', 'honore') AND deleted_at IS NULL
         AND capacite_creneau > 1
       GROUP BY commercant_id, prestation_id, date_rdv, heure_debut, place_no
      HAVING count(*) > 1
    ) d;
  IF doublons IS NOT NULL THEN
    RAISE EXCEPTION 'PLACES_EN_DOUBLE : rien n a ete change. Doublons : %', doublons;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS rdv_une_place_par_cours
  ON public.rdv_reservations (commercant_id, prestation_id, date_rdv, heure_debut, place_no)
  WHERE statut IN ('confirme', 'honore') AND deleted_at IS NULL AND capacite_creneau > 1;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE : une ligne par point, valeur ET attendu
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'A. l index des places par cours existe'::text AS controle,
       CASE WHEN to_regclass('public.rdv_une_place_par_cours') IS NOT NULL THEN 'oui' ELSE 'NON' END AS valeur,
       'oui'::text AS attendu
UNION ALL
SELECT 'B. il est unique et range par cours, pas par professeur',
       CASE WHEN (SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'rdv_une_place_par_cours')
                 LIKE 'CREATE UNIQUE INDEX%(commercant_id, prestation_id, date_rdv, heure_debut, place_no)%capacite_creneau > 1%'
            THEN 'oui' ELSE 'NON' END,
       'oui'
UNION ALL
SELECT 'C. places en double dans un meme cours',
       (SELECT count(*)::text FROM (
          SELECT 1 FROM public.rdv_reservations
           WHERE statut IN ('confirme', 'honore') AND deleted_at IS NULL AND capacite_creneau > 1
           GROUP BY commercant_id, prestation_id, date_rdv, heure_debut, place_no
          HAVING count(*) > 1) d),
       '0'
UNION ALL
SELECT 'D. l ancien index des rendez-vous individuels est intact',
       CASE WHEN to_regclass('public.rdv_no_double_book') IS NOT NULL THEN 'oui' ELSE 'NON' END,
       'oui';
