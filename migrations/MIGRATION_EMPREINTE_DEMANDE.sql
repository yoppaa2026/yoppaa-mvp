-- LE LIEN « CONFIRME TA TABLE » (lot 4, seconde moitié, 14/09/2026)
--
-- Une réservation prise AU TÉLÉPHONE n'a pas de carte au bout du fil : personne
-- ne dicte son numéro de carte, et le noter sur un papier est interdit. La
-- table de huit du samedi soir, la plus chère à perdre, n'était donc jamais
-- garantie. Le restaurateur envoie maintenant un lien au client, qui pose sa
-- carte lui-même.
--
-- ⚠️ CE N'EST PAS LA TABLE QUI ATTEND, C'EST LE LIEN QUI EXPIRE. Le restaurateur
-- au téléphone ne dit pas « je vous confirme si vous cliquez » : il confirme. La
-- réservation est donc posée comme avant, et ce lien ne fait que la faire passer
-- de « sans empreinte » à « garantie ». Aucune table ne se libère toute seule,
-- aucun appel fantôme ne bloque la salle, et le restaurateur garde la main : son
-- agenda lui dit qui a confirmé, il décide de relancer ou d'annuler.
--
-- 🔴 L'EMPREINTE DU JETON EN BASE, JAMAIS LE JETON. Une fuite de la base ne doit
-- pas rendre les liens utilisables : on garde un SHA-256, et le jeton en clair
-- ne vit que dans l'email ou le SMS du client. C'est la règle posée le 25/08
-- sur les jetons de bons cadeaux, et elle vaut ici pour la même raison.
--
-- ⚠️ ET LE VERROU S'ÉTEND À CES QUATRE COLONNES. `rdv_empreinte_verrou` est
-- recréée pour les couvrir : elles décident de qui peut poser une carte sur une
-- table, et ça ne s'écrit pas depuis un navigateur.
--
-- ✅ PASSÉE PAR ALEX LE 14/09/2026 : les quatre colonnes, le jeton haché, les
-- deux garde-fous, l'index de recherche, le verrou étendu aux QUATORZE colonnes
-- et toujours en SECURITY INVOKER, le trigger actif, aucune réservation avec un
-- lien. Les sept essais du verrou sont conformes : le commerçant ne peut ni
-- fabriquer un jeton, ni repousser une échéance, ni déclarer un envoi, ni
-- choisir le canal, ni insérer une réservation avec un lien tout prêt.
--
-- 🔴 DEUX ÉCARTS AU PASSAGE, ET ILS NE DISENT PAS LA MÊME CHOSE :
--
-- 1. **B021 ET B022 ONT DIT « ACCEPTÉ » ALORS QU'ON ATTENDAIT UN REFUS, ET
--    C'EST MA FAUTE, PAS CELLE DE LA BASE.** La table temporaire portait le
--    TRIGGER mais PAS les contraintes CHECK : un lien sans échéance y passait
--    forcément. Ces deux essais ne mesuraient rien, et « accepté » ne prouvait
--    rien. Une garde qui ne se déclenche jamais est pire qu'une garde absente.
--    Les contraintes existent bel et bien (A03 et A04 les comptent), et
--    CONTROLE_EMPREINTE_DROITS.sql les éprouve correctement, en recopiant les
--    contraintes VIVANTES comme la première migration le faisait déjà.
--
-- 2. 🔴 **A06 : `anon` A QUATRE PRIVILÈGES SUR LES COLONNES DU LIEN**, là où
--    j'en attendais zéro. Le haché ne se renverse pas, donc ce n'est pas le
--    sujet : le sujet, c'est que si `anon` lit ces colonnes, il lit la même
--    table que `client_email`, `client_nom` et `client_telephone`. La RLS
--    protège à la LIGNE, mais il faut savoir ce qui est ouvert.
--    ⚠️ RIEN N'A ÉTÉ RÉVOQUÉ : en PostgreSQL, un privilège posé sur la TABLE ne
--    se retire pas colonne par colonne, et on ne touche pas aux droits de
--    production sur une intuition. CONTROLE_EMPREINTE_DROITS.sql mesure d'abord.

BEGIN;

