-- ═══════════════════════════════════════════════════════════════════════════
-- MODULE RESTAURANT, migration 4 sur 7 — passee par Alex le 09/09/2026.
--
-- anon ne peut plus ecrire dans la table de liaison prestation / praticien.
--
-- ⚠️ RANGEE LE 10/09, APRES COUP. Ce texte a ete fourni dans la conversation
-- et passe a la main dans l editeur Supabase, mais il n avait jamais ete
-- depose ici : le schema de la reservation de table n etait trace NULLE PART
-- hors de la base. Il est recopie a l identique depuis l historique, pas
-- reconstitue de memoire. Idempotent : le rejouer ne change rien.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE INSERT, UPDATE, DELETE ON public.rdv_prestation_praticiens FROM anon;

select 'anon sur rdv_prestation_praticiens' as controle,
       coalesce((select string_agg(distinct privilege_type::text,'+')
                   from information_schema.role_table_grants
                  where table_schema='public' and table_name='rdv_prestation_praticiens'
                    and grantee='anon'),'AUCUN') as valeur,
       'SELECT' as attendu
union all
select 'la lecture publique survit',
       (select count(*)::text from information_schema.role_table_grants
         where table_schema='public' and table_name='rdv_prestation_praticiens'
           and grantee='anon' and privilege_type='SELECT'),
       '1'
union all
select 'liens praticien d une AUTRE maison',
       (select count(*)::text
          from rdv_prestation_praticiens l
          join rdv_prestations p on p.id = l.prestation_id
          join rdv_praticiens k on k.id = l.praticien_id
         where p.commercant_id <> k.commercant_id),
       '0 avant de durcir la policy'
union all
select 'liens dont le praticien n existe plus',
       (select count(*)::text
          from rdv_prestation_praticiens l
     left join rdv_praticiens k on k.id = l.praticien_id
         where k.id is null),
       '0'
union all
select 'liens dont la prestation n existe plus',
       (select count(*)::text
          from rdv_prestation_praticiens l
     left join rdv_prestations p on p.id = l.prestation_id
         where p.id is null),
       '0';
