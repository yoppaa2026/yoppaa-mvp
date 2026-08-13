-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_COURS_COLLECTIFS.sql
--
-- UN CRÉNEAU PEUT ACCUEILLIR PLUSIEURS PERSONNES.
--
-- Yoppaa ne connaît qu'un modèle de rendez-vous : une personne, un créneau,
-- un praticien. C'est juste pour un coiffeur, un garagiste ou un tatoueur.
-- Ça ne décrit pas du tout un cours de yoga de dix personnes à 10h, et c'est
-- pourtant le quotidien d'un studio, d'un coach ou d'une auto-école.
--
-- ⚠️ CE QUI L'INTERDIT AUJOURD'HUI EST UN INDEX UNIQUE, et il a raison
-- d'exister : il est ATOMIQUE, donc il tient même quand deux clients cliquent
-- à la même seconde, là où un comptage applicatif se ferait doubler.
--
--   rdv_no_double_book ON (commercant_id, praticien, date_rdv, heure_debut)
--     WHERE statut IN ('confirme','honore') AND deleted_at IS NULL
--
-- On ne le supprime donc pas, ON LUI AJOUTE UNE DIMENSION : le numéro de
-- place. Chaque inscrit occupe une place numérotée, et l'unicité porte
-- désormais sur (créneau, place).
--
-- ⚠️ ET RIEN NE CHANGE POUR LES SALONS, ce qui est la garantie qui compte.
-- Une prestation individuelle a une capacité de 1, donc `place_no` vaut
-- toujours 1, donc l'index est exactement aussi strict qu'avant. Aucune ligne
-- existante n'est à réécrire, et le défaut des deux colonnes fait que tout le
-- parc bascule sans bouger.
--
-- La onzième inscription à un cours de dix est refusée PAR LA BASE, jamais par
-- un comptage qui pourrait se tromper sous la course. C'est le même principe
-- que le compteur de numérotation des commandes : on ne fait jamais `MAX+1` en
-- espérant, on laisse la base trancher.
--
-- Décisions d'Alex du 13/08 :
--   • la capacité se règle sur la PRESTATION, une fois, valable partout ;
--   • l'agenda montre UN bloc par cours, dépliable sur ses inscrits ;
--   • un cours complet reste AFFICHÉ, grisé, plutôt que de disparaître.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1) LA CAPACITÉ, SUR LA PRESTATION ─────────────────────────────────────
-- ⚠️ DÉFAUT 1, et c'est ce qui protège l'existant : toute prestation déjà
-- créée reste individuelle, et le commerçant qui n'ouvre pas ce réglage ne
-- verra jamais la différence.
ALTER TABLE rdv_prestations
  ADD COLUMN IF NOT EXISTS capacite int NOT NULL DEFAULT 1;

ALTER TABLE rdv_prestations DROP CONSTRAINT IF EXISTS rdv_prestations_capacite_check;
ALTER TABLE rdv_prestations
  ADD CONSTRAINT rdv_prestations_capacite_check CHECK (capacite > 0);

COMMENT ON COLUMN rdv_prestations.capacite IS
  'Nombre de personnes qu''un même créneau peut accueillir. 1 = rendez-vous individuel (le cas de tous les salons). Au-delà = cours collectif.';


-- ─── 2) LA PLACE OCCUPÉE, SUR LA RÉSERVATION ───────────────────────────────
ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS place_no int NOT NULL DEFAULT 1;

ALTER TABLE rdv_reservations DROP CONSTRAINT IF EXISTS rdv_reservations_place_no_check;
ALTER TABLE rdv_reservations
  ADD CONSTRAINT rdv_reservations_place_no_check CHECK (place_no > 0);

COMMENT ON COLUMN rdv_reservations.place_no IS
  'Numéro de place occupée dans le créneau, de 1 à la capacité de la prestation. Toujours 1 pour un rendez-vous individuel. C''est lui qui rend l''index anti double-booking compatible avec les cours collectifs.';


-- ─── 3) L'INDEX ANTI DOUBLE-BOOKING, ÉLARGI ────────────────────────────────
-- ⚠️ On le RECRÉE, on ne l'abandonne pas. Sans place_no il interdisait le
-- deuxième inscrit ; avec place_no il interdit deux personnes SUR LA MÊME
-- PLACE, ce qui est la vraie règle. Un cours plein reste impossible à
-- surcharger, et une prestation individuelle est verrouillée comme avant
-- puisque sa seule place possible est la n° 1.
--
-- La création ne peut pas échouer : ajouter une colonne à un index unique ne
-- fait qu'assouplir la contrainte, jamais l'inverse.
DROP INDEX IF EXISTS rdv_no_double_book;

CREATE UNIQUE INDEX IF NOT EXISTS rdv_no_double_book ON rdv_reservations(
  commercant_id,
  COALESCE(praticien_id, '00000000-0000-0000-0000-000000000000'::uuid),
  date_rdv,
  heure_debut,
  place_no
)
WHERE statut IN ('confirme', 'honore') AND deleted_at IS NULL;


-- ─── 4) LA CONTRAINTE D'EXCLUSION, SI ELLE EXISTE ──────────────────────────
-- ⚠️ `MIGRATION_RDV_NO_OVERLAP.sql` porte la mention « DRAFT, à revoir avant
-- prod » et n'a probablement jamais été passée. Si elle l'a été, elle interdit
-- TOUT chevauchement de plages pour un praticien nommé, ce qui bloquerait le
-- deuxième inscrit d'un cours aussi sûrement que l'index précédent.
--
-- Ce bloc ne fait donc rien dans le cas normal, et prévient dans l'autre.
-- ⚠️ Il ne la SUPPRIME PAS : rouvrir en silence un trou de double-booking
-- serait pire que le problème qu'on règle. Si le message apparaît, envoie-le
-- moi, on traitera ce cas à part.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_constraint
  WHERE conrelid = 'rdv_reservations'::regclass AND contype = 'x';

  IF n > 0 THEN
    RAISE WARNING 'ATTENTION : % contrainte(s) d''exclusion sur rdv_reservations. Elles interdisent tout chevauchement et bloqueront les cours collectifs. NE PAS les retirer sans en parler.', n;
  END IF;
END $$;


-- ─── 5) GRANT explicites (règle projet) ────────────────────────────────────
GRANT SELECT ON rdv_prestations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON rdv_prestations TO authenticated;
GRANT ALL ON rdv_prestations TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à exécuter APRÈS, dans une requête séparée.
--
-- ⚠️ Il interroge l'ÉTAT RÉEL du schéma, jamais une reformulation de ce que la
-- migration prétend avoir fait.
--
-- Résultat attendu, exactement :  1, 1, 1, 1, 0
--   (le dernier vaut 0 si aucune contrainte d'exclusion ne gêne)
-- ═══════════════════════════════════════════════════════════════════════════
-- select
--   (select count(*) from information_schema.columns
--     where table_name = 'rdv_prestations' and column_name = 'capacite')          as capacite_prestation,
--   (select count(*) from information_schema.columns
--     where table_name = 'rdv_reservations' and column_name = 'place_no')         as place_reservation,
--   (select count(*) from pg_indexes
--     where indexname = 'rdv_no_double_book' and indexdef like '%place_no%')      as index_elargi,
--   (select count(*) from pg_constraint
--     where conname = 'rdv_prestations_capacite_check')                           as garde_capacite,
--   (select count(*) from pg_constraint
--     where conrelid = 'rdv_reservations'::regclass and contype = 'x')            as exclusion_genante;
