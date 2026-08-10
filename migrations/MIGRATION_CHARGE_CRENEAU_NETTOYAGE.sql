-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_CHARGE_CRENEAU_NETTOYAGE.sql
--
-- Suppression de `charge_preparation_par_creneau`, devenue sans appelant.
--
-- ⚠️ À PASSER SEULEMENT UNE FOIS LE DÉPLOIEMENT DU 10/08 EN LIGNE.
-- La fonction avait été volontairement conservée par
-- MIGRATION_CHARGE_CRENEAU_PAR_JOUR pour que les deux cohabitent pendant le
-- déploiement : plus aucune fenêtre où l'affichage tombe, que la migration
-- passe avant ou après la mise en ligne du code.
--
-- Depuis, `charge_creneaux_par_jour` la remplace partout. Vérification faite
-- dans le code : plus une seule occurrence de l'ancien nom hors commentaires.
--
-- POURQUOI LA SUPPRIMER PLUTÔT QUE DE LA LAISSER DORMIR. Elle agrégeait toutes
-- dates confondues, ce qui est FAUX pour un créneau hebdomadaire. La laisser
-- en base, c'est offrir à quelqu'un — moi le premier — de la rappeler un jour
-- en croyant bien faire, et de réintroduire le défaut corrigé aujourd'hui.
--
-- Réversible : sa définition complète vit dans
-- MIGRATION_RLS_LECTURES_RESIDUELLES.sql puis MIGRATION_CHARGE_CRENEAU_ANNULEES.sql.
--
-- Le pire cas si un onglet resté ouvert tourne encore sur l'ancien code :
-- l'appel échoue, les compteurs tombent à zéro, les créneaux paraissent libres.
-- Le CONTRÔLE SERVEUR refuse de toute façon un créneau complet (409), et un
-- simple rechargement remet tout d'aplomb.
--
-- Idempotente : `IF EXISTS`, ré-exécutable sans effet de bord.
--
-- Vérification attendue en fin de script :
--   ancienne_restante = 0, nouvelle_presente = 1
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.charge_preparation_par_creneau(uuid);

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Les deux chiffres comptent : le second garantit qu'on n'a pas supprimé la
-- mauvaise, ce qui laisserait l'affichage des créneaux sans aucune source.
SELECT
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'charge_preparation_par_creneau') AS ancienne_restante,
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'charge_creneaux_par_jour')       AS nouvelle_presente;
