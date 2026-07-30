-- ============================================================
-- MIGRATION_FIDELITE.sql
-- B.6 Fidélité (brief verrouillé 31/07) : le GSM = la carte.
--  1) Config du programme sur commercants (fidelite_*)
--  2) fidelite_cartes : une carte par (commerçant, téléphone),
--     créée à la volée au pointage comptoir ou au crédit auto
--  3) fidelite_mouvements : historique + anti-doublon
--
-- Répartition forfaits : Communiquer = pointage comptoir,
-- Vendre = + crédit automatique sur transactions abouties.
-- ============================================================

-- 1. Configuration du programme (mêmes conventions que boutique_*)
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS fidelite_actif boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fidelite_mecanique text NOT NULL DEFAULT 'passages'
    CHECK (fidelite_mecanique IN ('passages', 'cagnotte')),
  ADD COLUMN IF NOT EXISTS fidelite_seuil_passages int NOT NULL DEFAULT 10
    CHECK (fidelite_seuil_passages BETWEEN 2 AND 50),
  ADD COLUMN IF NOT EXISTS fidelite_taux_cagnotte numeric(4,2) NOT NULL DEFAULT 5.00
    CHECK (fidelite_taux_cagnotte > 0 AND fidelite_taux_cagnotte <= 30),
  ADD COLUMN IF NOT EXISTS fidelite_seuil_cagnotte numeric(8,2) NOT NULL DEFAULT 10.00
    CHECK (fidelite_seuil_cagnotte > 0),
  ADD COLUMN IF NOT EXISTS fidelite_recompense_type text NOT NULL DEFAULT 'remise_montant'
    CHECK (fidelite_recompense_type IN ('remise_montant', 'remise_pct')),
  ADD COLUMN IF NOT EXISTS fidelite_recompense_valeur numeric(8,2),
  ADD COLUMN IF NOT EXISTS fidelite_recompense_libelle text,
  ADD COLUMN IF NOT EXISTS fidelite_sms_actif boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fidelite_sms_credits int NOT NULL DEFAULT 0;

-- 2. Cartes : le téléphone (normalisé +32...) est LA clé d'identité.
--    token = accès sécurisé à la page /carte/[token] (lien du SMS), la seule
--    voie de consultation sans compte (jamais de consultation par numéro).
CREATE TABLE IF NOT EXISTS fidelite_cartes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  telephone     text NOT NULL,
  client_id     uuid REFERENCES clients(id) ON DELETE SET NULL,
  passages      int NOT NULL DEFAULT 0,
  cagnotte      numeric(8,2) NOT NULL DEFAULT 0,
  recompenses_disponibles int NOT NULL DEFAULT 0,
  token         text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  sms_creation_envoye boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (commercant_id, telephone)
);

CREATE INDEX IF NOT EXISTS idx_fid_cartes_commercant ON fidelite_cartes (commercant_id);
CREATE INDEX IF NOT EXISTS idx_fid_cartes_telephone  ON fidelite_cartes (telephone);
CREATE INDEX IF NOT EXISTS idx_fid_cartes_client     ON fidelite_cartes (client_id);

-- 3. Mouvements : historique lisible + anti-doublon du crédit auto
--    (une commande ne crédite jamais deux fois la même carte)
CREATE TABLE IF NOT EXISTS fidelite_mouvements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carte_id    uuid NOT NULL REFERENCES fidelite_cartes(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('passage', 'cagnotte', 'recompense_debloquee', 'recompense_utilisee', 'ajustement')),
  valeur      numeric(8,2),
  source      text NOT NULL CHECK (source IN ('comptoir', 'commande', 'rdv', 'system')),
  commande_id uuid,
  rdv_id      uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fid_mvts_carte ON fidelite_mouvements (carte_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_fid_mvts_commande
  ON fidelite_mouvements (carte_id, commande_id) WHERE commande_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_fid_mvts_rdv
  ON fidelite_mouvements (carte_id, rdv_id) WHERE rdv_id IS NOT NULL;

-- 4. RLS : AUCUNE lecture publique (le téléphone est une donnée personnelle).
--    Le commerçant voit et gère SES cartes (pointage comptoir) ; le Yopper et
--    la page /carte/[token] passent par des API service_role.
ALTER TABLE fidelite_cartes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fidelite_mouvements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fid_cartes_own ON fidelite_cartes;
CREATE POLICY fid_cartes_own ON fidelite_cartes
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM commercants c
            WHERE c.id = fidelite_cartes.commercant_id AND c.auth_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM commercants c
            WHERE c.id = fidelite_cartes.commercant_id AND c.auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS fid_mvts_own ON fidelite_mouvements;
CREATE POLICY fid_mvts_own ON fidelite_mouvements
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM fidelite_cartes fc JOIN commercants c ON c.id = fc.commercant_id
            WHERE fc.id = fidelite_mouvements.carte_id AND c.auth_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM fidelite_cartes fc JOIN commercants c ON c.id = fc.commercant_id
            WHERE fc.id = fidelite_mouvements.carte_id AND c.auth_user_id = auth.uid())
  );

-- 5. GRANT explicites (règle projet) : pas d'anon, authenticated (RLS filtre),
--    service_role complet pour les API (crédit auto, app Yopper, page token, SMS)
GRANT SELECT, INSERT, UPDATE, DELETE ON fidelite_cartes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON fidelite_mouvements TO authenticated;
GRANT ALL ON fidelite_cartes TO service_role;
GRANT ALL ON fidelite_mouvements TO service_role;
