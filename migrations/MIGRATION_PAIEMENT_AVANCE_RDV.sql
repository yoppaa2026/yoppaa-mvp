-- ═══════════════════════════════════════════════════════════════════════════
-- LE PAIEMENT D'AVANCE D'UN RENDEZ-VOUS (décision d'Alex, 31/08)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CE QU'ON OUVRE. Aujourd'hui un rendez-vous ne peut se payer en ligne QUE
-- s'il porte un acompte. Un client qui voudrait régler d'avance une prestation
-- sans acompte n'a aucun chemin. Or un seul interrupteur répondait à deux
-- questions sans rapport : « le commerçant EXIGE-t-il une garantie » et « le
-- client PEUT-il payer d'avance ». Une exigence n'est pas une offre.
--
-- 🔴 ET VOICI POURQUOI CETTE MIGRATION EST SI PETITE : LA NATURE DU PAIEMENT
-- N'A PAS BESOIN DE COLONNE, ELLE EST DÉJÀ DANS `acompte_du`.
--
-- Ma première idée était d'ajouter une colonne `paiement_nature` valant
-- « garantie » ou « avance ». C'était fabriquer une DEUXIÈME SOURCE DE VÉRITÉ
-- pour une information déjà portée, et ce défaut-là, on l'a déjà vécu : un
-- compteur et une ligne, une seule des deux alimentée.
--
-- La règle tient en une phrase : **`acompte_du` dit ce qui était dû comme
-- GARANTIE**. Il vaut donc :
--   • 15,00 sur une prestation à 60 € avec 25 % d'acompte → garantie de 15 € ;
--   • 0     sur un paiement d'avance → aucune garantie, tout revient au client ;
--   • 60,00 sur un acompte réglé à 100 % → le commerçant l'a explicitement
--           exigé, il le garde. Ce n'est pas la même chose qu'une avance, et
--           c'est précisément ce que la colonne sait déjà distinguer.
--   • NULL  sur un rendez-vous antérieur au 30/08 → INCONNU, jamais zéro. Le
--           repli conservateur reste en place.
--
-- ⚠️ CETTE MIGRATION NE SUFFIT PAS SEULE. Elle doit être suivie du correctif de
-- `restitutionNoShow`, qui garde aujourd'hui TOUT l'encaissé sans jamais le
-- borner par la garantie. Sans ce correctif, un rendez-vous payé d'avance suivi
-- d'un lapin ferait perdre au client la totalité de son argent. Le code part
-- APRÈS le go sur ce fichier, jamais avant.
--
-- ⚠️ AUCUNE COLONNE N'EST SUPPRIMÉE ICI. `rdv_paiement_cash`, `solde_paye`,
-- `solde_paye_date` et `mode_paiement_solde` sont mortes elles aussi, mais on
-- les COMMENTE au lieu de les jeter : une suppression est irréversible, et rien
-- ne presse.

BEGIN;

-- ─── 1) L'INTERRUPTEUR DU COMMERÇANT ──────────────────────────────────────
--
-- ⚠️ ON NE CRÉE RIEN : `rdv_paiement_ligne` EXISTE DEPUIS `MIGRATION_RDV.sql`
-- et n'est lue par AUCUN code d'application. C'est la seule colonne du schéma
-- dont le nom parle de payer un rendez-vous en ligne, et elle dormait.
--
-- Sa valeur par défaut passe à `true` : décision d'Alex, le paiement d'avance
-- est ouvert dès que Stripe est connecté, le commerçant peut l'éteindre.
ALTER TABLE commercants
  ALTER COLUMN rdv_paiement_ligne SET DEFAULT true;

-- ⚠️ ET ON RATTRAPE L'EXISTANT. Un défaut ne change QUE les lignes futures :
-- sans cette mise à jour, tous les commerçants déjà inscrits resteraient à
-- `false`, c'est-à-dire éteints, sans que personne ne l'ait décidé.
UPDATE commercants
   SET rdv_paiement_ligne = true
 WHERE rdv_paiement_ligne IS DISTINCT FROM true;

COMMENT ON COLUMN commercants.rdv_paiement_ligne IS
  'Le client PEUT payer sa prestation d''avance en ligne. Allumé par défaut depuis le 31/08. '
  'Ce n''est pas une exigence : l''acompte, lui, se règle par rdv_acompte_en_ligne_actif et '
  'rdv_prestations.acompte_pourcent. Le vrai mur reste Stripe : sans stripe_account_charges_enabled, '
  'aucun paiement n''est proposé, quel que soit ce réglage.';

