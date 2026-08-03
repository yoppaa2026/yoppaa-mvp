-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_RDV_COMMANDE_LIEE.sql
-- Un rendez-vous et une commande de produits nés du MÊME paiement.
--
-- CONTEXTE. Chez un commerce de services, un client qui réserve une coupe et
-- veut repartir avec son shampoing devait faire DEUX parcours et DEUX
-- paiements. Décision Alex du 03/08 : un seul tunnel, une seule transaction
-- Stripe qui additionne l'acompte du rendez-vous et le prix complet des
-- produits, retirés le jour du rendez-vous.
--
-- POURQUOI CE LIEN EST OBLIGATOIRE. À l'annulation, le client choisit s'il
-- garde ses produits. S'il les garde, on ne rembourse que l'acompte : c'est un
-- remboursement PARTIEL du paiement. Sans lien entre les deux objets, on ne
-- sait pas quelle part de quel paiement rembourser, et le montant se calcule
-- au jugé. On lie donc les deux dès la création.
--
-- Le lien est posé des DEUX côtés. La lecture part tantôt du rendez-vous
-- (agenda, annulation) tantôt de la commande (préparation, comptabilité) :
-- une jointure à sens unique obligerait l'un des deux à balayer toute la
-- table. Les deux colonnes sont nullables, l'immense majorité des commandes et
-- des rendez-vous restant indépendants.
--
-- Aucune table créée : aucun GRANT à ajouter.
-- Idempotente : ré-exécutable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. La commande sait de quel rendez-vous elle vient ─────────────────────
ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS rdv_reservation_id uuid;

COMMENT ON COLUMN commandes.rdv_reservation_id IS
  'Rendez-vous payé dans la même transaction que cette commande (tunnel unique des commerces de services). NULL pour une commande ordinaire.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commandes_rdv_reservation_id_fkey'
  ) THEN
    ALTER TABLE commandes
      ADD CONSTRAINT commandes_rdv_reservation_id_fkey
      FOREIGN KEY (rdv_reservation_id) REFERENCES rdv_reservations(id)
      -- ON DELETE SET NULL et non CASCADE : supprimer un rendez-vous ne doit
      -- JAMAIS faire disparaître une commande payée. La marchandise a été
      -- vendue, elle doit rester dans les comptes et dans l'export TVA.
      ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 2. Le rendez-vous sait quelle commande il porte ────────────────────────
ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS commande_id uuid;

COMMENT ON COLUMN rdv_reservations.commande_id IS
  'Commande de produits payée dans la même transaction que ce rendez-vous. NULL pour un rendez-vous sans produits.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rdv_reservations_commande_id_fkey'
  ) THEN
    ALTER TABLE rdv_reservations
      ADD CONSTRAINT rdv_reservations_commande_id_fkey
      FOREIGN KEY (commande_id) REFERENCES commandes(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 3. Index de jointure ───────────────────────────────────────────────────
-- Partiels : seules les lignes réellement liées nous intéressent, et elles
-- resteront une minorité. Un index plein coûterait de l'écriture sur chaque
-- commande pour rien.
CREATE INDEX IF NOT EXISTS idx_commandes_rdv_reservation
  ON commandes (rdv_reservation_id)
  WHERE rdv_reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rdv_reservations_commande
  ON rdv_reservations (commande_id)
  WHERE commande_id IS NOT NULL;

-- ─── 4. Ce que le client a décidé de ses produits à l'annulation ────────────
-- Trois états. NULL : le rendez-vous n'a jamais été annulé, ou n'avait pas de
-- produits. 'garde' : le client garde ses produits, seul l'acompte est
-- remboursé, la marchandise l'attend en boutique. 'rend' : tout est remboursé
-- et le stock est restauré.
--
-- Cette colonne n'est pas un confort d'affichage : c'est la trace de la
-- décision du client, celle qui justifie le montant remboursé si la banque ou
-- le client conteste plus tard.
ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS produits_annulation text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rdv_reservations_produits_annulation_check'
  ) THEN
    ALTER TABLE rdv_reservations
      ADD CONSTRAINT rdv_reservations_produits_annulation_check
      CHECK (produits_annulation IS NULL OR produits_annulation IN ('garde', 'rend'));
  END IF;
END $$;

COMMENT ON COLUMN rdv_reservations.produits_annulation IS
  'Choix du client à l''annulation d''un rendez-vous portant des produits : garde (remboursement de l''acompte seul) ou rend (remboursement total + stock restauré).';

-- ─── Vérification ──────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'commandes' AND column_name = 'rdv_reservation_id')        AS col_commandes,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'rdv_reservations' AND column_name = 'commande_id')        AS col_rdv,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'rdv_reservations' AND column_name = 'produits_annulation') AS col_choix,
  (SELECT count(*) FROM pg_indexes
     WHERE indexname IN ('idx_commandes_rdv_reservation', 'idx_rdv_reservations_commande')) AS index_crees;
-- Attendu : 1, 1, 1, 2