ALTER TABLE public.rdv_reservations
  ADD COLUMN IF NOT EXISTS empreinte_demande_jeton_hash text,
  ADD COLUMN IF NOT EXISTS empreinte_demande_at timestamptz,
  ADD COLUMN IF NOT EXISTS empreinte_demande_expire_at timestamptz,
  ADD COLUMN IF NOT EXISTS empreinte_demande_canal text;

COMMENT ON COLUMN public.rdv_reservations.empreinte_demande_jeton_hash IS
  'SHA-256 du jeton du lien « confirme ta table ». JAMAIS le jeton en clair : une fuite de la base ne doit pas rendre les liens utilisables.';
COMMENT ON COLUMN public.rdv_reservations.empreinte_demande_expire_at IS
  'Quand le LIEN cesse de fonctionner. Ce n est pas la table qui expire : elle reste reservee, simplement sans garantie.';

ALTER TABLE public.rdv_reservations DROP CONSTRAINT IF EXISTS rdv_empreinte_canal_check;
ALTER TABLE public.rdv_reservations
  ADD CONSTRAINT rdv_empreinte_canal_check
  CHECK (empreinte_demande_canal IS NULL OR empreinte_demande_canal IN ('email', 'sms'));

-- ⚠️ UNE DEMANDE A FORCÉMENT UNE FIN. Sans échéance, un lien envoyé en septembre
-- poserait encore une carte en mars, sur une table oubliée depuis longtemps.
ALTER TABLE public.rdv_reservations DROP CONSTRAINT IF EXISTS rdv_empreinte_demande_complete_check;
ALTER TABLE public.rdv_reservations
  ADD CONSTRAINT rdv_empreinte_demande_complete_check
  CHECK (empreinte_demande_jeton_hash IS NULL
         OR (empreinte_demande_expire_at IS NOT NULL AND empreinte_demande_at IS NOT NULL));

-- La page publique cherche une table PAR SON JETON : sans index, chaque clic
-- balaierait toutes les réservations du parc.
CREATE INDEX IF NOT EXISTS idx_rdv_empreinte_demande_hash
  ON public.rdv_reservations (empreinte_demande_jeton_hash)
  WHERE empreinte_demande_jeton_hash IS NOT NULL;

-- ⚠️ AUCUN GRANT DE LECTURE POUR `anon` SUR CES COLONNES : le jeton haché ne
-- sort jamais de la base, c'est le serveur qui compare. Le commerçant, lui, doit
-- savoir s'il a déjà envoyé un lien et quand il expire.
GRANT SELECT (empreinte_demande_at, empreinte_demande_expire_at, empreinte_demande_canal)
  ON public.rdv_reservations TO authenticated;

