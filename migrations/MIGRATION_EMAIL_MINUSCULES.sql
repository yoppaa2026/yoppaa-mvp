-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_EMAIL_MINUSCULES.sql
--
-- Les adresses mail déjà enregistrées repassent en minuscules.
--
-- ⚠️ LE DÉFAUT FAISAIT DISPARAÎTRE LES COMMANDES DES GENS.
-- L'email du client était enregistré TEL QU'IL L'AVAIT TAPÉ, majuscules
-- comprises, et relu systématiquement EN MINUSCULES (`identiteYopper` applique
-- un `toLowerCase()`). La comparaison `client_email = <email du compte>` ne
-- retrouvait donc RIEN dès que le client avait saisi « Jean.Dupont@Gmail.com ».
--
-- Ce que vivait ce client :
--   • il commandait, tout se passait bien, il recevait ses emails ;
--   • il se connectait, et ses commandes ET ses rendez-vous DISPARAISSAIENT de
--     son écran, comme s'il n'avait jamais rien acheté.
--
-- Le code écrit désormais en minuscules. Cette migration répare l'existant,
-- sans quoi les commandes déjà passées resteraient introuvables pour toujours.
--
-- ⚠️ EN THÉORIE, la partie gauche d'une adresse est sensible à la casse
-- (RFC 5321). EN PRATIQUE, aucun fournisseur grand public ne l'applique : Gmail,
-- Outlook et Proton traitent Jean@ et jean@ comme la même boîte. Normaliser est
-- la seule façon de retrouver quelqu'un de façon fiable.
--
-- ⚠️ AUCUNE DONNÉE N'EST PERDUE : on ne change que la casse. Aucune ligne n'est
-- supprimée, aucune adresse n'est remplacée par une autre.
--
-- Idempotente : une adresse déjà en minuscules n'est pas touchée (le WHERE
-- filtre sur la différence), et ré-exécuter ne fait donc rien.
--
-- Vérification attendue en fin de script : restants = 0 partout.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE commandes
   SET client_email = lower(btrim(client_email))
 WHERE client_email IS NOT NULL
   AND client_email <> lower(btrim(client_email));

UPDATE rdv_reservations
   SET client_email = lower(btrim(client_email))
 WHERE client_email IS NOT NULL
   AND client_email <> lower(btrim(client_email));

-- La fiche client sert de pivot entre les deux : elle doit suivre la même règle.
UPDATE clients
   SET email = lower(btrim(email))
 WHERE email IS NOT NULL
   AND email <> lower(btrim(email));

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Interroge l'état réel de la base, jamais une tautologie : on recompte ce qui
-- resterait à normaliser après coup.
SELECT 'commandes' AS table_verifiee,
       count(*) FILTER (WHERE client_email IS NOT NULL
                          AND client_email <> lower(btrim(client_email))) AS restants
  FROM commandes
UNION ALL
SELECT 'rdv_reservations',
       count(*) FILTER (WHERE client_email IS NOT NULL
                          AND client_email <> lower(btrim(client_email)))
  FROM rdv_reservations
UNION ALL
SELECT 'clients',
       count(*) FILTER (WHERE email IS NOT NULL
                          AND email <> lower(btrim(email)))
  FROM clients;
