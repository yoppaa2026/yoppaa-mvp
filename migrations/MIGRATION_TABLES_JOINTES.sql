-- LES TABLES JOINTES (lot 3 du module restaurant, 11/09/2026)
--
-- La demande exacte du Bistrologue, rapportée par Alex le 09/09 : « possibilité
-- de grouper des tables ensemble si le commerçant donne son accord, par exemple
-- j'autorise le couplage de x fois 2 tables de 4 personnes, si une personne
-- veut réserver pour 6 ou 8 alors qu'il n'y a que des tables de 2 ou 4 ».
--
-- LE MODÈLE. Une jointure est une LIGNE DE `rdv_prestations`, comme un format de
-- table : « 2 tables de 4 jointes, de 6 à 8 personnes, 2 à la fois ». Deux
-- colonnes nouvelles disent de quoi elle est faite :
--   • `jointure_de`     : la table qu'on joint (le format « Table de 4 ») ;
--   • `jointure_tables` : combien d'exemplaires on en joint (2).
-- Tout le reste existe déjà et garde son sens : `couverts_min`/`couverts_max`
-- sont la capacité DÉCLARÉE de la jointure (deux tables de 4 ne font pas
-- toujours 8, on perd souvent les bouts), `quantite` est le nombre de jointures
-- possibles EN MÊME TEMPS (le « x » du Bistrologue), `duree_minutes` et
-- `duree_paliers` la durée à table du grand groupe.
--
-- Une réservation posée sur une jointure pointe vers elle (`prestation_id`), et
-- le moteur de salle lui fait immobiliser `jointure_tables` exemplaires de sa
-- table de base. Le moteur ne joint qu'en DERNIER RECOURS : quand aucune table
-- seule n'est libre pour le groupe.
--
-- CE QUE LA BASE GARANTIT ICI, ET QUE LE CODE NE PEUT PAS VOIR :
--   1. une jointure est faite d'une TABLE DE LA MÊME MAISON, qui n'est pas
--      elle-même une jointure ;
--   2. sa composition est FIGÉE : la changer réinterpréterait les réservations
--      déjà prises (un groupe posé sur « 2 tables » compterait soudain pour 3) ;
--   3. une jointure qui porte des réservations À VENIR ne s'éteint pas et ne se
--      supprime pas. La fiche publique ne lit que les tables actives : ses
--      réservations cesseraient d'y compter, et les deux tables de 4 du samedi
--      paraîtraient libres pendant que le groupe de huit est attendu.
--
-- ⚠️ À PASSER AVANT LE DÉPLOIEMENT DU CODE : le serveur et le tableau de bord
-- demandent ces deux colonnes par leur nom. Sans elles, leurs requêtes
-- échoueraient entières. Sûre à rejouer.
--
-- ✅ PASSÉE PAR ALEX LE 11/09/2026, avant le push de `25c8977` : colonnes
-- `uuid` et `integer`, les trois garde-fous posés, fonction 1 (attendu 1),
-- déclencheur posé et actif 1 (attendu 1), aucune jointure existante, droits
-- d'`anon` et RLS inchangés, et les quinze essais conformes (1, 9, 13, 14 et 15
-- acceptés ; 2 à 8 et 10 à 12 refusés).

-- 1) Les deux colonnes.
ALTER TABLE public.rdv_prestations
  ADD COLUMN IF NOT EXISTS jointure_de uuid REFERENCES public.rdv_prestations(id);
ALTER TABLE public.rdv_prestations
  ADD COLUMN IF NOT EXISTS jointure_tables integer;

COMMENT ON COLUMN public.rdv_prestations.jointure_de IS
  'Jointure : la table (format) dont elle joint plusieurs exemplaires. NULL = une table seule, ou une prestation ordinaire.';
COMMENT ON COLUMN public.rdv_prestations.jointure_tables IS
  'Jointure : combien d exemplaires de la table sont joints (2 a 20). Figee a la creation.';

