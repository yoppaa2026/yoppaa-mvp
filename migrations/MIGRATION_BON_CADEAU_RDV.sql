-- MIGRATION_BON_CADEAU_RDV.sql — 28/08/2026
--
-- 🔴 LE BON CADEAU NE POUVAIT PAS SERVIR CHEZ UN COMMERCE DE SERVICE.
--
-- Un salon, un institut, un cabinet peut VENDRE des bons cadeaux : la route
-- d'achat ne regarde que le forfait et l'interrupteur, jamais la catégorie. Le
-- bénéficiaire recevait donc un bon parfaitement valide, et un email lui
-- promettant « commande en ligne et applique le code au moment de payer ».
-- Or `/cadeau/<token>` l'envoie vers la fiche de RENDEZ-VOUS, qui ne connaît
-- aucun bon cadeau. Promesse sans débiteur, et cul-de-sac.
--
-- Le rendez-vous AVEC PRODUITS passe par une commande, la plomberie existait.
-- Le rendez-vous à simple ACOMPTE n'en crée aucune : sans colonne, impossible
-- d'enregistrer le débit, ni d'empêcher un double débit si le webhook rejoue.
--
-- ⚠️ AUCUNE DONNÉE EXISTANTE N'EST TOUCHÉE. Tout est additif, les deux index
-- d'idempotence actuels sont partiels sur `commande_id IS NOT NULL` et ne
-- couvrent donc jamais les lignes de rendez-vous.

BEGIN;

-- 1) Le rendez-vous porte son bon, comme il porte déjà sa récompense.
ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS bon_cadeau_id uuid REFERENCES bons_cadeaux(id),
  ADD COLUMN IF NOT EXISTS bon_cadeau_montant numeric(10,2) NOT NULL DEFAULT 0;

-- 2) Le mouvement peut désigner un rendez-vous. ON DELETE SET NULL, jamais
--    CASCADE : l'historique d'un bon ne doit pas s'effacer parce qu'un
--    rendez-vous a été purgé. Le mouvement reste, il dit ce qui a été débité.
ALTER TABLE bons_cadeaux_mouvements
  ADD COLUMN IF NOT EXISTS rdv_id uuid REFERENCES rdv_reservations(id) ON DELETE SET NULL;

-- 3) La source dit CE QUI S'EST PASSÉ, sans qu'on ait à croiser deux colonnes.
ALTER TABLE bons_cadeaux_mouvements
  DROP CONSTRAINT IF EXISTS bons_cadeaux_mouvements_source_check;
ALTER TABLE bons_cadeaux_mouvements
  ADD CONSTRAINT bons_cadeaux_mouvements_source_check
  CHECK (source = ANY (ARRAY['commande'::text, 'comptoir'::text, 'annulation'::text, 'rdv'::text]));

-- 4) ⚠️ UN MOUVEMENT NE DÉSIGNE JAMAIS LES DEUX. Sans cette garde, un débit
--    pourrait pointer une commande ET un rendez-vous, et plus personne ne
--    saurait lequel a réellement consommé l'argent.
ALTER TABLE bons_cadeaux_mouvements
  DROP CONSTRAINT IF EXISTS bons_cadeaux_mouvements_une_cible;
ALTER TABLE bons_cadeaux_mouvements
  ADD CONSTRAINT bons_cadeaux_mouvements_une_cible
  CHECK (num_nonnulls(commande_id, rdv_id) <= 1);

-- 5) L'idempotence côté rendez-vous, calquée sur celle des commandes : un
--    webhook rejoué ne débite pas deux fois, une annulation rejouée ne
--    recrédite pas deux fois.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_bons_mvts_rdv
  ON bons_cadeaux_mouvements (bon_id, rdv_id)
  WHERE rdv_id IS NOT NULL AND source = 'rdv';

CREATE UNIQUE INDEX IF NOT EXISTS uidx_bons_mvts_rdv_annulation
  ON bons_cadeaux_mouvements (bon_id, rdv_id)
  WHERE rdv_id IS NOT NULL AND source = 'annulation';

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- CONTRÔLE — une ligne par vérification, la valeur ET l'attendu, tout en text
-- ─────────────────────────────────────────────────────────────────────────
SELECT '1 · rdv.bon_cadeau_id' AS controle,
       coalesce((SELECT data_type FROM information_schema.columns
                 WHERE table_name='rdv_reservations' AND column_name='bon_cadeau_id'), 'ABSENTE')::text AS valeur,
       'uuid'::text AS attendu
UNION ALL
SELECT '2 · rdv.bon_cadeau_montant defaut',
       coalesce((SELECT column_default FROM information_schema.columns
                 WHERE table_name='rdv_reservations' AND column_name='bon_cadeau_montant'), 'ABSENTE')::text,
       '0'::text
UNION ALL
SELECT '3 · mouvements.rdv_id',
       coalesce((SELECT data_type FROM information_schema.columns
                 WHERE table_name='bons_cadeaux_mouvements' AND column_name='rdv_id'), 'ABSENTE')::text,
       'uuid'::text
UNION ALL
SELECT '4 · source accepte rdv',
       (SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%''rdv''%' THEN 'oui' ELSE 'NON' END
        FROM pg_constraint WHERE conname='bons_cadeaux_mouvements_source_check')::text,
       'oui'::text
UNION ALL
SELECT '5 · garde une seule cible',
       (SELECT count(*) FROM pg_constraint
        WHERE conname='bons_cadeaux_mouvements_une_cible')::text,
       '1'::text
UNION ALL
SELECT '6 · index idempotence rdv',
       (SELECT count(*) FROM pg_indexes
        WHERE indexname IN ('uidx_bons_mvts_rdv','uidx_bons_mvts_rdv_annulation'))::text,
       '2'::text
UNION ALL
SELECT '7 · index commandes intacts',
       (SELECT count(*) FROM pg_indexes
        WHERE indexname IN ('uidx_bons_mvts_commande','uidx_bons_mvts_annulation'))::text,
       '2'::text
UNION ALL
-- ⚠️ On PROUVE que rien n'a bougé dans les données, on ne le suppose pas.
SELECT '8 · mouvements existants',
       (SELECT count(*) FROM bons_cadeaux_mouvements)::text,
       'inchange (note le nombre)'::text
UNION ALL
SELECT '9 · rdv portant deja un bon',
       (SELECT count(*) FROM rdv_reservations WHERE bon_cadeau_id IS NOT NULL)::text,
       '0'::text
ORDER BY 1;
