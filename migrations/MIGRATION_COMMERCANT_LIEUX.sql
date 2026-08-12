-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_COMMERCANT_LIEUX.sql
--
-- LE SIÈGE SOCIAL N'EST PAS LE LIEU DE L'ACTIVITÉ, et Yoppaa confondait les deux.
--
-- Un commerçant n'a aujourd'hui QU'UNE adresse, et elle joue quatre rôles à la
-- fois : identifier l'entreprise, dire où se passe l'activité, servir de point
-- de calcul des distances, et rattacher la fiche à une commune. Tant que les
-- quatre coïncident, personne ne voit le problème.
--
-- Ils divergent dans deux cas bien réels :
--   • le commerçant inscrit à la BCE à son domicile, mais qui travaille
--     ailleurs. Il saisit son domicile pour être en règle, et Yoppaa envoie ses
--     clients chez lui ;
--   • le commerçant ITINÉRANT. Une professeure de yoga qui donne cours dans
--     deux ou trois salles, un food truck qui change de place chaque jour. Une
--     seule adresse ne peut pas les décrire.
--
-- ⚠️ LA TABLE EXISTAIT DÉJÀ, SOUS UN NOM TROP ÉTROIT. `foodtruck_emplacements`
-- fait presque exactement ce qu'il faut : un libellé convivial, une adresse, un
-- jour de semaine récurrent OU une date ponctuelle, des heures, un indicateur
-- actif, et une règle de résolution où le ponctuel prime sur l'hebdomadaire.
-- La garder sous ce nom condamnerait tout le monde à lire « foodtruck » en
-- pensant à une salle de yoga. On la renomme maintenant, tant qu'elle est jeune.
--
-- Ce que la migration fait, dans l'ordre :
--   1. renomme la table, ses index et ses politiques ;
--   2. ouvre une troisième sorte de lieu, `permanent`, celle du salon ou du
--      second siège d'exploitation, sans jour ni date : actif tous les jours ;
--   3. ajoute les coordonnées, sans lesquelles aucune distance ne se calcule
--      depuis un emplacement (le food truck mesurait depuis son dépôt) ;
--   4. ajoute le rattachement communal du lieu, pour la décision d'Alex du
--      12/08 : un commerce itinérant apparaît dans TOUTES ses communes ;
--   5. pose la case `siege_social_est_lieu_activite` sur les commerçants.
--
-- ⚠️ LE DÉFAUT DE LA CASE EST `true`, ET C'EST CE QUI PROTÈGE L'EXISTANT. Pour
-- tous les commerçants déjà inscrits, l'adresse saisie EST leur lieu d'activité :
-- avec ce défaut, rien ne bouge pour eux, ni sur leur fiche, ni dans les
-- distances, ni dans leur commune.
--
-- Aucune donnée personnelle : des adresses de commerces, publiques par nature.
--
-- Idempotente : ré-exécutable sans effet de bord.
--
-- Vérification attendue en fin de script :
--   table_renommee = 1, ancienne_disparue = 0, colonnes_lieux = 4,
--   case_commercants = 1, permanent_autorise = 1
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) Renommage de la table ──────────────────────────────────────────────
-- Le renommage PRÉSERVE les lignes, les index, les contraintes et les
-- politiques. Seuls leurs NOMS restent trompeurs, d'où les étapes suivantes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'foodtruck_emplacements')
     AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'commercant_lieux') THEN
    ALTER TABLE foodtruck_emplacements RENAME TO commercant_lieux;
  END IF;
END $$;

-- Table de secours si elle n'avait jamais été créée (environnement neuf).
CREATE TABLE IF NOT EXISTS commercant_lieux (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  type          text NOT NULL,
  date_jour     date,
  jour_semaine  text,
  libelle       text NOT NULL,
  adresse       text NOT NULL,
  heure_debut   time,
  heure_fin     time,
  actif         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── 2) Les nouvelles colonnes ─────────────────────────────────────────────
ALTER TABLE commercant_lieux
  ADD COLUMN IF NOT EXISTS latitude   double precision,
  ADD COLUMN IF NOT EXISTS longitude  double precision,
  ADD COLUMN IF NOT EXISTS commune_id uuid REFERENCES communes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS principal  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN commercant_lieux.latitude IS
  'Coordonnées du LIEU, géocodées à l''enregistrement. Sans elles, la distance affichée au Yopper se mesurait depuis le siège social et non depuis l''endroit où il doit se rendre.';
COMMENT ON COLUMN commercant_lieux.commune_id IS
  'Commune du lieu. Décision Alex du 12/08 : un commerce itinérant apparaît dans TOUTES ses communes, tout le temps, la fiche indiquant quel jour il est où.';
COMMENT ON COLUMN commercant_lieux.principal IS
  'Le lieu de référence, celui qui sert quand aucun autre ne s''applique.';

-- ─── 3) Les contraintes, refaites proprement ───────────────────────────────
-- ⚠️ Le renommage d'une table NE renomme PAS ses contraintes : elles portent
-- encore `foodtruck_emplacements_*`. On les enlève toutes et on repose les
-- bonnes, ce qui règle du même coup l'ouverture du type `permanent`.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'commercant_lieux'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE commercant_lieux DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE commercant_lieux
  ADD CONSTRAINT commercant_lieux_type_check
  CHECK (type IN ('permanent', 'hebdo', 'ponctuel'));

