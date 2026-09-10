-- ═══════════════════════════════════════════════════════════════════════════
-- MODULE RESTAURANT, migration 2 sur 7 — passee par Alex le 09/09/2026.
--
-- La commande en ligne devient un interrupteur, comme la livraison ou l agenda.
--
-- ⚠️ RANGEE LE 10/09, APRES COUP. Ce texte a ete fourni dans la conversation
-- et passe a la main dans l editeur Supabase, mais il n avait jamais ete
-- depose ici : le schema de la reservation de table n etait trace NULLE PART
-- hors de la base. Il est recopie a l identique depuis l historique, pas
-- reconstitue de memoire. Idempotent : le rejouer ne change rien.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.commercants
  ADD COLUMN IF NOT EXISTS commande_actif boolean NOT NULL DEFAULT true;

select 'la colonne existe' as controle,
       coalesce((select data_type::text || ' defaut ' || coalesce(column_default,'AUCUN')
                   from information_schema.columns
                  where table_schema='public' and table_name='commercants'
                    and column_name='commande_actif'),'ABSENTE') as valeur,
       'boolean defaut true' as attendu
union all
select 'aucun commercant ne change',
       (select count(*)::text from public.commercants where commande_actif is not true),
       '0'
union all
select 'la vue expose-t-elle deja la colonne',
       (select count(*)::text from information_schema.columns
         where table_schema='public' and table_name='commercants_public'
           and column_name='commande_actif'),
       '0 pour l instant'
union all
select 'definition de la vue publique',
       (select pg_get_viewdef('public.commercants_public'::regclass, true)),
       'a relire avant de la reecrire';
