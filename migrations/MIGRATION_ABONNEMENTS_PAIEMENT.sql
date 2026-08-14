-- ═══════════════════════════════════════════════════════════════════════════
-- ABONNEMENTS : LA TRACE DU PAIEMENT, ET LE REJEU RENDU INOFFENSIF
--
-- ⚠️ CETTE MIGRATION AURAIT DÛ ÊTRE DANS LA PRÉCÉDENTE. En écrivant le webhook
-- j'ai constaté qu'aucune colonne ne relie un contrat au paiement qui l'a créé,
-- donc rien ne distingue un vrai second achat d'un webhook rejoué.
--
-- ⚠️ ET STRIPE REJOUE SES WEBHOOKS. Ce n'est pas une panne, c'est le
-- fonctionnement documenté : à la moindre réponse lente ou à un 500 passager,
-- le même événement revient. Sans cette colonne, une cliente qui paie UNE fois
-- se retrouve avec DEUX contrats, donc le double de séances, et plus personne
-- ne sait lequel est le bon.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1) D'où vient ce contrat ──────────────────────────────────────────────
-- NULL pour tous les contrats existants : ils ont été enregistrés à la main par
-- le commerçant, encaissés sur place ou par virement, et n'ont jamais eu de
-- paiement Stripe. C'est une information, pas un trou.
ALTER TABLE abonnements
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

COMMENT ON COLUMN abonnements.stripe_payment_intent_id IS
  'Le paiement Stripe qui a créé ce contrat. NULL pour une vente enregistrée à la main.';


-- ─── 2) ⚠️ L'UNICITÉ EN BASE, PAS DANS LE CODE ─────────────────────────────
--
-- Le webhook regarde déjà si le contrat existe avant de l'insérer. Ça ne suffit
-- pas : deux rejeux simultanés passent tous les deux la lecture avant que l'un
-- ait écrit, et on obtient les deux contrats qu'on voulait éviter. C'est
-- exactement la course au double-booking traitée le 22/06 sur les rendez-vous,
-- et la réponse est la même : la base est le seul endroit où deux écritures ne
-- peuvent pas se croiser.
--
-- Index PARTIEL : il ne porte que sur les contrats issus d'un paiement. Les
-- ventes enregistrées à la main ont toutes `NULL` et ne se gênent pas entre
-- elles.
CREATE UNIQUE INDEX IF NOT EXISTS abonnements_paiement_unique
  ON abonnements (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à exécuter séparément.
--
-- Attendu :  colonne_paiement | index_unique | contrats_en_ligne
--                    1        |       1      |         0
-- ═══════════════════════════════════════════════════════════════════════════

-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_name = 'abonnements' AND column_name = 'stripe_payment_intent_id') AS colonne_paiement,
--   (SELECT count(*) FROM pg_indexes
--     WHERE tablename = 'abonnements' AND indexname = 'abonnements_paiement_unique') AS index_unique,
--   (SELECT count(*) FROM abonnements WHERE stripe_payment_intent_id IS NOT NULL) AS contrats_en_ligne;
