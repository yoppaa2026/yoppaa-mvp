-- LA CADENCE DE LA CUISINE (lot 5 du module restaurant, 12/09/2026)
--
-- « Vingt couverts à 20:00 et rien à 20:30, ce n'est pas une bonne soirée,
-- c'est un coup de feu. » Le restaurateur règle combien de personnes peuvent
-- ARRIVER sur un même quart d'heure (19:00, 19:15, 19:30…). Au-delà, sa fiche
-- propose un autre quart d'heure, même quand des tables sont libres ; au
-- téléphone, Yoppaa le prévient et le laisse poser quand même. La règle vit
-- dans `lib/inventaire-salle.js` (`etatCadence`), la même pour la fiche, le
-- serveur et le tableau de bord.
--
-- CE QUE FAIT CETTE MIGRATION, EN UNE SEULE TRANSACTION :
--   1. `commercants.rdv_cadence_couverts` : le réglage. VIDE PAR DÉFAUT, et
--      vide veut dire « pas de limite » : aucun commerce ne change de
--      comportement tant qu'il n'a rien réglé. De 1 à 200.
--   2. La vue publique `commercants_public` l'expose, À LA FIN de ses 55
--      colonnes, pour que la fiche le connaisse.
--      ⚠️ ELLE REFUSE DE S'APPLIQUER si la vue vivante n'a pas EXACTEMENT les 55
--      colonnes attendues, dans l'ordre, et le filtre des fiches publiées : on
--      ne réécrit pas une vue de production sur une définition qu'on ne connaît
--      pas (MIGRATION_RDV_HORIZON, 07/09). Le refus nomme les colonnes vivantes,
--      et la transaction entière est annulée : rien ne change.
--      ⚠️ SANS `security_invoker`, comme depuis le 27/08 (voir
--      MIGRATION_RETRAIT_COLONNES_RDV_FIDELITE) : la vue reste en lecture seule
--      par ses DROITS, reposés ici.
--   3. Les deux fonctions publiques des créneaux pris rendent `couverts`, le
--      nombre de personnes : sans lui, la fiche ne sait pas combien arrivent.
--      Un nombre, pas une donnée personnelle : aucun nom, aucun email, aucun
--      téléphone n'en sort, exactement comme `place_no` le 16/08.
--
-- 🔴 DEUX FRÈRES CORRIGÉS AU PASSAGE :
--   • la fiche compte déjà les couverts d'une salle SANS inventaire, et
--     `rdv_slots_busy` ne les lui a jamais rendus : chaque table y pesait UN
--     couvert, et la grille proposait ce que le serveur refusait ensuite ;
--   • `rdv_slots_busy_range`, qui colore le calendrier à pastilles, n'était
--     défini dans AUCUN fichier du dépôt, et ne rendait probablement pas
--     `prestation_id` : une pastille verte sur un jour complet. Il est RECRÉÉ
--     sur la définition de `rdv_slots_busy`, la date en plus, borné à 400
--     jours (l'horizon d'un commerce en vaut 365 au plus). Sa définition
--     d'avant est rendue par le contrôle, pour mémoire.
--
-- ⚠️ À PASSER AVANT LE DÉPLOIEMENT DU CODE : le tableau de bord lit la cadence
-- par son nom avec la salle du jour. Sans la colonne, cette lecture échoue, et
-- la saisie d'une table au téléphone s'arrête sur « Impossible de lire ta
-- salle ». Sûre à rejouer.
--
-- ✅ PASSÉE PAR ALEX LE 12/09/2026, avant le push de `127d7db` : les dix-huit
-- contrôles A01 à A18 conformes (colonne `integer` vide par défaut, garde-fou
-- posé, aucun commerce réglé, droits de lecture et de réglage, vue à 56
-- colonnes avec la cadence en dernier, filtre des fiches publiées intact,
-- options inchangées, lecture seule pour `anon`, 12 commerces publiés toujours
-- visibles, les deux fonctions en une seule version chacune, qui rendent les
-- couverts et restent appelables par `anon`), et les neuf essais conformes
-- (cadences vide, 1, 12 et 200 acceptées ; -3, 0 et 201 refusées ; les deux
-- fonctions répondent pour un commerce inconnu).
-- 🔴 ET L'ANCIENNE DÉFINITION DU CALENDRIER À PASTILLES, RELUE (Z2), CONFIRME LE
-- DÉFAUT NOMMÉ LE 10/09 : elle ne rendait que la date, les heures et le
-- praticien, ni `prestation_id` ni `couverts`. Une salle en inventaire y
-- paraissait donc toujours vide. Mêmes statuts et même filtre de suppression
-- que la nouvelle, qui n'ajoute que des colonnes et la borne de 400 jours.

