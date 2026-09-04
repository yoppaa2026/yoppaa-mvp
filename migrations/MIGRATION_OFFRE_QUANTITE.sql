-- L'OFFRE DE FIN DE JOURNÉE PORTE SA PROPRE QUANTITÉ
--
-- Appliquée en production le 04/09/2026, sept contrôles verts.
--
-- 🔴 POURQUOI PAS SUR L'ARTICLE, ET C'EST ALEX QUI L'A TROUVÉ.
--
-- Ma première version écrivait la quantité restante dans `articles.stock_jour`.
-- Son scénario l'a démolie : un boulanger qui produit sur commande ne met
-- AUCUNE limite de stock sur ses tartes, puisqu'il produit ce qu'on lui
-- demande. Le champ est donc vide, ce qui veut dire « aucune limite ».
--
-- Publier « il m'en reste 1 » y aurait écrit 1. Or `articles.stock_jour` N'EST
-- PAS DATÉ : il vaut pour tous les jours suivants. Le lendemain matin, sa tarte
-- auparavant illimitée aurait été plafonnée à une pièce, et le surlendemain
-- aussi. **Publier un invendu aurait cassé durablement son catalogue, en
-- silence.**
--
-- La quantité vit donc sur l'OFFRE, qui porte déjà sa fenêtre et son prix. Un
-- seul objet, une seule durée de vie : quand la fenêtre se ferme, tout s'arrête
-- et rien ne déborde sur demain.
--
-- ⚠️ ET `commande_articles` NE GARDAIT AUCUNE TRACE DU DEAL. Le `deal_id`
-- servait à calculer le prix, puis il était jeté. Impossible de savoir combien
-- d'unités d'une offre avaient été vendues, donc impossible de la plafonner.
-- Cette colonne vaut d'ailleurs bien au-delà de l'anti-gaspi : ni la
-- comptabilité ni les statistiques ne distinguaient une ligne vendue en
-- promotion d'une ligne au prix plein.

alter table yoppaa_deals
  add column if not exists quantite integer;

comment on column yoppaa_deals.quantite is
  'Combien il en reste sur CETTE offre. Vit sur l offre, jamais sur l article : articles.stock_jour n est pas date et plafonnerait le produit tous les jours suivants.';

alter table commande_articles
  add column if not exists deal_id uuid;

comment on column commande_articles.deal_id is
  'Quelle offre a produit cette ligne. PAS de cle etrangere : une offre supprimee pendant un paiement ferait echouer la commande. Un identifiant orphelin ne gene personne, une vente refusee si.';

-- ⚠️ UNE OFFRE QUI PORTE UNE FENÊTRE DOIT PORTER SA QUANTITÉ. Même famille que
-- « les deux heures ou aucune » : un invendu sans quantité ne se plafonne pas,
-- et il se vendrait à l'infini sans que rien ne le signale.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'yoppaa_deals_quantite_positive') then
    alter table yoppaa_deals
      add constraint yoppaa_deals_quantite_positive
      check (quantite is null or quantite > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'yoppaa_deals_fenetre_a_sa_quantite') then
    alter table yoppaa_deals
      add constraint yoppaa_deals_fenetre_a_sa_quantite
      check (heure_fin is null or quantite is not null);
  end if;
end $$;

-- Le comptage « combien en a-t-on déjà vendu sur cette offre ».
create index if not exists idx_commande_articles_deal
  on commande_articles (deal_id) where deal_id is not null;

-- ─── CONTRÔLE ───────────────────────────────────────────────────────────────
select controle, valeur, attendu from (
  select 1 as ordre, 'colonne yoppaa_deals.quantite' as controle,
    coalesce((select data_type from information_schema.columns where table_schema='public'
              and table_name='yoppaa_deals' and column_name='quantite'),'ABSENTE')::text as valeur,
    'integer' as attendu
  union all select 2, 'colonne commande_articles.deal_id',
    coalesce((select data_type from information_schema.columns where table_schema='public'
              and table_name='commande_articles' and column_name='deal_id'),'ABSENTE')::text,
    'uuid'
  union all select 3, 'quantite strictement positive',
    (select count(*) from pg_constraint where conname='yoppaa_deals_quantite_positive')::text, '1'
  union all select 4, 'une fenetre exige sa quantite',
    (select count(*) from pg_constraint where conname='yoppaa_deals_fenetre_a_sa_quantite')::text, '1'
  union all select 5, 'index de comptage',
    (select count(*) from pg_indexes where indexname='idx_commande_articles_deal')::text, '1'
  union all select 6, 'aucune cle etrangere posee sur deal_id',
    (select count(*) from pg_constraint c join pg_class t on t.oid = c.conrelid
     where t.relname = 'commande_articles' and c.contype = 'f'
       and pg_get_constraintdef(c.oid) like '%deal_id%')::text, '0'
  union all select 7, 'lignes de commande deja rattachees a une offre',
    (select count(*) from commande_articles where deal_id is not null)::text, '0'
) t order by ordre;
