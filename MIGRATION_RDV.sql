-- ════════════════════════════════════════════════════════════
-- MIGRATION RDV YOPPAA — VERSION CORRIGÉE & PRÊTE
-- À passer manuellement par Alexandre dans Supabase SQL Editor
-- (memory feedback-migrations-sql : pas d'auto-exec, étapes séquentielles)
--
-- Corrige les blockers B1-B6 du brief original + I1 + I2.
-- Décisions tranchées :
--   • Praticien-Prestation = N-N (junction table)
--   • Soft delete pour rdv_reservations (conformité 7 ans Belgique)
--   • Hard DELETE bloqué sur statut 'honore' (RLS)
--   • Vitrines actuelles sur LIVE : grandfathering (pas de changement DB)
--   • Double-booking : UNIQUE INDEX
--   • Fidélité : trigger automatique avec reset au seuil
-- ════════════════════════════════════════════════════════════


-- ─── ÉTAPE 0 : AUDIT PRÉALABLE OBLIGATOIRE ──────────────────
-- À exécuter EN PREMIER, séparément, pour valider les pré-requis.

-- 0.1. Les avis existants ont-ils tous une commande_id ?
-- Résultat attendu : 0. Si > 0, voir étape 2c (NOT VALID en place pour assurer ça).
SELECT COUNT(*) AS avis_sans_commande FROM avis WHERE commande_id IS NULL;

-- 0.2. ✅ VÉRIFIÉ LE 2026-05-30 : zéro commerçant vitrine en DB.
-- → Aucun grandfathering nécessaire. lib/plans.js peut restreindre LIVE à 'alimentaire' direct.
-- Query de re-vérification au cas où (doit toujours retourner 0) :
-- SELECT id, nom, plan, statut_publication FROM commercants WHERE categorie = 'vitrine';


-- ════════════════════════════════════════════════════════════
-- ÉTAPE 1 : CRÉATION DES TABLES (ORDRE CORRECT)
-- ════════════════════════════════════════════════════════════

-- ─── 1.1 — rdv_praticiens (créée en PREMIER, référencée par les autres) ───
CREATE TABLE rdv_praticiens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  prenom text NOT NULL,
  nom text,
  photo_url text,
  description text,
  couleur_hex text DEFAULT '#6B35C4',
  actif boolean DEFAULT true,
  ordre int DEFAULT 0,
  deleted_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX idx_rdv_praticiens_commercant ON rdv_praticiens(commercant_id) WHERE deleted_at IS NULL;


-- ─── 1.2 — rdv_prestations (PAS de FK praticien_id direct, relation N-N) ───
CREATE TABLE rdv_prestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  nom text NOT NULL,
  description text,
  duree_minutes int NOT NULL CHECK (duree_minutes > 0),
  prix decimal(8,2),
  prix_min decimal(8,2),
  prix_max decimal(8,2),
  acompte_pourcent int DEFAULT 0 CHECK (acompte_pourcent BETWEEN 0 AND 100),
  actif boolean DEFAULT true,
  ordre int DEFAULT 0,
  deleted_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX idx_rdv_prestations_commercant ON rdv_prestations(commercant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_rdv_prestations_actif ON rdv_prestations(commercant_id, actif) WHERE deleted_at IS NULL;


-- ─── 1.3 — Junction N-N : prestation_praticiens ───
-- Sémantique :
--   • PRO (sans praticien) : ignorer cette table
--   • PRO+ : junction vide pour une prestation = TOUS les praticiens du commerçant peuvent la faire
--   • PRO+ : junction non vide = SEULS les praticiens listés peuvent la faire
CREATE TABLE rdv_prestation_praticiens (
  prestation_id uuid NOT NULL REFERENCES rdv_prestations(id) ON DELETE CASCADE,
  praticien_id uuid NOT NULL REFERENCES rdv_praticiens(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT now(),
  PRIMARY KEY (prestation_id, praticien_id)
);
CREATE INDEX idx_rdv_pp_prestation ON rdv_prestation_praticiens(prestation_id);
CREATE INDEX idx_rdv_pp_praticien  ON rdv_prestation_praticiens(praticien_id);


-- ─── 1.4 — rdv_creneaux ───
CREATE TABLE rdv_creneaux (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  praticien_id uuid REFERENCES rdv_praticiens(id) ON DELETE CASCADE,
  jour_semaine text CHECK (jour_semaine IN ('lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche')),
  date_specifique date,
  heure_debut time NOT NULL,
  heure_fin time NOT NULL,
  pas_minutes int DEFAULT 15 CHECK (pas_minutes IN (5,10,15,30,60)),
  pause_debut time,
  pause_fin time,
  actif boolean DEFAULT true,
  deleted_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CHECK (heure_fin > heure_debut),
  CHECK (jour_semaine IS NOT NULL OR date_specifique IS NOT NULL),
  -- Si pause définie, les 2 bornes doivent être présentes et cohérentes
  CHECK (
    (pause_debut IS NULL AND pause_fin IS NULL) OR
    (pause_debut IS NOT NULL AND pause_fin IS NOT NULL AND pause_fin > pause_debut)
  )
);
CREATE INDEX idx_rdv_creneaux_commercant ON rdv_creneaux(commercant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_rdv_creneaux_jour ON rdv_creneaux(commercant_id, jour_semaine) WHERE deleted_at IS NULL;


-- ─── 1.5 — rdv_reservations (avec soft delete + anti double-booking) ───
CREATE TABLE rdv_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  prestation_id uuid NOT NULL REFERENCES rdv_prestations(id),
  praticien_id uuid REFERENCES rdv_praticiens(id),

  -- Coordonnées client figées (audit trail)
  client_email text NOT NULL,
  client_prenom text NOT NULL,
  client_nom text,
  client_telephone text NOT NULL,

  -- Détails figés
  date_rdv date NOT NULL,
  heure_debut time NOT NULL,
  heure_fin time NOT NULL,
  duree_minutes int NOT NULL,
  prix_estime decimal(8,2),

  -- Acompte (Phase 2 Stripe)
  acompte_montant decimal(8,2),
  acompte_paye boolean DEFAULT false,
  stripe_payment_intent_id text,

  -- Workflow
  statut text NOT NULL DEFAULT 'confirme' CHECK (statut IN (
    'confirme', 'annule_client', 'annule_commercant', 'honore', 'no_show', 'reporte'
  )),
  motif_annulation text,
  notes_client text,
  notes_commercant text,  -- privé commerçant ; RGPD : doit être communiqué en cas de demande client

  rgpd_marketing boolean DEFAULT false,
  numero_rdv int,

  -- Soft delete : permet "flexibilité agenda commerçant" SANS perdre la trace légale (7 ans BE)
  deleted_at timestamp,

  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX idx_rdv_resa_commercant_date ON rdv_reservations(commercant_id, date_rdv) WHERE deleted_at IS NULL;
CREATE INDEX idx_rdv_resa_client          ON rdv_reservations(client_id)               WHERE deleted_at IS NULL;
CREATE INDEX idx_rdv_resa_statut          ON rdv_reservations(commercant_id, statut)   WHERE deleted_at IS NULL;
CREATE INDEX idx_rdv_resa_praticien       ON rdv_reservations(praticien_id, date_rdv)  WHERE deleted_at IS NULL;

-- ANTI DOUBLE-BOOKING : un même slot ne peut avoir 2 RDV actifs simultanés
-- COALESCE(praticien_id, sentinel) gère le cas PRO sans praticien (1 seul praticien implicite)
CREATE UNIQUE INDEX rdv_no_double_book ON rdv_reservations(
  commercant_id,
  COALESCE(praticien_id, '00000000-0000-0000-0000-000000000000'::uuid),
  date_rdv,
  heure_debut
)
WHERE statut IN ('confirme', 'honore') AND deleted_at IS NULL;


-- ─── 1.6 — rdv_fidelite_progression ───
CREATE TABLE rdv_fidelite_progression (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  compteur int DEFAULT 0,
  recompenses_obtenues int DEFAULT 0,
  recompense_dispo boolean DEFAULT false,  -- true quand seuil atteint, false après usage
  derniere_recompense_le timestamp,
  UNIQUE (commercant_id, client_id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX idx_rdv_fidelite_client ON rdv_fidelite_progression(client_id);


-- ════════════════════════════════════════════════════════════
-- ÉTAPE 2 : EXTENSION DES TABLES EXISTANTES
-- ════════════════════════════════════════════════════════════

-- 2.1 — commercants : configuration RDV par commerçant
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS rdv_actif boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rdv_acompte_global int DEFAULT 0 CHECK (rdv_acompte_global BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS rdv_delai_annulation_heures int DEFAULT 24,
  ADD COLUMN IF NOT EXISTS rdv_paiement_cash boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS rdv_paiement_ligne boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rdv_fidelite_actif boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rdv_fidelite_seuil int DEFAULT 10 CHECK (rdv_fidelite_seuil > 0),
  ADD COLUMN IF NOT EXISTS rdv_fidelite_pourcent int DEFAULT 10 CHECK (rdv_fidelite_pourcent BETWEEN 5 AND 50),
  ADD COLUMN IF NOT EXISTS rdv_message_confirmation text;

-- 2.2 — avis : lien optionnel vers rdv_reservation
ALTER TABLE avis
  ADD COLUMN IF NOT EXISTS rdv_reservation_id uuid REFERENCES rdv_reservations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_avis_rdv ON avis(rdv_reservation_id);

-- 2.3 — Contrainte : un avis vient soit d'une commande, soit d'un RDV (jamais les 2, jamais aucun)
-- NOT VALID : la contrainte n'est appliquée qu'aux NOUVELLES lignes (sécurité pour les existantes).
-- Si l'audit 0.1 retourne 0, on peut faire VALIDATE après pour appliquer aussi aux anciennes.
ALTER TABLE avis ADD CONSTRAINT avis_source_unique CHECK (
  (commande_id IS NOT NULL AND rdv_reservation_id IS NULL) OR
  (commande_id IS NULL AND rdv_reservation_id IS NOT NULL)
) NOT VALID;
-- Quand prêt et après vérif :
--   ALTER TABLE avis VALIDATE CONSTRAINT avis_source_unique;


-- ════════════════════════════════════════════════════════════
-- ÉTAPE 3 : GRANT EXPLICITES (memory feedback-supabase-grants)
-- ════════════════════════════════════════════════════════════

GRANT SELECT ON rdv_prestations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON rdv_prestations TO authenticated;

GRANT SELECT ON rdv_praticiens TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON rdv_praticiens TO authenticated;

GRANT SELECT ON rdv_prestation_praticiens TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON rdv_prestation_praticiens TO authenticated;

GRANT SELECT ON rdv_creneaux TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON rdv_creneaux TO authenticated;

GRANT SELECT ON rdv_reservations TO authenticated;
GRANT INSERT ON rdv_reservations TO anon, authenticated;
GRANT UPDATE, DELETE ON rdv_reservations TO authenticated;

GRANT SELECT, INSERT, UPDATE ON rdv_fidelite_progression TO authenticated;


-- ════════════════════════════════════════════════════════════
-- ÉTAPE 4 : ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════

ALTER TABLE rdv_prestations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdv_praticiens             ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdv_prestation_praticiens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdv_creneaux               ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdv_reservations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdv_fidelite_progression   ENABLE ROW LEVEL SECURITY;


-- ─── 4.1 — PRESTATIONS ───────────────────────────────────────
CREATE POLICY "Prestations actives visibles publiquement" ON rdv_prestations
  FOR SELECT TO anon, authenticated
  USING (
    actif = true AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM commercants c
      WHERE c.id = commercant_id
        AND c.statut_publication = 'publie'
        AND c.categorie = 'vitrine'
        AND c.rdv_actif = true
    )
  );

CREATE POLICY "Commercant gere ses prestations" ON rdv_prestations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM commercants c WHERE c.id = commercant_id AND c.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM commercants c WHERE c.id = commercant_id AND c.auth_user_id = auth.uid()));


-- ─── 4.2 — PRATICIENS ────────────────────────────────────────
CREATE POLICY "Praticiens visibles publiquement" ON rdv_praticiens
  FOR SELECT TO anon, authenticated
  USING (
    actif = true AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM commercants c
      WHERE c.id = commercant_id
        AND c.statut_publication = 'publie'
        AND c.categorie = 'vitrine'
        AND c.rdv_actif = true
    )
  );

CREATE POLICY "Commercant gere ses praticiens" ON rdv_praticiens
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM commercants c WHERE c.id = commercant_id AND c.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM commercants c WHERE c.id = commercant_id AND c.auth_user_id = auth.uid()));


-- ─── 4.3 — JUNCTION PRESTATION-PRATICIEN ─────────────────────
CREATE POLICY "Junction visible si prestation visible" ON rdv_prestation_praticiens
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rdv_prestations p
      WHERE p.id = prestation_id AND p.actif = true AND p.deleted_at IS NULL
    )
  );

