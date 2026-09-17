-- LE MONDE OU UN COMPTE STRIPE EST NE (17/09)
--
-- POURQUOI. Stripe a deux mondes etanches, test et live, et le mode appartient
-- a la PLATEFORME : la cle `sk_test_`/`sk_live_` commande TOUS les comptes
-- connectes. Le jour de la bascule, chaque `stripe_account_id` cree en test
-- pointe vers un compte qui N EXISTE PAS en live.
--
-- 🔴 CE QUE CA FAIT AUJOURD HUI, SANS CETTE MIGRATION. Le commercant a un
-- `stripe_account_id` renseigne, donc `create-account-link` saute la creation et
-- demande un lien sur un compte introuvable. Stripe refuse. Le commercant
-- clique, ca echoue, il reclique, ca echoue encore, et son ecran affiche un
-- message anglais avec un identifiant technique. IL NE PEUT PLUS JAMAIS SE
-- CONNECTER, et rien ne previent Yoppaa.
--
-- 🔴 POURQUOI DEUX COLONNES ET PAS UNE LECTURE DE L ERREUR STRIPE. Deviner le
-- code d erreur que Stripe renvoie dans ce cas, c est ecrire une garde de
-- memoire : elle ne verifierait que ma memoire, et ne se prouve qu en live avec
-- de vrais comptes. On note donc le monde A LA NAISSANCE du compte, et on
-- compare deux mots. Certain, et mesurable au banc.
--
-- ⚠️ `stripe_account_id_precedent` N EST PAS UN CONFORT. Le detachement se
-- declenche tout seul au moment ou le commercant reconnecte son compte. Si un
-- jour quelqu un remet la cle de test en production par erreur, sans cette
-- colonne il effacerait les liens vers les VRAIS comptes, un commercant apres
-- l autre, definitivement. Une bascule se rattrape ; un identifiant efface, non.
--
-- ⚠️ AUCUNE DE CES DEUX COLONNES NE VA DANS `commercants_public`. La vue liste
-- ses colonnes une par une, donc elle ne bouge pas toute seule : c est verifie
-- au controle E.
--
-- ⚠️ LE REMPLISSAGE DIT « test » POUR TOUT L EXISTANT, et c est un FAIT verifie
-- le 17/09 sur les captures Stripe d Alex : 11 clients en mode test, ZERO en
-- live. Ce n est pas une supposition de confort.

-- ═══ DDL ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.commercants
  ADD COLUMN IF NOT EXISTS stripe_account_mode          text,
  ADD COLUMN IF NOT EXISTS stripe_account_id_precedent  text;

COMMENT ON COLUMN public.commercants.stripe_account_mode IS
  'Monde Stripe ou le compte connecte est ne : test ou live. Compare au mode de la cle plateforme pour savoir si le compte est encore atteignable.';
COMMENT ON COLUMN public.commercants.stripe_account_id_precedent IS
  'Identifiant du compte Connect mis de cote lors d un changement de mode. Ne jamais effacer : c est la seule trace du compte d avant la bascule.';

-- Seules trois valeurs ont un sens. Une quatrieme ferait mentir le verdict.
ALTER TABLE public.commercants
  DROP CONSTRAINT IF EXISTS commercants_stripe_account_mode_check;
ALTER TABLE public.commercants
  ADD CONSTRAINT commercants_stripe_account_mode_check
  CHECK (stripe_account_mode IS NULL OR stripe_account_mode IN ('test', 'live'));

-- Tout l existant est ne en test (verifie sur les captures Stripe du 17/09).
UPDATE public.commercants
   SET stripe_account_mode = 'test'
 WHERE stripe_account_id IS NOT NULL
   AND stripe_account_mode IS NULL;

