-- ═══════════════════════════════════════════════════════════════════════════
-- NETTOYAGE DES DROITS `anon` + UNE SEULE DÉFINITION DE « ADMINISTRATEUR »
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Suite de l'audit du 01/09. Rappel de ce qu'il a établi :
--   ✅ AUCUNE FUITE DE LECTURE. Toutes les policies atteignables par `anon`
--      bornent sur `auth.uid()` ou `is_admin()`, qui valent NULL sans jeton.
--   🟠 UN seul trou réel : `demandes_commande` accepte un INSERT public sans
--      aucune contrainte, sur une table que PLUS RIEN n'utilise.
--   🟠 Douze tables personnelles portent des droits `anon` dormants.
--   🔴 `is_admin` et `is_yoppaa_admin` disent la MÊME chose de DEUX façons.
--
-- ⚠️ CE QUI A ÉTÉ MESURÉ AVANT D'ÉCRIRE UNE SEULE LIGNE, table par table :
-- qui lit quoi, et avec quelle clé. Une route serveur utilise la clé de
-- service, qui ignore droits et RLS : lui retirer `anon` ne change rien. Un
-- écran du navigateur utilise `anon` sans compte, `authenticated` avec.
-- Résultat : presque toutes les lectures navigateur viennent du TABLEAU DE
-- BORD, où le commerçant est connecté. `authenticated` n'est jamais touché ici.
--
-- ⚠️ ON NE RÉVOQUE QUE `anon`, JAMAIS `authenticated`, JAMAIS `service_role`.

-- ─── 1. UNE SEULE DÉFINITION DE « ADMINISTRATEUR » ──────────────────────────
--
-- 🔴 IL Y EN AVAIT DEUX, ET ELLES DIFFÉRAIENT :
--     is_admin()        → auth.jwt() ->> 'email' IN ('…')   — 10 policies
--     is_yoppaa_admin() → auth.email() = '…'                — 19 policies
--
-- Les deux sont saines aujourd'hui. Le défaut est à venir : le jour où
-- l'adresse change, en corriger une laisse DIX-NEUF ou DIX policies mentir.
-- C'est le motif qui a produit le plus de défauts sur ce projet.
--
-- ⚠️ ON NE SUPPRIME NI L'UNE NI L'AUTRE : 29 policies les nomment. `is_admin`
-- délègue désormais, l'adresse ne vit plus qu'à UN endroit.
CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT public.is_yoppaa_admin()
$function$;

COMMENT ON FUNCTION public.is_admin() IS
  'Délègue à is_yoppaa_admin(). L''adresse administrateur ne vit qu''à UN endroit depuis le 01/09.';

-- ─── 2. LA SEULE PORTE RÉELLEMENT OUVERTE ───────────────────────────────────
--
-- `demandes_commande` acceptait un INSERT public avec `CHECK=true`, donc sans
-- aucune contrainte : n'importe qui pouvait créer des lignes attribuées à
-- n'importe quel commerçant.
--
-- 🔴 ET LA TABLE EST MORTE. Mesuré : la seule mention applicative est sa
-- SUPPRESSION dans `app/api/yopper/supprimer-compte`. Rien n'y écrit, rien
-- n'y lit.
--
-- ⚠️ ON NE LA SUPPRIME PAS : elle porte peut-être des lignes anciennes, et une
-- table se détruit une fois. On ferme la porte, on garde le contenu. Le
-- contrôle ci-dessous dit combien de lignes elle contient, pour décider après.
DROP POLICY IF EXISTS "insertion demandes publique" ON public.demandes_commande;
DROP POLICY IF EXISTS "lecture demandes commerçant" ON public.demandes_commande;
REVOKE ALL ON public.demandes_commande FROM anon;

-- ─── 3. LES DROITS DORMANTS, LÀ OÙ RIEN NE LES RÉCLAME ──────────────────────
--
-- Ces tables n'ont AUCUNE policy atteignable par `anon` qui lui rende quoi que
-- ce soit, et aucun écran ne les lit sans compte. Le droit ne servait à rien.
REVOKE ALL ON public.commandes               FROM anon;
REVOKE ALL ON public.commande_articles       FROM anon;
REVOKE ALL ON public.favoris                 FROM anon;
REVOKE ALL ON public.suggestions_commercants FROM anon;
REVOKE ALL ON public.bons_cadeaux            FROM anon;
REVOKE ALL ON public.abonnements             FROM anon;
REVOKE ALL ON public.fidelite_cartes         FROM anon;
REVOKE ALL ON public.fidelite_mouvements     FROM anon;

-- ⚠️ `avis` : le Yopper ne lit PAS cette table. Les avis publics d'une fiche
-- passent par la VUE `avis_public` (vérifié : trois écrans l'utilisent, aucun
-- ne touche la table). Révoquer ici ne retire donc rien à personne.
REVOKE ALL ON public.avis FROM anon;

-- ⚠️ `pre_inscriptions` : le formulaire de la landing passe par une ROUTE
-- serveur (`/api/pre-inscription`, protégée par Turnstile), jamais par le
-- navigateur. Mesuré : cinq fichiers serveur, zéro navigateur.
REVOKE ALL ON public.pre_inscriptions FROM anon;