BEGIN;

-- 0) Ce qui existait avant, pour le contrôle.
DROP TABLE IF EXISTS pg_temp.cadence_avant;
CREATE TEMP TABLE cadence_avant AS
SELECT p.proname::text AS fonction,
       pg_get_function_identity_arguments(p.oid)::text AS arguments,
       pg_get_function_result(p.oid)::text AS rend,
       pg_get_functiondef(p.oid)::text AS definition
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('rdv_slots_busy', 'rdv_slots_busy_range');
-- ⚠️ ET LES OPTIONS DE LA VUE : `CREATE OR REPLACE VIEW` REMPLACE ses options
-- par celles qu'on lui donne, même aucune. Une option posée en base sans que le
-- dépôt le sache disparaîtrait en silence ; on la note, on la repose.
DROP TABLE IF EXISTS pg_temp.vue_avant;
CREATE TEMP TABLE vue_avant AS
SELECT reloptions AS options FROM pg_class WHERE oid = 'public.commercants_public'::regclass;

-- 1) Le réglage.
ALTER TABLE public.commercants
  ADD COLUMN IF NOT EXISTS rdv_cadence_couverts integer;

COMMENT ON COLUMN public.commercants.rdv_cadence_couverts IS
  'Cadence de la cuisine : combien de personnes peuvent arriver sur un meme quart d heure. NULL = pas de limite. Un groupe plus grand passe s il arrive seul sur son quart d heure.';

-- Les bornes de l'écran (CADENCE_MIN, CADENCE_MAX dans lib/inventaire-salle.js).
ALTER TABLE public.commercants DROP CONSTRAINT IF EXISTS commercants_rdv_cadence_check;
ALTER TABLE public.commercants
  ADD CONSTRAINT commercants_rdv_cadence_check
  CHECK (rdv_cadence_couverts IS NULL OR rdv_cadence_couverts BETWEEN 1 AND 200);

-- La colonne hérite des droits de la table ; on le rend EXPLICITE, comme pour
-- l'horizon le 07/09 : le jour où des droits par colonne apparaîtraient,
-- l'oubli serait muet.
GRANT SELECT (rdv_cadence_couverts) ON public.commercants TO anon, authenticated;
GRANT UPDATE (rdv_cadence_couverts) ON public.commercants TO authenticated;

-- 2) La vue publique, sur la définition vivante et nulle autre.
DO $$
DECLARE
  attendu text := 'id,nom,type,telephone,created_at,adresse,latitude,longitude,horaires,description,infos_pratiques,logo_url,heure_ouverture_resa,horaires_detail,slug,horizon_commande,mode_capacite,statut_publication,plan,heure_limite_morning,est_service,categorie,rdv_actif,rdv_acompte_global,rdv_delai_annulation_heures,rdv_paiement_cash,rdv_paiement_ligne,rdv_message_confirmation,stripe_account_charges_enabled,stripe_account_details_submitted,stripe_account_payouts_enabled,rdv_acompte_en_ligne_actif,livraison_actif,accepte_paiement_cash,fidelite_actif,notif_mode,delai_annulation_heures,photos_catalogue_actif,boutique_mode_vente,boutique_retrait_paiement,boutique_frais_port,boutique_gratuit_des,boutique_expedition_cp,fidelite_mecanique,fidelite_seuil_passages,fidelite_taux_cagnotte,fidelite_seuil_cagnotte,fidelite_recompense_type,fidelite_recompense_valeur,fidelite_recompense_libelle,boutique_delai_heures,bons_cadeaux_actif,essai_plan,rdv_horizon_jours,commande_actif';
  vivant text;
  filtre text;
