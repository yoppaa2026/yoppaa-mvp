-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC DE SÉCURITÉ — tableau de bord complet, en une exécution
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ POURQUOI CE FICHIER EXISTE. Deux jours de suite, une faille en production
-- s'est révélée INVISIBLE DANS LE CODE : elle n'existait qu'en base, posée à la
-- main dans l'interface Supabase. Sur 56 tables, 27 seulement viennent d'une
-- migration du dépôt. Aucun `npm run verif`, aucun `next build`, aucune
-- relecture ne voit la moitié de ta base.
--
-- Ce fichier est le seul contrôle qui la voit. À relancer avant chaque
-- ouverture, et chaque fois qu'une table est créée dans l'interface.
--
-- ⚠️ IL NE LIT QUE DES MÉTADONNÉES. Pas une ligne de `clients`, de `commandes`
-- ni d'aucune table à données personnelles. Il peut se coller n'importe où sans
-- précaution RGPD.
--
-- MODE D'EMPLOI : l'éditeur Supabase n'affiche que le résultat de la DERNIÈRE
-- requête. Lance donc les huit blocs UN PAR UN. Chacun dit, en commentaire, ce
-- que tu dois lire.


-- ─── 1) LES TABLES SANS RLS ────────────────────────────────────────────────
-- ⚠️ LE PLUS IMPORTANT DES HUIT. Une table sans RLS est lisible ET modifiable
-- par n'importe qui possédant la clé anon, qui est publique et se trouve dans
-- le bundle JavaScript de l'app.
--
-- ATTENDU : aucune ligne.
--
-- Si tu obtiens « Success » sans tableau, c'est bien zéro ligne. Pour t'assurer
-- que la requête cherche vraiment, retire la dernière condition : elle doit
-- alors lister tes 56 tables avec `true` en face.
SELECT c.relname AS table_sans_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false
 ORDER BY 1;


-- ─── 2) LES ÉCRITURES OUVERTES À TOUS LES RÔLES ────────────────────────────
-- ⚠️ `{public}` N'EST PAS « LES VISITEURS », C'EST TOUS LES RÔLES, `anon`
-- compris. Combiné à `USING true`, il ne filtre plus rien. C'est exactement la
-- forme des trois failles trouvées les 20 et 21/08 :
--   commercants        | Gestion commercant          | UPDATE | {public} | true
--   client_preferences | écriture préférences client | ALL    | {public} | true
--   clients            | Insert client               | INSERT | {public} | true
--
-- ⚠️ Sur une policy `ALL` dont le `with_check` est absent, PostgreSQL réutilise
-- le `USING` : l'écriture est ouverte elle aussi.
--
-- ATTENDU : que des lignes dont la condition NOMME un propriétaire
-- (`auth.uid()`, `is_admin()`, un `commercant_id IN (...)`). Toute ligne dont
-- la condition est `true` ou `—` est une porte ouverte.
SELECT tablename, policyname, cmd, roles::text,
       coalesce(qual, '—')       AS using_clause,
       coalesce(with_check, '—') AS with_check_clause
  FROM pg_policies
 WHERE schemaname = 'public'
   AND cmd <> 'SELECT'
   AND ('public' = ANY (roles) OR 'anon' = ANY (roles))
 ORDER BY tablename, cmd;


-- ─── 3) LES LECTURES OUVERTES SANS AUCUN FILTRE ────────────────────────────
-- Beaucoup sont légitimes : catalogue, communes, horaires, tout ce qui est
-- public par nature. À relire quand même, en se demandant à chaque ligne :
-- « est-ce que cette table peut contenir le nom, l'email ou le téléphone de
-- quelqu'un ? »
--
-- ⚠️ Et guetter les DOUBLONS : une policy stricte et une policy large sur la
-- même table se combinent en OU, donc la large gagne toujours. C'est comme ça
-- que le catalogue d'un commerçant non validé reste lisible.
SELECT tablename, policyname, roles::text, coalesce(qual, '—') AS using_clause
  FROM pg_policies
 WHERE schemaname = 'public'
   AND cmd = 'SELECT'
   AND ('public' = ANY (roles) OR 'anon' = ANY (roles))
 ORDER BY (coalesce(qual, 'true') <> 'true'), tablename;


-- ─── 4) LES TABLES QUI ONT LA RLS MAIS AUCUNE POLICY ───────────────────────
-- Deux lectures opposées, et il faut trancher table par table :
--   • VOULU : la table n'est accessible qu'en clé de service (compteurs,
--     journaux, événements Stripe). C'est le bon design.
--   • TROU : on a activé la RLS en croyant avoir fini, et l'app tape dessus
--     avec la clé anon. L'écran est alors vide SANS ERREUR.
SELECT c.relname AS table_sans_policy
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
   AND NOT EXISTS (
     SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = c.relname)
 ORDER BY 1;


