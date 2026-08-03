-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION STRIPE — Connect Express + paiements acomptes RDV + commandes C&C
-- À passer dans Supabase SQL Editor en une fois. Tout est idempotent (re-run sûr).
--
-- Stratégie : Stripe Connect Express + Direct Charge
--   • Acompte RDV (vitrine PRO/PRO+) : activable par commerçant, paiement immédiat
--   • Commande C&C (alimentaire BOOST/MAX) : paiement obligatoire à la commande
--   • Subscriptions plans commerçants : sur le compte platform Yoppaa (séparé)
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. COMMERCANTS : Connect Express + toggle acompte en ligne ─────────────
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS stripe_account_id              TEXT,           -- acct_xxx (Connect Express account)
  ADD COLUMN IF NOT EXISTS stripe_account_charges_enabled BOOLEAN DEFAULT false,  -- true quand onboarding KYC complet
  ADD COLUMN IF NOT EXISTS stripe_account_details_submitted BOOLEAN DEFAULT false,  -- true quand tous champs requis fournis
  ADD COLUMN IF NOT EXISTS stripe_account_payouts_enabled BOOLEAN DEFAULT false,  -- true quand payouts vers IBAN actifs
  ADD COLUMN IF NOT EXISTS stripe_onboarding_done_at      TIMESTAMPTZ,    -- horodatage du onboarding terminé
  ADD COLUMN IF NOT EXISTS rdv_acompte_en_ligne_actif     BOOLEAN DEFAULT false;  -- toggle "Exiger acompte en ligne" (par commerçant)

CREATE INDEX IF NOT EXISTS idx_commercants_stripe_account ON commercants(stripe_account_id);


-- ─── 2. RDV_RESERVATIONS : tracking acompte payé + clôture solde ────────────
ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id  TEXT,                -- pi_xxx (PaymentIntent acompte)
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,               -- cs_xxx (Checkout Session, pre-paiement)
  ADD COLUMN IF NOT EXISTS acompte_paye_en_ligne     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS acompte_paye_date         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_refund_id          TEXT,                -- re_xxx (Refund ID, set au moment de l'annulation)
  ADD COLUMN IF NOT EXISTS stripe_refund_amount      NUMERIC(10,2),       -- montant remboursé en EUR
  ADD COLUMN IF NOT EXISTS stripe_refund_date        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mode_paiement_solde       TEXT CHECK (mode_paiement_solde IN ('cash','carte','virement','autre',NULL)),
  ADD COLUMN IF NOT EXISTS solde_paye                BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS solde_paye_date           TIMESTAMPTZ;

-- Index sur PI pour lookup rapide depuis webhook handler
CREATE INDEX IF NOT EXISTS idx_rdv_payment_intent ON rdv_reservations(stripe_payment_intent_id);


-- ─── 3. COMMANDES (C&C alimentaire) : préparation paiement obligatoire BOOST/MAX
-- Pas encore utilisé (Phase 1 = vitrine only), mais schéma prêt pour quand on
-- branchera le paiement obligatoire sur les plans BOOST/MAX.
ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id   TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS paye_en_ligne              BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS paye_en_ligne_date         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_refund_id           TEXT,
  ADD COLUMN IF NOT EXISTS stripe_refund_amount       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS stripe_refund_date         TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_commandes_payment_intent ON commandes(stripe_payment_intent_id);


-- ─── 4. TABLE WEBHOOK EVENTS : idempotency Stripe webhooks ──────────────────
-- Stripe peut envoyer le même event plusieurs fois (retries). On stocke chaque
-- event_id reçu pour ne PAS traiter 2 fois (ex: créer 2 RDV pour 1 paiement).
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id    TEXT NOT NULL UNIQUE,                          -- evt_xxx de Stripe
  event_type  TEXT NOT NULL,                                 -- payment_intent.succeeded, etc.
  account_id  TEXT,                                          -- acct_xxx si event venant d'un Connect account
  payload     JSONB,                                         -- full event pour debug
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','error','skipped')),
  error_msg   TEXT
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_webhook_events(event_type, processed_at DESC);

-- RLS : table privée admin uniquement
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin only stripe events" ON stripe_webhook_events;
CREATE POLICY "Admin only stripe events" ON stripe_webhook_events
  FOR ALL TO authenticated
  USING (auth.email() = 'verstappenalexandre@gmail.com')
  WITH CHECK (auth.email() = 'verstappenalexandre@gmail.com');

GRANT SELECT, INSERT, UPDATE ON stripe_webhook_events TO service_role;


-- ─── 5. VERIF ──────────────────────────────────────────────────────────────
-- Pour valider que tout est en place :
SELECT 'commercants' AS table_name, count(*) AS cols_added
FROM information_schema.columns
WHERE table_name = 'commercants'
  AND column_name IN ('stripe_account_id','stripe_account_charges_enabled','rdv_acompte_en_ligne_actif')
UNION ALL
SELECT 'rdv_reservations', count(*)
FROM information_schema.columns
WHERE table_name = 'rdv_reservations'
  AND column_name IN ('stripe_payment_intent_id','acompte_paye_en_ligne','mode_paiement_solde','solde_paye')
UNION ALL
SELECT 'commandes', count(*)
FROM information_schema.columns
WHERE table_name = 'commandes'
  AND column_name IN ('stripe_payment_intent_id','paye_en_ligne','stripe_refund_id')
UNION ALL
SELECT 'stripe_webhook_events (created)', count(*)
FROM information_schema.tables
WHERE table_name = 'stripe_webhook_events';

-- Output attendu :
--   commercants                      | 3
--   rdv_reservations                 | 4
--   commandes                        | 3
--   stripe_webhook_events (created)  | 1
