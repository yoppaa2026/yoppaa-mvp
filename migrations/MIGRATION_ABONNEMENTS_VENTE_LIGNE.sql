-- ═══════════════════════════════════════════════════════════════════════════
-- ABONNEMENTS : LA VENTE EN LIGNE
--
-- Décision d'Alex du 15/08 : un Yopper doit pouvoir acheter un abonnement
-- depuis la fiche du commerçant, dans un bloc « Abonnements » sous les
-- prestations, et le payer EN UNE FOIS par le tunnel existant.
--
-- ⚠️ CETTE MIGRATION EXÉCUTE UNE INSTRUCTION LAISSÉE DANS LA PRÉCÉDENTE.
-- MIGRATION_ABONNEMENTS.sql fermait les deux tables à l'anonyme, en écrivant
-- noir sur blanc : « Le jour où la souscription en ligne existera, on ouvrira
-- la lecture des formules EXPLICITEMENT, jamais par un USING (true) posé au cas
-- où : c'est ce qui avait fuité lors de l'audit du 03/08. » Ce jour est arrivé.
--
-- ⚠️ ET `abonnements` RESTE FERMÉE. Elle porte des noms, des emails et des
-- téléphones. La cliente lira SON contrat par une route serveur en service_role
-- qui exige une identité prouvée, exactement comme /api/rdv/mes-rdvs. Ouvrir la
-- table « puisqu'on en a besoin » serait la faille de l'audit, une troisième
-- fois.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1) LE COMMERÇANT DÉCIDE CE QU'IL MET EN VITRINE ───────────────────────
--
-- ⚠️ DÉFAUT `false`, ET C'EST VOLONTAIRE. Sans ce garde-fou, la migration
-- publierait d'un coup toutes les formules déjà créées, y compris un brouillon
-- ou un tarif négocié pour une cliente en particulier. Le commerçant met en
-- vente ce qu'il veut, quand il le veut. Même principe protecteur que la
-- capacité des prestations, dont le défaut à 1 laisse tout le parc inchangé.
ALTER TABLE abonnement_formules
  ADD COLUMN IF NOT EXISTS vente_en_ligne boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN abonnement_formules.vente_en_ligne IS
  'La formule est achetable en ligne depuis la fiche publique. Défaut false : rien ne se publie tout seul.';


-- ─── 2) LA LECTURE PUBLIQUE, ET RIEN DE PLUS ───────────────────────────────
--
-- Trois conditions cumulées, aucune n'est décorative :
--   • `vente_en_ligne` : le commerçant l'a explicitement mise en vitrine ;
--   • `actif`          : elle n'est pas retirée du catalogue ;
--   • `deleted_at`     : elle n'est pas supprimée.
--
-- ⚠️ La politique du commerçant (`abo_formules_own`, FOR ALL) reste en place et
-- n'est PAS remplacée. Deux politiques permissives se cumulent en OU : le
-- commerçant continue de voir et de modifier TOUTES ses formules, y compris
-- celles qu'il ne vend pas en ligne. Écraser l'ancienne l'aurait privé de ses
-- propres brouillons.
DROP POLICY IF EXISTS "abo_formules_lecture_publique" ON abonnement_formules;
CREATE POLICY "abo_formules_lecture_publique"
  ON abonnement_formules FOR SELECT
  TO anon, authenticated
  USING (vente_en_ligne IS TRUE AND actif IS TRUE AND deleted_at IS NULL);


-- ─── 3) GRANT (règle projet) ───────────────────────────────────────────────
-- ⚠️ Sans lui, RLS n'est même pas atteint : PostgREST refuse avant, et la
-- politique ci-dessus ne servirait à rien. `authenticated` a déjà ses droits
-- depuis MIGRATION_ABONNEMENTS.sql ; il manque `anon`, car un visiteur qui n'a
-- pas de compte doit pouvoir lire la vitrine avant d'acheter.
GRANT SELECT ON abonnement_formules TO anon;


-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à exécuter séparément, après la migration.
--
-- Attendu :  colonne_vente | politique_publique | grant_anon | formules_en_vente
--                   1      |         1          |     1      |         0
--
-- ⚠️ `formules_en_vente` DOIT VALOIR 0 : aucune formule existante ne se publie
-- toute seule. Un autre chiffre voudrait dire que le défaut n'a pas tenu.
-- ═══════════════════════════════════════════════════════════════════════════

-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_name = 'abonnement_formules' AND column_name = 'vente_en_ligne') AS colonne_vente,
--   (SELECT count(*) FROM pg_policies
--     WHERE tablename = 'abonnement_formules' AND policyname = 'abo_formules_lecture_publique') AS politique_publique,
--   (SELECT count(*) FROM information_schema.role_table_grants
--     WHERE table_name = 'abonnement_formules' AND grantee = 'anon' AND privilege_type = 'SELECT') AS grant_anon,
--   (SELECT count(*) FROM abonnement_formules WHERE vente_en_ligne IS TRUE) AS formules_en_vente;
