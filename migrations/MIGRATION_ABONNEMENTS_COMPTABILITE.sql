-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_ABONNEMENTS_COMPTABILITE.sql
--
-- ⚠️ CE QUE CETTE MIGRATION RÉPARE : LA VENTE D'UN ABONNEMENT N'EXISTAIT DANS
-- AUCUN DOCUMENT COMPTABLE.
--
-- L'achat d'un abonnement n'écrit que dans `abonnements`, jamais une commande.
-- Or l'export comptable ne lit que `commandes` et `rdv_reservations`. Résultat,
-- pour un abonnement de 540 € réellement encaissé par Stripe :
--   • rien dans le journal des transactions remis au comptable,
--   • rien dans le chiffre d'affaires des Statistiques,
--   • et les FRAIS STRIPE n'étaient même pas enregistrés, la route qui les
--     récupère ne mettant à jour que les commandes et les rendez-vous.
-- Pour une professeure de yoga qui vend surtout des abonnements, la
-- Comptabilité était donc quasiment vide.
--
-- Trois colonnes, exactement celles que portent déjà les rendez-vous, pour que
-- l'abonnement soit une ligne comptable comme les autres.
--
-- ⚠️ AUCUN TAUX N'EST ÉCRIT ICI ni deviné : `tva_taux` est FIGÉ À LA VENTE
-- depuis la prestation que l'abonnement paie, exactement comme un rendez-vous
-- fige le sien. Les contrats déjà vendus restent à NULL ; l'export retombe
-- alors sur le taux par défaut du commerce, et s'il n'y en a pas, le montant
-- part dans la colonne « Taux non renseigné », qui se voit.
--
-- Idempotente : ré-exécutable sans effet de bord. Aucune donnée n'est modifiée.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE abonnements
  ADD COLUMN IF NOT EXISTS tva_taux     numeric(5,2),
  ADD COLUMN IF NOT EXISTS stripe_frais numeric(10,2),
  ADD COLUMN IF NOT EXISTS stripe_net   numeric(10,2);

COMMENT ON COLUMN abonnements.tva_taux IS
  'Taux de TVA figé à la vente, repris de la prestation payée par cet abonnement. NULL pour les contrats antérieurs : l''export retombe sur le taux par défaut du commerce, puis sur "taux non renseigné".';
COMMENT ON COLUMN abonnements.stripe_frais IS
  'Commission Stripe réellement prélevée sur ce paiement, en euros. NULL tant que le relevé n''est pas revenu, ou pour un encaissement au comptoir.';
COMMENT ON COLUMN abonnements.stripe_net IS
  'Montant net versé par Stripe après commission, en euros.';

-- Aucun GRANT ici : la table `abonnements` existe déjà avec ses droits et ses
-- policies, et l'ajout de colonnes en hérite. La règle du GRANT explicite vaut
-- pour toute table CRÉÉE, ce qui n'est pas le cas ici.

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Attendu : 3 lignes (stripe_frais, stripe_net, tva_taux).
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'abonnements'
  AND column_name IN ('tva_taux', 'stripe_frais', 'stripe_net')
ORDER BY column_name;

-- Combien de contrats payés vont entrer en Comptabilité, et combien attendent
-- encore leur taux. Aucune donnée personnelle n'est lue.
SELECT
  count(*) FILTER (WHERE paye IS TRUE)                        AS payes,
  count(*) FILTER (WHERE paye IS TRUE AND tva_taux IS NULL)   AS sans_taux_fige,
  count(*)                                                    AS total
FROM abonnements;
