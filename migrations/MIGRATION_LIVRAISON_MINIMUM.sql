-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_LIVRAISON_MINIMUM.sql
--
-- Le montant minimum de commande pour être livré.
--
-- POURQUOI. Un commerçant qui prend sa voiture pour trois euros de marchandise
-- y perd, essence et temps compris. C'est le premier réglage que réclame
-- quiconque livre, et il manquait : `livraison_config` portait la zone, les
-- frais et le seuil de gratuité, mais aucun plancher.
--
-- NULL ou 0 = aucun minimum. C'est le comportement actuel, donc les
-- commerçants déjà configurés ne voient rien changer.
--
-- ⚠️ CE MINIMUM SE MESURE SUR LES ARTICLES, jamais sur ce qui est payé.
-- Le contrôle serveur (lib/livraison.js, minimumAtteint) l'applique AVANT les
-- frais de livraison et AVANT tout bon cadeau :
--   • ajouter les frais ferait franchir le seuil sans que le panier grossisse ;
--   • un bon cadeau ferait passer sous le minimum une commande qui l'atteignait.
-- Dans les deux cas, le commerçant roulerait pour moins que ce qu'il a fixé.
--
-- Aucune donnée personnelle. Pas de GRANT ni de policy à ajouter : on ajoute
-- une colonne à une table existante, qui garde ses droits et ses politiques.
--
-- Idempotente : ré-exécutable sans effet de bord.
--
-- Vérification attendue en fin de script : colonne_creee = 1
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.livraison_config
  ADD COLUMN IF NOT EXISTS minimum_commande numeric(8,2);

COMMENT ON COLUMN public.livraison_config.minimum_commande IS
  'Montant minimum d''articles pour être livré, en euros. NULL ou 0 = aucun minimum. Mesuré sur les articles, hors frais de livraison et hors bon cadeau.';

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Interroge l'état réel de la base, pas une tautologie (leçon du 09/08).
SELECT COUNT(*) AS colonne_creee
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'livraison_config'
  AND column_name = 'minimum_commande';