BEGIN
  SELECT string_agg(column_name::text, ',' ORDER BY ordinal_position) INTO vivant
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'commercants_public';
  -- Rejouée, la vue porte déjà la cadence à la fin : c'est la même.
  IF vivant IS DISTINCT FROM attendu AND vivant IS DISTINCT FROM attendu || ',rdv_cadence_couverts' THEN
    RAISE EXCEPTION 'VUE_DERIVEE : commercants_public n a pas les 55 colonnes attendues, rien n a ete change. Colonnes vivantes : %', coalesce(vivant, 'VUE ABSENTE');
  END IF;
  filtre := regexp_replace(lower(coalesce(substring(pg_get_viewdef('public.commercants_public'::regclass, true) from 'WHERE(.*)$'), '')),
                           '[[:space:]();]|commercants\.|::text', '', 'g');
  IF filtre IS DISTINCT FROM 'statut_publication=''publie''' THEN
    RAISE EXCEPTION 'VUE_DERIVEE : le filtre des fiches publiees a change, rien n a ete change. Filtre vivant : %', filtre;
  END IF;
END
$$;

CREATE OR REPLACE VIEW public.commercants_public AS
 SELECT id, nom, type, telephone, created_at, adresse, latitude, longitude,
    horaires, description, infos_pratiques, logo_url, heure_ouverture_resa,
    horaires_detail, slug, horizon_commande, mode_capacite, statut_publication,
    plan, heure_limite_morning, est_service, categorie, rdv_actif,
    rdv_acompte_global, rdv_delai_annulation_heures, rdv_paiement_cash,
    rdv_paiement_ligne, rdv_message_confirmation,
    stripe_account_charges_enabled, stripe_account_details_submitted,
    stripe_account_payouts_enabled, rdv_acompte_en_ligne_actif,
    livraison_actif, accepte_paiement_cash, fidelite_actif, notif_mode,
    delai_annulation_heures, photos_catalogue_actif, boutique_mode_vente,
    boutique_retrait_paiement, boutique_frais_port, boutique_gratuit_des,
    boutique_expedition_cp, fidelite_mecanique, fidelite_seuil_passages,
    fidelite_taux_cagnotte, fidelite_seuil_cagnotte, fidelite_recompense_type,
    fidelite_recompense_valeur, fidelite_recompense_libelle,
    boutique_delai_heures, bons_cadeaux_actif, essai_plan, rdv_horizon_jours,
    commande_actif,
    -- La nouvelle, À LA FIN : `CREATE OR REPLACE VIEW` n'autorise que ça.
    rdv_cadence_couverts
   FROM commercants
  WHERE statut_publication = 'publie'::text;

DO $$
DECLARE
  opts text[];
BEGIN
  SELECT options INTO opts FROM pg_temp.vue_avant LIMIT 1;
  IF opts IS NOT NULL AND array_length(opts, 1) > 0 THEN
    EXECUTE format('ALTER VIEW public.commercants_public SET (%s)', array_to_string(opts, ', '));
  END IF;
END
$$;

-- ⚠️ UNE VUE NAÎT MODIFIABLE, et sans `security_invoker` l'écriture contourne la
-- RLS (la faille du 27/08). Lecture seule, par les droits.
REVOKE INSERT, UPDATE, DELETE ON public.commercants_public FROM anon, authenticated;
GRANT SELECT ON public.commercants_public TO anon, authenticated;

-- 3) Les créneaux pris, avec le nombre de personnes.
--
-- ⚠️ `CREATE OR REPLACE` NE SUFFIT PAS : PostgreSQL refuse de changer le type de
-- retour d'une fonction. On la supprime et on la recrée DANS LA MÊME
-- TRANSACTION, puis on REPOSE SES DROITS : sans eux, l'écran de réservation
-- afficherait « aucun créneau » à tout le monde, coiffeurs compris.
DROP FUNCTION IF EXISTS public.rdv_slots_busy(uuid, date);

