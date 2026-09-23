-- ═══════════════════════════════════════════════════════════════════════════
-- L'EMAIL DU DOSSIER SUIT L'EMAIL DE CONNEXION
-- Écrite le 23/09/2026 — pour l'écran « changer mon email » de « Mon compte »
-- ═══════════════════════════════════════════════════════════════════════════
--
-- POURQUOI. Un commerçant va enfin pouvoir changer son email de connexion
-- depuis son tableau de bord. Or cet email vit à DEUX endroits :
--
--   auth.users.email     → ce avec quoi il se connecte
--   commercants.email    → ce que lisent la facturation, les relances, le cron
--                          des 30 jours, l'export comptable et Stripe Billing
--
-- Changer l'un sans l'autre, c'est un commerçant qui se connecte avec sa
-- nouvelle adresse et reçoit ses factures sur l'ancienne. Personne ne s'en
-- aperçoit avant la première réclamation, et à ce moment-là la facture est
-- partie dans le vide.
--
-- 🔴 POURQUOI UN TRIGGER, ET PAS UNE ÉCRITURE DEPUIS L'ÉCRAN. Parce que
-- l'écran NE PEUT PAS savoir quand le changement prend effet. `Secure email
-- change` est activé sur ce projet (vérifié le 12/09) : Supabase envoie un lien
-- aux DEUX adresses, et l'email d'authentification ne bascule qu'une fois les
-- DEUX confirmées, ce qui peut arriver dix minutes ou trois jours plus tard,
-- depuis un autre appareil, sans que Yoppaa soit ouvert. Une écriture au moment
-- du clic écrirait donc une adresse qui n'est pas encore la sienne, et le
-- resterait si jamais il ne confirmait pas.
--
-- ⚠️ ET CE RÉGLAGE EST CE QUI PROTÈGE LA CONSOLE D'ADMINISTRATION : être admin,
-- ici, c'est détenir une adresse. Sans la double confirmation, n'importe qui
-- pourrait demander à basculer vers l'adresse d'Alex. On ne le contourne pas,
-- on se branche derrière.
--
-- 🔴 LE TRIGGER NE PEUT PAS FAIRE ÉCHOUER UNE CONNEXION. Un trigger posé sur
-- `auth.users` s'exécute dans la transaction du système d'authentification : la
-- moindre exception non capturée ferait échouer le changement d'email, et
-- potentiellement d'autres écritures d'auth. On capture donc tout, et on écrit
-- un WARNING dans les journaux Postgres plutôt que de rester muet. Un silence
-- s'empile ; un avertissement se retrouve.
--
-- ⚠️ ON N'ALIGNE PAS L'EXISTANT, ET C'EST VOLONTAIRE. Si des dossiers divergent
-- déjà, les écraser ici remplacerait une adresse choisie par une adresse
-- devinée, sans que personne ne l'ait demandé. Le contrôle D01 les COMPTE
-- (le nombre seul, aucune adresse ne sort), et la décision revient à Alex.
--
-- ⚠️ LE FRÈRE, NOMMÉ ET NON TRAITÉ : `clients.email` (les Yoppers) diverge de
-- la même façon, et `MIGRATION_CLIENTS_INSERTION.sql` le contrôlait déjà. Il
-- n'est pas traité ici pour une raison précise : un Yopper n'a aujourd'hui
-- AUCUN écran pour changer son email, donc aucune divergence nouvelle ne peut
-- naître de ce côté, et la table `clients` est anonymisée à la suppression du
-- compte. Y écrire demande son propre examen, pas un ajout en passant.
--
-- Idempotente : ré-exécutable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 0. LE TERRAIN, VÉRIFIÉ AVANT D'ÉCRIRE ──────────────────────────────────
-- ⚠️ Sans `supabase_auth_admin`, le GRANT plus bas échouerait sur un message
-- Postgres obscur, à la ligne 90 d'un fichier. Autant le dire ici, en clair.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    RAISE EXCEPTION 'RIEN N A ETE CREE. Le role supabase_auth_admin est introuvable : cette base n est pas un projet Supabase, ou le role a ete renomme. Le trigger serait pose sans pouvoir s executer.';
  END IF;
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'RIEN N A ETE CREE. La table auth.users est introuvable.';
  END IF;
END $$;

-- ─── 1. LA FONCTION ─────────────────────────────────────────────────────────
-- SECURITY DEFINER : elle est déclenchée par le système d'authentification,
-- qui n'a aucun droit sur `public.commercants` et ne doit pas en recevoir.
-- `search_path` figé : une fonction SECURITY DEFINER sans search_path fixe est
-- une porte ouverte, c'est la règle maison depuis l'audit du 01/09.
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
       AND email IS DISTINCT FROM NEW.email;
  EXCEPTION WHEN OTHERS THEN
    -- 🔴 NE JAMAIS FAIRE ÉCHOUER L'AUTHENTIFICATION. Le cas réel : deux
    -- dossiers finiraient avec la même adresse si un index unique existe sur
    -- `commercants.email`. Mieux vaut un dossier en retard qu'un commerçant
    -- qui ne peut plus se connecter.
    RAISE WARNING 'sync_email_commercant : email non propage pour auth_user_id=% (%)', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.sync_email_commercant() IS
  'Propage un changement d''email de auth.users vers commercants.email. Ne peut jamais faire echouer l''authentification : toute erreur devient un WARNING.';

-- ─── 2. LES DROITS ──────────────────────────────────────────────────────────
-- ⚠️ `supabase_auth_admin` est le rôle qui écrit dans `auth.users`, donc celui
-- qui déclenchera ce trigger. Personne d'autre n'a besoin de l'exécuter.
REVOKE ALL ON FUNCTION public.sync_email_commercant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_email_commercant() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.sync_email_commercant() TO postgres;

-- ─── 3. LE TRIGGER ──────────────────────────────────────────────────────────
-- ⚠️ `AFTER`, jamais `BEFORE` : on propage une vérité déjà acquise, on ne
-- participe pas à la décision.
-- ⚠️ `OF email` ET la clause `WHEN` : sans elles, la fonction tournerait à
-- CHAQUE écriture sur `auth.users`, c'est-à-dire à chaque connexion de chaque
-- utilisateur, pour ne rien faire.
DROP TRIGGER IF EXISTS trg_sync_email_commercant ON auth.users;
CREATE TRIGGER trg_sync_email_commercant
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_email_commercant();

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — une ligne par vérification, la valeur ET l'attendu, tout en text.
-- ⚠️ AUCUNE ADRESSE NE SORT D'ICI. D01 et D02 comptent des lignes, ils n'en
-- affichent aucune : ce sont des données personnelles.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'C01 la fonction existe'::text AS controle,
       COALESCE((SELECT 'oui' FROM pg_proc p
                   JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='sync_email_commercant' LIMIT 1), 'NON')::text AS valeur,
       'oui'::text AS attendu
UNION ALL
SELECT 'C02 elle est SECURITY DEFINER'::text,
       COALESCE((SELECT CASE WHEN p.prosecdef THEN 'oui' ELSE 'NON' END FROM pg_proc p
                   JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='sync_email_commercant' LIMIT 1), 'FONCTION ABSENTE')::text,
       'oui'::text
UNION ALL
SELECT 'C03 son search_path est fige'::text,
       COALESCE((SELECT array_to_string(p.proconfig, ', ') FROM pg_proc p
                   JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='sync_email_commercant' LIMIT 1), 'AUCUN')::text,
       'search_path=public'::text
UNION ALL
SELECT 'C04 le trigger existe sur auth.users'::text,
       COALESCE((SELECT tgname::text FROM pg_trigger
                  WHERE tgrelid='auth.users'::regclass
                    AND tgname='trg_sync_email_commercant' AND NOT tgisinternal), 'ABSENT')::text,
       'trg_sync_email_commercant'::text
UNION ALL
SELECT 'C05 il se declenche APRES, et seulement sur un changement'::text,
       COALESCE((SELECT CASE WHEN (t.tgtype & 2) = 0 THEN 'AFTER' ELSE 'BEFORE' END
                   || CASE WHEN t.tgqual IS NOT NULL THEN ' + condition WHEN' ELSE ' SANS CONDITION' END
                   FROM pg_trigger t
                  WHERE t.tgrelid='auth.users'::regclass
                    AND t.tgname='trg_sync_email_commercant'), 'TRIGGER ABSENT')::text,
       'AFTER + condition WHEN'::text
UNION ALL
SELECT 'C06 il est actif (pas desactive)'::text,
       COALESCE((SELECT CASE tgenabled WHEN 'O' THEN 'actif' WHEN 'D' THEN 'DESACTIVE' ELSE tgenabled::text END
                   FROM pg_trigger
                  WHERE tgrelid='auth.users'::regclass
                    AND tgname='trg_sync_email_commercant'), 'TRIGGER ABSENT')::text,
       'actif'::text
UNION ALL
SELECT 'C07 supabase_auth_admin peut l executer'::text,
       COALESCE((SELECT CASE WHEN has_function_privilege('supabase_auth_admin',
                                   'public.sync_email_commercant()', 'EXECUTE')
                             THEN 'oui' ELSE 'NON' END), 'ROLE INTROUVABLE')::text,
       'oui'::text
UNION ALL
-- ⚠️ `has_function_privilege('public', ...)` N'EXISTE PAS : PUBLIC n'est pas un
-- rôle, c'est l'absence de rôle. On lit donc l'ACL, où une entrée PUBLIC
-- s'écrit sans nom devant le `=`. Et une ACL vide ne veut pas dire « fermé » :
-- sans le moindre GRANT explicite, PostgreSQL laisse EXECUTE à tout le monde.
SELECT 'C08 PUBLIC ne peut PAS l executer'::text,
       COALESCE((SELECT CASE
                   WHEN p.proacl IS NULL THEN 'PEUT (aucun GRANT explicite)'
                   WHEN EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%') THEN 'PEUT'
                   ELSE 'ne peut pas' END
                   FROM pg_proc p
                   JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='sync_email_commercant' LIMIT 1),
                'FONCTION ABSENTE')::text,
       'ne peut pas'::text
UNION ALL
SELECT 'D01 dossiers dont l email DIFFERE de celui de connexion (nombre seul)'::text,
       (SELECT count(*)::text FROM public.commercants c
          JOIN auth.users u ON u.id = c.auth_user_id
         WHERE lower(c.email) IS DISTINCT FROM lower(u.email))::text,
       '0 ; si > 0, ce sont des divergences ANTERIEURES, a examiner avant d aligner'::text
UNION ALL
SELECT 'D02 dossiers sans compte de connexion rattache (nombre seul)'::text,
       (SELECT count(*)::text FROM public.commercants WHERE auth_user_id IS NULL),
       'pour information : le trigger ne peut rien pour eux'::text
UNION ALL
SELECT 'D03 index unique sur commercants.email'::text,
       COALESCE((SELECT string_agg(i.relname::text, ', ')
                   FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
                  WHERE x.indrelid='public.commercants'::regclass AND x.indisunique
                    AND pg_get_indexdef(i.oid) LIKE '%(email)%'), 'aucun')::text,
       'pour information : s il y en a un, deux dossiers ne peuvent pas partager une adresse'::text
ORDER BY 1;
