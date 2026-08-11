-- ════════════════════════════════════════════════════════════════════════════
-- Rappels de retrait : savoir DEPUIS QUAND une commande attend
--
-- ⚠️ RIEN NE DISAIT QUAND UNE COMMANDE ÉTAIT DEVENUE PRÊTE. `recupere_at`
-- existe depuis le 01/07, posé par un déclencheur au passage à « récupérée ».
-- Mais le moment où le commerçant clique « Marquer prête », lui, n'était nulle
-- part. Sans cette date, impossible de calculer un rappel à 24, 48 ou 72
-- heures, et impossible de montrer au commerçant qu'une commande dort depuis
-- trois jours sur son étagère.
--
-- Décision d'Alex (11/08) :
--   • rappels au client à 24 h, 48 h et 72 h pour le DÉTAIL et les SERVICES,
--     à 24 h pour l'ALIMENTAIRE ;
--   • ⚠️ AUCUNE ANNULATION AUTOMATIQUE. C'est le commerçant qui décide, et lui
--     seul. Il reçoit des rappels dans son tableau de bord pour que la
--     commande ne pourrisse pas dans un coin.
--
-- Trois colonnes, sur le modèle exact de `recupere_at` :
--   • `pret_at`                  quand la commande est passée à « prête » ;
--   • `rappel_retrait_nb`        combien de rappels sont déjà partis ;
--   • `rappel_retrait_dernier_at` quand le dernier est parti.
--
-- Les deux dernières évitent le pire défaut possible d'un cron : envoyer
-- plusieurs fois le même rappel, ou en renvoyer un à chaque passage.
--
-- Idempotent. À passer dans Supabase SQL Editor.
-- Date : 2026-08-11
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS pret_at                   timestamptz,
  ADD COLUMN IF NOT EXISTS rappel_retrait_nb         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rappel_retrait_dernier_at timestamptz;

-- ─── Le déclencheur, calqué sur `set_recupere_at` ───────────────────────────
-- ⚠️ IL NE REPOSE PAS LA DATE si la commande est déjà prête : un commerçant qui
-- rouvre une commande puis la remarque prête ne doit pas remettre le compteur à
-- zéro et réveiller le client une seconde fois.
CREATE OR REPLACE FUNCTION set_pret_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.statut = 'pret' AND (OLD.statut IS NULL OR OLD.statut <> 'pret') THEN
    IF NEW.pret_at IS NULL THEN
      NEW.pret_at = NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_pret_at ON commandes;
CREATE TRIGGER trg_set_pret_at
  BEFORE UPDATE ON commandes
  FOR EACH ROW
  EXECUTE FUNCTION set_pret_at();

-- ─── Reprise des commandes déjà prêtes ──────────────────────────────────────
-- Sans cela, les commandes qui attendent DÉJÀ ne recevraient jamais de rappel :
-- leur `pret_at` resterait vide pour toujours. `created_at` est une
-- approximation, la seule disponible, et elle ne peut que sous-estimer
-- l'attente — donc déclencher les rappels un peu trop tôt plutôt que jamais.
UPDATE commandes
SET pret_at = created_at
WHERE statut = 'pret' AND pret_at IS NULL;

-- ─── Contrôle ───────────────────────────────────────────────────────────────
-- Attendu : colonnes = 3, declencheur = 1
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'commandes'
      AND column_name IN ('pret_at', 'rappel_retrait_nb', 'rappel_retrait_dernier_at')) AS colonnes,
  (SELECT count(*) FROM pg_trigger
    WHERE tgname = 'trg_set_pret_at' AND NOT tgisinternal) AS declencheur,
  (SELECT count(*) FROM commandes WHERE statut = 'pret' AND pret_at IS NOT NULL) AS pretes_datees;