CREATE FUNCTION public.rdv_slots_busy(p_commercant_id uuid, p_date date)
RETURNS TABLE(
  heure_debut    time without time zone,
  heure_fin      time without time zone,
  praticien_id   uuid,
  prestation_id  uuid,
  place_no       int,
  couverts       int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT heure_debut, heure_fin, praticien_id, prestation_id, place_no, couverts
  FROM rdv_reservations
  WHERE commercant_id = p_commercant_id
    AND date_rdv = p_date
    AND deleted_at IS NULL
    AND statut IN ('confirme', 'honore');
$function$;

GRANT EXECUTE ON FUNCTION public.rdv_slots_busy(uuid, date) TO anon, authenticated, service_role;

-- Le calendrier à pastilles : TOUTES ses versions partent, quelle que soit leur
-- signature (on ne la connaît pas), puis une seule revient. Deux versions de
-- même nom rendraient l'appel ambigu, et le calendrier muet.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature
             FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname = 'rdv_slots_busy_range'
  LOOP
    EXECUTE 'DROP FUNCTION ' || f.signature::text;
  END LOOP;
END
$$;

CREATE FUNCTION public.rdv_slots_busy_range(p_commercant_id uuid, p_date_start date, p_date_end date)
RETURNS TABLE(
  date_rdv       date,
  heure_debut    time without time zone,
  heure_fin      time without time zone,
  praticien_id   uuid,
  prestation_id  uuid,
  place_no       int,
  couverts       int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT date_rdv, heure_debut, heure_fin, praticien_id, prestation_id, place_no, couverts
  FROM rdv_reservations
  WHERE commercant_id = p_commercant_id
    AND date_rdv BETWEEN p_date_start AND LEAST(p_date_end, p_date_start + 400)
    AND deleted_at IS NULL
    AND statut IN ('confirme', 'honore');
$function$;

GRANT EXECUTE ON FUNCTION public.rdv_slots_busy_range(uuid, date, date) TO anon, authenticated, service_role;

COMMIT;

-- 4) L'essai, sur une table TEMPORAIRE qui porte le garde-fou VIVANT de la
-- colonne, recopié depuis la base : aucun vrai commerce n'est lu ni touché. Et
-- les deux fonctions, appelées pour un commerce qui n'existe pas : elles doivent
-- répondre, vides, sans rien lire de réel.
DROP TABLE IF EXISTS pg_temp.essai_cadence;
DROP TABLE IF EXISTS pg_temp.essai_cadence_resultats;
CREATE TEMP TABLE essai_cadence (rdv_cadence_couverts integer);
CREATE TEMP TABLE essai_cadence_resultats (ordre int, cas text, obtenu text, attendu text);

DO $$
DECLARE
  garde text;
  n int;
  v int;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO garde FROM pg_constraint
   WHERE conname = 'commercants_rdv_cadence_check' AND conrelid = 'public.commercants'::regclass;
  EXECUTE 'ALTER TABLE pg_temp.essai_cadence ADD CONSTRAINT essai_cadence_bornes ' || garde;

  FOREACH v IN ARRAY ARRAY[1, 12, 200] LOOP
    BEGIN
      INSERT INTO essai_cadence VALUES (v);
      INSERT INTO essai_cadence_resultats VALUES (v, 'une cadence de ' || v, 'accepte', 'accepte');
    EXCEPTION WHEN others THEN
      INSERT INTO essai_cadence_resultats VALUES (v, 'une cadence de ' || v, 'refuse : ' || SQLERRM, 'accepte');
    END;
  END LOOP;

  BEGIN
    INSERT INTO essai_cadence VALUES (NULL);
    INSERT INTO essai_cadence_resultats VALUES (0, 'pas de cadence (vide)', 'accepte', 'accepte');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_cadence_resultats VALUES (0, 'pas de cadence (vide)', 'refuse : ' || SQLERRM, 'accepte');
  END;

  FOREACH v IN ARRAY ARRAY[0, -3, 201] LOOP
    BEGIN
      INSERT INTO essai_cadence VALUES (v);
      INSERT INTO essai_cadence_resultats VALUES (300 + v, 'une cadence de ' || v, 'accepte', 'refuse');
    EXCEPTION WHEN check_violation THEN
      INSERT INTO essai_cadence_resultats VALUES (300 + v, 'une cadence de ' || v, 'refuse', 'refuse');
    WHEN others THEN
      INSERT INTO essai_cadence_resultats VALUES (300 + v, 'une cadence de ' || v, 'autre erreur : ' || SQLERRM, 'refuse');
    END;
  END LOOP;

  BEGIN
    SELECT count(*) INTO n FROM public.rdv_slots_busy(gen_random_uuid(), (now() AT TIME ZONE 'Europe/Brussels')::date);
    INSERT INTO essai_cadence_resultats VALUES (600, 'rdv_slots_busy repond pour un commerce inconnu', n::text || ' ligne', '0 ligne');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_cadence_resultats VALUES (600, 'rdv_slots_busy repond pour un commerce inconnu', 'erreur : ' || SQLERRM, '0 ligne');
  END;

  BEGIN
    SELECT count(*) INTO n FROM public.rdv_slots_busy_range(gen_random_uuid(), (now() AT TIME ZONE 'Europe/Brussels')::date, (now() AT TIME ZONE 'Europe/Brussels')::date + 60);
    INSERT INTO essai_cadence_resultats VALUES (601, 'rdv_slots_busy_range repond pour un commerce inconnu', n::text || ' ligne', '0 ligne');
  EXCEPTION WHEN others THEN
    INSERT INTO essai_cadence_resultats VALUES (601, 'rdv_slots_busy_range repond pour un commerce inconnu', 'erreur : ' || SQLERRM, '0 ligne');
  END;
END
$$;

-- 5) Contrôle : une ligne par vérification, sa valeur et l'attendu.
SELECT 'A01' AS ordre, 'colonne rdv_cadence_couverts' AS controle,
       COALESCE((SELECT data_type::text || CASE WHEN is_nullable = 'YES' THEN ' nullable' ELSE ' NOT NULL' END
                   FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name = 'rdv_cadence_couverts'), 'ABSENTE') AS valeur,
       'integer nullable' AS attendu
