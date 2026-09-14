-- LE VERROU SUR L'ARGENT DE L'EMPREINTE (lot 4 du restaurant, 14/09/2026)
--
-- 🔴 LE DÉFAUT QUE CE FICHIER FERME, MESURÉ AU PASSAGE DE LA MIGRATION D'AVANT
-- (contrôle A21). `authenticated` peut ÉCRIRE sur `rdv_reservations`, et ce
-- n'est pas théorique : le tableau de bord s'en sert vraiment depuis le
-- navigateur (app/dashboard/page.js:2036, ModalNouveauRdv.js:692). Un
-- commerçant, ou un compte compromis, pouvait donc :
--   • gonfler `empreinte_montant` juste avant de déclencher le débit, et le
--     serveur aurait prélevé ce qu'IL avait écrit, pas ce que le client a
--     accepté au moment de réserver ;
--   • coller dans `empreinte_setup_intent_id` l'identifiant d'une AUTRE
--     réservation qu'il voit dans son agenda, et DÉBITER LA CARTE D'UN AUTRE
--     CLIENT ;
--   • insérer une réservation déjà « posée », sans qu'aucune carte n'ait
--     jamais été donnée.
--
-- ⚠️ LES FRÈRES, CHERCHÉS ET NOMMÉS. `acompte_montant`, `stripe_refund_amount`
-- et `stripe_payment_intent_id` sont écrivables depuis toujours, et le sont
-- encore après ce fichier. La différence est réelle, pas une excuse : ils ne
-- servent qu'à des REMBOURSEMENTS, que Stripe plafonne au paiement d'origine.
-- Le débit d'empreinte est LE PREMIER PRÉLÈVEMENT décidé sur une valeur lue en
-- base, et il n'a aucun plafond naturel. C'est pour ça qu'il est traité ici et
-- maintenant. Le trigger est écrit pour qu'on puisse leur étendre plus tard.
--
-- LA RÈGLE : L'ÉCRAN CALCULE, LE SERVEUR DÉCIDE (27/08). Ici elle devient :
-- l'argent de l'empreinte ne s'écrit QUE par la clé de service. Le navigateur
-- qui essaie est REFUSÉ BRUYAMMENT, jamais rattrapé en silence : un écran
-- légitime ne touche pas à ces colonnes, donc une tentative est soit une
-- attaque, soit un défaut de notre côté, et les deux méritent de s'entendre.
--
-- ⚠️ PAS DE `SECURITY DEFINER`, ET C'EST LE POINT DÉLICAT. Dans une fonction
-- `SECURITY DEFINER`, `current_user` devient LE PROPRIÉTAIRE de la fonction :
-- le test se croirait toujours appelé par le serveur, et le verrou serait un
-- décor. La fonction reste donc en `SECURITY INVOKER` (le défaut), où
-- `current_user` vaut bien `service_role`, `authenticated` ou `anon` selon la
-- clé employée. Elle ne fait que comparer OLD et NEW : elle n'a besoin d'aucun
-- droit supplémentaire.
--
-- `postgres` passe aussi : c'est le rôle de l'éditeur SQL, il peut de toute
-- façon désactiver le trigger, et le bloquer n'empêcherait qu'Alex de corriger
-- une ligne à la main un soir de panne.
--
-- ⏳ PAS ENCORE PASSÉE.

BEGIN;

CREATE OR REPLACE FUNCTION public.rdv_empreinte_verrou()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  -- Ce que le navigateur n'a pas le droit de décider.
  touche text := NULL;
