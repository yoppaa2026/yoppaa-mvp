-- L'ADMIN N'EST ADMIN QU'AVEC LE CODE À SIX CHIFFRES (29/09/2026)
--
-- Étape 4 de la double authentification, voulue par Alex le 29/09. Les étapes
-- 1 à 3 sont passées et vérifiées : l'adresse ne vit plus qu'ici et dans
-- lib/admin-identite.js (MIGRATION_ADMIN_CENTRALISE.sql), Alex s'est enrôlé
-- avec Proton Authenticator, et la porte de /admin lui a bien demandé le code
-- après une reconnexion (« TEST OK »).
--
-- CE QUE FAIT CETTE MIGRATION : `is_yoppaa_admin()` exige désormais que la
-- session ait donné le code (`aal2` dans le jeton). Le mot de passe seul ne
-- donne plus AUCUN droit d'administration en base : ni les 50 policies qui
-- passent par la fonction, ni le déclencheur qui réserve le statut et la
-- publication des fiches. Côté serveur, le même jour :
-- `EXIGER_DOUBLE_AUTH_ADMIN = true` (lib/api-auth.js).
--
-- ⚠️ LE CONTRÔLE ESSAIE LA FONCTION sur quatre sessions simulées, dans cette
-- même transaction : l'admin sans code, l'admin avec code, un autre compte
-- avec code, et personne. On ne se contente pas de relire son texte.
--
-- 🔙 POUR REVENIR EN ARRIÈRE (si l'administration devenait inaccessible) :
--   CREATE OR REPLACE FUNCTION public.is_yoppaa_admin()
--   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
--   AS $$ SELECT COALESCE(auth.email() = 'verstappenalexandre@gmail.com', false) $$;
-- et repasser `EXIGER_DOUBLE_AUTH_ADMIN` à false.
--
-- Idempotent. Une seule transaction.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_yoppaa_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    auth.email() = 'verstappenalexandre@gmail.com'
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

SELECT 'A1' AS n, 'la fonction exige le code' AS controle,
       (SELECT CASE WHEN prosrc ILIKE '%aal2%' THEN 'oui' ELSE 'NON' END
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'is_yoppaa_admin') AS valeur,
       'oui' AS attendu
UNION ALL
SELECT 'B1', 'admin, mot de passe seul',
       pg_temp.essai_admin('{"email":"verstappenalexandre@gmail.com","aal":"aal1"}'), 'false'
UNION ALL
SELECT 'B2', 'admin, avec le code',
       pg_temp.essai_admin('{"email":"verstappenalexandre@gmail.com","aal":"aal2"}'), 'true'
UNION ALL
SELECT 'B3', 'un autre compte, avec un code',
       pg_temp.essai_admin('{"email":"commercant@exemple.be","aal":"aal2"}'), 'false'
UNION ALL
SELECT 'B4', 'personne',
       pg_temp.essai_admin('{}'), 'false'
UNION ALL
SELECT 'C1', 'policies qui passent par la fonction',
       (SELECT count(*)::text FROM pg_policies
         WHERE permissive = 'PERMISSIVE'
           AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'is_(yoppaa_)?admin\('),
       'pour information'
ORDER BY 1;
