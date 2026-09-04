-- ANTI-GASPI : LA FENÊTRE HORAIRE DE L'OFFRE DE FIN DE JOURNÉE
--
-- Appliquée en production le 04/09/2026, six contrôles verts.
--
-- Un invendu, c'est un deal qui pointe un article existant et qui s'éteint à
-- une heure précise. Tout le reste existait déjà :
--   • le nom, la photo et le TAUX DE TVA viennent de l'article ;
--   • le prix cassé, c'est `prix_deal` ;
--   • la quantité, c'est `articles.stock_jour` ;
--   • seule l'heure de fin manquait.
--
-- ⚠️ PAS DE DRAPEAU `anti_gaspi`, ET C'EST DÉLIBÉRÉ. Un booléen à côté des
-- heures aurait pu dire « oui » pendant que les heures disent le contraire :
-- deux sources de vérité pour une seule idée. LA PRÉSENCE DE LA FENÊTRE FAIT
-- L'OFFRE DE FIN DE JOURNÉE.
--
-- ⚠️ `time` SANS FUSEAU, comme les quatre autres migrations du dépôt
-- (abonnements, lieux, cours collectifs, emplacements food truck). L'heure est
-- LOCALE, en heure belge : c'est celle que le commerçant lit sur sa pendule.
-- La conversion vit dans `lib/anti-gaspi.js`, jamais dans une requête.

alter table yoppaa_deals
  add column if not exists heure_debut time,
  add column if not exists heure_fin   time;

comment on column yoppaa_deals.heure_debut is
  'Heure LOCALE (Europe/Brussels), meme convention que creneaux.heure_debut. Jamais UTC.';
comment on column yoppaa_deals.heure_fin is
  'Heure LOCALE de fermeture. La PRESENCE de la fenetre fait l offre de fin de journee : pas de drapeau separe, qui pourrait contredire les heures.';

-- ⚠️ LES DEUX HEURES, OU AUCUNE. Une demi-fenêtre ne s'afficherait jamais, et
-- rien ne le signalerait : on refuse de l'enregistrer plutôt que de la laisser
-- disparaître en silence.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'yoppaa_deals_fenetre_complete') then
    alter table yoppaa_deals
      add constraint yoppaa_deals_fenetre_complete
      check ((heure_debut is null) = (heure_fin is null));
  end if;
end $$;

-- L'écran de fin de journée ne lit que les offres qui portent une fenêtre.
create index if not exists idx_deals_fenetre
  on yoppaa_deals (commercant_id, heure_fin)
  where heure_fin is not null and actif = true;

-- ─── CONTRÔLE ───────────────────────────────────────────────────────────────
select controle, valeur, attendu from (
  select 1 as ordre, 'colonne heure_debut' as controle,
    coalesce((select data_type from information_schema.columns where table_schema='public'
              and table_name='yoppaa_deals' and column_name='heure_debut'),'ABSENTE')::text as valeur,
    'time without time zone' as attendu
  union all select 2, 'colonne heure_fin',
    coalesce((select data_type from information_schema.columns where table_schema='public'
              and table_name='yoppaa_deals' and column_name='heure_fin'),'ABSENTE')::text,
    'time without time zone'
  union all select 3, 'contrainte fenetre complete',
    (select count(*) from pg_constraint where conname='yoppaa_deals_fenetre_complete')::text, '1'
  union all select 4, 'index partiel',
    (select count(*) from pg_indexes where indexname='idx_deals_fenetre')::text, '1'
  union all select 5, 'aucun drapeau anti_gaspi cree',
    (select count(*) from information_schema.columns where table_schema='public'
     and table_name='yoppaa_deals' and column_name='anti_gaspi')::text, '0'
  union all select 6, 'deals portant deja une fenetre',
    (select count(*) from yoppaa_deals where heure_fin is not null)::text, '0'
) t order by ordre;
