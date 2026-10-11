-- ════════════════════════════════════════════════════════════════════════════
-- UN SECOND COMPTE ADMIN : CAROLE (11/10)
-- Demande d'Alex : sa compagne l'aide à encoder les fiches commerçants depuis
-- l'administration. Option retenue : un compte À SON NOM (sa propre double
-- authentification, des sessions indépendantes), plutôt que le partage du
-- compte d'Alex (une déconnexion coupe toutes les sessions du compte).
-- ════════════════════════════════════════════════════════════════════════════
--
-- CE QUI CHANGE : `is_yoppaa_admin()` accepte une LISTE COURTE d'adresses, la
-- même que `ADMIN_EMAILS` (lib/admin-identite.js). Le code à six chiffres
-- (`aal2`) reste EXIGÉ pour chacune : un mot de passe seul n'ouvre rien.
--
-- ⚠️ AVANT DE CHANGER QUOI QUE CE SOIT, on vérifie qu'AUCUNE autre fonction ni
-- AUCUNE policy ne compare encore une adresse en dur : sinon Carole aurait la
-- moitié des droits, ou un ancien contrôle laisserait passer sans le code. Si
-- c'est le cas, tout s'arrête et RIEN n'est modifié (une seule transaction).
--
-- GRANT : aucun objet créé ; `CREATE OR REPLACE` garde les droits, redonnés
-- quand même explicitement. Idempotent. Date : 2026-10-11
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  autres text;
BEGIN
  SELECT string_agg(x, ', ') INTO autres FROM (
    SELECT 'fonction ' || p.proname AS x
      FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
     WHERE s.nspname = 'public' AND p.proname <> 'is_yoppaa_admin'
       AND p.prosrc ILIKE '%verstappenalexandre@gmail.com%'
    UNION ALL
    SELECT 'policy ' || tablename || '.' || policyname || ' (' || permissive || ')'
      FROM pg_policies
     WHERE (coalesce(qual, '') || coalesce(with_check, '')) ILIKE '%verstappenalexandre@gmail.com%'
  ) t;
  IF autres IS NOT NULL THEN
    RAISE EXCEPTION 'L''adresse admin est encore écrite ailleurs en base : %. Rien n''a été modifié.', autres;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_yoppaa_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    lower(auth.email()) IN ('verstappenalexandre@gmail.com', 'carole.mackowiak@gmail.com')
    AND coalesce(auth.jwt() ->> 'aal', '') = 'aal2',
    false
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_yoppaa_admin() TO anon, authenticated;

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
-- Un essai = une session simulée, posée puis évaluée dans la même fonction.
CREATE OR REPLACE FUNCTION pg_temp.essai_admin(claims text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', claims, true);
  PERFORM set_config('request.jwt.claim.email', coalesce(claims::jsonb ->> 'email', ''), true);
  RETURN public.is_yoppaa_admin()::text;
END $$;

SELECT * FROM (
  SELECT 1 AS n, 'la fonction exige toujours le code'::text AS controle,
         (SELECT CASE WHEN prosrc ILIKE '%aal2%' THEN 'oui' ELSE 'NON' END
            FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
           WHERE s.nspname = 'public' AND p.proname = 'is_yoppaa_admin')::text AS valeur,
         'oui'::text AS attendu
  UNION ALL SELECT 2, 'Alex, mot de passe seul', pg_temp.essai_admin('{"email":"verstappenalexandre@gmail.com","aal":"aal1"}'), 'false'
  UNION ALL SELECT 3, 'Alex, avec le code', pg_temp.essai_admin('{"email":"verstappenalexandre@gmail.com","aal":"aal2"}'), 'true'
  UNION ALL SELECT 4, 'Carole, mot de passe seul', pg_temp.essai_admin('{"email":"carole.mackowiak@gmail.com","aal":"aal1"}'), 'false'
  UNION ALL SELECT 5, 'Carole, avec le code', pg_temp.essai_admin('{"email":"carole.mackowiak@gmail.com","aal":"aal2"}'), 'true'
  UNION ALL SELECT 6, 'Carole, adresse en majuscules, avec le code', pg_temp.essai_admin('{"email":"Carole.Mackowiak@gmail.com","aal":"aal2"}'), 'true'
  UNION ALL SELECT 7, 'un autre compte, avec un code', pg_temp.essai_admin('{"email":"commercant@exemple.be","aal":"aal2"}'), 'false'
  UNION ALL SELECT 8, 'un alias de l adresse de Carole, avec un code', pg_temp.essai_admin('{"email":"carole.mackowiak+x@gmail.com","aal":"aal2"}'), 'false'
  UNION ALL SELECT 9, 'personne', pg_temp.essai_admin('{}'), 'false'
  UNION ALL SELECT 10, 'la fonction reste SECURITY DEFINER',
         (SELECT p.prosecdef::text FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
           WHERE s.nspname = 'public' AND p.proname = 'is_yoppaa_admin'), 'true'
  UNION ALL SELECT 11, 'aucune autre fonction n ecrit une adresse admin',
         (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
           WHERE s.nspname = 'public' AND p.proname <> 'is_yoppaa_admin'
             AND (p.prosrc ILIKE '%verstappenalexandre@gmail.com%' OR p.prosrc ILIKE '%carole.mackowiak@gmail.com%'))::text,
         '0'
  UNION ALL SELECT 12, 'policies qui ecrivent une adresse admin (nom:type)',
         coalesce((SELECT string_agg(tablename || '.' || policyname || ':' || permissive, ', ')
            FROM pg_policies
           WHERE (coalesce(qual, '') || coalesce(with_check, '')) ILIKE ANY (ARRAY['%verstappenalexandre@gmail.com%', '%carole.mackowiak@gmail.com%'])), 'aucune')::text,
         'aucune'
) t ORDER BY n;