-- ── LE VERROU, ÉTENDU AUX QUATRE NOUVELLES COLONNES ─────────────────────────
--
-- 🔴 SANS ÇA, UN COMMERÇANT POURRAIT POSER LUI-MÊME LE HACHÉ D'UN JETON QU'IL
-- CHOISIT, donc fabriquer un lien d'empreinte valable sur n'importe laquelle de
-- ses tables, y compris après l'avoir facturée. Le reste de la fonction ne
-- change pas d'une ligne.
CREATE OR REPLACE FUNCTION public.rdv_empreinte_verrou()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  touche text := NULL;
BEGIN
  IF current_user IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.empreinte_statut IS NOT NULL THEN touche := 'empreinte_statut'; END IF;
    IF NEW.empreinte_montant IS NOT NULL THEN touche := 'empreinte_montant'; END IF;
    IF NEW.empreinte_setup_intent_id IS NOT NULL THEN touche := 'empreinte_setup_intent_id'; END IF;
    IF NEW.empreinte_payment_method_id IS NOT NULL THEN touche := 'empreinte_payment_method_id'; END IF;
    IF NEW.empreinte_customer_id IS NOT NULL THEN touche := 'empreinte_customer_id'; END IF;
    IF NEW.empreinte_debit_pi_id IS NOT NULL THEN touche := 'empreinte_debit_pi_id'; END IF;
    IF NEW.empreinte_debit_montant IS NOT NULL THEN touche := 'empreinte_debit_montant'; END IF;
    IF NEW.empreinte_debit_at IS NOT NULL THEN touche := 'empreinte_debit_at'; END IF;
    IF NEW.empreinte_debit_erreur IS NOT NULL THEN touche := 'empreinte_debit_erreur'; END IF;
    IF NEW.annulation_tardive THEN touche := 'annulation_tardive'; END IF;
    IF NEW.empreinte_demande_jeton_hash IS NOT NULL THEN touche := 'empreinte_demande_jeton_hash'; END IF;
    IF NEW.empreinte_demande_at IS NOT NULL THEN touche := 'empreinte_demande_at'; END IF;
    IF NEW.empreinte_demande_expire_at IS NOT NULL THEN touche := 'empreinte_demande_expire_at'; END IF;
    IF NEW.empreinte_demande_canal IS NOT NULL THEN touche := 'empreinte_demande_canal'; END IF;
  ELSE
    -- ⚠️ `IS DISTINCT FROM`, PAS `<>` : contre NULL, `<>` rend NULL donc faux, et
    -- effacer une colonne passerait inaperçu.
    IF NEW.empreinte_statut IS DISTINCT FROM OLD.empreinte_statut THEN touche := 'empreinte_statut'; END IF;
    IF NEW.empreinte_montant IS DISTINCT FROM OLD.empreinte_montant THEN touche := 'empreinte_montant'; END IF;
    IF NEW.empreinte_setup_intent_id IS DISTINCT FROM OLD.empreinte_setup_intent_id THEN touche := 'empreinte_setup_intent_id'; END IF;
    IF NEW.empreinte_payment_method_id IS DISTINCT FROM OLD.empreinte_payment_method_id THEN touche := 'empreinte_payment_method_id'; END IF;
    IF NEW.empreinte_customer_id IS DISTINCT FROM OLD.empreinte_customer_id THEN touche := 'empreinte_customer_id'; END IF;
    IF NEW.empreinte_debit_pi_id IS DISTINCT FROM OLD.empreinte_debit_pi_id THEN touche := 'empreinte_debit_pi_id'; END IF;
    IF NEW.empreinte_debit_montant IS DISTINCT FROM OLD.empreinte_debit_montant THEN touche := 'empreinte_debit_montant'; END IF;
    IF NEW.empreinte_debit_at IS DISTINCT FROM OLD.empreinte_debit_at THEN touche := 'empreinte_debit_at'; END IF;
    IF NEW.empreinte_debit_erreur IS DISTINCT FROM OLD.empreinte_debit_erreur THEN touche := 'empreinte_debit_erreur'; END IF;
    IF NEW.annulation_tardive IS DISTINCT FROM OLD.annulation_tardive THEN touche := 'annulation_tardive'; END IF;
    IF NEW.empreinte_demande_jeton_hash IS DISTINCT FROM OLD.empreinte_demande_jeton_hash THEN touche := 'empreinte_demande_jeton_hash'; END IF;
    IF NEW.empreinte_demande_at IS DISTINCT FROM OLD.empreinte_demande_at THEN touche := 'empreinte_demande_at'; END IF;
    IF NEW.empreinte_demande_expire_at IS DISTINCT FROM OLD.empreinte_demande_expire_at THEN touche := 'empreinte_demande_expire_at'; END IF;
    IF NEW.empreinte_demande_canal IS DISTINCT FROM OLD.empreinte_demande_canal THEN touche := 'empreinte_demande_canal'; END IF;
  END IF;

  IF touche IS NOT NULL THEN
    RAISE EXCEPTION 'EMPREINTE_VERROUILLEE : % ne s ecrit que par le serveur (role %).', touche, current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$function$;

COMMIT;

-- ── LES ESSAIS, EN DEVENANT VRAIMENT `authenticated` ────────────────────────
DROP TABLE IF EXISTS pg_temp.essai_lien;
DROP TABLE IF EXISTS pg_temp.lien_resultats;
CREATE TEMP TABLE essai_lien (
  id                            int,
  empreinte_statut              text,
  empreinte_montant             numeric(8,2),
  empreinte_setup_intent_id     text,
  empreinte_payment_method_id   text,
  empreinte_customer_id         text,
  empreinte_debit_pi_id         text,
  empreinte_debit_montant       numeric(8,2),
  empreinte_debit_at            timestamptz,
  empreinte_debit_erreur        text,
  annulation_tardive            boolean NOT NULL DEFAULT false,
  empreinte_demande_jeton_hash  text,
  empreinte_demande_at          timestamptz,
  empreinte_demande_expire_at   timestamptz,
  empreinte_demande_canal       text,
  notes_commercant              text
);
CREATE TEMP TABLE lien_resultats (ordre int, cas text, obtenu text, attendu text);