-- 2) Les garde-fous de la ligne.
-- Les deux colonnes vont ensemble : l'une sans l'autre ne décrit rien.
ALTER TABLE public.rdv_prestations DROP CONSTRAINT IF EXISTS rdv_prestations_jointure_complete;
ALTER TABLE public.rdv_prestations
  ADD CONSTRAINT rdv_prestations_jointure_complete
  CHECK ((jointure_de IS NULL) = (jointure_tables IS NULL));
-- On joint au moins deux tables : une « jointure » d'une seule table est une table.
ALTER TABLE public.rdv_prestations DROP CONSTRAINT IF EXISTS rdv_prestations_jointure_bornes;
ALTER TABLE public.rdv_prestations
  ADD CONSTRAINT rdv_prestations_jointure_bornes
  CHECK (jointure_tables IS NULL OR jointure_tables BETWEEN 2 AND 20);
-- Une jointure est une table, qui dit combien à la fois et pour combien de
-- personnes, et elle ne se joint pas elle-même.
ALTER TABLE public.rdv_prestations DROP CONSTRAINT IF EXISTS rdv_prestations_jointure_est_une_table;
ALTER TABLE public.rdv_prestations
  ADD CONSTRAINT rdv_prestations_jointure_est_une_table
  CHECK (jointure_de IS NULL OR (jointure_de <> id AND par_couverts IS TRUE
         AND quantite IS NOT NULL AND couverts_max IS NOT NULL));

-- 3) La garde de ce que la ligne seule ne voit pas.
--
-- ⚠️ LES DEUX LECTURES PASSENT PAR `EXECUTE`, et c'est pour l'essai : la table
-- lue est celle qui porte le déclencheur (`TG_TABLE_SCHEMA`/`TG_TABLE_NAME`), et
-- celle des réservations vient de l'argument du déclencheur. Le vrai déclencheur
-- n'en passe aucun, donc lit `public.rdv_reservations` ; celui de l'essai, plus
-- bas, lit une table temporaire. Aucune vraie réservation n'est lue pour
-- tester. L'argument est écrit dans la définition du déclencheur, jamais reçu
-- d'un appelant.
CREATE OR REPLACE FUNCTION public.rdv_prestations_garde_jointure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  table_resas text := COALESCE(TG_ARGV[0], 'public.rdv_reservations');
  base_commerce uuid;
  base_table boolean;
  base_jointe uuid;
  base_supprimee boolean;
  reservee boolean;
BEGIN
  -- 2. La composition est figée, dans les deux sens : une jointure ne change pas
  -- de table ni de nombre, une table ne devient pas une jointure.
  IF TG_OP = 'UPDATE'
     AND (NEW.jointure_de IS DISTINCT FROM OLD.jointure_de
          OR NEW.jointure_tables IS DISTINCT FROM OLD.jointure_tables) THEN
    RAISE EXCEPTION 'JOINTURE_FIGEE'
      USING ERRCODE = 'P0001',
            HINT = 'La composition d''une jointure ne change pas : supprime-la et crées-en une autre.';
  END IF;

  -- 1. Une table de la même maison, qui n'est ni supprimée ni elle-même une
  -- jointure. Vérifié à la naissance (et si la maison changeait).
  IF NEW.jointure_de IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.commercant_id IS DISTINCT FROM OLD.commercant_id) THEN
    EXECUTE format('SELECT commercant_id, par_couverts, jointure_de, deleted_at IS NOT NULL FROM %I.%I WHERE id = $1',
                   TG_TABLE_SCHEMA, TG_TABLE_NAME)
      INTO base_commerce, base_table, base_jointe, base_supprimee
      USING NEW.jointure_de;
    IF base_commerce IS NULL
       OR base_commerce IS DISTINCT FROM NEW.commercant_id
       OR base_table IS NOT TRUE
       OR base_jointe IS NOT NULL
       OR base_supprimee IS TRUE THEN
      RAISE EXCEPTION 'JOINTURE_INVALIDE'
        USING ERRCODE = 'P0001',
              HINT = 'Une jointure se fait avec une table de ta salle.';
    END IF;
  END IF;

  -- 3. Une jointure qui porte des réservations à venir (aujourd'hui compris,
  -- heure de Bruxelles) ne s'éteint pas et ne se supprime pas.
  IF TG_OP = 'UPDATE' AND OLD.jointure_de IS NOT NULL
     AND ((OLD.actif IS TRUE AND NEW.actif IS NOT TRUE)
          OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)) THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s r WHERE r.prestation_id = $1 AND r.deleted_at IS NULL AND r.statut IN (%L, %L) AND r.date_rdv >= $2)',
                   table_resas, 'confirme', 'honore')
      INTO reservee
      USING OLD.id, (now() AT TIME ZONE 'Europe/Brussels')::date;
    IF reservee IS TRUE THEN
      RAISE EXCEPTION 'JOINTURE_RESERVEE'
        USING ERRCODE = 'P0001',
              HINT = 'Des réservations à venir occupent cette jointure : déplace-les ou annule-les d''abord.';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS rdv_prestations_jointure ON public.rdv_prestations;
