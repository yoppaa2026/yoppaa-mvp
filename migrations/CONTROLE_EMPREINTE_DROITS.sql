-- CE QUE `anon` PEUT LIRE SUR LES RÉSERVATIONS, ET DEUX ESSAIS REFAITS
--
-- 🔴 POURQUOI CE FICHIER EXISTE. Le contrôle A06 de MIGRATION_EMPREINTE_DEMANDE
-- attendait ZÉRO privilège pour `anon` sur les quatre colonnes du lien, et il
-- en a trouvé QUATRE. La vraie question n'est pas le haché d'un jeton, qui ne
-- se renverse pas : c'est de savoir si `anon` lit AUSSI `client_email`,
-- `client_nom` et `client_telephone` de la même table. Ce sont des données
-- personnelles.
--
-- ⚠️ CE FICHIER NE CHANGE RIEN. Il mesure. On ne révoque pas des droits de
-- production sur une intuition, et surtout pas par colonne : en PostgreSQL, un
-- privilège posé sur la TABLE ne se retire pas colonne par colonne. Si c'est le
-- cas ici, le remède est un autre chantier, qui se décide en connaissance de
-- cause.
--
-- ⚠️ ET IL REFAIT LES DEUX ESSAIS QUI NE MESURAIENT RIEN. Dans la migration
-- d'avant, la table temporaire portait le TRIGGER mais pas les CONTRAINTES : un
-- lien sans échéance y passait forcément, et « accepté » ne prouvait rien. Les
-- contraintes vivantes sont recopiées ici, comme elles l'avaient été pour les
-- réglages.

-- ── 1) LES ESSAIS, AVEC LES CONTRAINTES VIVANTES ───────────────────────────
DROP TABLE IF EXISTS pg_temp.essai_contraintes;
DROP TABLE IF EXISTS pg_temp.contraintes_resultats;
CREATE TEMP TABLE essai_contraintes (
  empreinte_statut              text,
  empreinte_montant             numeric(8,2),
  empreinte_payment_method_id   text,
  empreinte_customer_id         text,
  empreinte_demande_jeton_hash  text,
  empreinte_demande_at          timestamptz,
  empreinte_demande_expire_at   timestamptz,
  empreinte_demande_canal       text
);
CREATE TEMP TABLE contraintes_resultats (ordre int, cas text, obtenu text, attendu text);

DO $$
DECLARE
  g text;
BEGIN
  FOR g IN SELECT pg_get_constraintdef(oid) FROM pg_constraint
            WHERE conrelid = 'public.rdv_reservations'::regclass
              AND conname IN ('rdv_empreinte_canal_check', 'rdv_empreinte_demande_complete_check',
                              'rdv_empreinte_statut_check', 'rdv_empreinte_montant_check',
                              'rdv_empreinte_complete_check')
  LOOP
    EXECUTE 'ALTER TABLE pg_temp.essai_contraintes ADD CONSTRAINT c' || md5(g) || ' ' || g;
  END LOOP;
END
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      (1, 'un lien avec son echeance',
          'INSERT INTO pg_temp.essai_contraintes (empreinte_demande_jeton_hash, empreinte_demande_at, empreinte_demande_expire_at, empreinte_demande_canal) VALUES (''h'', now(), now() + interval ''7 days'', ''email'')', 'accepte'),
      (2, '🔴 un lien SANS echeance',
          'INSERT INTO pg_temp.essai_contraintes (empreinte_demande_jeton_hash, empreinte_demande_at) VALUES (''h2'', now())', 'refuse'),
      (3, '🔴 un lien sans date d envoi',
          'INSERT INTO pg_temp.essai_contraintes (empreinte_demande_jeton_hash, empreinte_demande_expire_at) VALUES (''h3'', now() + interval ''1 day'')', 'refuse'),
      (4, '🔴 un canal invente',
          'INSERT INTO pg_temp.essai_contraintes (empreinte_demande_canal) VALUES (''pigeon'')', 'refuse'),
      (5, 'les deux canaux prevus',
          'INSERT INTO pg_temp.essai_contraintes (empreinte_demande_canal) VALUES (''sms'')', 'accepte'),
      (6, 'pas de lien du tout',
          'INSERT INTO pg_temp.essai_contraintes (empreinte_statut) VALUES (NULL)', 'accepte')
    ) AS t(ordre, cas, sql, attendu)
  LOOP
    BEGIN
      EXECUTE r.sql;
      INSERT INTO contraintes_resultats VALUES (r.ordre, r.cas, 'accepte', r.attendu);
    EXCEPTION WHEN check_violation THEN
      INSERT INTO contraintes_resultats VALUES (r.ordre, r.cas, 'refuse', r.attendu);
    WHEN others THEN
      INSERT INTO contraintes_resultats VALUES (r.ordre, r.cas, 'autre erreur : ' || SQLERRM, r.attendu);
    END;
  END LOOP;