CREATE TRIGGER essai_lien_trg
  BEFORE INSERT OR UPDATE ON pg_temp.essai_lien
  FOR EACH ROW EXECUTE FUNCTION public.rdv_empreinte_verrou();

DO $$
DECLARE
  schema_temp text;
BEGIN
  SELECT nspname INTO schema_temp FROM pg_namespace WHERE oid = pg_my_temp_schema();
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', schema_temp);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I.essai_lien TO authenticated', schema_temp);
  EXECUTE format('GRANT SELECT, INSERT ON %I.lien_resultats TO authenticated', schema_temp);
END
$$;

INSERT INTO pg_temp.essai_lien (id, notes_commercant) VALUES (1, 'table de 8 prise au telephone');

DO $$
DECLARE
  r record;
BEGIN
  SET LOCAL ROLE authenticated;
  FOR r IN
    SELECT * FROM (VALUES
      (1, 'le commercant fabrique lui-meme un jeton de lien',
          'UPDATE pg_temp.essai_lien SET empreinte_demande_jeton_hash = ''abc'' WHERE id = 1', 'refuse'),
      (2, 'il repousse l echeance d un lien',
          'UPDATE pg_temp.essai_lien SET empreinte_demande_expire_at = now() + interval ''1 year'' WHERE id = 1', 'refuse'),
      (3, 'il declare avoir envoye un lien',
          'UPDATE pg_temp.essai_lien SET empreinte_demande_at = now() WHERE id = 1', 'refuse'),
      (4, 'il choisit le canal',
          'UPDATE pg_temp.essai_lien SET empreinte_demande_canal = ''sms'' WHERE id = 1', 'refuse'),
      (5, 'il insere une reservation avec un lien tout pret',
          'INSERT INTO pg_temp.essai_lien (id, empreinte_demande_jeton_hash) VALUES (2, ''def'')', 'refuse'),
      (6, 'il modifie sa note, sans toucher au lien',
          'UPDATE pg_temp.essai_lien SET notes_commercant = ''pres de la fenetre'' WHERE id = 1', 'accepte'),
      (7, 'l argent de l empreinte reste verrouille lui aussi',
          'UPDATE pg_temp.essai_lien SET empreinte_montant = 900 WHERE id = 1', 'refuse')
    ) AS t(ordre, cas, sql, attendu)
  LOOP
    BEGIN
      EXECUTE r.sql;
      INSERT INTO lien_resultats VALUES (r.ordre, r.cas, 'accepte', r.attendu);
    EXCEPTION WHEN insufficient_privilege THEN
      INSERT INTO lien_resultats VALUES (r.ordre, r.cas, 'refuse', r.attendu);
    WHEN others THEN
      INSERT INTO lien_resultats VALUES (r.ordre, r.cas, 'autre erreur : ' || SQLERRM, r.attendu);
    END;
  END LOOP;
  RESET ROLE;

  -- Le serveur, lui, pose le lien sans difficulte.
  BEGIN
    UPDATE pg_temp.essai_lien
       SET empreinte_demande_jeton_hash = 'hash', empreinte_demande_at = now(),
           empreinte_demande_expire_at = now() + interval '7 days', empreinte_demande_canal = 'email'
     WHERE id = 1;
    INSERT INTO lien_resultats VALUES (20, 'le serveur envoie le lien', 'accepte', 'accepte');
  EXCEPTION WHEN others THEN
    INSERT INTO lien_resultats VALUES (20, 'le serveur envoie le lien', 'refuse : ' || SQLERRM, 'accepte');
  END;

  -- ⚠️ ET UN LIEN SANS ECHEANCE EST REFUSE PAR LA BASE, meme au serveur : un
  -- lien qui ne finit jamais poserait une carte des mois plus tard.
  BEGIN
    UPDATE pg_temp.essai_lien SET empreinte_demande_expire_at = NULL WHERE id = 1;
    INSERT INTO lien_resultats VALUES (21, 'un lien sans echeance', 'accepte', 'refuse');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO lien_resultats VALUES (21, 'un lien sans echeance', 'refuse', 'refuse');
  WHEN others THEN
    INSERT INTO lien_resultats VALUES (21, 'un lien sans echeance', 'autre erreur : ' || SQLERRM, 'refuse');
  END;

  BEGIN
    UPDATE pg_temp.essai_lien SET empreinte_demande_canal = 'pigeon' WHERE id = 1;
    INSERT INTO lien_resultats VALUES (22, 'un canal invente', 'accepte', 'refuse');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO lien_resultats VALUES (22, 'un canal invente', 'refuse', 'refuse');
  WHEN others THEN
    INSERT INTO lien_resultats VALUES (22, 'un canal invente', 'autre erreur : ' || SQLERRM, 'refuse');
  END;