-- ─── 4. LES DEUX QUI GARDENT LEUR `INSERT`, ET POURQUOI ─────────────────────
--
-- 🔴 CELLES-CI CASSERAIENT DES PARCOURS ENTIERS. Leurs policies sont
-- explicitement écrites pour `anon, authenticated`, et elles font vivre la
-- commande en invité et la réservation sans compte.
--
-- ⚠️ `rdv_reservations_insertion_publique` est d'ailleurs BIEN écrite : son
-- CHECK interdit de prétendre avoir payé (`acompte_paye IS NOT TRUE`,
-- `stripe_payment_intent_id IS NULL`, `statut = 'confirme'`). C'est le
-- contre-exemple exact de `demandes_commande`.
REVOKE ALL   ON public.clients          FROM anon;
GRANT  INSERT ON public.clients          TO   anon;

REVOKE ALL   ON public.rdv_reservations FROM anon;
GRANT  INSERT ON public.rdv_reservations TO   anon;

-- ─── 5. CE QU'ON NE TOUCHE PAS, DÉLIBÉRÉMENT ────────────────────────────────
--
-- 🔴 `commercants` GARDE SES DROITS `anon`, ET CE N'EST PAS UN OUBLI.
-- `app/signup/page.js` écrit dans cette table DIX fois, et un commerçant qui
-- s'inscrit n'est pas encore authentifié au début du parcours. Un verrou posé
-- sans mesurer a déjà cassé ce signup le 26/08 ; on ne recommence pas.
-- Elle demande son propre examen, parcours d'inscription en main.

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE : une ligne par vérification, la valeur ET l'attendu, tout en text
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'is_admin delegue a is_yoppaa_admin'::text AS controle,
       (CASE WHEN (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'is_admin') LIKE '%is_yoppaa_admin%'
             THEN 'OUI' ELSE 'NON' END)::text AS valeur,
       'OUI'::text AS attendu

UNION ALL
SELECT 'is_admin a garde son search_path fige',
       COALESCE((SELECT array_to_string(proconfig, ' ') FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'is_admin'), 'AUCUN')::text,
       'search_path=public'::text

UNION ALL
SELECT 'les 29 policies d administration repondent toujours',
       (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public'
          AND (COALESCE(qual, '') || COALESCE(with_check, '')) ~ 'is_(yoppaa_)?admin\(')::text,
       '29'::text

UNION ALL
SELECT 'policies restantes sur demandes_commande',
       (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'demandes_commande')::text,
       '0'::text

UNION ALL
SELECT 'lignes dans demandes_commande (pour decider de la suite)',
       (SELECT count(*) FROM public.demandes_commande)::text,
       '(pour information)'::text

UNION ALL
-- Une ligne par table : ce qui reste à `anon` après le ménage.
SELECT ('anon sur ' || t.relname)::text,
       COALESCE((SELECT string_agg(DISTINCT g.privilege_type, '+' ORDER BY g.privilege_type)
                 FROM information_schema.role_table_grants g
                 WHERE g.table_schema = 'public' AND g.table_name = t.relname
                   AND g.grantee = 'anon'), 'aucun')::text,
       (CASE t.relname
          WHEN 'clients'          THEN 'INSERT'
          WHEN 'rdv_reservations' THEN 'INSERT'
          WHEN 'commercants'      THEN 'DELETE+INSERT+SELECT+UPDATE'
          ELSE 'aucun' END)::text
FROM pg_class t
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND t.relkind = 'r'
  AND t.relname IN ('bons_cadeaux', 'commandes', 'commande_articles', 'clients',
                    'rdv_reservations', 'favoris', 'avis', 'abonnements',
                    'client_preferences', 'fidelite_cartes', 'fidelite_mouvements',
                    'fidelite_recompenses', 'demandes_commande', 'pre_inscriptions',
                    'suggestions_commercants', 'commercants')

UNION ALL
-- ⚠️ ET LE CONTRÔLE QUI COMPTE VRAIMENT : `authenticated` n'a rien perdu. Si
-- ce chiffre baissait, le tableau de bord d'un commerçant connecté tomberait.
SELECT 'tables ou authenticated garde ses droits',
       (SELECT count(DISTINCT table_name) FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND grantee = 'authenticated'
          AND table_name IN ('bons_cadeaux', 'commandes', 'commande_articles', 'clients',
                             'rdv_reservations', 'favoris', 'avis', 'abonnements',
                             'fidelite_cartes', 'fidelite_mouvements', 'commercants'))::text,
       '11'::text

UNION ALL
SELECT 'TOTAL tables personnelles avec un droit anon',
       (SELECT count(DISTINCT g.table_name) FROM information_schema.role_table_grants g
        WHERE g.table_schema = 'public' AND g.grantee = 'anon'
          AND g.table_name IN ('bons_cadeaux', 'commandes', 'commande_articles', 'clients',
                               'rdv_reservations', 'favoris', 'avis', 'abonnements',
                               'client_preferences', 'fidelite_cartes', 'fidelite_mouvements',
                               'fidelite_recompenses', 'demandes_commande', 'pre_inscriptions',
                               'suggestions_commercants'))::text,
       '2'::text

ORDER BY 1;
