-- CE QUE CES POLICIES DISENT VRAIMENT
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ MON PREMIER DIAGNOSTIC A COMPTÉ 11 POLICIES « AVEUGLES À L'IDENTITÉ ».
-- Neuf d'entre elles s'appellent `admin_*`. Une policy d'administration qui ne
-- consulterait pas l'identité n'aurait aucun sens : elle ouvrirait la table
-- entière à tout le monde.
--
-- L'explication la plus probable est que ma recherche visait `auth.`, et que
-- ces policies lisent l'identité AUTREMENT :
--
--     ((current_setting('request.jwt.claims', true))::json ->> 'email') = '...'
--
-- C'est ce que fait `auth.jwt()` sous le capot. Du SQL écrit à la main avant
-- que la fonction existe consulte donc parfaitement l'identité, sans jamais
-- écrire `auth.`.
--
-- 🔴 MAIS JE NE VAIS PAS LE SUPPOSER. Une affirmation se vérifie comme du
-- code. On lit la condition réelle de chacune, et on décide sur pièce.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ DEUX POLICIES VISENT `anon` NOMMÉMENT, et celles-là n'ont rien d'un
-- accident de rédaction : quelqu'un les a écrites exprès.
--
--   • `clients.yopper_insert_own_clients` — l'invité qui paie crée sa fiche.
--   • `rdv_reservations.rdv_reservations_insertion_publique` — 🔴 CELLE-CI EST
--     SUSPECTE. Depuis le 30/08, le rendez-vous NE SE CRÉE PLUS DEPUIS LE
--     NAVIGATEUR : il passe par une route serveur. Cette policy pourrait donc
--     être un reste, et un reste qui laisse n'importe quel visiteur écrire
--     dans l'agenda d'un commerçant.

select controle, valeur, attendu from (

  -- ─── LA CONDITION RÉELLE DE CHAQUE POLICY SIGNALÉE ──────────────────────
  select 100 + row_number() over (order by tablename, policyname) as ordre,
    (tablename || '.' || policyname || ' [' || cmd || '] pour ' || array_to_string(roles, '+')) as controle,
    left(
      'USING ' || coalesce(qual, '(aucun)') ||
      '   ///   WITH CHECK ' || coalesce(with_check, '(aucun)'), 700) as valeur,
    'doit consulter l identite' as attendu
  from pg_policies
  where schemaname = 'public'
    and cmd in ('UPDATE', 'INSERT', 'DELETE', 'ALL')
    and roles && array['anon','public']::name[]
    and (
      -- celles que le premier diagnostic a signalees
      (coalesce(qual, '') !~ 'auth\.' and coalesce(with_check, '') !~ 'auth\.')
      -- et celles qui visent anon nommement, meme si elles lisent auth.
      or 'anon' = any(roles)
    )

  -- ─── LE COMPTE AFFINÉ ───────────────────────────────────────────────────
  --
  -- ⚠️ ON ÉLARGIT LA RECHERCHE À TOUTES LES FAÇONS DE LIRE L'IDENTITÉ :
  -- `auth.`, `current_setting`, `jwt`, `uid()`. Ce qui reste après ça ne
  -- consulte vraiment personne, et c'est la seule ligne qui doit valoir zéro.
  union all select 1, 'policies d ecriture VRAIMENT aveugles a l identite',
    (select count(*) from pg_policies
      where schemaname = 'public' and cmd in ('UPDATE', 'INSERT', 'DELETE', 'ALL')
        and roles && array['anon','public']::name[]
        and coalesce(qual, '') !~ 'auth\.|current_setting|jwt|uid\(\)'
        and coalesce(with_check, '') !~ 'auth\.|current_setting|jwt|uid\(\)')::text, '0'

  union all select 2, 'lesquelles',
    coalesce((select string_agg(tablename || '.' || policyname || ' [' || cmd || ']', ' | '
      order by tablename, policyname) from pg_policies
      where schemaname = 'public' and cmd in ('UPDATE', 'INSERT', 'DELETE', 'ALL')
        and roles && array['anon','public']::name[]
        and coalesce(qual, '') !~ 'auth\.|current_setting|jwt|uid\(\)'
        and coalesce(with_check, '') !~ 'auth\.|current_setting|jwt|uid\(\)'), 'aucune'), 'aucune'

  -- ⚠️ ET LA MÊME QUESTION POUR LA LECTURE, sur les tables à données
  -- personnelles. L'audit du 01/09 l'a soldée, on le reverifie ici parce
  -- qu'une policy ajoutee depuis n'aurait ete vue par personne.
  union all select 3, 'policies de LECTURE aveugles a l identite sur les tables sensibles',
    (select count(*) from pg_policies
      where schemaname = 'public' and cmd in ('SELECT', 'ALL')
        and tablename in ('clients','commandes','yoppers','rdv_reservations','favoris',
                          'avis','abonnements','client_preferences','commande_articles')
        and roles && array['anon','public']::name[]
        and coalesce(qual, '') !~ 'auth\.|current_setting|jwt|uid\(\)')::text, '0'

  union all select 4, 'lesquelles',
    coalesce((select string_agg(tablename || '.' || policyname || ' [' || cmd || ']', ' | '
      order by tablename, policyname) from pg_policies
      where schemaname = 'public' and cmd in ('SELECT', 'ALL')
        and tablename in ('clients','commandes','yoppers','rdv_reservations','favoris',
                          'avis','abonnements','client_preferences','commande_articles')
        and roles && array['anon','public']::name[]
        and coalesce(qual, '') !~ 'auth\.|current_setting|jwt|uid\(\)'), 'aucune'), 'aucune'

) t order by ordre;