-- ─── 2) CE QUE `acompte_du` VEUT DIRE, ÉCRIT NOIR SUR BLANC ───────────────
--
-- La colonne existe depuis le 30/08. Son commentaire disait ce qu'elle CONTIENT
-- (un montant) ; il doit dire ce qu'elle SIGNIFIE, puisque c'est elle qui porte
-- désormais la différence entre une garantie et une avance.
COMMENT ON COLUMN rdv_reservations.acompte_du IS
  'Montant de la GARANTIE due à la réservation, avant déduction du bon cadeau. '
  'C''est cette colonne qui porte la NATURE du paiement, et non une colonne dédiée : '
  '0 = aucune garantie exigée, donc un paiement d''avance qui revient ENTIER au client en cas '
  'de no-show. > 0 = garantie, que le commerçant conserve. '
  'NULL = INCONNU (rendez-vous antérieur au 30/08), jamais zéro : le repli conservateur '
  'de restitutionNoShow s''applique alors.';

-- ─── 3) LES COLONNES MORTES, NOMMÉES POUR QU'ON NE S'Y TROMPE PAS ─────────
--
-- ⚠️ LES CROIRE DISPONIBLES SERAIT UNE ERREUR. Elles existent, elles sont
-- exposées par la vue publique, et RIEN ne les alimente. Le vocabulaire de
-- `mode_paiement_solde` ne correspond même pas à celui des modes d'encaissement
-- réellement en vigueur.
COMMENT ON COLUMN commercants.rdv_paiement_cash IS
  'MORTE : lue par aucun code d''application (vérifié le 31/08). Conservée sans être supprimée.';
COMMENT ON COLUMN rdv_reservations.solde_paye IS
  'MORTE : ni lue ni écrite par l''application (vérifié le 31/08). L''encaissement réel vit dans '
  'encaisse_mode / encaisse_montant / encaisse_le.';
COMMENT ON COLUMN rdv_reservations.solde_paye_date IS
  'MORTE : voir solde_paye.';
COMMENT ON COLUMN rdv_reservations.mode_paiement_solde IS
  'MORTE : son CHECK n''accepte que cash/carte/virement/autre, un vocabulaire qui ne correspond à '
  'aucun des modes d''encaissement en vigueur (terminal / especes / rien).';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — une seule requête, une ligne par vérification, valeur ET attendu
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ LE CONTRÔLE DES DROITS SE COMPARE À UNE COLONNE VOISINE, il ne s'invente
-- pas. J'ai déjà attendu « 0 » sur `column_privileges` là où la base rendait
-- « 14 » : mon attendu était faux, pas la base. La bonne question n'est pas
-- « combien ? » mais « autant qu'ailleurs ? ».

SELECT '1. defaut de rdv_paiement_ligne' AS controle,
       COALESCE(column_default, 'AUCUN')::text AS valeur,
       'true'::text AS attendu
  FROM information_schema.columns
 WHERE table_name = 'commercants' AND column_name = 'rdv_paiement_ligne'

UNION ALL
SELECT '2. commercants encore eteints',
       COUNT(*)::text,
       '0'::text
  FROM commercants
 WHERE rdv_paiement_ligne IS DISTINCT FROM true

UNION ALL
SELECT '3. commercants au total (temoin, doit etre > 0)',
       COUNT(*)::text,
       'plus de zero'::text
  FROM commercants

UNION ALL
SELECT '4. le commentaire de rdv_paiement_ligne parle de Stripe',
       CASE WHEN col_description('commercants'::regclass,
              (SELECT ordinal_position FROM information_schema.columns
                WHERE table_name = 'commercants' AND column_name = 'rdv_paiement_ligne')::int)
              LIKE '%Stripe%' THEN 'oui' ELSE 'non' END::text,
       'oui'::text

UNION ALL
SELECT '5. le commentaire d acompte_du dit la NATURE',
       CASE WHEN col_description('rdv_reservations'::regclass,
              (SELECT ordinal_position FROM information_schema.columns
                WHERE table_name = 'rdv_reservations' AND column_name = 'acompte_du')::int)
              LIKE '%NATURE%' THEN 'oui' ELSE 'non' END::text,
       'oui'::text

UNION ALL
SELECT '6. les 4 colonnes mortes sont nommees MORTE',
       COUNT(*)::text,
       '4'::text
  FROM (
    SELECT col_description(c.oid, a.attnum) AS d
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
     WHERE (c.relname = 'commercants' AND a.attname = 'rdv_paiement_cash')
        OR (c.relname = 'rdv_reservations' AND a.attname IN ('solde_paye','solde_paye_date','mode_paiement_solde'))
  ) x
 WHERE x.d LIKE 'MORTE%'

UNION ALL
SELECT '7. droits sur rdv_paiement_ligne',
       (SELECT COUNT(*)::text FROM information_schema.column_privileges
         WHERE table_name = 'commercants' AND column_name = 'rdv_paiement_ligne'),
       (SELECT COUNT(*)::text FROM information_schema.column_privileges
         WHERE table_name = 'commercants' AND column_name = 'rdv_acompte_en_ligne_actif')

UNION ALL
SELECT '8. aucune colonne n a ete supprimee (temoin)',
       COUNT(*)::text,
       '4'::text
  FROM information_schema.columns
 WHERE (table_name = 'commercants' AND column_name IN ('rdv_paiement_cash','rdv_paiement_ligne'))
    OR (table_name = 'rdv_reservations' AND column_name IN ('solde_paye','acompte_du'));