CREATE POLICY "Commercant gere ses liens" ON rdv_prestation_praticiens
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rdv_prestations p
      JOIN commercants c ON c.id = p.commercant_id
      WHERE p.id = prestation_id AND c.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rdv_prestations p
      JOIN commercants c ON c.id = p.commercant_id
      WHERE p.id = prestation_id AND c.auth_user_id = auth.uid()
    )
  );


-- ─── 4.4 — CRENEAUX ──────────────────────────────────────────
CREATE POLICY "Creneaux visibles publiquement" ON rdv_creneaux
  FOR SELECT TO anon, authenticated
  USING (
    actif = true AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM commercants c
      WHERE c.id = commercant_id
        AND c.statut_publication = 'publie'
        AND c.rdv_actif = true
    )
  );

CREATE POLICY "Commercant gere ses creneaux" ON rdv_creneaux
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM commercants c WHERE c.id = commercant_id AND c.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM commercants c WHERE c.id = commercant_id AND c.auth_user_id = auth.uid()));


-- ─── 4.5 — RESERVATIONS (FIX B2 : policies séparées par action) ──────────

-- INSERT : public (un visiteur peut prendre RDV sans compte)
CREATE POLICY "Reservation insert public" ON rdv_reservations
  FOR INSERT TO anon, authenticated
  WITH CHECK (deleted_at IS NULL);

