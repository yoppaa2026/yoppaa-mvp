-- MIGRATION_ABONNEMENTS_SANS_JOUR_FIXE
-- Décision d'Alex, 18/08 : le jour fixe hebdomadaire disparaît.
--
-- ⚠️ CE QUI CHANGE, ET POURQUOI.
--
-- Un abonnement était vendu comme « tous les mardis à 19h ». Dans la vraie vie
-- d'un cours, la semaine d'une abonnée bouge : elle vient le mardi, puis le
-- jeudi, puis le mardi. Le jour fixe obligeait à annuler et reposer chaque fois.
--
-- Le contrat devient donc un CRÉDIT DE N SÉANCES SUR UNE PÉRIODE, sans jour.
-- Les séances se posent une à une, par la commerçante ou par la cliente, et
-- chacune retombe où elle veut dans la semaine.
--
-- ⚠️ ET LE COMPTE CHANGE DE BASE. Il ne se fait plus en comptant les mardis
-- mais en comptant les SEMAINES, ce que le commentaire de `seances_total`
-- décrivait déjà depuis le premier jour : c'est le code qui s'en écartait.
-- Effet de bord heureux, un défaut silencieux disparaît : un mardi tombant
-- dans un congé faisait perdre la séance, alors qu'une semaine seulement
-- entamée par un congé garde la sienne, posée un autre jour.
--
-- ⚠️ AUCUNE COLONNE N'EST SUPPRIMÉE, AUCUNE DONNÉE N'EST RÉÉCRITE.
-- `mode`, `jour_semaine` et `heure_debut` restent en place : les contrats déjà
-- vendus les portent, leurs séances sont déjà posées, et rien ne justifie de
-- réécrire un contrat payé. Ils deviennent de l'HISTOIRE, plus une règle.
-- En particulier `seances_total` n'est PAS recalculé : le nombre de séances est
-- figé à la souscription, et le recalculer retirerait des séances déjà payées.

BEGIN;

-- ─── 1. LA GARDE QUI EXIGEAIT UN JOUR ET UNE HEURE ──────────────────────────
--
-- Elle protégeait deux choses, et les deux prémisses viennent de tomber :
--   • « une place fixe sans jour ne génère rien » : plus rien ne se génère
--     d'avance, les séances se posent une à une ;
--   • « un crédit sans email ne peut pas être retrouvé » : c'était vrai quand
--     la cliente était la seule à pouvoir réserver. La commerçante pose
--     désormais les séances elle-même, et une abonnée de 70 ans qui n'a pas
--     d'adresse email doit pouvoir exister.
--
-- ⚠️ ON NE REMPLACE PAS PAR UNE AUTRE GARDE, ET C'EST DÉLIBÉRÉ : les deux
-- situations qu'elle interdisait sont maintenant l'une et l'autre légitimes.
-- L'écran d'inscription DIT à la commerçante ce que l'absence d'email implique
-- (elle posera toutes les séances), il ne le lui interdit plus.
ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_mode_coherent_check;

-- ─── 2. LE DÉFAUT DE `mode` PASSE À 'credit' ────────────────────────────────
--
-- La colonne survit pour les contrats déjà vendus, mais elle ne pilote plus
-- rien : ce qui distingue les deux situations n'est plus une valeur stockée,
-- c'est un FAIT observable, les séances sont posées ou elles ne le sont pas.
-- Le défaut change pour qu'une insertion qui oublierait la colonne ne recrée
-- pas un contrat à place fixe par accident.
ALTER TABLE abonnements ALTER COLUMN mode SET DEFAULT 'credit';

-- Les deux valeurs restent acceptées : 'place_fixe' est de l'histoire, et on ne
-- casse pas la lecture des contrats de l'année dernière.
ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_mode_check;
ALTER TABLE abonnements
  ADD CONSTRAINT abonnements_mode_check CHECK (mode IN ('place_fixe', 'credit'));

-- ─── 3. CE QUE LES COLONNES VEULENT DIRE MAINTENANT ─────────────────────────
COMMENT ON COLUMN abonnements.mode IS
  'HISTORIQUE depuis le 18/08. place_fixe = contrat vendu avant la suppression du jour fixe, ses séances ont été générées d''avance. credit = le contrat ordinaire : N séances à poser une à une, par la commerçante ou par la cliente. Ne pilote plus aucun comportement : ce qui compte est de savoir si les séances sont posées, et cela se lit sur rdv_reservations.';

COMMENT ON COLUMN abonnements.jour_semaine IS
  'HISTORIQUE depuis le 18/08. Le jour hebdomadaire des contrats vendus avant la suppression du jour fixe. NULL sur tout contrat récent : une abonnée n''a plus de jour attitré, chaque séance se pose où elle veut dans la semaine.';

COMMENT ON COLUMN abonnements.heure_debut IS
  'HISTORIQUE depuis le 18/08, comme jour_semaine. L''heure vit désormais sur chaque séance posée, pas sur le contrat.';

COMMENT ON COLUMN abonnements.seances_total IS
  'Nombre de séances accordées, FIGÉ à la souscription. Il se compte en SEMAINES de la période, moins celles entièrement écartées par un congé, multiplié par seances_par_semaine. Le recalculer plus tard réécrirait un contrat payé au moindre congé ajouté en cours d''année.';

COMMIT;

-- ─── CONTRÔLE ───────────────────────────────────────────────────────────────
-- La garde doit avoir disparu, le défaut doit valoir 'credit'.
--
--   SELECT conname
--     FROM pg_constraint
--    WHERE conrelid = 'abonnements'::regclass
--      AND conname = 'abonnements_mode_coherent_check';
--   -- attendu : 0 ligne
--
--   SELECT column_default
--     FROM information_schema.columns
--    WHERE table_name = 'abonnements' AND column_name = 'mode';
--   -- attendu : 'credit'::text
--
-- Et l'inventaire de ce qui existe déjà, pour savoir ce qu'on garde en histoire :
--
--   SELECT mode, count(*) AS contrats, count(jour_semaine) AS avec_jour
--     FROM abonnements
--    WHERE deleted_at IS NULL
--    GROUP BY mode;
