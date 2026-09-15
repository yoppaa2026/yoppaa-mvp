-- UN COMMERÇANT QUI A UN HISTORIQUE NE PEUT PLUS DISPARAÎTRE, MÊME EN BASE
--
-- ✅ PASSÉE PAR ALEX LE 15/09 : C01 à C03 conformes (quatre clés en RESTRICT,
-- définitions intactes, `commandes` sans cascade). D01 liste encore 32 tables
-- en cascade, dont DEUX VENTES D'AVCOTECH : `commandes_hardware` (boutique
-- matériel) et `success_packs` (accompagnement payé), à trancher avec Alex.
--
-- ✅ DÉCISION D'ALEX, 15/09 : un vrai commerçant s'ARCHIVE, il ne s'efface
-- jamais. La route admin refuse désormais la suppression dès qu'il a une
-- commande, une réservation, un bon cadeau, un abonnement ou un achat de SMS.
--
-- ⚠️ CETTE MIGRATION EST LA DÉFENSE EN PROFONDEUR, pas la règle. Quatre de ces
-- tables étaient liées au commerçant par `ON DELETE CASCADE` (relevé du 15/09,
-- ligne D04 de MIGRATION_RDV_SUPPRESSION_ET_ANON et migrations du dépôt) :
-- effacer la ligne du commerçant, depuis n'importe où, emportait EN SILENCE
-- ses réservations, ses bons vendus, les abonnements de ses clientes et les
-- packs de SMS qu'il a achetés à Yoppaa. Une cascade s'exécute avec les droits
-- du propriétaire de la table : aucun retrait de droit ne l'arrête.
--
-- ⚠️ `RESTRICT`, PAS `SET NULL`. Une réservation sans commerçant n'a plus de
-- sens comptable ; mieux vaut que l'effacement du commerçant ÉCHOUE et le dise.
--
-- ⚠️ `commandes` N'EST PAS DANS LA LISTE : sa clé n'était déjà pas en cascade
-- (ligne D04). Les cartes et récompenses de fidélité restent en cascade : ce
-- sont des droits de clients, pas de la comptabilité. Nommé, pas tranché ici.
--
-- ⚠️ SANS EFFET SUR UN COMMERCE SANS HISTORIQUE : aucune ligne, aucun refus.
-- La route admin continue de supprimer un commerce de test vierge.
--
-- ⚠️ AUCUN ESSAI N'EFFACE UN COMMERÇANT. Le contrôle lit l'action que la base
-- applique à chaque clé (`confdeltype`) : c'est la règle du moteur lui-même.
-- Supprimer un vrai commerçant pour voir, même annulé aussitôt, toucherait à
-- la production pour le confort d'une vérification.

-- ═══════════════════════════════════════════════════════════════════════════
-- LA MIGRATION : chaque clé est recréée à l'identique, CASCADE devient RESTRICT
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname,
           con.conrelid::regclass AS tab,
           pg_get_constraintdef(con.oid) AS def
      FROM pg_constraint con
     WHERE con.contype = 'f'
       AND con.confrelid = 'public.commercants'::regclass
       AND con.confdeltype = 'c'
       AND con.conrelid IN ('public.rdv_reservations'::regclass,
                            'public.bons_cadeaux'::regclass,
                            'public.abonnements'::regclass,
                            'public.fidelite_sms_achats'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tab, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.tab, r.conname,
                   replace(r.def, 'ON DELETE CASCADE', 'ON DELETE RESTRICT'));
  END LOOP;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE : une ligne par vérification, la valeur ET l'attendu, tout en text
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'C01' AS ordre,
       'ce que la base fait de ces quatre historiques si le commercant disparait' AS controle,
       (SELECT COALESCE(string_agg(con.conrelid::regclass::text || ' = ' ||
                 CASE con.confdeltype WHEN 'c' THEN '🔴 CASCADE' WHEN 'r' THEN 'RESTRICT'
                      WHEN 'a' THEN 'NO ACTION' WHEN 'n' THEN 'SET NULL' ELSE con.confdeltype::text END,
                 ', ' ORDER BY con.conrelid::regclass::text), 'AUCUNE CLE')
          FROM pg_constraint con
         WHERE con.contype = 'f' AND con.confrelid = 'public.commercants'::regclass
           AND con.conrelid IN ('public.rdv_reservations'::regclass, 'public.bons_cadeaux'::regclass,
                                'public.abonnements'::regclass, 'public.fidelite_sms_achats'::regclass))::text AS valeur,
       'abonnements = RESTRICT, bons_cadeaux = RESTRICT, fidelite_sms_achats = RESTRICT, rdv_reservations = RESTRICT'::text AS attendu
UNION ALL
SELECT 'C02', 'chaque cle vise toujours la meme colonne (definitions completes)',
       (SELECT COALESCE(string_agg(con.conrelid::regclass::text || ' : ' || pg_get_constraintdef(con.oid),
                 ' | ' ORDER BY con.conrelid::regclass::text), 'AUCUNE')
          FROM pg_constraint con
         WHERE con.contype = 'f' AND con.confrelid = 'public.commercants'::regclass
           AND con.conrelid IN ('public.rdv_reservations'::regclass, 'public.bons_cadeaux'::regclass,
                                'public.abonnements'::regclass, 'public.fidelite_sms_achats'::regclass))::text,
       'a lire : FOREIGN KEY (commercant_id) REFERENCES commercants(id) ON DELETE RESTRICT, quatre fois'::text
UNION ALL
SELECT 'C03', 'et commandes, pour memoire',
       (SELECT COALESCE(string_agg(pg_get_constraintdef(con.oid), ' | '), 'AUCUNE')
          FROM pg_constraint con
         WHERE con.contype = 'f' AND con.confrelid = 'public.commercants'::regclass
           AND con.conrelid = 'public.commandes'::regclass)::text,
       'pas de CASCADE'::text
UNION ALL
SELECT 'D01', 'ce qui part encore en cascade avec un commercant (a lire, pas tranche)',
       (SELECT COALESCE(string_agg(con.conrelid::regclass::text, ', ' ORDER BY con.conrelid::regclass::text), 'RIEN')
          FROM pg_constraint con
         WHERE con.contype = 'f' AND con.confrelid = 'public.commercants'::regclass
           AND con.confdeltype = 'c')::text,
       'catalogue, creneaux, fidelite... : a lire'::text
ORDER BY 1;
