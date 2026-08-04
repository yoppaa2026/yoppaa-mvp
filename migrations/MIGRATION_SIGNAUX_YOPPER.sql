-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_SIGNAUX_YOPPER.sql
-- Les envies des habitants deviennent lisibles par le commerçant.
--
-- CONTEXTE. Quand un habitant tombe sur une fiche où il ne peut pas commander,
-- il peut dire « je veux commander ici ». Ce signal part dans
-- `upgrade_requests` depuis des semaines et PERSONNE NE LE LIT : ni le
-- commerçant, ni un écran d'administration. C'est pourtant l'argument de vente
-- le plus fort qui soit, et la landing le promet noir sur blanc.
--
-- ⚠️ CONTRAINTE STRUCTURANTE : RGPD. Le commerçant ne doit JAMAIS voir QUI a
-- envoyé une envie. Il voit des NOMBRES. C'est exactement la promesse faite sur
-- la page d'accueil : « tu ne vois pas leurs coordonnées, mais tu leur parles
-- par des notifications ciblées ». Cette migration ne crée donc aucun accès aux
-- lignes : elle ajoute une vue d'agrégats et deux réglages.
--
-- Idempotente : ré-exécutable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Réglages du commerçant ─────────────────────────────────────────────
-- Prévenir à CHAQUE envie serait du harcèlement et perdrait tout son sens. On
-- prévient quand ça devient un argument : quand plusieurs personnes demandent
-- LA MÊME chose. Le seuil est réglable, zéro désactive l'alerte.
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS signaux_seuil_alerte integer NOT NULL DEFAULT 5;

COMMENT ON COLUMN commercants.signaux_seuil_alerte IS
  'Nombre d''envies d''un même type à partir duquel le commerçant est prévenu. 0 = jamais.';

-- Date de la dernière consultation de ses envies. Tout ce qui est postérieur
-- est « nouveau » : un seul horodatage suffit, là où un drapeau par ligne
-- aurait demandé d'écrire dans une table de données personnelles.
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS signaux_vus_le timestamptz;

COMMENT ON COLUMN commercants.signaux_vus_le IS
  'Dernière fois que le commerçant a ouvert ses envies. Sert à marquer les nouvelles, sans rien écrire dans upgrade_requests.';

-- Dernier email de signaux envoyé. Sans lui, le cron réexpédierait le même
-- récapitulatif à chaque passage.
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS signaux_email_le timestamptz;

-- LE DROIT DE DIRE NON. Un signal qui ne convertit jamais devient du bruit et
-- abîme la confiance. Le commerçant peut faire taire ces emails, définitivement
-- ou pour un temps. Un commerçant qui se sent respecté revient de lui-même.
ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS signaux_email_actif boolean NOT NULL DEFAULT true;

ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS signaux_email_pause_jusqu timestamptz;

COMMENT ON COLUMN commercants.signaux_email_pause_jusqu IS
  'Le commerçant a demandé une pause sur les emails de signaux jusqu''à cette date. NULL = pas de pause.';

-- ─── 2. Index de lecture ───────────────────────────────────────────────────
-- L'agrégation demande « les envies de CE commerce, par type, sur une période ».
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_commercant_date
  ON upgrade_requests (commercant_id, type, created_at DESC);

-- ─── 3. La vue d'agrégats : des NOMBRES, jamais des personnes ──────────────
-- SECURITY INVOKER par défaut sur une vue simple : c'est voulu, la vue ne sert
-- qu'aux routes serveur. Aucune colonne ne permet de remonter à un habitant.
-- `soir` et `weekend` portent l'argument le plus fort face à un commerçant qui
-- a déjà un logiciel de réservation : ces demandes-là sont arrivées quand sa
-- boutique était FERMÉE et que personne ne pouvait l'appeler. Ce ne sont pas
-- des rendez-vous qu'il a déjà, ce sont des rendez-vous qu'il a perdus.
-- L'heure est lue en heure de Bruxelles, sinon le décompte se décale d'une ou
-- deux heures selon la saison.
CREATE OR REPLACE VIEW signaux_envies_stats AS
SELECT
  commercant_id,
  type,
  count(*)                                                          AS total,
  count(*) FILTER (WHERE created_at >= now() - interval '30 days')  AS trente_jours,
  count(*) FILTER (WHERE created_at >= now() - interval '7 days')   AS sept_jours,
  count(*) FILTER (
    WHERE created_at >= now() - interval '30 days'
      AND EXTRACT(hour FROM created_at AT TIME ZONE 'Europe/Brussels') >= 19
  )                                                                 AS soir_30j,
  count(*) FILTER (
    WHERE created_at >= now() - interval '30 days'
      AND EXTRACT(isodow FROM created_at AT TIME ZONE 'Europe/Brussels') >= 6
  )                                                                 AS weekend_30j,
  max(created_at)                                                   AS derniere
FROM upgrade_requests
GROUP BY commercant_id, type;

COMMENT ON VIEW signaux_envies_stats IS
  'Envies des habitants agrégées par commerce et par type. Ne contient AUCUNE donnée personnelle : le commerçant voit des nombres, jamais des identités.';

-- La vue reste réservée au serveur : le navigateur du commerçant ne la lit pas.
REVOKE ALL ON signaux_envies_stats FROM anon, authenticated;
GRANT SELECT ON signaux_envies_stats TO service_role;

-- ─── Vérification ──────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'commercants'
       AND column_name IN ('signaux_seuil_alerte', 'signaux_vus_le', 'signaux_email_le',
                           'signaux_email_actif', 'signaux_email_pause_jusqu'))  AS colonnes,
  (SELECT count(*) FROM information_schema.views
     WHERE table_name = 'signaux_envies_stats')                                  AS vue_creee,
  (SELECT count(*) FROM pg_indexes
     WHERE indexname = 'idx_upgrade_requests_commercant_date')                   AS index_cree;
-- Attendu : 5, 1, 1

-- Et un aperçu de ce qui dort déjà en base, tous commerces confondus :
SELECT type, count(*) AS envies FROM upgrade_requests GROUP BY type ORDER BY envies DESC;
