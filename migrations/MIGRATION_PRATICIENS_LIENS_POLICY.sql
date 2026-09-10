-- ═══════════════════════════════════════════════════════════════════════════
-- MODULE RESTAURANT, migration 5 sur 7 — passee par Alex le 09/09/2026.
--
-- La policy verifie les DEUX bouts du lien, pas seulement la prestation.
--
-- ⚠️ RANGEE LE 10/09, APRES COUP. Ce texte a ete fourni dans la conversation
-- et passe a la main dans l editeur Supabase, mais il n avait jamais ete
-- depose ici : le schema de la reservation de table n etait trace NULLE PART
-- hors de la base. Il est recopie a l identique depuis l historique, pas
-- reconstitue de memoire. Idempotent : le rejouer ne change rien.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS "Commercant gere ses liens" ON public.rdv_prestation_praticiens;

CREATE POLICY "Commercant gere ses liens"
  ON public.rdv_prestation_praticiens
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM rdv_prestations p JOIN commercants c ON c.id = p.commercant_id
             WHERE p.id = rdv_prestation_praticiens.prestation_id AND c.auth_user_id = auth.uid())
    AND
    EXISTS (SELECT 1 FROM rdv_praticiens k JOIN commercants c ON c.id = k.commercant_id
             WHERE k.id = rdv_prestation_praticiens.praticien_id AND c.auth_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM rdv_prestations p JOIN commercants c ON c.id = p.commercant_id
             WHERE p.id = rdv_prestation_praticiens.prestation_id AND c.auth_user_id = auth.uid())
    AND
    EXISTS (SELECT 1 FROM rdv_praticiens k JOIN commercants c ON c.id = k.commercant_id
             WHERE k.id = rdv_prestation_praticiens.praticien_id AND c.auth_user_id = auth.uid())
  );

COMMIT;

select 'le USING vise les DEUX bouts' as controle,
       (select case when qual like '%rdv_praticiens%' and qual like '%rdv_prestations%'
                    then 'les deux' else coalesce(left(qual,60),'POLICY ABSENTE') end
          from pg_policies where schemaname='public'
           and tablename='rdv_prestation_praticiens'
           and policyname='Commercant gere ses liens') as valeur,
       'les deux' as attendu
union all
select 'le CHECK aussi',
       (select case when with_check like '%rdv_praticiens%' and with_check like '%rdv_prestations%'
                    then 'les deux' else coalesce(left(with_check,60),'ABSENT') end
          from pg_policies where schemaname='public'
           and tablename='rdv_prestation_praticiens'
           and policyname='Commercant gere ses liens'),
       'les deux'
union all
select 'policies sur la table',
       (select count(*)::text from pg_policies
         where schemaname='public' and tablename='rdv_prestation_praticiens'),
       '4'
union all
select 'la lecture publique intacte',
       (select count(*)::text from pg_policies
         where schemaname='public' and tablename='rdv_prestation_praticiens'
           and policyname='Junction visible si prestation visible'),
       '1'
union all
select 'zz_commerce_ouvert toujours RESTRICTIVE',
       (select permissive from pg_policies
         where schemaname='public' and tablename='rdv_prestation_praticiens'
           and policyname='zz_commerce_ouvert'),
       'RESTRICTIVE';