BEGIN
  IF current_user IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Une réservation NAÎT sans empreinte. Elle ne devient garantie qu'une fois
    -- la carte réellement enregistrée chez Stripe, et c'est le serveur qui
    -- l'écrit à ce moment-là.
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
  ELSE
    -- ⚠️ `IS DISTINCT FROM`, PAS `<>` : avec `<>`, une comparaison contre NULL
    -- rend NULL, donc faux, et passer une colonne de « posée » à vide serait
    -- passé inaperçu. C'est exactement le geste qu'un attaquant ferait pour
    -- effacer sa trace.
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
  END IF;

  IF touche IS NOT NULL THEN
    RAISE EXCEPTION 'EMPREINTE_VERROUILLEE : % ne s ecrit que par le serveur (role %).', touche, current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.rdv_empreinte_verrou() IS
  'L argent de l empreinte ne s ecrit que par la cle de service. Le navigateur qui essaie est refuse, jamais rattrape en silence : un ecran legitime ne touche pas a ces colonnes.';

DROP TRIGGER IF EXISTS rdv_empreinte_verrou_trg ON public.rdv_reservations;
CREATE TRIGGER rdv_empreinte_verrou_trg
  BEFORE INSERT OR UPDATE ON public.rdv_reservations
  FOR EACH ROW EXECUTE FUNCTION public.rdv_empreinte_verrou();

-- Une fonction de trigger se déclenche sans que PostgreSQL vérifie EXECUTE ;
-- le GRANT est posé quand même, explicite, comme pour tout objet créé ici.
GRANT EXECUTE ON FUNCTION public.rdv_empreinte_verrou() TO anon, authenticated, service_role;

COMMIT;

-- ── LES ESSAIS, EN DEVENANT VRAIMENT `authenticated` ────────────────────────
--
-- ⚠️ UN VERROU QU'ON N'ESSAIE PAS D'OUVRIR N'EST PAS UN VERROU. Les essais se
-- font sur une table TEMPORAIRE qui porte LE MÊME trigger, en prenant
-- réellement le rôle `authenticated` : aucune vraie réservation n'est lue ni
-- touchée, et le test passe par le même chemin que l'attaque.
DROP TABLE IF EXISTS pg_temp.essai_verrou;
DROP TABLE IF EXISTS pg_temp.verrou_resultats;
CREATE TEMP TABLE essai_verrou (
  id                          int,
  empreinte_statut            text,
  empreinte_montant           numeric(8,2),
  empreinte_setup_intent_id   text,
  empreinte_payment_method_id text,
  empreinte_customer_id       text,
  empreinte_debit_pi_id       text,
  empreinte_debit_montant     numeric(8,2),
  empreinte_debit_at          timestamptz,
  empreinte_debit_erreur      text,
  annulation_tardive          boolean NOT NULL DEFAULT false,
  notes_commercant            text
);
CREATE TEMP TABLE verrou_resultats (ordre int, cas text, obtenu text, attendu text);

CREATE TRIGGER essai_verrou_trg
  BEFORE INSERT OR UPDATE ON pg_temp.essai_verrou
  FOR EACH ROW EXECUTE FUNCTION public.rdv_empreinte_verrou();

DO $$
DECLARE
  schema_temp text;
BEGIN
  SELECT nspname INTO schema_temp FROM pg_namespace
   WHERE oid = pg_my_temp_schema();
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', schema_temp);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I.essai_verrou TO authenticated', schema_temp);
  -- ⚠️ ET LA TABLE DES RÉSULTATS, SANS QUOI L'ESSAI NE PEUT PAS SE RACONTER :
  -- devenu `authenticated`, le bloc n'aurait plus le droit d'y écrire, et le
  -- refus de la première tentative aurait fait tomber tout l'essai au lieu
  -- d'être noté comme le succès qu'il est.
  EXECUTE format('GRANT SELECT, INSERT ON %I.verrou_resultats TO authenticated', schema_temp);
END
$$;

-- La ligne de départ, posée par le serveur : une empreinte régulièrement posée.
INSERT INTO pg_temp.essai_verrou (id, empreinte_statut, empreinte_montant,
       empreinte_setup_intent_id, empreinte_payment_method_id, empreinte_customer_id, notes_commercant)
