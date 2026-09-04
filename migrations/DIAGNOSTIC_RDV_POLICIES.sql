-- TOUTES LES POLICIES DE L'AGENDA, AVEC LEUR NATURE
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI EST ÉTABLI AU 04/09.
--
-- ✅ `is_admin()` DÉLÈGUE à `is_yoppaa_admin()`, qui compare `auth.email()` à
-- une seule adresse. Ce n'est donc PAS une seconde source de vérité, c'est un
-- alias. `SECURITY DEFINER` avec `search_path` figé, et `auth.email()` rend
-- `NULL` pour un visiteur : la comparaison rend `NULL`, la policy refuse.
-- Rien à corriger de ce côté.
--
-- 🔴 `rdv_reservations_insertion_publique` NE REGARDE JAMAIS QUI ÉCRIT. Sa
-- condition ne porte que sur des champs d'argent.
--
-- ⚠️ ET ON NE PEUT PAS SIMPLEMENT LA SUPPRIMER. Les trois policies capables
-- d'insérer dans l'agenda sont :
--   • `Admin Yoppaa FULL`   → `is_yoppaa_admin()`, c'est-à-dire Alex seul ;
--   • `zz_commerce_ouvert`  → le VERROU du commerce non validé, qui filtre ;
--   • `rdv_reservations_insertion_publique` → la fautive.
--
-- Si `zz_commerce_ouvert` est RESTRICTIVE (elle a été créée ainsi dans
-- `MIGRATION_VERROU_COMMERCANT_NON_VALIDE.sql`), elle ne DONNE aucun droit :
-- elle ne fait que retrancher. Le commerçant qui crée un rendez-vous à la main
-- depuis son tableau de bord passerait donc AUJOURD'HUI par la policy fautive,
-- et la retirer sèchement le casserait.
--
-- 🔴 C'EST TOUTE LA DIFFÉRENCE ENTRE PERMISSIVE ET RESTRICTIVE, et ce projet
-- s'est déjà fait avoir : une policy sans `AS RESTRICTIVE` OUVRE au lieu de
-- fermer. Cette requête la lit donc explicitement, au lieu de la déduire du
-- fichier de migration qui l'a créée.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ AUCUNE ÉCRITURE. Tout vient de `pg_policies` et `pg_proc`.

select controle, valeur, attendu from (

  -- ─── TOUTES LES POLICIES DE L'AGENDA, SANS EXCEPTION ────────────────────
  --
  -- ⚠️ ON LES PREND TOUTES, pas seulement celles qui insèrent. Écrire une
  -- nouvelle policy sans connaître ses voisines, c'est ajouter une porte à un
  -- mur dont on n'a pas fait le tour.
  select
    row_number() over (order by cmd, policyname) as ordre,
    ('rdv_reservations.' || policyname || ' [' || cmd || '] '
      || (case when permissive = 'PERMISSIVE' then 'PERMISSIVE (elle DONNE)' else 'RESTRICTIVE (elle RETRANCHE)' end)
      || ' pour ' || array_to_string(roles, '+')) as controle,
    left('USING ' || coalesce(qual, '(aucun)') || '   ///   WITH CHECK ' || coalesce(with_check, '(aucun)'), 600) as valeur,
    'le commercant doit garder un chemin vers SON agenda' as attendu
  from pg_policies
  where schemaname = 'public' and tablename = 'rdv_reservations'

  -- ─── LE VERROU LUI-MÊME ─────────────────────────────────────────────────
  union all select 100, 'fonction mes_commerces_bloques',
    coalesce(left((select pg_get_functiondef(p.oid) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'mes_commerces_bloques' limit 1), 600), 'ABSENTE'),
    'doit rendre les commerces BLOQUES du compte courant'

  -- ⚠️ LA QUESTION QUI DÉCIDE DU CORRECTIF. S'il n'existe aucune policy
  -- PERMISSIVE qui rattache le rendez-vous au commerce de celui qui écrit,
  -- alors retirer la fautive coupe le commerçant de son propre agenda, et il
  -- faut la REMPLACER, pas la supprimer.
  union all select 101, 'policies PERMISSIVES qui rattachent le rdv a SON commercant',
    (select count(*) from pg_policies where schemaname = 'public'
      and tablename = 'rdv_reservations' and permissive = 'PERMISSIVE'
      and coalesce(with_check, '') like '%auth_user_id = auth.uid()%')::text,
    '0 attendu, ce qui veut dire REMPLACER et non supprimer'

) t order by ordre;