-- SELECT : commercant voit ses RDV
CREATE POLICY "Commercant voit ses RDV" ON rdv_reservations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM commercants c WHERE c.id = commercant_id AND c.auth_user_id = auth.uid()));

-- SELECT : client voit ses RDV
CREATE POLICY "Client voit ses RDV" ON rdv_reservations
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid()));

-- UPDATE : commercant modifie ses RDV (changement statut, notes, etc.)
CREATE POLICY "Commercant update ses RDV" ON rdv_reservations
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM commercants c WHERE c.id = commercant_id AND c.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM commercants c WHERE c.id = commercant_id AND c.auth_user_id = auth.uid()));

-- DELETE : commercant peut hard-delete UNIQUEMENT les RDV NON honorés
-- (fix I1 conformité légale belge 7 ans : honore = fait économique = conservation obligatoire)
-- Pour les RDV honorés : utiliser soft delete via UPDATE deleted_at = now()
CREATE POLICY "Commercant delete RDV non honores" ON rdv_reservations
  FOR DELETE TO authenticated
  USING (
    statut <> 'honore'
    AND EXISTS (SELECT 1 FROM commercants c WHERE c.id = commercant_id AND c.auth_user_id = auth.uid())
  );

-- UPDATE : client peut annuler son propre RDV confirmé (et seulement pour passer en annule_client)
-- NOTE LIMITATION : RLS ne peut pas restreindre par colonne. Le client peut techniquement toucher
-- d'autres champs si l'UI le permet. Pour MVP : se reposer sur l'app (envoyer UPDATE limité).
-- Pour V2 : créer une RPC function `annuler_mon_rdv(rdv_id)` en SECURITY DEFINER.
CREATE POLICY "Client peut annuler son RDV" ON rdv_reservations
  FOR UPDATE TO authenticated
  USING (
    client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid())
    AND statut = 'confirme'
  )
  WITH CHECK (statut IN ('confirme', 'annule_client'));