VALUES (1, 'posee', 120.00, 'seti_vrai', 'pm_vrai', 'cus_vrai', 'table de 6');

DO $$
DECLARE
  r record;
  n int;
BEGIN
  SET LOCAL ROLE authenticated;

  FOR r IN
    SELECT * FROM (VALUES
      (1, 'le commercant gonfle le montant garanti',
          'UPDATE pg_temp.essai_verrou SET empreinte_montant = 2000 WHERE id = 1', 'refuse'),
      (2, 'il colle le SetupIntent d un autre client',
          'UPDATE pg_temp.essai_verrou SET empreinte_setup_intent_id = ''seti_autre'' WHERE id = 1', 'refuse'),
      (3, 'il remplace la carte',
          'UPDATE pg_temp.essai_verrou SET empreinte_payment_method_id = ''pm_autre'' WHERE id = 1', 'refuse'),
      (4, 'il efface sa trace (statut vide)',
          'UPDATE pg_temp.essai_verrou SET empreinte_statut = NULL WHERE id = 1', 'refuse'),
      (5, 'il declare un debit deja fait',
          'UPDATE pg_temp.essai_verrou SET empreinte_debit_montant = 120 WHERE id = 1', 'refuse'),
      (6, 'il declare l annulation tardive lui-meme',
          'UPDATE pg_temp.essai_verrou SET annulation_tardive = true WHERE id = 1', 'refuse'),
      (7, 'il insere une reservation deja garantie',
          'INSERT INTO pg_temp.essai_verrou (id, empreinte_statut, empreinte_montant, empreinte_payment_method_id, empreinte_customer_id) VALUES (2, ''posee'', 900, ''pm_x'', ''cus_x'')', 'refuse'),
      (8, 'il modifie sa note, sans toucher a l argent',
          'UPDATE pg_temp.essai_verrou SET notes_commercant = ''table pres de la fenetre'' WHERE id = 1', 'accepte'),
      (9, 'il insere une reservation normale, sans empreinte',
          'INSERT INTO pg_temp.essai_verrou (id, notes_commercant) VALUES (3, ''table de 2'')', 'accepte'),
      (10, 'il reecrit la meme valeur d empreinte (aucun changement)',
          'UPDATE pg_temp.essai_verrou SET empreinte_montant = 120.00 WHERE id = 1', 'accepte')
    ) AS t(ordre, cas, sql, attendu)
  LOOP
    BEGIN
      EXECUTE r.sql;
      INSERT INTO verrou_resultats VALUES (r.ordre, r.cas, 'accepte', r.attendu);
    EXCEPTION WHEN insufficient_privilege THEN
      INSERT INTO verrou_resultats VALUES (r.ordre, r.cas, 'refuse', r.attendu);
    WHEN others THEN
      INSERT INTO verrou_resultats VALUES (r.ordre, r.cas, 'autre erreur : ' || SQLERRM, r.attendu);
    END;
  END LOOP;

  RESET ROLE;

  -- Et le serveur, lui, doit pouvoir écrire : un verrou qui bloque TOUT LE
  -- MONDE empêcherait simplement l'empreinte d'exister.
  BEGIN
    UPDATE pg_temp.essai_verrou SET empreinte_montant = 140.00, empreinte_statut = 'debitee' WHERE id = 1;
    SELECT count(*) INTO n FROM pg_temp.essai_verrou WHERE id = 1 AND empreinte_montant = 140.00;
    INSERT INTO verrou_resultats VALUES (20, 'le serveur ecrit le debit', n::text || ' ligne mise a jour', '1 ligne mise a jour');
  EXCEPTION WHEN others THEN
    INSERT INTO verrou_resultats VALUES (20, 'le serveur ecrit le debit', 'refuse : ' || SQLERRM, '1 ligne mise a jour');
  END;

  -- Et le montant du client n'a pas bougé pendant les dix tentatives.
  SELECT count(*) INTO n FROM pg_temp.essai_verrou WHERE id = 2;
  INSERT INTO verrou_resultats VALUES (21, 'la reservation forgee n existe pas', n::text, '0');