CREATE TRIGGER rdv_prestations_jointure
  BEFORE INSERT OR UPDATE ON public.rdv_prestations
  FOR EACH ROW
  EXECUTE FUNCTION public.rdv_prestations_garde_jointure();

-- Une fonction de déclencheur ne s'appelle pas directement : même usage que
-- les autres gardes du projet.
REVOKE EXECUTE ON FUNCTION public.rdv_prestations_garde_jointure() FROM public;

-- ⚠️ `anon` LIT les prestations (fiche publique), il n'en ÉCRIT aucune. Aucun
-- nouvel objet lisible : on réaffirme les droits de la table, comme les
-- migrations précédentes du module.
GRANT SELECT ON public.rdv_prestations TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.rdv_prestations FROM anon;

-- 4) L'essai, sur des tables TEMPORAIRES qui portent la même garde et les mêmes
-- garde-fous : aucune vraie prestation, aucune vraie réservation n'est lue ni
-- touchée. Chaque cas écrit ce qu'il a obtenu.
DROP TABLE IF EXISTS pg_temp.essai_tables;
DROP TABLE IF EXISTS pg_temp.essai_resas;
DROP TABLE IF EXISTS pg_temp.essai_jointures_resultats;
CREATE TEMP TABLE essai_tables (LIKE public.rdv_prestations INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE TEMP TABLE essai_resas (prestation_id uuid, statut text, date_rdv date, deleted_at timestamp);
CREATE TEMP TABLE essai_jointures_resultats (ordre int, cas text, obtenu text, attendu text);
CREATE TRIGGER essai_tables_garde
  BEFORE INSERT OR UPDATE ON essai_tables
  FOR EACH ROW EXECUTE FUNCTION public.rdv_prestations_garde_jointure('pg_temp.essai_resas');

DO $$
DECLARE
  aujourdhui date := (now() AT TIME ZONE 'Europe/Brussels')::date;
  maison uuid := gen_random_uuid();
  voisine uuid := gen_random_uuid();
  t4 uuid := gen_random_uuid();
  t4_voisine uuid := gen_random_uuid();
  coupe uuid := gen_random_uuid();
  j1 uuid := gen_random_uuid();
  j2 uuid := gen_random_uuid();
  j3 uuid := gen_random_uuid();
BEGIN
  INSERT INTO essai_tables (id, commercant_id, nom, duree_minutes, par_couverts, couverts_min, couverts_max, quantite, capacite) VALUES
    (t4, maison, 'Table de 4', 120, true, 1, 4, 6, 24),
    (t4_voisine, voisine, 'Table de 4', 120, true, 1, 4, 6, 24);
  INSERT INTO essai_tables (id, commercant_id, nom, duree_minutes, par_couverts, capacite) VALUES
    (coupe, maison, 'Coupe', 30, false, 1);

  BEGIN
    INSERT INTO essai_tables (id, commercant_id, nom, duree_minutes, par_couverts, couverts_min, couverts_max, quantite, capacite, jointure_de, jointure_tables)
    VALUES (j1, maison, '2 tables de 4 jointes', 150, true, 6, 8, 2, 16, t4, 2);
    INSERT INTO essai_jointures_resultats VALUES (1, 'joindre deux tables de la maison', 'accepte', 'accepte');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_jointures_resultats VALUES (1, 'joindre deux tables de la maison', 'refuse : ' || SQLERRM, 'accepte');
  END;

  BEGIN
    INSERT INTO essai_tables (commercant_id, nom, duree_minutes, par_couverts, couverts_min, couverts_max, quantite, capacite, jointure_de, jointure_tables)
    VALUES (maison, 'vol', 150, true, 6, 8, 1, 8, t4_voisine, 2);
    INSERT INTO essai_jointures_resultats VALUES (2, 'joindre les tables d une autre maison', 'accepte', 'refuse');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_jointures_resultats VALUES (2, 'joindre les tables d une autre maison',
      CASE WHEN SQLERRM = 'JOINTURE_INVALIDE' THEN 'refuse' ELSE 'autre erreur : ' || SQLERRM END, 'refuse');
  END;

  BEGIN
    INSERT INTO essai_tables (commercant_id, nom, duree_minutes, par_couverts, couverts_min, couverts_max, quantite, capacite, jointure_de, jointure_tables)
    VALUES (maison, 'jointure de jointure', 150, true, 10, 16, 1, 16, j1, 2);
    INSERT INTO essai_jointures_resultats VALUES (3, 'joindre une jointure', 'accepte', 'refuse');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_jointures_resultats VALUES (3, 'joindre une jointure',
      CASE WHEN SQLERRM = 'JOINTURE_INVALIDE' THEN 'refuse' ELSE 'autre erreur : ' || SQLERRM END, 'refuse');
  END;

  BEGIN
    INSERT INTO essai_tables (commercant_id, nom, duree_minutes, par_couverts, couverts_min, couverts_max, quantite, capacite, jointure_de, jointure_tables)
    VALUES (maison, 'deux coupes', 60, true, 2, 2, 1, 2, coupe, 2);
    INSERT INTO essai_jointures_resultats VALUES (4, 'joindre ce qui n est pas une table', 'accepte', 'refuse');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_jointures_resultats VALUES (4, 'joindre ce qui n est pas une table',
      CASE WHEN SQLERRM = 'JOINTURE_INVALIDE' THEN 'refuse' ELSE 'autre erreur : ' || SQLERRM END, 'refuse');
  END;

  BEGIN
    INSERT INTO essai_tables (commercant_id, nom, duree_minutes, par_couverts, couverts_min, couverts_max, quantite, capacite, jointure_de)
    VALUES (maison, 'sans nombre', 150, true, 6, 8, 1, 8, t4);
    INSERT INTO essai_jointures_resultats VALUES (5, 'une jointure sans nombre de tables', 'accepte', 'refuse');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_jointures_resultats VALUES (5, 'une jointure sans nombre de tables',
      CASE WHEN SQLERRM LIKE '%rdv_prestations_jointure_complete%' THEN 'refuse' ELSE 'autre erreur : ' || SQLERRM END, 'refuse');
  END;

  BEGIN
    INSERT INTO essai_tables (commercant_id, nom, duree_minutes, par_couverts, couverts_min, couverts_max, quantite, capacite, jointure_de, jointure_tables)
    VALUES (maison, 'une seule table', 150, true, 3, 4, 1, 4, t4, 1);
    INSERT INTO essai_jointures_resultats VALUES (6, 'une jointure d une seule table', 'accepte', 'refuse');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_jointures_resultats VALUES (6, 'une jointure d une seule table',
      CASE WHEN SQLERRM LIKE '%rdv_prestations_jointure_bornes%' THEN 'refuse' ELSE 'autre erreur : ' || SQLERRM END, 'refuse');
  END;

  BEGIN
    UPDATE essai_tables SET jointure_tables = 3 WHERE id = j1;
    INSERT INTO essai_jointures_resultats VALUES (7, 'changer le nombre de tables jointes', 'accepte', 'refuse');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_jointures_resultats VALUES (7, 'changer le nombre de tables jointes',
      CASE WHEN SQLERRM = 'JOINTURE_FIGEE' THEN 'refuse' ELSE 'autre erreur : ' || SQLERRM END, 'refuse');
  END;

  BEGIN
    UPDATE essai_tables SET jointure_de = j1, jointure_tables = 2 WHERE id = t4;
    INSERT INTO essai_jointures_resultats VALUES (8, 'transformer une table en jointure', 'accepte', 'refuse');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_jointures_resultats VALUES (8, 'transformer une table en jointure',
      CASE WHEN SQLERRM = 'JOINTURE_FIGEE' THEN 'refuse' ELSE 'autre erreur : ' || SQLERRM END, 'refuse');
  END;

  BEGIN
    UPDATE essai_tables SET couverts_max = 7, quantite = 1, capacite = 7, nom = 'Grande tablee' WHERE id = j1;
    INSERT INTO essai_jointures_resultats VALUES (9, 'regler les bornes et le nombre a la fois', 'accepte', 'accepte');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_jointures_resultats VALUES (9, 'regler les bornes et le nombre a la fois', 'refuse : ' || SQLERRM, 'accepte');
  END;

  -- j1 : une table de huit dans trois jours. j2 : une d'hier, une annulée.
  -- j3 : une ce soir.
  INSERT INTO essai_tables (id, commercant_id, nom, duree_minutes, par_couverts, couverts_min, couverts_max, quantite, capacite, jointure_de, jointure_tables) VALUES
    (j2, maison, '3 tables de 4 jointes', 180, true, 9, 12, 1, 12, t4, 3),
    (j3, maison, '2 tables de 4, terrasse', 150, true, 6, 8, 1, 8, t4, 2);
  INSERT INTO essai_resas VALUES
    (j1, 'confirme', aujourdhui + 3, NULL),
    (j2, 'honore', aujourdhui - 1, NULL),
    (j2, 'annule', aujourdhui + 2, NULL),
    (j3, 'confirme', aujourdhui, NULL);

  BEGIN
    UPDATE essai_tables SET actif = false WHERE id = j1;
    INSERT INTO essai_jointures_resultats VALUES (10, 'eteindre une jointure reservee dans trois jours', 'accepte', 'refuse');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_jointures_resultats VALUES (10, 'eteindre une jointure reservee dans trois jours',
      CASE WHEN SQLERRM = 'JOINTURE_RESERVEE' THEN 'refuse' ELSE 'autre erreur : ' || SQLERRM END, 'refuse');
  END;

  BEGIN
    UPDATE essai_tables SET deleted_at = now() WHERE id = j1;
    INSERT INTO essai_jointures_resultats VALUES (11, 'supprimer une jointure reservee dans trois jours', 'accepte', 'refuse');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_jointures_resultats VALUES (11, 'supprimer une jointure reservee dans trois jours',
      CASE WHEN SQLERRM = 'JOINTURE_RESERVEE' THEN 'refuse' ELSE 'autre erreur : ' || SQLERRM END, 'refuse');
  END;

  BEGIN
    UPDATE essai_tables SET actif = false WHERE id = j3;
    INSERT INTO essai_jointures_resultats VALUES (12, 'eteindre une jointure reservee ce soir', 'accepte', 'refuse');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_jointures_resultats VALUES (12, 'eteindre une jointure reservee ce soir',
      CASE WHEN SQLERRM = 'JOINTURE_RESERVEE' THEN 'refuse' ELSE 'autre erreur : ' || SQLERRM END, 'refuse');
  END;

  BEGIN
    UPDATE essai_tables SET actif = false WHERE id = j2;
    INSERT INTO essai_jointures_resultats VALUES (13, 'eteindre une jointure dont tout est passe ou annule', 'accepte', 'accepte');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_jointures_resultats VALUES (13, 'eteindre une jointure dont tout est passe ou annule', 'refuse : ' || SQLERRM, 'accepte');
  END;

  BEGIN
    UPDATE essai_tables SET actif = true WHERE id = j2;
    UPDATE essai_tables SET deleted_at = now() WHERE id = j2;
    INSERT INTO essai_jointures_resultats VALUES (14, 'rallumer puis supprimer cette jointure', 'accepte', 'accepte');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_jointures_resultats VALUES (14, 'rallumer puis supprimer cette jointure', 'refuse : ' || SQLERRM, 'accepte');
  END;

  BEGIN
    UPDATE essai_tables SET quantite = 5, capacite = 20 WHERE id = t4;
    UPDATE essai_tables SET actif = false WHERE id = coupe;
    INSERT INTO essai_jointures_resultats VALUES (15, 'regler une table et une prestation ordinaires', 'accepte', 'accepte');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_jointures_resultats VALUES (15, 'regler une table et une prestation ordinaires', 'refuse : ' || SQLERRM, 'accepte');
  END;
END
$$;

-- 5) Contrôle : une ligne par vérification, sa valeur et l'attendu.
SELECT '00' AS ordre, 'colonne jointure_de' AS controle,
       COALESCE((SELECT data_type::text FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'rdv_prestations'
                    AND column_name = 'jointure_de'), 'ABSENTE') AS valeur,
       'uuid' AS attendu