ALTER TABLE commercant_lieux
  ADD CONSTRAINT commercant_lieux_jour_check
  CHECK (jour_semaine IS NULL OR jour_semaine IN
    ('lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'));

-- Chaque sorte de lieu porte ce qu'il lui faut, et RIEN de ce qui ne la
-- concerne pas : un permanent daté serait ambigu, et c'est l'ambiguïté qui
-- fabrique les règles de résolution qu'on ne sait plus lire six mois après.
ALTER TABLE commercant_lieux
  ADD CONSTRAINT commercant_lieux_coherence_check
  CHECK (
       (type = 'permanent' AND date_jour IS NULL     AND jour_semaine IS NULL)
    OR (type = 'hebdo'     AND date_jour IS NULL     AND jour_semaine IS NOT NULL)
    OR (type = 'ponctuel'  AND date_jour IS NOT NULL AND jour_semaine IS NULL)
  );

-- ─── 4) Les index, renommés et complétés ───────────────────────────────────
ALTER INDEX IF EXISTS uidx_ft_emp_ponctuel  RENAME TO uidx_lieux_ponctuel;
ALTER INDEX IF EXISTS uidx_ft_emp_hebdo     RENAME TO uidx_lieux_hebdo;
ALTER INDEX IF EXISTS idx_ft_emp_commercant RENAME TO idx_lieux_commercant;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_lieux_ponctuel
  ON commercant_lieux (commercant_id, date_jour) WHERE type = 'ponctuel';
CREATE UNIQUE INDEX IF NOT EXISTS uidx_lieux_hebdo
  ON commercant_lieux (commercant_id, jour_semaine) WHERE type = 'hebdo';
CREATE INDEX IF NOT EXISTS idx_lieux_commercant
  ON commercant_lieux (commercant_id);

-- L'accueil interroge les lieux PAR COMMUNE pour lister les commerces autour du
-- Yopper, y compris les itinérants. Sans cet index, ce balayage grossit avec le
-- nombre de lieux.
CREATE INDEX IF NOT EXISTS idx_lieux_commune
  ON commercant_lieux (commune_id) WHERE commune_id IS NOT NULL AND actif = true;

-- ─── 5) RLS et politiques, renommées ───────────────────────────────────────
ALTER TABLE commercant_lieux ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ft_emp_select_public ON commercant_lieux;
DROP POLICY IF EXISTS ft_emp_write_own     ON commercant_lieux;
DROP POLICY IF EXISTS lieux_select_public  ON commercant_lieux;
DROP POLICY IF EXISTS lieux_write_own      ON commercant_lieux;

-- Lecture publique : la fiche client doit dire où aller, y compris à un
-- visiteur non connecté.
CREATE POLICY lieux_select_public ON commercant_lieux
  FOR SELECT USING (true);

-- Écriture réservée au commerçant propriétaire.
CREATE POLICY lieux_write_own ON commercant_lieux
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM commercants c
            WHERE c.id = commercant_lieux.commercant_id AND c.auth_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM commercants c
            WHERE c.id = commercant_lieux.commercant_id AND c.auth_user_id = auth.uid())
  );

-- GRANT explicites (règle projet sur toute migration de structure).
GRANT SELECT ON commercant_lieux TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON commercant_lieux TO authenticated;
GRANT ALL ON commercant_lieux TO service_role;

-- ─── 6) La case sur les commerçants ────────────────────────────────────────
-- ⚠️ DÉFAUT `true` : pour tout commerçant déjà inscrit, l'adresse saisie EST
-- son lieu d'activité. Avec ce défaut, rien ne bouge pour lui.
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS siege_social_est_lieu_activite boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN commercants.siege_social_est_lieu_activite IS
  'Le siège social sert-il aussi de lieu d''activité ? Faux pour un commerçant inscrit à son domicile ou itinérant : ses lieux vivent alors dans commercant_lieux.';

COMMENT ON COLUMN commercants.adresse IS
  'SIÈGE SOCIAL, celui de l''inscription à la BCE. Ce n''est pas forcément là que se passe l''activité : voir siege_social_est_lieu_activite et la table commercant_lieux.';

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Interroge l'état réel de la base, jamais une tautologie.
SELECT
  (SELECT COUNT(*) FROM pg_tables WHERE tablename = 'commercant_lieux')        AS table_renommee,
  (SELECT COUNT(*) FROM pg_tables WHERE tablename = 'foodtruck_emplacements')  AS ancienne_disparue,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'commercant_lieux'
      AND column_name IN ('latitude','longitude','commune_id','principal'))    AS colonnes_lieux,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'commercants'
      AND column_name = 'siege_social_est_lieu_activite')                      AS case_commercants,
  (SELECT COUNT(*) FROM pg_constraint
    WHERE conrelid = 'commercant_lieux'::regclass
      AND conname = 'commercant_lieux_type_check'
      AND pg_get_constraintdef(oid) LIKE '%permanent%')                        AS permanent_autorise;