UNION ALL
SELECT 'A02', 'vide par defaut (pas de limite)',
       COALESCE((SELECT column_default::text FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name = 'rdv_cadence_couverts'), 'aucun'),
       'aucun'
UNION ALL
SELECT 'A03', 'garde-fou des bornes pose',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conname = 'commercants_rdv_cadence_check' AND conrelid = 'public.commercants'::regclass),
       '1'
UNION ALL
SELECT 'A04', 'aucun commerce n a de cadence (au premier passage)',
       (SELECT count(*)::text FROM public.commercants WHERE rdv_cadence_couverts IS NOT NULL),
       '0'
UNION ALL
SELECT 'A05', 'anon et authenticated lisent la colonne',
       (SELECT count(DISTINCT grantee)::text FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'commercants' AND column_name = 'rdv_cadence_couverts'
           AND privilege_type = 'SELECT' AND grantee IN ('anon', 'authenticated')),
       '2'
UNION ALL
SELECT 'A06', 'le commercant peut la regler',
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'commercants' AND column_name = 'rdv_cadence_couverts'
           AND privilege_type = 'UPDATE' AND grantee = 'authenticated'),
       '1'
UNION ALL
SELECT 'A07', 'vue : colonnes',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants_public'),
       '56'
UNION ALL
SELECT 'A08', 'vue : la cadence est la derniere colonne',
       COALESCE((SELECT column_name::text FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants_public'
                  ORDER BY ordinal_position DESC LIMIT 1), 'VUE ABSENTE'),
       'rdv_cadence_couverts'
