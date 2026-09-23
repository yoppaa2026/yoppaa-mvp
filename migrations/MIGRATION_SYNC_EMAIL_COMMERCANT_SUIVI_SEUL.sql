-- ═══════════════════════════════════════════════════════════════════════════
-- LE TRIGGER PROPAGE UN CHANGEMENT, IL N'IMPOSE PAS UNE VALEUR
-- Écrite le 23/09/2026 — CORRIGE `MIGRATION_SYNC_EMAIL_COMMERCANT.sql`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 CE QUE LE CONTRÔLE D01 A MONTRÉ, ET QUE JE N'AVAIS PAS PRÉVU. Un dossier
-- portait déjà une adresse différente de son email de connexion : « Chez
-- Momo », en Vendre et publiée, se connecte avec le compte d'Alex et reçoit ses
-- emails sur une boîte interne `@yoppaa.app`. Ce n'est pas une faute de frappe,
-- c'est un choix : on se connecte avec un compte, la fiche écrit ailleurs.
--
-- La première version du trigger disait « le dossier suit la connexion » :
--
--     UPDATE commercants SET email = NEW.email WHERE auth_user_id = NEW.id
--
-- Le jour où Alex change son email, cette ligne ÉCRASE la boîte dédiée par son
-- adresse personnelle, sur TOUTES les fiches rattachées à son compte, sans que
-- personne ne le demande et sans que rien ne le dise. Les commandes de Chez
-- Momo arriveraient dans sa boîte perso, et le choix d'origine serait perdu,
-- irrattrapable puisque l'ancienne valeur n'existe plus nulle part.
--
-- ⚠️ LA RÈGLE JUSTE TIENT EN UNE LIGNE : on propage un CHANGEMENT, on n'impose
-- pas une VALEUR. Un dossier qui portait l'ancienne adresse prend la nouvelle,
-- parce qu'il la suivait. Un dossier qui portait autre chose garde la sienne,
-- parce que quelqu'un l'a décidé.
--
-- ⚠️ ET ON NE REMPLIT PAS UN VIDE. Un dossier sans email ne « suivait » rien :
-- lui écrire l'adresse de connexion à l'occasion d'un changement serait
-- inventer une décision. S'il en existe, ils se traitent pour eux-mêmes.
--
-- ⚠️ CE QUI NE CHANGE PAS : le trigger, ses droits, son `AFTER UPDATE OF
-- email`, sa condition `WHEN`, et le fait qu'il ne peut jamais faire échouer
-- une authentification. Seul le corps de la fonction bouge.
--
-- Idempotente : ré-exécutable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_email_commercant()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    UPDATE public.commercants
       SET email = NEW.email
     WHERE auth_user_id = NEW.id
       -- 🔴 LA CONDITION QUI PROTÈGE UN CHOIX. Sans elle, un dossier qui a
       -- délibérément une autre adresse se fait écraser au premier changement
       -- d'email du compte auquel il est rattaché.
       AND lower(email) = lower(OLD.email)
       AND email IS DISTINCT FROM NEW.email;
  EXCEPTION WHEN OTHERS THEN
    -- 🔴 NE JAMAIS FAIRE ÉCHOUER L'AUTHENTIFICATION. Mieux vaut un dossier en
    -- retard qu'un commerçant qui ne peut plus se connecter.
    RAISE WARNING 'sync_email_commercant : email non propage pour auth_user_id=% (%)', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.sync_email_commercant() IS
  'Propage un changement d''email de auth.users vers commercants.email, UNIQUEMENT sur les dossiers qui portaient l''ancienne adresse. Un dossier avec une adresse choisie garde la sienne. Ne peut jamais faire echouer l''authentification.';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — une ligne par vérification, la valeur ET l'attendu, tout en text.
-- ⚠️ AUCUNE ADRESSE NE SORT D'ICI : on compte des lignes.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'C01 la fonction ne touche que ce qui suivait l ancienne adresse'::text AS controle,
       COALESCE((SELECT CASE WHEN pg_get_functiondef(p.oid) LIKE '%lower(email) = lower(OLD.email)%'
                             THEN 'oui' ELSE 'NON' END
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='sync_email_commercant' LIMIT 1), 'FONCTION ABSENTE')::text AS valeur,
       'oui'::text AS attendu
UNION ALL
SELECT 'C02 elle est toujours SECURITY DEFINER'::text,
       COALESCE((SELECT CASE WHEN p.prosecdef THEN 'oui' ELSE 'NON' END
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='sync_email_commercant' LIMIT 1), 'FONCTION ABSENTE')::text,
       'oui'::text
UNION ALL
SELECT 'C03 son search_path est toujours fige'::text,
       COALESCE((SELECT array_to_string(p.proconfig, ', ')
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='sync_email_commercant' LIMIT 1), 'AUCUN')::text,
       'search_path=public'::text
UNION ALL
SELECT 'C04 elle ne peut toujours pas faire echouer une connexion'::text,
       COALESCE((SELECT CASE WHEN pg_get_functiondef(p.oid) LIKE '%EXCEPTION WHEN OTHERS%'
                             THEN 'oui' ELSE 'NON' END
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='sync_email_commercant' LIMIT 1), 'FONCTION ABSENTE')::text,
       'oui'::text
UNION ALL
SELECT 'C05 le trigger est intact et actif'::text,
       COALESCE((SELECT CASE tgenabled WHEN 'O' THEN 'actif' ELSE 'DESACTIVE' END
                   FROM pg_trigger
                  WHERE tgrelid='auth.users'::regclass
                    AND tgname='trg_sync_email_commercant'), 'TRIGGER ABSENT')::text,
       'actif'::text
UNION ALL
SELECT 'C06 supabase_auth_admin peut toujours l executer'::text,
       (CASE WHEN has_function_privilege('supabase_auth_admin',
                    'public.sync_email_commercant()', 'EXECUTE') THEN 'oui' ELSE 'NON' END)::text,
       'oui'::text
UNION ALL
SELECT 'D01 dossiers dont l email DIFFERE de celui de connexion (nombre seul)'::text,
       (SELECT count(*)::text FROM public.commercants c
          JOIN auth.users u ON u.id = c.auth_user_id
         WHERE lower(c.email) IS DISTINCT FROM lower(u.email))::text,
       '1 attendu : Chez Momo, et sa boite dediee est desormais PROTEGEE'::text
UNION ALL
SELECT 'D02 dossiers sans aucune adresse (le trigger ne les remplira pas)'::text,
       (SELECT count(*)::text FROM public.commercants WHERE email IS NULL OR btrim(email) = ''),
       '0 ; si > 0, ils se traitent pour eux-memes'::text
ORDER BY 1;
