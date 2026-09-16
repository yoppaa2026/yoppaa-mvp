-- REMISE A ZERO DE LA FIDELITE (16/09) — VERSION CORRIGEE
--
-- 🔴 SCRIPT DESTRUCTIF, LANCE PAR ALEX ET PAR PERSONNE D AUTRE.
-- Decision d Alex : « toutes les fidelites sont en test, on peut tout
-- supprimer ». Il efface les CARTES, les RECOMPENSES et les MOUVEMENTS de TOUS
-- les commercants.
--
-- ⚠️ LA PREMIERE VERSION A ECHOUE, ET RIEN N A ETE SUPPRIME : elle utilisait
-- `CREATE TEMP TABLE`, qui ne survit pas entre deux instructions dans l editeur
-- Supabase. L erreur finale a annule TOUT le coller, suppressions comprises :
-- l editeur execute l ensemble dans UNE SEULE TRANSACTION. Bon a savoir, et
-- c est un vrai filet de securite.
--
-- Les comptes d avant sont donc connus (constat du 16/09) et ecrits en toutes
-- lettres dans la colonne « attendu » : plus besoin de les relever ici.
--
-- ⚠️ CE QU IL NE TOUCHE PAS, ET C EST VOULU : les COMMANDES. Une commande est
-- une vente, meme de test. `commandes.fidelite_remise` reste tel quel : ce
-- montant a REELLEMENT ete remise ce jour-la, et l effacer ferait mentir le
-- journal comptable. Les controles E et F le verifient.
--
-- ⚠️ EN REVANCHE ON DETACHE `commandes.fidelite_recompense_id` AVANT de
-- supprimer ce qu il vise. DEUX LIENS, DEUX SENS :
-- `commandes.fidelite_recompense_id` RESERVE,
-- `fidelite_recompenses.commande_id` CONSOMME. Le second part avec la ligne, le
-- premier doit etre detache a la main, sinon il pointe dans le vide.

-- ═══ EFFACEMENT ═══════════════════════════════════════════════════════════
DO $$
BEGIN
  -- 1) Detacher les references AVANT de supprimer ce qu elles visent.
  UPDATE commandes SET fidelite_recompense_id = NULL WHERE fidelite_recompense_id IS NOT NULL;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'rdv_reservations'
                AND column_name = 'fidelite_recompense_id') THEN
    EXECUTE 'UPDATE rdv_reservations SET fidelite_recompense_id = NULL WHERE fidelite_recompense_id IS NOT NULL';
  END IF;

  -- 2) Les mouvements d abord : ils referencent les cartes.
  DELETE FROM fidelite_mouvements;
  -- 3) Les recompenses ensuite.
  DELETE FROM fidelite_recompenses;
  -- 4) Les cartes enfin.
  DELETE FROM fidelite_cartes;
END
$$;

-- ═══ CONTROLE — une ligne par verification, valeur ET attendu ══════════════
SELECT 'A. cartes de fidelite'::text AS controle,
       (SELECT count(*)::text FROM fidelite_cartes) AS valeur,
       '0 (il y en avait 16)'::text AS attendu
UNION ALL
SELECT 'B. recompenses'::text,
       (SELECT count(*)::text FROM fidelite_recompenses),
       '0 (il y en avait 20)'::text
UNION ALL
SELECT 'C. mouvements'::text,
       (SELECT count(*)::text FROM fidelite_mouvements),
       '0 (il y en avait 178)'::text
UNION ALL
SELECT 'D. commandes encore liees a une recompense'::text,
       (SELECT count(*)::text FROM commandes WHERE fidelite_recompense_id IS NOT NULL),
       '0 (il y en avait 19) : plus aucune reference morte'::text
UNION ALL
-- 🔴 LES DEUX CONTROLES QUI COMPTENT VRAIMENT : aucune vente touchee.
SELECT 'E. commandes en base (AUCUNE ne doit disparaitre)'::text,
       (SELECT count(*)::text FROM commandes),
       '211, EXACTEMENT comme avant'::text
UNION ALL
SELECT 'F. remises de fidelite deja accordees, CONSERVEES'::text,
       (SELECT count(*)::text FROM commandes WHERE coalesce(fidelite_remise, 0) > 0),
       '19, EXACTEMENT comme avant : ce montant a ete remise pour de vrai'::text
UNION ALL
SELECT 'G. commercants avec la fidelite allumee'::text,
       (SELECT count(*)::text FROM commercants WHERE fidelite_actif IS TRUE),
       '6, inchange : on vide les cartes, pas les reglages'::text;
