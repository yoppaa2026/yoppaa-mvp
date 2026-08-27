-- ════════════════════════════════════════════════════════════════════════════
-- RETRAIT DE L'ANCIENNE FIDÉLITÉ DES RENDEZ-VOUS — 27/08
-- ════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI. Deux systèmes de fidélité cohabitaient sur le rendez-vous, et ils
-- ne se partageaient pas les commerces au hasard : chacun était amputé de ce
-- que l'autre avait.
--
--   • L'ANCIEN  : rdv_fidelite_actif + rdv_fidelite_progression + le
--     déclencheur incrementer_fidelite_rdv. Il n'écrit QU'UN COMPTEUR. Pas de
--     carte, pas de SMS, et surtout AUCUNE ligne dans fidelite_recompenses.
--     Un client atteignait donc son seuil, recevait un email annonçant une
--     réduction, et le tunnel de paiement ne trouvait rien à lui appliquer.
--   • L'UNIFIÉ  : fidelite_actif + fidelite_cartes + fidelite_mouvements +
--     fidelite_recompenses. Carte visible, SMS, récompense dépensable en ligne.
--
-- Au 27/08, UN SEUL commerce portait l'ancien (Dermaé), et il avait la
-- fidélité unifiée ÉTEINTE. Ses clients ne pouvaient donc rien dépenser.
--
-- ⚠️ CETTE MIGRATION NE CRÉE AUCUN OBJET : il n'y a donc aucun GRANT à poser.
-- Elle ne lit ni n'écrit aucune donnée personnelle.
--
-- ⚠️ LES TROIS COLONNES rdv_fidelite_* NE SONT PAS SUPPRIMÉES ICI, et c'est
-- volontaire : elles sont exposées par la vue commercants_public. Les retirer
-- impose de reconstruire cette vue à partir de sa définition RÉELLE, jamais de
-- mémoire (j'ai déjà failli en amputer treize colonnes le 27/08). Le bloc 4
-- prépare cette seconde migration. Laissées en place, elles ne sont plus lues
-- par aucun code.


-- ─── BLOC 0 — CE QUI VA CHANGER (à lire AVANT d'exécuter la suite) ──────────
--
-- Attendu : une seule ligne, celle de Dermaé.

SELECT nom, plan, rdv_fidelite_actif, rdv_fidelite_seuil, rdv_fidelite_pourcent,
       fidelite_actif, fidelite_mecanique, fidelite_recompense_libelle
FROM commercants
WHERE rdv_fidelite_actif = true;

-- Et ce qu'on va perdre : le compteur des progressions en cours.
-- ⚠️ CES COMPTEURS NE SONT PAS REPRIS. L'ancienne table est indexée sur
-- client_id, les cartes le sont sur le TÉLÉPHONE : les rapprocher demanderait
-- de lire des données personnelles pour une poignée de lignes de démonstration.
-- Si ce compte est supérieur à ce que tu attends, ARRÊTE-TOI et dis-le-moi.

SELECT count(*) AS progressions_perdues,
       count(*) FILTER (WHERE recompense_dispo) AS dont_recompense_en_attente
FROM rdv_fidelite_progression;


-- ─── BLOC 1 — LA BASCULE ────────────────────────────────────────────────────
--
-- On garde l'intention du commerçant : son seuil et son pourcentage de remise
-- deviennent ceux de la carte unifiée. COALESCE partout, pour ne jamais écraser
-- un réglage qu'il aurait déjà posé côté unifié.

-- 🔴 CORRIGÉ APRÈS COUP, LE 27/08, ET LA FAUTE VALAIT DE L'ARGENT.
-- La première version écrivait un libellé construit sur rdv_fidelite_pourcent,
-- SANS REGARDER le fidelite_recompense_type déjà posé. Chez Dermaé, le type
-- valait `remise_montant` et la valeur 10.00 : le texte annonçait donc
-- « -10% sur ton prochain rendez-vous » pour une récompense de 10 EUROS. Sur un
-- soin à 60 €, la phrase promettait 6 € et le tunnel en appliquait 10.
--
-- ⚠️ ON N'ÉCRIT PLUS DE LIBELLÉ DU TOUT. `libelleRecompense()` le déduit du
-- type et de la valeur, donc il est juste par construction. Un libellé qui
-- recopie ces deux champs est une SECONDE VÉRITÉ, et elle dérive au premier
-- changement de réglage du commerçant. On ne le garde que s'il l'a écrit
-- lui-même.

UPDATE commercants
SET fidelite_actif              = true,
    fidelite_mecanique          = COALESCE(fidelite_mecanique, 'passages'),
    fidelite_seuil_passages     = COALESCE(fidelite_seuil_passages,
                                           NULLIF(rdv_fidelite_seuil, 0), 10),
    fidelite_recompense_type    = COALESCE(fidelite_recompense_type, 'remise_pct'),
    fidelite_recompense_valeur  = COALESCE(fidelite_recompense_valeur,
                                           NULLIF(rdv_fidelite_pourcent, 0), 10),
    rdv_fidelite_actif          = false
WHERE rdv_fidelite_actif = true;


-- ─── BLOC 2 — LE RETRAIT ────────────────────────────────────────────────────
--
-- Ordre imposé : le déclencheur avant sa fonction, la fonction avant la table.
-- Le second déclencheur (trg_touch_rdv_fidelite) porte SUR la table, il part
-- avec elle.

DROP TRIGGER IF EXISTS trg_rdv_fidelite ON rdv_reservations;
DROP FUNCTION IF EXISTS incrementer_fidelite_rdv();
DROP TABLE IF EXISTS rdv_fidelite_progression;


-- ─── BLOC 3 — CONTRÔLE APRÈS ────────────────────────────────────────────────
--
-- Attendu : 0, 0, 0, puis la ligne de Dermaé avec fidelite_actif = true.

SELECT
  (SELECT count(*) FROM commercants WHERE rdv_fidelite_actif = true)        AS restes_ancien_drapeau,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rdv_fidelite_progression') AS table_restante,
  (SELECT count(*) FROM pg_trigger
    WHERE tgname = 'trg_rdv_fidelite')                                       AS declencheur_restant;

SELECT nom, fidelite_actif, fidelite_mecanique, fidelite_seuil_passages,
       fidelite_recompense_type, fidelite_recompense_valeur, fidelite_recompense_libelle
FROM commercants
WHERE nom ILIKE 'Dermaé%';


-- ─── BLOC 4 — PRÉPARER LA SUPPRESSION DES TROIS COLONNES ────────────────────
--
-- ⚠️ NE RIEN EXÉCUTER D'AUTRE ICI. Ce bloc ne fait que LIRE, pour que la
-- seconde migration soit écrite sur la vraie définition de la vue et non sur
-- un souvenir. Colle-moi les deux résultats.
--
-- ⚠️ CREATE OR REPLACE VIEW NE SAIT PAS RETIRER UNE COLONNE : Postgres refuse.
-- Il faudra donc DROP VIEW puis CREATE VIEW, et REPOSER les GRANT. D'où la
-- seconde requête : sans elle, la vue reviendrait muette pour anon.

SELECT pg_get_viewdef('public.commercants_public'::regclass, true) AS definition_reelle;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'commercants_public'
ORDER BY grantee, privilege_type;