END
$$;

-- ── CONTRÔLE : une ligne par vérification, sa valeur et l'attendu ───────────
SELECT 'A01' AS ordre, 'la fonction du verrou existe' AS controle,
       (SELECT count(*)::text FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace AND proname = 'rdv_empreinte_verrou') AS valeur,
       '1' AS attendu
UNION ALL
SELECT 'A02', 'elle n est PAS en SECURITY DEFINER (sinon current_user ment)',
       (SELECT CASE WHEN prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END
          FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'rdv_empreinte_verrou'),
       'SECURITY INVOKER'
UNION ALL
SELECT 'A03', 'son search_path est fige',
       COALESCE((SELECT array_to_string(proconfig, ',') FROM pg_proc
                  WHERE pronamespace = 'public'::regnamespace AND proname = 'rdv_empreinte_verrou'), 'AUCUN'),
       'search_path=public'
UNION ALL
SELECT 'A04', 'le trigger est pose sur rdv_reservations',
       COALESCE((SELECT tgname::text FROM pg_trigger
                  WHERE tgrelid = 'public.rdv_reservations'::regclass
                    AND tgname = 'rdv_empreinte_verrou_trg' AND NOT tgisinternal), 'ABSENT'),
       'rdv_empreinte_verrou_trg'
UNION ALL
SELECT 'A05', 'il couvre l INSERT ET l UPDATE, avant l ecriture, ligne par ligne',
       (SELECT CASE WHEN (tgtype & 4) > 0 AND (tgtype & 16) > 0 AND (tgtype & 2) > 0 AND (tgtype & 1) > 0
                    THEN 'BEFORE INSERT OR UPDATE, FOR EACH ROW' ELSE 'incomplet (tgtype=' || tgtype || ')' END
          FROM pg_trigger WHERE tgrelid = 'public.rdv_reservations'::regclass
            AND tgname = 'rdv_empreinte_verrou_trg'),
       'BEFORE INSERT OR UPDATE, FOR EACH ROW'
UNION ALL
SELECT 'A06', 'le trigger est actif',
       (SELECT CASE tgenabled WHEN 'O' THEN 'actif' WHEN 'D' THEN 'DESACTIVE' ELSE tgenabled::text END
          FROM pg_trigger WHERE tgrelid = 'public.rdv_reservations'::regclass
            AND tgname = 'rdv_empreinte_verrou_trg'),
       'actif'
UNION ALL
SELECT 'A07', 'les dix colonnes verrouillees sont nommees dans la fonction',
       (SELECT count(*)::text FROM unnest(ARRAY['empreinte_statut','empreinte_montant',
               'empreinte_setup_intent_id','empreinte_payment_method_id','empreinte_customer_id',
               'empreinte_debit_pi_id','empreinte_debit_montant','empreinte_debit_at',
               'empreinte_debit_erreur','annulation_tardive']) AS c
         WHERE (SELECT prosrc FROM pg_proc
                 WHERE pronamespace = 'public'::regnamespace AND proname = 'rdv_empreinte_verrou') LIKE '%' || c || '%'),
       '10'
UNION ALL
SELECT 'A08', 'aucune comparaison <> sur une colonne verrouillee (NULL passerait)',
       (SELECT CASE WHEN prosrc ~ 'NEW\.empreinte_[a-z_]+ <>' OR prosrc ~ 'NEW\.annulation_tardive <>'
                    THEN 'IL EN RESTE' ELSE 'aucune' END
          FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'rdv_empreinte_verrou'),
       'aucune'
UNION ALL
SELECT 'B' || lpad(ordre::text, 3, '0'), 'essai : ' || cas, obtenu, attendu FROM verrou_resultats
ORDER BY 1, 2;