-- ─── 4.6 — FIDELITE ──────────────────────────────────────────
CREATE POLICY "Client voit sa progression" ON rdv_fidelite_progression
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid()));

CREATE POLICY "Commercant voit progressions de ses clients" ON rdv_fidelite_progression
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM commercants c WHERE c.id = commercant_id AND c.auth_user_id = auth.uid()));

-- INSERT/UPDATE seront effectués par le trigger ci-dessous (en SECURITY DEFINER implicite via fonction)
-- Le commercant peut consulter mais pas modifier directement (logique pilotée par le trigger)


-- ════════════════════════════════════════════════════════════
-- ÉTAPE 5 : TRIGGER FIDÉLITÉ AUTO (FIX B4)
-- Au passage statut 'honore' : incrémente le compteur + reset si seuil atteint
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION incrementer_fidelite_rdv()
RETURNS TRIGGER AS $$
DECLARE
  v_fidelite_actif boolean;
  v_seuil int;
  v_current_compteur int;
BEGIN
  -- Trigger seulement au PASSAGE vers 'honore' (pas si déjà honoré)
  IF NEW.statut = 'honore' AND (OLD.statut IS NULL OR OLD.statut <> 'honore') THEN

    -- Vérifier que la fidélité est activée chez ce commerçant
    SELECT rdv_fidelite_actif, rdv_fidelite_seuil
      INTO v_fidelite_actif, v_seuil
      FROM commercants WHERE id = NEW.commercant_id;

    IF v_fidelite_actif AND NEW.client_id IS NOT NULL THEN
      -- Upsert avec valeur initiale 1 (fix B4 : pas 0)
      INSERT INTO rdv_fidelite_progression (commercant_id, client_id, compteur)
      VALUES (NEW.commercant_id, NEW.client_id, 1)
      ON CONFLICT (commercant_id, client_id)
      DO UPDATE SET
        compteur = rdv_fidelite_progression.compteur + 1,
        updated_at = now()
      RETURNING compteur INTO v_current_compteur;

      -- Si seuil atteint : déclencher la récompense
      IF v_current_compteur >= v_seuil THEN
        UPDATE rdv_fidelite_progression
          SET recompense_dispo = true,
              recompenses_obtenues = recompenses_obtenues + 1,
              derniere_recompense_le = now(),
              compteur = 0
        WHERE commercant_id = NEW.commercant_id
          AND client_id = NEW.client_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_rdv_fidelite
  AFTER UPDATE OF statut ON rdv_reservations
  FOR EACH ROW
  EXECUTE FUNCTION incrementer_fidelite_rdv();


