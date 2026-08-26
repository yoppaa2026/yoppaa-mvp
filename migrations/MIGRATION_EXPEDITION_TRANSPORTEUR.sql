-- ════════════════════════════════════════════════════════════════════════════
-- LE TRANSPORTEUR DU COLIS
--
-- Demande d'Alex, 26/08 : « Il faut pouvoir ajouter le nom du transporteur avec
-- le numéro d'expédition. Le nom doit aussi s'afficher côté Yopper dans
-- l'onglet commande. »
--
-- ⚠️ UN NUMÉRO DE SUIVI SEUL NE SE SUIT NULLE PART. `expedition_suivi` existe
-- depuis MIGRATION_BOUTIQUE_EXPEDITION, mais un numéro sans transporteur n'est
-- pas une information : le client ne sait pas sur quel site le coller, et le
-- commerçant ne sait plus, deux jours après, chez qui il a déposé le paquet.
--
-- Les valeurs autorisées sont celles de `lib/transporteurs.js`. Le CHECK les
-- répète, et c'est VOLONTAIRE : le navigateur écrit encore directement dans
-- `commandes`, une contrainte de base est donc le seul endroit qui ne se
-- contourne pas. Une valeur inconnue serait affichée nulle part, ce qui est
-- exactement le silence qu'on veut éviter.
--
-- ⚠️ NULL EST LÉGITIME ET LE RESTERA : toutes les commandes déjà expédiées
-- n'ont pas de transporteur, et une commande qui n'est pas une expédition n'en
-- aura jamais. `null` veut dire SANS OBJET, pas « on ne sait pas lire ».
--
-- Idempotent. À passer dans Supabase SQL Editor.
-- Date : 2026-08-26
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS expedition_transporteur text;

-- Le CHECK se pose à part, pour que la migration reste rejouable même si la
-- colonne existait déjà sans contrainte.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commandes_expedition_transporteur_check'
  ) THEN
    ALTER TABLE commandes
      ADD CONSTRAINT commandes_expedition_transporteur_check
      CHECK (
        expedition_transporteur IS NULL
        OR expedition_transporteur IN (
          'bpost', 'dpd', 'gls', 'postnl', 'dhl', 'ups', 'mondialrelay', 'autre'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN commandes.expedition_transporteur IS
  'Qui porte le colis. Clés de lib/transporteurs.js. NULL = sans objet (pas une expedition, ou colis parti avant le 26/08).';

-- ⚠️ AUCUN GRANT À AJOUTER : c'est une colonne d'une table existante, elle
-- hérite des droits de `commandes`. Le GRANT systématique vaut pour les OBJETS
-- créés (tables, vues, fonctions), et il n'y en a aucun ici.

-- ─── CONTRÔLE ───────────────────────────────────────────────────────────────
-- Doit rendre UNE ligne : la colonne, son type, et la contrainte.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'commandes' AND column_name = 'expedition_transporteur') AS colonne_presente,
  (SELECT count(*) FROM pg_constraint
    WHERE conname = 'commandes_expedition_transporteur_check') AS contrainte_presente;
