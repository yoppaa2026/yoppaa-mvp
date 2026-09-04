-- UN DÉLAI PAR ARTICLE
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POURQUOI CETTE COLONNE EXISTE
--
-- Une tarte se prépare en 48 h, un sandwich en une heure, une baguette est
-- déjà sur l'étagère. Jusqu'ici Yoppaa ne savait dire qu'une seule chose pour
-- tout le catalogue : la CLÔTURE du créneau, réglée une fois pour toutes. Un
-- boulanger qui vend les trois n'avait donc le choix qu'entre refuser les
-- sandwichs de midi et promettre des tartes impossibles.
--
-- ⚠️ HORIZON ET DÉLAI SONT DEUX BORNES OPPOSÉES, et un seul mot les désignait
-- dans le premier brief. `commercants.horizon_commande` est un PLAFOND
-- (jusqu'où en avant peut-on réserver) ; ce délai-ci est un PLANCHER (combien
-- de temps me faut-il au minimum). Les confondre donne un commerce qui refuse
-- tout : un horizon de deux jours et un délai de 48 h ne laissent presque aucun
-- instant commandable.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ PAS DE MODE, PAS DE PRESET, PAS DE SECOND SYSTÈME DE STOCK. Le brief
-- d'origine posait trois colonnes et un mode de fonctionnement par commerce ;
-- l'audit a montré que deux de ces colonnes étaient mortes et qu'une fonction
-- citée n'existait pas. Une seule colonne, sur l'objet qui porte la contrainte,
-- couvre les trois cas du boulanger.
--
-- 🔴 ET ELLE VIT SUR L'ARTICLE, PAS SUR LE COMMERCE. C'est tout l'intérêt : le
-- même boulanger vend une tarte à 48 h et un sandwich à 1 h dans la même
-- commande. Un réglage global aurait imposé les 48 h au sandwich.

alter table articles
  add column if not exists delai_minutes integer;

comment on column articles.delai_minutes is
  'Combien de temps il faut au commercant pour preparer CET article, en minutes. Vide ou zero = disponible au prochain creneau. Le panier retient le plus contraignant de ses articles.';

-- ⚠️ UN PLAFOND, ET IL N'EST PAS DÉCORATIF. Les deux calculs du premier retrait
-- explorent QUATORZE JOURS et rendent « rien » au-delà. Un délai plus long
-- rendrait l'article commandable par personne, en silence, sans qu'aucun écran
-- ne le signale : c'est exactement la forme de défaut qu'on passe la semaine à
-- retirer. On refuse la saisie plutôt que de fabriquer un article fantôme.
--
-- ⚠️ ET LE NÉGATIF EST REFUSÉ ICI AUSSI, pas seulement dans le module. Laissé
-- passer, il ferait remonter le premier retrait AVANT maintenant et rendrait
-- commandable un créneau déjà commencé.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'articles_delai_minutes_borne') then
    alter table articles
      add constraint articles_delai_minutes_borne
      check (delai_minutes is null or (delai_minutes >= 0 and delai_minutes <= 20160));
  end if;
end $$;

-- ─── CONTRÔLE ───────────────────────────────────────────────────────────────
select controle, valeur, attendu from (
  select 1 as ordre, 'colonne articles.delai_minutes' as controle,
    coalesce((select data_type from information_schema.columns where table_schema='public'
              and table_name='articles' and column_name='delai_minutes'),'ABSENTE')::text as valeur,
    'integer' as attendu
  union all select 2, 'contrainte de bornes posee',
    (select count(*) from pg_constraint where conname='articles_delai_minutes_borne')::text, '1'
  -- ⚠️ LA FICHE LIT `select(''*'')` : sans ce droit, la colonne serait absente de
  -- chaque article cote client, et le module conclurait « aucun delai ».
  union all select 3, 'anon peut LIRE la colonne',
    has_column_privilege('anon','articles','delai_minutes','SELECT')::text, 'true'
  union all select 4, 'le commercant connecte peut LIRE la colonne',
    has_column_privilege('authenticated','articles','delai_minutes','SELECT')::text, 'true'
  union all select 5, 'le commercant connecte peut ECRIRE la colonne',
    has_column_privilege('authenticated','articles','delai_minutes','UPDATE')::text, 'true'
  -- 🔴 CE CONTROLE POSAIT LA MAUVAISE QUESTION, ET IL EST SORTI ROUGE LE 04/09.
  --
  -- Il demandait « anon detient-il le GRANT UPDATE ». La reponse est OUI, et
  -- elle l est sur TOUTES les tables : Supabase pose par defaut
  -- `alter default privileges in schema public grant all on tables to anon,
  -- authenticated, service_role`. Le GRANT est large chez tout le monde, ce
  -- n est pas lui qui protege.
  --
  -- ⚠️ CE QUI PROTEGE, C EST LA RLS. Un GRANT ouvre la porte du batiment, la
  -- RLS decide de quelles lignes on approche. Mesurer le GRANT, c est mesurer
  -- une forme la ou la protection est une regle.
  --
  -- ⚠️ ET UNE ALARME QUI SONNE TOUT LE TEMPS NE PROTEGE PLUS RIEN. Laisse tel
  -- quel, ce controle serait rouge sur chaque migration future, et on
  -- apprendrait a l ignorer. C est exactement ce qui est arrive a la CI le
  -- 04/09 au matin.
  union all select 6, 'articles : la RLS est active (c est ELLE qui protege)',
    (select relrowsecurity from pg_class where oid = 'public.articles'::regclass)::text, 'true'
  union all select 7, 'articles portant deja un delai',
    (select count(*) from articles where delai_minutes is not null and delai_minutes > 0)::text, '0'
  union all select 8, 'aucun delai negatif ou hors bornes',
    (select count(*) from articles where delai_minutes is not null
       and (delai_minutes < 0 or delai_minutes > 20160))::text, '0'
) t order by ordre;
