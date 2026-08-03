-- ============================================================
-- MIGRATION_BONS_CADEAUX.sql
-- Module 3 Bons cadeaux DIGITAUX (décisions Alex 31/07) :
--   · montant LIBRE (5 à 250 €), acheté en ligne sur la fiche du
--     commerçant (Stripe Direct Charge : l'argent va chez lui)
--   · envoyé par email au bénéficiaire OU à l'acheteur lui-même
--   · un CODE unique, un SOLDE utilisable en PLUSIEURS FOIS :
--     en ligne (tunnel de commande) ET au comptoir (pointage dashboard)
--   · validité : 12 mois par défaut, réglable par commerçant
--   · ouvert aux 3 segments (toggle par commerçant), plan Vendre
-- ============================================================

-- 1. Configuration par commerçant
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS bons_cadeaux_actif boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bons_cadeaux_validite_mois int NOT NULL DEFAULT 12
    CHECK (bons_cadeaux_validite_mois BETWEEN 3 AND 60);

-- 2. Bons : le code est LA clé d'utilisation (comptoir + tunnel),
--    le token sert uniquement à la jolie page /cadeau/[token] du lien email.
--    Le bon est créé en 'paiement_en_attente' AVANT le Stripe Checkout et
--    activé par le webhook (pas de bon fantôme utilisable sans paiement).
CREATE TABLE IF NOT EXISTS bons_cadeaux (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id      uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  code               text NOT NULL UNIQUE,
  token              text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  montant_initial    numeric(8,2) NOT NULL CHECK (montant_initial > 0),
  solde              numeric(8,2) NOT NULL CHECK (solde >= 0),
  statut             text NOT NULL DEFAULT 'paiement_en_attente'
    CHECK (statut IN ('paiement_en_attente', 'actif', 'annule')),
  acheteur_email     text NOT NULL,
  acheteur_prenom    text,
  destinataire_mode  text NOT NULL DEFAULT 'moi'
    CHECK (destinataire_mode IN ('moi', 'offrir')),
  beneficiaire_email  text,
  beneficiaire_prenom text,
  message            text,
  expires_at         timestamptz,
  stripe_session_id  text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bons_commercant ON bons_cadeaux (commercant_id, created_at);

-- 3. Mouvements : historique + IDEMPOTENCE (une commande ne débite jamais
--    deux fois le même bon, une annulation ne re-crédite jamais deux fois)
CREATE TABLE IF NOT EXISTS bons_cadeaux_mouvements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bon_id      uuid NOT NULL REFERENCES bons_cadeaux(id) ON DELETE CASCADE,
  montant     numeric(8,2) NOT NULL,   -- négatif = utilisation, positif = re-crédit
  source      text NOT NULL CHECK (source IN ('commande', 'comptoir', 'annulation')),
  commande_id uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bons_mvts_bon ON bons_cadeaux_mouvements (bon_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_bons_mvts_commande
  ON bons_cadeaux_mouvements (bon_id, commande_id)
  WHERE commande_id IS NOT NULL AND source = 'commande';
CREATE UNIQUE INDEX IF NOT EXISTS uidx_bons_mvts_annulation
  ON bons_cadeaux_mouvements (bon_id, commande_id)
  WHERE commande_id IS NOT NULL AND source = 'annulation';

-- 4. Traçabilité sur la commande : quel bon, pour quel montant déduit.
--    commandes.total reste le VRAI total de la commande (CA, fidélité) ;
--    le montant payé en ligne = total - bon_cadeau_montant.
ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS bon_cadeau_id uuid REFERENCES bons_cadeaux(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bon_cadeau_montant numeric(8,2) NOT NULL DEFAULT 0;

-- 5. RLS : AUCUNE lecture publique (le code = de l'argent). Le commerçant
--    voit et gère SES bons (pointage comptoir) ; l'achat, la vérification
--    tunnel et la page /cadeau/[token] passent par des API service_role.
ALTER TABLE bons_cadeaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE bons_cadeaux_mouvements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bons_own ON bons_cadeaux;
CREATE POLICY bons_own ON bons_cadeaux
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM commercants c
            WHERE c.id = bons_cadeaux.commercant_id AND c.auth_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM commercants c
            WHERE c.id = bons_cadeaux.commercant_id AND c.auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS bons_mvts_own ON bons_cadeaux_mouvements;
CREATE POLICY bons_mvts_own ON bons_cadeaux_mouvements
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM bons_cadeaux b JOIN commercants c ON c.id = b.commercant_id
            WHERE b.id = bons_cadeaux_mouvements.bon_id AND c.auth_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM bons_cadeaux b JOIN commercants c ON c.id = b.commercant_id
            WHERE b.id = bons_cadeaux_mouvements.bon_id AND c.auth_user_id = auth.uid())
  );

-- 6. GRANT explicites (règle projet) : pas d'anon, authenticated (RLS filtre),
--    service_role complet pour les API (achat, webhook, tunnel, page token)
GRANT SELECT, INSERT, UPDATE, DELETE ON bons_cadeaux TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bons_cadeaux_mouvements TO authenticated;
GRANT ALL ON bons_cadeaux TO service_role;
GRANT ALL ON bons_cadeaux_mouvements TO service_role;
