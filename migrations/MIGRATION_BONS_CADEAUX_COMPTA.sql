-- ═══════════════════════════════════════════════════════════════════════════
-- LA VENTE D'UN BON CADEAU ENTRE ENFIN DANS LA COMPTABILITÉ
-- Passée en production le 03/09/2026, six contrôles verts.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 POURQUOI. Le paiement d'un bon cadeau est un DIRECT CHARGE sur le compte
-- Stripe du commerçant : l'argent arrive réellement chez lui. La vente n'écrivait
-- pourtant que dans `bons_cadeaux`, jamais une commande, et l'export comptable
-- ne lit que les commandes, les rendez-vous et les abonnements. Quinze bons
-- vendus, aucune ligne, et la colonne « encaissé en ligne » présentée au
-- commerçant comme la clé du rapprochement ne pouvait pas se rapprocher.
--
-- ⚠️ C'EST LE FRÈRE JAMAIS TRAITÉ DES ABONNEMENTS DU 17/08 : une vente qui
-- n'écrit pas de commande est une vente que la comptabilité ne voit pas.
--
-- ⚠️ `updated_at` NE POUVAIT PAS SERVIR DE DATE DE PAIEMENT : chaque débit du
-- solde le réécrit. D'où `paye_le`, qui ne bouge plus une fois posé.
--
-- ⚠️ LE RÉGIME DE TVA EST FIGÉ SUR LE BON, comme le taux l'est déjà sur une
-- ligne de commande. Un bon à USAGE UNIQUE (taux connu dès l'émission, cas d'un
-- salon à 21 %) porte sa TVA À LA VENTE ; un bon à USAGES MULTIPLES (taux
-- incertain, cas d'une épicerie qui mélange 6 et 21) la porte À L'UTILISATION.
-- Un commerçant qui change de catalogue l'an prochain ne doit pas réécrire la
-- TVA de ses bons de cette année.
--
-- ⚠️ AUCUN GRANT : ce sont des colonnes ajoutées à des tables déjà autorisées,
-- et un GRANT de table couvre les colonnes ajoutées.
--
-- ⚠️ CONTRAINTES `NOT VALID` : elles s'appliquent aux écritures futures sans
-- exiger la relecture des lignes existantes, dont le régime est NULL.

alter table bons_cadeaux
  add column if not exists paye_le timestamptz,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_frais numeric(10,2),
  add column if not exists stripe_net numeric(10,2),
  add column if not exists tva_regime text,
  add column if not exists tva_taux numeric(5,2);

alter table commercants
  add column if not exists bons_tva_regime text;

-- `add constraint` n'accepte pas `if not exists` : sans ce bloc, un second
-- passage échouerait au lieu de ne rien faire.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bons_cadeaux_tva_regime_chk') then
    alter table bons_cadeaux
      add constraint bons_cadeaux_tva_regime_chk
      check (tva_regime is null or tva_regime in ('usage_unique','usage_multiple')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'commercants_bons_tva_regime_chk') then
    alter table commercants
      add constraint commercants_bons_tva_regime_chk
      check (bons_tva_regime is null or bons_tva_regime in ('usage_unique','usage_multiple')) not valid;
  end if;
end $$;

-- Le cron nocturne complète les frais manquants et reprend l'historique : cet
-- index lui évite de balayer toute la table chaque nuit.
create index if not exists idx_bons_frais_a_reprendre
  on bons_cadeaux (paye_le)
  where stripe_frais is null and paye_le is not null;

comment on column bons_cadeaux.tva_regime is
  'Regime FIGE a la vente. Un changement chez le commercant ne reecrit pas le passe.';
comment on column bons_cadeaux.paye_le is
  'Instant du paiement. updated_at ne peut pas servir : le debit du solde le reecrit.';
comment on column commercants.bons_tva_regime is
  'Correction manuelle du regime deduit du catalogue. NULL = on deduit.';

-- ─── CONTRÔLE ───────────────────────────────────────────────────────────────
-- Une ligne par contrôle, sa valeur et son attendu, tout en texte.

select 'A. colonnes ajoutees sur bons_cadeaux' as controle,
       (select count(*)::text from information_schema.columns
        where table_name='bons_cadeaux'
          and column_name in ('paye_le','stripe_payment_intent_id','stripe_frais','stripe_net','tva_regime','tva_taux')) as valeur,
       '6' as attendu
union all
select 'B. colonne ajoutee sur commercants',
       (select count(*)::text from information_schema.columns
        where table_name='commercants' and column_name='bons_tva_regime'), '1'
union all
select 'C. contraintes de regime posees',
       (select count(*)::text from pg_constraint
        where conname in ('bons_cadeaux_tva_regime_chk','commercants_bons_tva_regime_chk')), '2'
union all
select 'D. index de reprise des frais',
       (select count(*)::text from pg_indexes where indexname='idx_bons_frais_a_reprendre'), '1'
union all
select 'E. bons vendus a rattraper, tous commerces',
       (select count(*)::text from bons_cadeaux where statut <> 'paiement_en_attente'),
       'au moins 6, dont ceux de Ciseaux et Soins'
union all
select 'F. aucune valeur de regime deja ecrite',
       (select count(*)::text from bons_cadeaux where tva_regime is not null), '0';