-- ─── 5) LES DÉCLENCHEURS QUI PROTÈGENT LES COLONNES ────────────────────────
-- ⚠️ LA RLS TRAVAILLE À LA LIGNE, PAS À LA COLONNE. Une policy
-- « USING (c'est bien ma ligne) » laisse réécrire TOUTES les colonnes de cette
-- ligne : son statut, ses prix, ses colonnes de paiement. Un `WITH CHECK` n'y
-- peut rien, une policy ne sait pas comparer à l'ancienne ligne.
--
-- ATTENDU au 21/08 : trois lignes, `avis`, `commercants`, `rdv_reservations`.
--
-- ⚠️ Le jour où une QUATRIÈME table reçoit une policy de ce genre, elle doit
-- apparaître ici. C'est la seule question à se poser.
SELECT c.relname AS "table", t.tgname AS declencheur,
       CASE WHEN (t.tgtype & 4) > 0 THEN 'INSERT' ELSE '' END ||
       CASE WHEN (t.tgtype & 16) > 0 THEN ' UPDATE' ELSE '' END AS sur
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE NOT t.tgisinternal
   AND (t.tgname LIKE '%colonnes_reservees' OR t.tgname LIKE '%creation_sure')
 ORDER BY 1;


-- ─── 6) LES FONCTIONS SECURITY DEFINER ─────────────────────────────────────
-- Elles s'exécutent avec les droits de leur PROPRIÉTAIRE et ignorent donc la
-- RLS. Deux dangers :
--   ⚠️ SANS `SET search_path`, on peut leur faire appeler autre chose que ce
--      qu'elles croient appeler. C'est une élévation de privilèges.
--   ⚠️ Une fonction qui prend un identifiant en paramètre et lit sans vérifier
--      la propriété est une porte ouverte, même avec un search_path.
--
-- ATTENDU : la colonne `search_path_pose` à `true` PARTOUT.
SELECT p.proname AS fonction,
       (p.proconfig IS NOT NULL
        AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
       ) AS search_path_pose,
       pg_get_function_identity_arguments(p.oid) AS arguments
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef
 ORDER BY 2, 1;


-- ─── 7) LES VUES LISIBLES PAR anon ─────────────────────────────────────────
-- ⚠️ UNE VUE N'HÉRITE PAS DE LA RLS DE SES TABLES. Sans `security_invoker`,
-- elle s'exécute avec les droits de son propriétaire : une vue sur une table à
-- données personnelles, accessible à `anon`, est une fuite complète.
--
-- ATTENDU : uniquement des vues dont on SAIT qu'elles écartent les colonnes
-- sensibles (`commercants_public` omet email, BCE, représentant légal et Stripe ;
-- `avis_public` omet client_id et commande_id).
SELECT c.relname AS vue,
       coalesce((SELECT o FROM unnest(c.reloptions) o WHERE o LIKE 'security_invoker%'),
                'security_invoker absent') AS mode,
       string_agg(DISTINCT g.grantee, ', ') AS accessible_a
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN information_schema.role_table_grants g
    ON g.table_schema = n.nspname AND g.table_name = c.relname
 WHERE n.nspname = 'public' AND c.relkind = 'v'
   AND g.grantee IN ('anon', 'authenticated')
 GROUP BY c.relname, c.reloptions
 ORDER BY 1;


-- ─── 8) LES TABLES FERMÉES À anon ──────────────────────────────────────────
--
-- ⚠️ CE BLOC SE LIT À L'ENVERS DES SEPT AUTRES, et j'ai commencé par me
-- tromper dessus : j'avais écrit « attendu : que du SELECT ». C'est faux.
--
-- SUPABASE ACCORDE `ALL` À `anon` SUR TOUT LE SCHÉMA public, PAR DÉFAUT, à la
-- création de chaque table. Lister les tables où `anon` a plus que SELECT rend
-- donc les 55 tables, à chaque exécution, sans rien signaler du tout. Une garde
-- qui crie au loup en permanence ne sert à rien, et suivre cette fausse alerte
-- en révoquant les droits éteindrait l'application entière.
--
-- ⚠️ CE QU'IL FAUT EN RETENIR : LA RLS EST LA SEULE BARRIÈRE. Il n'y a aucune
-- seconde ligne de défense au niveau des droits. C'est ce qui donne tout leur
-- poids aux blocs 1 à 4.
--
-- (`TRUNCATE` et `REFERENCES` figurent dans ces droits mais PostgREST ne les
-- expose pas : avec la clé anon on n'atteint que SELECT, INSERT, UPDATE et
-- DELETE, et ces quatre-là passent par la RLS.)
--
-- On regarde donc L'EXCEPTION : les tables dont on a délibérément retiré les
-- droits. Elles doivent le rester.
--
-- ATTENDU : au minimum `client_preferences` (révoquée le 21/08),
-- `compteurs_commande` et `fiche_vues` (clé de service uniquement).
-- ⚠️ Si l'une de ces trois DISPARAÎT de la liste, quelqu'un lui a rendu ses
-- droits, et le trou du 21/08 est rouvert.
SELECT c.relname AS table_fermee_a_anon
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND NOT EXISTS (
     SELECT 1 FROM information_schema.role_table_grants g
      WHERE g.table_schema = 'public' AND g.table_name = c.relname
        AND g.grantee = 'anon')
 ORDER BY 1;