UNION ALL
SELECT '00', 'colonne jointure_tables',
       COALESCE((SELECT data_type::text FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'rdv_prestations'
                    AND column_name = 'jointure_tables'), 'ABSENTE'),
       'integer'
UNION ALL
SELECT '00', 'les trois garde-fous de la ligne',
       COALESCE((SELECT string_agg(conname::text, ' | ' ORDER BY conname) FROM pg_constraint
                  WHERE conrelid = 'public.rdv_prestations'::regclass
                    AND conname IN ('rdv_prestations_jointure_complete', 'rdv_prestations_jointure_bornes',
                                    'rdv_prestations_jointure_est_une_table')), 'AUCUN'),
       'rdv_prestations_jointure_bornes | rdv_prestations_jointure_complete | rdv_prestations_jointure_est_une_table'
UNION ALL
SELECT '00', 'fonction de garde presente',
       (SELECT count(*)::text FROM pg_proc
         WHERE proname = 'rdv_prestations_garde_jointure' AND pronamespace = 'public'::regnamespace),
       '1'
UNION ALL
SELECT '00', 'declencheur pose et actif sur rdv_prestations',
       (SELECT count(*)::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         WHERE t.tgname = 'rdv_prestations_jointure' AND c.relname = 'rdv_prestations'
           AND NOT t.tgisinternal AND t.tgenabled = 'O'),
       '1'
UNION ALL
SELECT '00', 'aucune prestation existante n est une jointure (au premier passage)',
       (SELECT count(*)::text FROM public.rdv_prestations WHERE jointure_de IS NOT NULL),
       '0'
UNION ALL
SELECT '00', 'anon peut lire les prestations',
       (SELECT count(*)::text FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'rdv_prestations'
           AND grantee = 'anon' AND privilege_type = 'SELECT'),
       '1'
UNION ALL
SELECT '00', 'anon ne peut rien ecrire',
       (SELECT count(*)::text FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'rdv_prestations'
           AND grantee = 'anon' AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')),
       '0'
UNION ALL
SELECT '00', 'la RLS reste active',
       (SELECT CASE WHEN relrowsecurity THEN 'true' ELSE 'false' END
          FROM pg_class WHERE oid = 'public.rdv_prestations'::regclass),
       'true'
UNION ALL
SELECT lpad(ordre::text, 2, '0'), cas, obtenu, attendu FROM essai_jointures_resultats
ORDER BY 1, 2;
