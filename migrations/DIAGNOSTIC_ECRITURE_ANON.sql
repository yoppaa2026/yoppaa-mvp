-- QUI PEUT ÉCRIRE DANS LES TABLES PUBLIQUES ?
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 D'OÙ VIENT CETTE QUESTION. Le 04/09, un contrôle de la migration
-- `MIGRATION_ARTICLE_DELAI.sql` est sorti rouge : `anon` détient le GRANT
-- UPDATE sur `articles`.
--
-- Il le détient sur TOUTES les tables, et c'est le réglage d'usine de
-- Supabase : `alter default privileges in schema public grant all on tables
-- to anon, authenticated, service_role`. Le GRANT n'est donc pas la
-- protection, et le contrôle mesurait une forme au lieu d'une règle.
--
-- ⚠️ CE QUI PROTÈGE, C'EST LA RLS. Reste à le VÉRIFIER plutôt qu'à le croire :
-- l'audit du 01/09 a soldé la LECTURE à zéro, jamais l'ÉCRITURE, et 98
-- policies n'ont encore été lues par personne.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ AUCUNE ÉCRITURE ICI, PAS MÊME UNE SONDE. Une sonde qui écrirait la même
-- valeur reste une écriture : elle réveillerait les déclencheurs `updated_at`
-- et daterait des lignes que personne n'a touchées. On lit le catalogue.
--
-- ⚠️ ET AUCUNE DONNÉE PERSONNELLE N'EST LUE. Tout vient de `pg_class` et
-- `pg_policies`, qui ne décrivent que la structure.

select controle, valeur, attendu from (

  -- ─── ARTICLES, LA TABLE QUI A DÉCLENCHÉ LA QUESTION ─────────────────────
  select 1 as ordre, 'articles : RLS activee' as controle,
    (select relrowsecurity from pg_class where oid = 'public.articles'::regclass)::text as valeur,
    'true' as attendu

  -- ⚠️ LE PROPRIETAIRE D'UNE TABLE CONTOURNE SA PROPRE RLS tant qu'elle n'est
  -- pas FORCEE. Sans effet pour `anon`, qui n'est propriétaire de rien, mais
  -- c'est la ligne qui explique les surprises.
  union all select 2, 'articles : RLS forcee (le proprietaire aussi la subit)',
    (select relforcerowsecurity from pg_class where oid = 'public.articles'::regclass)::text,
    'true ou false, pour information'

  -- ⚠️ UNE POLICY « TO public » N'EST PAS UNE FAILLE EN SOI. C'est l'écriture
  -- par défaut de Supabase : `create policy ... for all using (auth.uid() =
  -- ...)` vise `public` sans le dire, et sa condition, elle, consulte bien
  -- l'identité. Compter ces policies-là ferait sonner l'alarme en permanence.
  --
  -- 🔴 CE QUI EST DANGEREUX, C'EST UNE POLICY D'ÉCRITURE QUI NE CONSULTE
  -- JAMAIS L'IDENTITE. Elle laisse alors passer quiconque détient le GRANT,
  -- c'est-à-dire n'importe quel visiteur.
  union all select 3, 'articles : policies d ECRITURE qui ne consultent PAS l identite',
    (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'articles'
        and cmd in ('UPDATE', 'INSERT', 'DELETE', 'ALL')
        and roles && array['anon','public']::name[]
        and coalesce(qual, '') !~ 'auth\.' and coalesce(with_check, '') !~ 'auth\.')::text, '0'

  union all select 4, 'articles : lesquelles',
    coalesce((select string_agg(policyname || ' [' || cmd || ']', ' | ') from pg_policies
      where schemaname = 'public' and tablename = 'articles'
        and cmd in ('UPDATE', 'INSERT', 'DELETE', 'ALL')
        and roles && array['anon','public']::name[]
        and coalesce(qual, '') !~ 'auth\.' and coalesce(with_check, '') !~ 'auth\.'), 'aucune'), 'aucune'

  union all select 5, 'articles : toutes ses policies d ecriture, pour lecture',
    coalesce((select string_agg(policyname || ' [' || cmd || ']', ' | ' order by policyname)
      from pg_policies where schemaname = 'public' and tablename = 'articles'
        and cmd in ('UPDATE', 'INSERT', 'DELETE', 'ALL')), 'AUCUNE'), 'au moins une pour le commercant'

  -- ─── LES FRÈRES : TOUT LE SCHÉMA PUBLIC ─────────────────────────────────
  --
  -- ⚠️ UNE AMELIORATION S'APPLIQUE PARTOUT. La question posée sur `articles`
  -- vaut pour les 60 et quelques autres tables, et c'est là que se cachent les
  -- 98 policies que personne n'a encore lues.
  union all select 6, 'tables publiques SANS RLS du tout',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity)::text, '0'

  union all select 7, 'lesquelles',
    coalesce((select string_agg(c.relname, ', ' order by c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 'aucune'), 'aucune'

  -- 🔴 LA LIGNE QUI COMPTE VRAIMENT.
  union all select 8, 'policies d ECRITURE qui ne consultent PAS l identite, toutes tables',
    (select count(*) from pg_policies
      where schemaname = 'public' and cmd in ('UPDATE', 'INSERT', 'DELETE', 'ALL')
        and roles && array['anon','public']::name[]
        and coalesce(qual, '') !~ 'auth\.' and coalesce(with_check, '') !~ 'auth\.')::text, '0'

  union all select 9, 'sur quelles tables',
    coalesce((select string_agg(distinct tablename, ', ' order by tablename) from pg_policies
      where schemaname = 'public' and cmd in ('UPDATE', 'INSERT', 'DELETE', 'ALL')
        and roles && array['anon','public']::name[]
        and coalesce(qual, '') !~ 'auth\.' and coalesce(with_check, '') !~ 'auth\.'), 'aucune'), 'aucune'

  union all select 10, 'et leurs noms',
    coalesce((select string_agg(tablename || '.' || policyname || ' [' || cmd || ']', ' | '
      order by tablename, policyname) from pg_policies
      where schemaname = 'public' and cmd in ('UPDATE', 'INSERT', 'DELETE', 'ALL')
        and roles && array['anon','public']::name[]
        and coalesce(qual, '') !~ 'auth\.' and coalesce(with_check, '') !~ 'auth\.'), 'aucune'), 'aucune'

  -- ⚠️ ET LES POLICIES QUI VISENT `anon` NOMMEMENT, en écriture. Celles-là ne
  -- sont jamais un défaut de rédaction : quelqu'un les a écrites exprès.
  union all select 11, 'policies d ecriture visant anon NOMMEMENT',
    (select count(*) from pg_policies
      where schemaname = 'public' and cmd in ('UPDATE', 'INSERT', 'DELETE', 'ALL')
        and 'anon' = any(roles))::text, '0'

  union all select 12, 'lesquelles',
    coalesce((select string_agg(tablename || '.' || policyname || ' [' || cmd || ']', ' | '
      order by tablename) from pg_policies
      where schemaname = 'public' and cmd in ('UPDATE', 'INSERT', 'DELETE', 'ALL')
        and 'anon' = any(roles)), 'aucune'), 'aucune'

  -- ⚠️ LE COMPTE TOTAL, pour savoir de combien de policies on parle. C'est le
  -- chiffre qui dit si « 98 jamais examinees » est encore vrai.
  union all select 13, 'policies d ecriture au total dans public',
    (select count(*) from pg_policies where schemaname = 'public'
      and cmd in ('UPDATE', 'INSERT', 'DELETE', 'ALL'))::text, 'pour information'

) t order by ordre;