UNION ALL
SELECT 'A09', 'vue : colonnes recentes toujours la',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants_public'
           AND column_name IN ('commande_actif', 'rdv_horizon_jours', 'essai_plan', 'boutique_expedition_cp', 'bons_cadeaux_actif')),
       '5'
UNION ALL
SELECT 'A10', 'vue : ne montre que les fiches publiees',
       CASE WHEN pg_get_viewdef('public.commercants_public'::regclass, true) LIKE '%statut_publication = ''publie''%'
            THEN 'oui' ELSE 'NON' END,
       'oui'
UNION ALL
SELECT 'A11', 'vue : options inchangees (aucune depuis le 27/08 : lecture seule par les droits)',
       (SELECT CASE WHEN c.reloptions IS NOT DISTINCT FROM (SELECT options FROM pg_temp.vue_avant LIMIT 1)
                    THEN 'oui (' || COALESCE(array_to_string(c.reloptions, ','), 'aucune') || ')'
                    ELSE 'NON : avant ' || COALESCE((SELECT array_to_string(options, ',') FROM pg_temp.vue_avant LIMIT 1), 'aucune')
                         || ', apres ' || COALESCE(array_to_string(c.reloptions, ','), 'aucune') END
          FROM pg_class c WHERE c.oid = 'public.commercants_public'::regclass),
       'oui (aucune)'
UNION ALL
SELECT 'A12', 'vue : ce que anon peut y faire',
       (SELECT COALESCE(string_agg(DISTINCT privilege_type::text, '+' ORDER BY privilege_type::text), 'RIEN')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'commercants_public' AND grantee = 'anon'),
       'SELECT'
UNION ALL
SELECT 'A13', 'vue : les commerces publies restent visibles',
       (SELECT count(*)::text FROM public.commercants_public),
       'le nombre habituel, jamais 0'
UNION ALL
SELECT 'A14', 'rdv_slots_busy : une seule version, qui rend couverts',
       (SELECT count(*)::text FROM pg_proc p
         WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'rdv_slots_busy'
           AND pg_get_function_result(p.oid) LIKE '%couverts integer%'),
       '1'
UNION ALL
SELECT 'A15', 'rdv_slots_busy : anon et authenticated peuvent l appeler',
       (has_function_privilege('anon', 'public.rdv_slots_busy(uuid, date)', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.rdv_slots_busy(uuid, date)', 'EXECUTE'))::text,
       'true'
UNION ALL
SELECT 'A16', 'rdv_slots_busy_range : versions',
       (SELECT count(*)::text FROM pg_proc p
         WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'rdv_slots_busy_range'),
       '1'
UNION ALL
SELECT 'A17', 'rdv_slots_busy_range : rend la date, la table et les couverts',
       (SELECT CASE WHEN pg_get_function_result(p.oid) LIKE '%date_rdv date%'
                     AND pg_get_function_result(p.oid) LIKE '%prestation_id uuid%'
                     AND pg_get_function_result(p.oid) LIKE '%couverts integer%' THEN 'oui' ELSE 'NON' END
          FROM pg_proc p
         WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'rdv_slots_busy_range'
         LIMIT 1),
       'oui'
UNION ALL
SELECT 'A18', 'rdv_slots_busy_range : anon et authenticated peuvent l appeler',
       (has_function_privilege('anon', 'public.rdv_slots_busy_range(uuid, date, date)', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.rdv_slots_busy_range(uuid, date, date)', 'EXECUTE'))::text,
       'true'
UNION ALL
SELECT 'Z1', 'AVANT : ' || fonction || '(' || arguments || ')', rend, 'pour memoire'
  FROM cadence_avant
UNION ALL
SELECT 'Z2', 'AVANT, definition de ' || fonction, definition, 'pour memoire'
  FROM cadence_avant WHERE fonction = 'rdv_slots_busy_range'
UNION ALL
SELECT 'B' || lpad(ordre::text, 3, '0'), 'essai : ' || cas, obtenu, attendu FROM essai_cadence_resultats
ORDER BY 1, 2;