END
$$;

-- ── CONTRÔLE : une ligne par vérification, sa valeur et l'attendu ───────────
SELECT 'A01' AS ordre, 'les quatre colonnes du lien' AS controle,
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'rdv_reservations'
           AND column_name LIKE 'empreinte_demande%') AS valeur,
       '4' AS attendu
UNION ALL
SELECT 'A02', 'le jeton est garde HACHE, jamais en clair',
       CASE WHEN COALESCE((SELECT col_description('public.rdv_reservations'::regclass, ordinal_position)
                             FROM information_schema.columns
                            WHERE table_schema = 'public' AND table_name = 'rdv_reservations'
                              AND column_name = 'empreinte_demande_jeton_hash'), '') LIKE 'SHA-256%'
            THEN 'oui' ELSE 'NON' END,
       'oui'
UNION ALL
SELECT 'A03', 'le canal est borne',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid = 'public.rdv_reservations'::regclass AND conname = 'rdv_empreinte_canal_check'),
       '1'
UNION ALL
SELECT 'A04', 'un lien a forcement une echeance',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid = 'public.rdv_reservations'::regclass AND conname = 'rdv_empreinte_demande_complete_check'),
       '1'
UNION ALL
SELECT 'A05', 'l index de recherche par jeton existe',
       (SELECT count(*)::text FROM pg_indexes
         WHERE schemaname = 'public' AND indexname = 'idx_rdv_empreinte_demande_hash'),
       '1'
UNION ALL
SELECT 'A06', 'anon ne lit AUCUNE colonne du lien',
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'rdv_reservations'
           AND column_name LIKE 'empreinte_demande%' AND grantee = 'anon'),
       '0'
UNION ALL
SELECT 'A07', 'le verrou couvre les quatorze colonnes',
       (SELECT count(*)::text FROM unnest(ARRAY['empreinte_statut','empreinte_montant',
               'empreinte_setup_intent_id','empreinte_payment_method_id','empreinte_customer_id',
               'empreinte_debit_pi_id','empreinte_debit_montant','empreinte_debit_at',
               'empreinte_debit_erreur','annulation_tardive','empreinte_demande_jeton_hash',
               'empreinte_demande_at','empreinte_demande_expire_at','empreinte_demande_canal']) AS c
         WHERE (SELECT prosrc FROM pg_proc
                 WHERE pronamespace = 'public'::regnamespace AND proname = 'rdv_empreinte_verrou') LIKE '%' || c || '%'),
       '14'
UNION ALL
SELECT 'A08', 'il n est toujours PAS en SECURITY DEFINER',
       (SELECT CASE WHEN prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END
          FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'rdv_empreinte_verrou'),
       'SECURITY INVOKER'
UNION ALL
SELECT 'A09', 'le trigger est toujours actif sur la vraie table',
       (SELECT CASE tgenabled WHEN 'O' THEN 'actif' ELSE 'DESACTIVE' END
          FROM pg_trigger WHERE tgrelid = 'public.rdv_reservations'::regclass
            AND tgname = 'rdv_empreinte_verrou_trg'),
       'actif'
UNION ALL
SELECT 'A10', 'aucune reservation n a de lien (au premier passage)',
       (SELECT count(*)::text FROM public.rdv_reservations WHERE empreinte_demande_jeton_hash IS NOT NULL),
       '0'
UNION ALL
SELECT 'B' || lpad(ordre::text, 3, '0'), 'essai : ' || cas, obtenu, attendu FROM lien_resultats
ORDER BY 1, 2;
