-- LES VENTES D'AVCOTECH NE PARTENT PLUS EN CASCADE AVEC UN COMMERÇANT
--
-- ✅ PASSÉE PAR ALEX LE 15/09 : C01 à C03 conformes (deux clés en RESTRICT,
-- `commandes_hardware` liée par `commercant_id`, les quatre historiques
-- précédents intacts). D02 : `commandes_hardware` VIDE. ⚠️ D01 : `en_attente`
-- = 1, un statut qu'AUCUN code actuel n'écrit (le checkout écrit
-- `paiement_en_attente`, que le webhook passe à `paye`) : ligne d'une ancienne
-- version, jamais marquée payée même si elle l'a été. Comptée dans
-- l'historique, rien ne se perd ; à examiner.
--
-- Suite de MIGRATION_COMMERCANT_ARCHIVE_FK.sql (passée le 15/09), dont la ligne
-- D01 listait encore 32 tables en cascade. Deux d'entre elles sont des VENTES
-- D'AVCOTECH, c'est-à-dire la comptabilité de Yoppaa elle-même :
--
--   • `success_packs` : les packs d'accompagnement et le matériel commandés
--     depuis le tableau de bord, en cours de paiement ou payés ;
--   • `commandes_hardware` : aucune ligne de code ne la lit ni ne l'écrit
--     aujourd'hui (relevé du 15/09), mais elle est liée au commerçant en
--     cascade. Protégée par principe, et décrite ci-dessous pour décider.
--
-- ✅ DÉCISION D'ALEX, 15/09 : « même règle » que le reste de l'historique.
--
-- ⚠️ POURQUOI RESTRICT NE BLOQUE PAS UN COMMERCE VIERGE. La route admin
-- efface elle-même les packs restants, et elle n'y arrive qu'après avoir
-- vérifié qu'aucun pack PAYÉ ou EN COURS n'existe : il ne reste alors que des
-- souhaits cochés à l'inscription. `commandes_hardware` n'étant écrite par
-- personne, elle est vide sauf surprise, que la ligne D02 dira.
--
-- ⚠️ AUCUN ESSAI N'EFFACE UN COMMERÇANT : le contrôle lit `confdeltype`.

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
       AND con.conrelid IN ('public.success_packs'::regclass,
                            'public.commandes_hardware'::regclass)
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
       'ce que la base fait de ces deux ventes si le commercant disparait' AS controle,
       (SELECT COALESCE(string_agg(con.conrelid::regclass::text || ' = ' ||
                 CASE con.confdeltype WHEN 'c' THEN '🔴 CASCADE' WHEN 'r' THEN 'RESTRICT'
                      WHEN 'a' THEN 'NO ACTION' WHEN 'n' THEN 'SET NULL' ELSE con.confdeltype::text END,
                 ', ' ORDER BY con.conrelid::regclass::text), 'AUCUNE CLE')
          FROM pg_constraint con
         WHERE con.contype = 'f' AND con.confrelid = 'public.commercants'::regclass
           AND con.conrelid IN ('public.success_packs'::regclass, 'public.commandes_hardware'::regclass))::text AS valeur,
       'commandes_hardware = RESTRICT, success_packs = RESTRICT'::text AS attendu
UNION ALL
SELECT 'C02', 'les deux cles, definitions completes',
       (SELECT COALESCE(string_agg(con.conrelid::regclass::text || ' : ' || pg_get_constraintdef(con.oid),
                 ' | ' ORDER BY con.conrelid::regclass::text), 'AUCUNE')
          FROM pg_constraint con
         WHERE con.contype = 'f' AND con.confrelid = 'public.commercants'::regclass
           AND con.conrelid IN ('public.success_packs'::regclass, 'public.commandes_hardware'::regclass))::text,
       'a lire : la colonne de commandes_hardware est celle que la route devrait compter'::text
UNION ALL
SELECT 'C03', 'les quatre historiques de la migration precedente restent en RESTRICT',
       (SELECT count(*) FROM pg_constraint con
         WHERE con.contype = 'f' AND con.confrelid = 'public.commercants'::regclass
           AND con.confdeltype = 'r'
           AND con.conrelid IN ('public.rdv_reservations'::regclass, 'public.bons_cadeaux'::regclass,
                                'public.abonnements'::regclass, 'public.fidelite_sms_achats'::regclass))::text,
       '4'::text
UNION ALL
SELECT 'D01', 'success_packs par statut (des nombres, aucun contenu)',
       (SELECT COALESCE(string_agg(COALESCE(statut, 'SANS STATUT') || ' = ' || n::text, ', ' ORDER BY statut), 'VIDE')
          FROM (SELECT statut, count(*) AS n FROM public.success_packs GROUP BY statut) s)::text,
       'a lire'::text
UNION ALL
SELECT 'D02', 'commandes_hardware : nombre de lignes (aucun contenu)',
       (SELECT count(*) FROM public.commandes_hardware)::text,
       'a lire : 0 attendu, la table n est ecrite par aucun code'::text
ORDER BY 1;
