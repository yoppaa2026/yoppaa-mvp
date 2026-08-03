-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_RLS_RDV_PUBLIC.sql
-- Ouvre en LECTURE PUBLIQUE la configuration de prise de rendez-vous.
--
-- LE BUG. La page publique /commander/rdv/<slug> lit les prestations, les
-- praticiens, leur jonction, les horaires de réservation et les fermetures.
-- Aucune de ces tables n'avait de politique de lecture pour le rôle anon : le
-- RLS ne renvoyait pas d'erreur, il renvoyait ZÉRO ligne. Résultat, un salon
-- avec neuf prestations encodées affichait « Aucune prestation disponible pour
-- le moment » et aucun rendez-vous ne pouvait être pris.
--
-- CE QUI N'EST PAS OUVERT, ET NE DOIT PAS L'ÊTRE. `rdv_reservations` contient
-- le nom, l'email et le téléphone des clients. Elle reste fermée en lecture.
-- Les créneaux déjà pris continuent de passer par les fonctions
-- rdv_slots_busy et rdv_slots_busy_range, en SECURITY DEFINER, qui ne
-- renvoient que des intervalles horaires sans la moindre donnée personnelle.
--
-- Seule une INSERTION encadrée y est autorisée, pour qu'un habitant puisse
-- réserver sans compte. Le WITH CHECK interdit de se déclarer soi-même
-- acompte payé : sans lui, n'importe qui pourrait forger une réservation
-- marquée comme réglée.
--
-- Aucune table créée : aucun GRANT à ajouter, les droits de table existent
-- déjà (le RLS filtrait, il ne refusait pas l'accès).
-- Idempotente : ré-exécutable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Configuration publique du salon ────────────────────────────────────
-- Ces cinq tables ne contiennent aucune donnée personnelle : ce sont les
-- prestations proposées, les praticiens, leurs affectations et les horaires.
-- C'est exactement ce qu'un salon affiche sur sa vitrine.

ALTER TABLE rdv_prestations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdv_praticiens            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdv_prestation_praticiens ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdv_creneaux              ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdv_fermetures            ENABLE ROW LEVEL SECURITY;

-- Prestations : uniquement celles réellement proposées.
DROP POLICY IF EXISTS "rdv_prestations_lecture_publique" ON rdv_prestations;
CREATE POLICY "rdv_prestations_lecture_publique"
  ON rdv_prestations FOR SELECT
  TO anon, authenticated
  USING (actif IS TRUE AND deleted_at IS NULL);

-- Praticiens : idem, on ne montre pas un praticien désactivé ou parti.
DROP POLICY IF EXISTS "rdv_praticiens_lecture_publique" ON rdv_praticiens;
CREATE POLICY "rdv_praticiens_lecture_publique"
  ON rdv_praticiens FOR SELECT
  TO anon, authenticated
  USING (actif IS TRUE AND deleted_at IS NULL);

-- Jonction prestation/praticien : sans elle, le choix « avec qui ? » est vide.
DROP POLICY IF EXISTS "rdv_prestation_praticiens_lecture_publique" ON rdv_prestation_praticiens;
CREATE POLICY "rdv_prestation_praticiens_lecture_publique"
  ON rdv_prestation_praticiens FOR SELECT
  TO anon, authenticated
  USING (true);

-- Horaires de réservation et fermetures : la grille des créneaux en dépend.
DROP POLICY IF EXISTS "rdv_creneaux_lecture_publique" ON rdv_creneaux;
CREATE POLICY "rdv_creneaux_lecture_publique"
  ON rdv_creneaux FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "rdv_fermetures_lecture_publique" ON rdv_fermetures;
CREATE POLICY "rdv_fermetures_lecture_publique"
  ON rdv_fermetures FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── 2. Réservation sans compte, mais encadrée ─────────────────────────────
-- Pas de politique de LECTURE ici : les coordonnées des autres clients ne
-- doivent jamais sortir. Le Yopper retrouve ses propres rendez-vous par les
-- routes API dédiées, qui vérifient son identité côté serveur.

ALTER TABLE rdv_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rdv_reservations_insertion_publique" ON rdv_reservations;
CREATE POLICY "rdv_reservations_insertion_publique"
  ON rdv_reservations FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Un rendez-vous créé depuis l'app est un rendez-vous à honorer, jamais un
    -- rendez-vous déjà réglé : le paiement d'acompte passe par Stripe et c'est
    -- le webhook, en service_role, qui écrit ces champs.
    acompte_paye IS NOT TRUE
    AND acompte_paye_en_ligne IS NOT TRUE
    AND stripe_payment_intent_id IS NULL
    AND stripe_refund_id IS NULL
    AND statut = 'confirme'
  );

-- ─── 3. Vérification ───────────────────────────────────────────────────────
-- Doit lister les six politiques créées ci-dessus.
SELECT tablename, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename LIKE 'rdv\_%'
 ORDER BY tablename, policyname;
