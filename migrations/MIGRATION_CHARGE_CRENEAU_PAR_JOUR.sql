-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_CHARGE_CRENEAU_PAR_JOUR.sql
--
-- La charge des créneaux, enfin comptée JOUR PAR JOUR.
--
-- LE DÉFAUT, et il se trompait dans LES DEUX SENS.
-- `charge_preparation_par_creneau` agrège toutes dates confondues : elle rend
-- un seul total par créneau, sans savoir de quel jour viennent les commandes.
-- Le navigateur s'en accommodait comme il pouvait :
--   • pour AUJOURD'HUI, il appliquait ce total. Une commande passée pour jeudi
--     comptait donc dans le créneau de ce matin : le créneau paraissait plus
--     plein qu'il ne l'était, et des clients étaient refusés pour rien ;
--   • pour les jours SUIVANTS, il forçait le compteur à ZÉRO. Un créneau déjà
--     complet jeudi s'affichait donc libre, et le client ne l'apprenait qu'au
--     moment de payer.
--
-- Un créneau « mardi 11h15 » revient chaque semaine : sans la date, il est
-- impossible de savoir de quel mardi on parle.
--
-- ⚠️ NOUVELLE FONCTION, l'ANCIENNE EST CONSERVÉE. Elles cohabitent le temps du
-- déploiement : passer cette migration ne casse rien si le code déployé est
-- encore l'ancien, et déployer le nouveau code ne casse rien si la migration
-- est déjà passée. Aucune fenêtre où l'affichage tombe.
-- `charge_preparation_par_creneau` pourra être supprimée une fois le nouveau
-- code en production, elle n'aura plus aucun appelant.
--
-- Mêmes statuts occupants que le serveur (lib/creneaux.js) : les annulées et
-- les terminées ne prennent plus de place.
--
-- `p_depuis` évite de balayer tout l'historique : seules les commandes du jour
-- et des suivantes pèsent sur un créneau à venir.
--
-- Aucune donnée personnelle : que des identifiants de créneau, des dates et
-- des totaux. Rien sur QUI a commandé.
--
-- Idempotente : ré-exécutable sans effet de bord.
--
-- Vérification attendue en fin de script : fonction_creee = 1
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION charge_creneaux_par_jour(
  p_commercant_id uuid,
  p_depuis        date DEFAULT CURRENT_DATE
)
RETURNS TABLE (creneau_id uuid, jour date, nb_commandes bigint, temps_total numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT c.creneau_id,
         c.date_commande::date,
         COUNT(DISTINCT c.id)::bigint,
         COALESCE(SUM(ca.quantite * COALESCE(a.temps_prepa, 1)), 0)::numeric
    FROM commandes c
    LEFT JOIN commande_articles ca ON ca.commande_id = c.id
    LEFT JOIN articles a           ON a.id = ca.article_id
   WHERE c.commercant_id = p_commercant_id
     AND c.creneau_id IS NOT NULL
     AND c.date_commande::date >= p_depuis
     AND c.statut IN ('paiement_en_attente', 'en_attente', 'en_preparation', 'pret')
   GROUP BY c.creneau_id, c.date_commande::date;
$$;

-- La jointure reste en LEFT : une commande sans ligne (cas théorique) doit tout
-- de même compter dans le nombre de commandes du créneau, sinon la capacité
-- affichée serait trop optimiste.

REVOKE ALL ON FUNCTION charge_creneaux_par_jour(uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION charge_creneaux_par_jour(uuid, date) TO anon, authenticated;

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Interroge l'état réel de la base, jamais une tautologie (leçon du 09/08).
SELECT COUNT(*) AS fonction_creee
FROM pg_proc
WHERE proname = 'charge_creneaux_par_jour';
