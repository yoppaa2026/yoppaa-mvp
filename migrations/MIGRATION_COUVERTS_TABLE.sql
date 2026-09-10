-- ═══════════════════════════════════════════════════════════════════════════
-- MODULE RESTAURANT, migration 1 sur 7 — passee par Alex le 09/09/2026.
--
-- Une reservation porte un nombre de couverts ; une prestation peut se declarer « table ».
--
-- ⚠️ RANGEE LE 10/09, APRES COUP. Ce texte a ete fourni dans la conversation
-- et passe a la main dans l editeur Supabase, mais il n avait jamais ete
-- depose ici : le schema de la reservation de table n etait trace NULLE PART
-- hors de la base. Il est recopie a l identique depuis l historique, pas
-- reconstitue de memoire. Idempotent : le rejouer ne change rien.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.rdv_reservations
  ADD COLUMN IF NOT EXISTS couverts integer NOT NULL DEFAULT 1;

ALTER TABLE public.rdv_reservations
  DROP CONSTRAINT IF EXISTS rdv_reservations_couverts_positif;
ALTER TABLE public.rdv_reservations
  ADD CONSTRAINT rdv_reservations_couverts_positif CHECK (couverts >= 1);

ALTER TABLE public.rdv_prestations
  ADD COLUMN IF NOT EXISTS par_couverts boolean NOT NULL DEFAULT false;
ALTER TABLE public.rdv_prestations
  ADD COLUMN IF NOT EXISTS couverts_min integer;
ALTER TABLE public.rdv_prestations
  ADD COLUMN IF NOT EXISTS couverts_max integer;

ALTER TABLE public.rdv_prestations
  DROP CONSTRAINT IF EXISTS rdv_prestations_couverts_bornes;
ALTER TABLE public.rdv_prestations
  ADD CONSTRAINT rdv_prestations_couverts_bornes CHECK (
    (couverts_min IS NULL OR couverts_min >= 1)
    AND (couverts_max IS NULL OR couverts_max >= 1)
    AND (couverts_min IS NULL OR couverts_max IS NULL OR couverts_min <= couverts_max)
  );

COMMIT;

select 'couverts sur les reservations' as controle,
       coalesce((select data_type::text || ' defaut ' || coalesce(column_default,'AUCUN')
                   || case when is_nullable='NO' then ' NOT NULL' else ' nullable' end
                   from information_schema.columns
                  where table_schema='public' and table_name='rdv_reservations'
                    and column_name='couverts'),'ABSENTE') as valeur,
       'integer defaut 1 NOT NULL' as attendu
union all
select 'aucune reservation existante ne bouge',
       (select count(*)::text from public.rdv_reservations where couverts <> 1),
       '0'
union all
select 'les trois colonnes de prestation',
       (select coalesce(string_agg(column_name::text, ' | ' order by column_name),'AUCUNE')
          from information_schema.columns
         where table_schema='public' and table_name='rdv_prestations'
           and column_name in ('par_couverts','couverts_min','couverts_max')),
       'couverts_max | couverts_min | par_couverts'
union all
select 'aucune prestation existante ne bascule',
       (select count(*)::text from public.rdv_prestations where par_couverts is true),
       '0'
union all
select 'les deux garde-fous',
       (select coalesce(string_agg(conname::text, ' | ' order by conname),'AUCUN')
          from pg_constraint
         where conname in ('rdv_reservations_couverts_positif','rdv_prestations_couverts_bornes')),
       'rdv_prestations_couverts_bornes | rdv_reservations_couverts_positif'
union all
select 'place_no et son unique intacts',
       (select case when count(*) = 1 then 'intact' else 'MODIFIE' end::text
          from pg_index x where x.indrelid='public.rdv_reservations'::regclass
           and pg_get_indexdef(x.indexrelid) like '%place_no%'),
       'intact'
union all
select 'droits inchanges sur les deux tables',
       (select coalesce(string_agg(distinct grantee::text || ':' || privilege_type::text, ' | '),'AUCUN')
          from information_schema.role_table_grants
         where table_schema='public' and table_name='rdv_reservations' and grantee='anon'),
       'ce qui existait avant';
