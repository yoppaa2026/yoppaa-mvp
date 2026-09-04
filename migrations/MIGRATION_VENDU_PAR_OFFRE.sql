-- COMBIEN EN A-T-ON DÉJÀ VENDU SUR CETTE OFFRE ?
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 LE DÉFAUT VU PAR ALEX LE 04/09 AU SOIR.
--
-- Il publie TROIS assiettes à moitié prix, et la fiche en propose QUINZE : elle
-- lisait le stock du jour de l'ARTICLE, pas la quantité de l'OFFRE. Quinze
-- assiettes vendues 4,75 € au lieu de 9,50 €, c'est soixante et onze euros qui
-- manquent à la caisse sur une offre censée écouler trois restes.
--
-- Le serveur refuse désormais (`verifierQuantiteOffres`). Mais l'écran, lui, ne
-- peut PAS calculer ce qu'il reste : un Yopper n'a pas le droit de lire les
-- lignes de commande des autres, et c'est très bien ainsi.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ MÊME PATRON QUE `stock_commande_par_article`, ET POUR LA MÊME RAISON. Une
-- fonction qui rend un AGRÉGAT ne révèle ni qui a commandé, ni quoi, ni quand :
-- elle rend un nombre. Ouvrir la table en lecture pour afficher un compteur
-- serait payer une donnée personnelle pour un chiffre.
--
-- ⚠️ ET LES MÊMES STATUTS QUE LE STOCK, MOT POUR MOT. Une commande non retirée
-- rend sa marchandise, donc elle ne consomme pas l'offre ; une commande en
-- attente de paiement, si, le temps du passage sur Stripe. Deux règles
-- différentes pour « qu'est-ce qui est vendu » auraient divergé au premier
-- changement, et c'est le défaut le plus fréquent de ce projet.
--
-- 🔴 ON COMPTE, ON NE DÉCRÉMENTE PAS. Écrire le reste dans `yoppaa_deals`
-- fabriquerait une seconde source de vérité, et deux paniers simultanés
-- perdraient une décrémentation en silence. Le comptage, lui, est idempotent :
-- il redonne le même résultat quel que soit l'ordre des évènements.
--
-- Idempotente : ré-exécutable sans effet de bord.

create or replace function vendu_par_offre(p_deal_ids uuid[])
returns table (deal_id uuid, vendu bigint)
language sql
security definer
set search_path = public
stable
as $$
  select ca.deal_id, sum(ca.quantite)::bigint
    from commande_articles ca
    join commandes c on c.id = ca.commande_id
   where ca.deal_id = any(p_deal_ids)
     and c.statut not in ('non_retire', 'annulee_paiement_ko', 'annulee_client_refund')
   group by ca.deal_id;
$$;

-- ⚠️ GRANT EXPLICITE, ET RÉVOCATION D'ABORD. Une fonction naît exécutable par
-- `public` : ne poser que le GRANT laisserait la porte ouverte à côté.
revoke all on function vendu_par_offre(uuid[]) from public;
grant execute on function vendu_par_offre(uuid[]) to anon, authenticated;

-- ─── CONTRÔLE ───────────────────────────────────────────────────────────────
select controle, valeur, attendu from (
  select 1 as ordre, 'la fonction existe' as controle,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'vendu_par_offre')::text as valeur,
    '1' as attendu

  union all select 2, 'elle s execute avec les droits de son proprietaire',
    coalesce((select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'vendu_par_offre'), 'ABSENTE'), 'true'

  -- ⚠️ SANS `search_path` FIGÉ, une fonction en SECURITY DEFINER est un chemin
  -- d escalade : on lui ferait lire une table fabriquee pour l occasion.
  union all select 3, 'son search_path est fige',
    coalesce((select array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'vendu_par_offre'), 'NON FIXE'), 'search_path=public'

  union all select 4, 'anon peut l executer',
    has_function_privilege('anon', 'public.vendu_par_offre(uuid[])', 'EXECUTE')::text, 'true'

  union all select 5, 'le commercant connecte aussi',
    has_function_privilege('authenticated', 'public.vendu_par_offre(uuid[])', 'EXECUTE')::text, 'true'

  -- 🔴 ELLE NE DOIT PAS RESTER OUVERTE A `public` A COTE DU GRANT NOMME.
  union all select 6, 'et public ne l a plus en propre',
    (select count(*) from information_schema.routine_privileges
      where routine_schema = 'public' and routine_name = 'vendu_par_offre'
        and grantee = 'PUBLIC')::text, '0'

  -- ⚠️ L INDEX DE COMPTAGE EXISTE DEPUIS LA MIGRATION DE LA QUANTITE. Sans lui,
  -- ce comptage balaierait toutes les lignes de commande du commerce.
  union all select 7, 'l index de comptage est en place',
    (select count(*) from pg_indexes where indexname = 'idx_commande_articles_deal')::text, '1'

  -- Elle rend un tableau vide sur une liste vide, sans lever.
  union all select 8, 'une liste vide ne rend rien et ne leve pas',
    (select count(*) from vendu_par_offre(array[]::uuid[]))::text, '0'
) t order by ordre;