-- ════════════════════════════════════════════════════════════
-- ÉTAPE 6 : TRIGGER updated_at AUTO
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION rdv_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_rdv_prestations BEFORE UPDATE ON rdv_prestations
  FOR EACH ROW EXECUTE FUNCTION rdv_touch_updated_at();
CREATE TRIGGER trg_touch_rdv_praticiens BEFORE UPDATE ON rdv_praticiens
  FOR EACH ROW EXECUTE FUNCTION rdv_touch_updated_at();
CREATE TRIGGER trg_touch_rdv_creneaux BEFORE UPDATE ON rdv_creneaux
  FOR EACH ROW EXECUTE FUNCTION rdv_touch_updated_at();
CREATE TRIGGER trg_touch_rdv_reservations BEFORE UPDATE ON rdv_reservations
  FOR EACH ROW EXECUTE FUNCTION rdv_touch_updated_at();
CREATE TRIGGER trg_touch_rdv_fidelite BEFORE UPDATE ON rdv_fidelite_progression
  FOR EACH ROW EXECUTE FUNCTION rdv_touch_updated_at();


-- ════════════════════════════════════════════════════════════
-- FIN DE LA MIGRATION
--
-- Reste à faire (NON SQL — code applicatif) :
--   • lib/plans.js : ajouter PRO + PRO+ + filtre LIVE (vitrine = legacy only)
--   • Routes /commander/rdv/[slug] + dashboard onglet RDV + tabs ConfigDashboard
--   • Templates Resend (confirmation, rappel, annulation, report) + iCal Europe/Brussels
--   • Notification son distinct RDV (/public/sounds/rdv.mp3)
--   • Profil Yopper : section "Mes RDV"
--   • Tests E2E + check anti-double-booking en concurrence
-- ════════════════════════════════════════════════════════════