END
$$;

-- ── 2) LE CONTRÔLE ─────────────────────────────────────────────────────────
SELECT 'A01' AS ordre,
       '🔴 ce que anon peut faire sur rdv_reservations, AU NIVEAU TABLE' AS controle,
       (SELECT COALESCE(string_agg(DISTINCT privilege_type::text, '+' ORDER BY privilege_type::text), 'RIEN')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'rdv_reservations' AND grantee = 'anon') AS valeur,
       'a lire : si SELECT figure ici, anon lit TOUTE la table, colonnes personnelles comprises' AS attendu
UNION ALL
SELECT 'A02', 'et authenticated, au niveau table',
       (SELECT COALESCE(string_agg(DISTINCT privilege_type::text, '+' ORDER BY privilege_type::text), 'RIEN')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'rdv_reservations' AND grantee = 'authenticated'),
       'pour memoire'
UNION ALL
SELECT 'A03', '🔴 anon lit-il les colonnes PERSONNELLES du client ?',
       (SELECT COALESCE(string_agg(DISTINCT column_name::text, ', ' ORDER BY column_name::text), 'AUCUNE')
          FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'rdv_reservations' AND grantee = 'anon'
           AND privilege_type = 'SELECT'
           AND column_name IN ('client_email', 'client_nom', 'client_prenom', 'client_telephone', 'notes_client')),
       'AUCUNE, sinon c est un chantier a ouvrir'
UNION ALL
SELECT 'A04', 'anon lit-il les identifiants Stripe de l empreinte ?',
       (SELECT COALESCE(string_agg(DISTINCT column_name::text, ', ' ORDER BY column_name::text), 'AUCUNE')
          FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'rdv_reservations' AND grantee = 'anon'
           AND privilege_type = 'SELECT'
           AND (column_name LIKE 'empreinte%' OR column_name LIKE 'stripe%')),
       'a lire'
UNION ALL
SELECT 'A05', 'combien de policies de LECTURE existent pour anon',
       (SELECT COALESCE(string_agg(policyname::text, ', ' ORDER BY policyname::text), 'AUCUNE')
          FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'rdv_reservations'
           AND cmd IN ('SELECT', 'ALL') AND 'anon' = ANY(roles)),
       'c est la RLS qui decide vraiment ce qu il VOIT'
UNION ALL
SELECT 'A06', 'la RLS est-elle bien active sur la table',
       (SELECT CASE WHEN relrowsecurity THEN 'oui' ELSE '🔴 NON' END
          FROM pg_class WHERE oid = 'public.rdv_reservations'::regclass),
       'oui'
UNION ALL
SELECT 'A07', 'et est-elle FORCEE (meme pour le proprietaire)',
       (SELECT CASE WHEN relforcerowsecurity THEN 'oui' ELSE 'non' END
          FROM pg_class WHERE oid = 'public.rdv_reservations'::regclass),
       'pour memoire'
UNION ALL
SELECT 'B' || lpad(ordre::text, 3, '0'), 'essai : ' || cas, obtenu, attendu FROM contraintes_resultats
ORDER BY 1, 2;