-- ═══ GRANT ═════════════════════════════════════════════════════════════════
-- 🔴 ON NE CHOISIT PAS LES DROITS, ON REPLIQUE CEUX DE `stripe_account_id`.
-- L ecriture se fait sous l identite du COMMERCANT (client Supabase monte avec
-- la cle anon et son JWT), pas avec la cle de service. Un droit oublie casse le
-- parcours de connexion en silence ; un droit invente ouvre une porte que
-- personne n a demandee. La colonne soeur porte deja la bonne reponse.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT grantee, privilege_type
      FROM information_schema.column_privileges
     WHERE table_schema = 'public'
       AND table_name   = 'commercants'
       AND column_name  = 'stripe_account_id'
  LOOP
    EXECUTE format(
      'GRANT %s (stripe_account_mode, stripe_account_id_precedent) ON public.commercants TO %s',
      r.privilege_type,
      CASE WHEN r.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(r.grantee) END
    );
  END LOOP;
END
$$;

-- ═══ CONTROLE : une ligne par verification, valeur ET attendu ══════════════
SELECT 'A. les deux colonnes existent'::text AS controle,
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants'
           AND column_name IN ('stripe_account_mode', 'stripe_account_id_precedent')) AS valeur,
       '2'::text AS attendu
UNION ALL
SELECT 'B. comptes Stripe lies, tous mondes confondus'::text,
       (SELECT count(*)::text FROM public.commercants WHERE stripe_account_id IS NOT NULL),
       'le nombre de comptes connectes existants'::text
UNION ALL
-- 🔴 LE CONTROLE QUI COMPTE : un compte sans monde note est INVISIBLE a la
-- detection. Il rendrait « inconnu » a vie, et son commercant resterait coince
-- apres la bascule sans que rien ne le signale.
SELECT 'C. comptes SANS monde note (invisibles a la detection)'::text,
       (SELECT count(*)::text FROM public.commercants
         WHERE stripe_account_id IS NOT NULL AND stripe_account_mode IS NULL),
       '0 : chacun serait un commercant coince en silence'::text
UNION ALL
SELECT 'D. et repartition des mondes notes'::text,
       coalesce((SELECT string_agg(stripe_account_mode || ' : ' || n, ' · ' ORDER BY stripe_account_mode)
                   FROM (SELECT stripe_account_mode, count(*)::text AS n
                           FROM public.commercants
                          WHERE stripe_account_mode IS NOT NULL
                          GROUP BY stripe_account_mode) q), '(aucun)'),
       'test uniquement, tant que la bascule n a pas eu lieu'::text
UNION ALL
-- ⚠️ LA VUE PUBLIQUE NE DOIT PAS LES VOIR. `stripe_account_id_precedent` sur
-- une vue lisible par `anon` exposerait les identifiants Connect au monde.
SELECT 'E. ces colonnes dans commercants_public (fuite)'::text,
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants_public'
           AND column_name IN ('stripe_account_mode', 'stripe_account_id_precedent')),
       '0 : la vue ne doit exposer ni le mode ni l ancien compte'::text
UNION ALL
-- ⚠️ LES DROITS DOIVENT ETRE LES MEMES QUE CEUX DE LA COLONNE SOEUR. Moins, et
-- le parcours de connexion casse ; plus, et on a ouvert quelque chose.
SELECT 'F. droits repliques depuis stripe_account_id'::text,
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'commercants'
           AND column_name = 'stripe_account_mode'),
       (SELECT count(*)::text || ' (le compte de stripe_account_id)'
          FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'commercants'
           AND column_name = 'stripe_account_id')
UNION ALL
SELECT 'G. et lesquels, pour les lire'::text,
       coalesce((SELECT string_agg(DISTINCT grantee || ':' || privilege_type, ' · ')
                   FROM information_schema.column_privileges
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name = 'stripe_account_mode'), '(aucun)'),
       'les memes roles et privileges que la colonne soeur'::text
UNION ALL
SELECT 'H. la contrainte de valeur est posee'::text,
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid = 'public.commercants'::regclass
           AND conname = 'commercants_stripe_account_mode_check'),
       '1'::text;
