-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_TVA_REFERENCE.sql
-- Table de référence des taux de TVA + régime de vente figé sur la commande.
--
-- Fait suite à MIGRATION_TVA_EXPORT.sql (déjà passée). Deux manques y sont
-- comblés :
--
-- 1) LES TAUX DEVIENNENT UNE DONNÉE DE RÉFÉRENCE. La TVA belge est fédérale
--    et mouvante : en 2026 une hausse de l'à-emporter de 6 à 12 % a été votée
--    puis annulée. Le jour où un taux change ou apparaît, on insère une ligne,
--    on ne redéploie pas. Les écrans de saisie lisent cette table.
--
-- 2) LE RÉGIME DE VENTE EST STOCKÉ SUR LA COMMANDE. En Belgique ce n'est pas
--    le produit qui commande le taux, c'est la nature de l'opération : la même
--    assiette est à 6 % emportée et à 12 % servie en salle, et une limonade
--    passe de 6 % à 21 % en s'asseyant. Sans le régime écrit sur la commande,
--    aucun contrôle a posteriori ne peut être refait.
--
-- Idempotente : ré-exécutable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Table de référence des taux ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tva_taux_reference (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taux        numeric(5,2) NOT NULL UNIQUE,
  libelle     text NOT NULL,
  aide        text,
  ordre       integer NOT NULL DEFAULT 0,
  actif       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tva_taux_reference IS
  'Taux de TVA belges proposés dans les écrans de saisie. Modifier cette table suffit à faire évoluer les choix offerts : aucun taux ne doit être écrit dans le code.';
COMMENT ON COLUMN tva_taux_reference.aide IS
  'Exemples d''usage affichés au commerçant. Informatif : la responsabilité du taux reste la sienne.';

-- GRANT explicites : obligatoires sur toute table créée (règle projet).
GRANT SELECT ON tva_taux_reference TO anon, authenticated;
GRANT ALL    ON tva_taux_reference TO service_role;

ALTER TABLE tva_taux_reference ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tva_reference_lecture_publique" ON tva_taux_reference;
CREATE POLICY "tva_reference_lecture_publique"
  ON tva_taux_reference FOR SELECT
  USING (true);   -- référentiel légal, aucune donnée personnelle

INSERT INTO tva_taux_reference (taux, libelle, aide, ordre) VALUES
  (0.00,  'Exonéré',  'Opérations exonérées ou commerce en franchise de TVA.', 10),
  (6.00,  '6 %',      'Denrées alimentaires et boissons non alcoolisées vendues à emporter ou livrées.', 20),
  (12.00, '12 %',     'Nourriture servie et consommée sur place (restauration).', 30),
  (21.00, '21 %',     'Boissons alcoolisées, boissons servies sur place, produits non alimentaires et services.', 40)
ON CONFLICT (taux) DO NOTHING;

-- ─── 2. Régime de vente figé sur la commande ───────────────────────────────
-- 'emporter'  : click & collect, retrait boutique, livraison, expédition
-- 'sur_place' : consommation en salle (réservation de table, commande à table)

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS regime_tva text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commandes_regime_tva_check'
  ) THEN
    ALTER TABLE commandes
      ADD CONSTRAINT commandes_regime_tva_check
      CHECK (regime_tva IS NULL OR regime_tva IN ('emporter', 'sur_place'));
  END IF;
END $$;

COMMENT ON COLUMN commandes.regime_tva IS
  'Nature de l''opération au moment de la vente : emporter ou sur_place. Détermine quel taux de l''article a été retenu. NULL pour les commandes antérieures, traitées comme emporter.';

-- Historique : tout ce qui existait avant la restauration sur place était,
-- par construction, de la vente à emporter.
UPDATE commandes SET regime_tva = 'emporter' WHERE regime_tva IS NULL;

-- ─── 3. Vérification ───────────────────────────────────────────────────────
SELECT taux, libelle FROM tva_taux_reference ORDER BY ordre;
SELECT count(*) AS commandes_sans_regime FROM commandes WHERE regime_tva IS NULL;
