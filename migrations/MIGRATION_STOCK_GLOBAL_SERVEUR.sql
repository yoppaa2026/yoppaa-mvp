-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 « STOCK DU JOUR (DÉFAUT) » N'ÉTAIT PLAFONNÉ QUE PAR LE NAVIGATEUR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trouvé le 31/08, en cherchant tout autre chose : ce qui existait déjà pour
-- l'anti-gaspi alimentaire.
--
-- LE DÉFAUT. Le tableau de bord propose DEUX stocks : une grille par jour de
-- semaine (`article_stock_jour`) et un stock global (`articles.stock_jour`,
-- champ « Stock du jour (défaut) »). Le navigateur applique les deux, dans cet
-- ordre, et c'est écrit noir sur blanc dans `getStockMax`. Le SERVEUR, lui, ne
-- connaissait que la grille : sans entrée pour ce jour-là, il faisait
-- `IF NOT FOUND THEN CONTINUE`, c'est-à-dire AUCUNE LIMITE.
--
-- Un commerçant qui règle « 10 » sur ce champ annonce donc dix pains et peut en
-- vendre quarante. Ce n'est pas une course rare : c'est le cas NOMINAL, à la
-- première commande passée hors de l'écran ou après un rechargement.
--
-- ⚠️ C'EST LE MÉTA-DÉFAUT DU PROJET, POUR LA QUATRIÈME FOIS : l'écran calcule,
-- le serveur décide. Ici l'écran calculait et le serveur ne décidait rien.
--
-- ⚠️ ET IL FALLAIT LES DEUX MOITIÉS. Le correctif JavaScript de
-- `verifierStockDisponible` ferme le cas ordinaire ; celui-ci ferme la COURSE,
-- puisque c'est cette fonction-là qui verrouille en transaction. Poser l'un sans
-- l'autre donnerait l'illusion d'être protégé.
--
-- ⚠️ LA RÈGLE EST RECOPIÉE MOT POUR MOT de `getStockMax` et de la fonction
-- JavaScript, et les trois cas comptent :
--   1) une entrée du jour de semaine fait foi, Y COMPRIS QUAND ELLE VAUT ZÉRO ;
--   2) sinon le stock global fait foi, s'il est strictement positif ;
--   3) sinon, et seulement là, il n'y a aucune limite.

BEGIN;

CREATE OR REPLACE FUNCTION reserver_stock_atomique(
  p_commande_id  uuid,
  p_commercant_id uuid,
  p_date         date,
  p_jour_semaine text,
  p_items        jsonb   -- [{"article_id":"uuid","quantite":N}, ...]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item        jsonb;
  v_article_id  uuid;
  v_qte         int;
  v_stock       int;
  v_actif       boolean;
  v_used        int;
  v_dispo       int;
BEGIN
  -- Verrous acquis dans un ordre déterministe (par article_id) pour éviter les deadlocks.
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_items)
    ORDER BY (value->>'article_id')
  LOOP
    v_article_id := (v_item->>'article_id')::uuid;
    v_qte        := (v_item->>'quantite')::int;

    -- ⚠️ ON RÉARME LES VARIABLES À CHAQUE TOUR. En plpgsql elles SURVIVENT d'une
    -- itération à l'autre : un article sans entrée hériterait sinon du `v_actif`
    -- de l'article précédent, et pourrait être refusé pour la mauvaise raison.
    v_stock := NULL;
    v_actif := NULL;

    -- Verrou de sérialisation sur le stock du jour pour cet article.
    SELECT stock, actif INTO v_stock, v_actif
    FROM article_stock_jour
    WHERE article_id = v_article_id AND jour_semaine = p_jour_semaine
    FOR UPDATE;

    IF NOT FOUND THEN
      -- 🔴 LE REPLI QUI MANQUAIT : le stock global du champ « défaut ».
      -- Verrouillé lui aussi, sinon deux commandes simultanées liraient la même
      -- valeur et passeraient toutes les deux.
      SELECT stock_jour INTO v_stock
      FROM articles
      WHERE id = v_article_id
      FOR UPDATE;

      -- Aucun stock global positif : l'article n'est vraiment pas géré.
      IF v_stock IS NULL OR v_stock <= 0 THEN
        CONTINUE;
      END IF;
      v_actif := true;
    END IF;

    IF v_actif IS FALSE THEN
      RAISE EXCEPTION 'ARTICLE_INACTIF:%', v_article_id USING ERRCODE = 'P0001';
    END IF;

    -- Consommé = commandes non annulées du jour (hors la nôtre) + réservations actives (hors la nôtre).
    SELECT
      COALESCE((
        SELECT SUM(ca.quantite)
        FROM commande_articles ca
        JOIN commandes c ON c.id = ca.commande_id
        WHERE ca.article_id = v_article_id
          AND c.commercant_id = p_commercant_id
          AND c.date_commande = p_date
          AND c.statut NOT IN ('non_retire','annulee_paiement_ko','annulee_client_refund')
          AND c.id <> p_commande_id
      ), 0)
      +
      COALESCE((
        SELECT SUM(r.quantite)
        FROM commande_stock_reservation r
        WHERE r.article_id = v_article_id
          AND r.date_commande = p_date
          AND r.expires_at > now()
          AND r.commande_id <> p_commande_id
      ), 0)
    INTO v_used;

    v_dispo := COALESCE(v_stock, 0) - v_used;

    IF v_qte > v_dispo THEN
      RAISE EXCEPTION 'STOCK_INSUFFISANT:%:%', v_article_id, GREATEST(0, v_dispo) USING ERRCODE = 'P0001';
    END IF;

    -- Réservation (TTL via le défaut expires_at = now() + 5 min de la table).
    INSERT INTO commande_stock_reservation (commande_id, commercant_id, article_id, quantite, date_commande)
    VALUES (p_commande_id, p_commercant_id, v_article_id, v_qte, p_date);
  END LOOP;
END;
$$;

-- ⚠️ GRANT REPOSÉ : un `CREATE OR REPLACE` conserve les droits, mais on ne parie
-- pas là-dessus. Une fonction sans droit se refuse au moment du paiement.
GRANT EXECUTE ON FUNCTION reserver_stock_atomique(uuid, uuid, date, text, jsonb)
  TO service_role, authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — une seule requête, une ligne par vérification, valeur ET attendu
-- ═══════════════════════════════════════════════════════════════════════════

SELECT '1. la fonction existe toujours' AS controle,
       COUNT(*)::text AS valeur,
       '1'::text AS attendu
  FROM pg_proc
 WHERE proname = 'reserver_stock_atomique'

UNION ALL
SELECT '2. elle lit desormais le stock global',
       CASE WHEN prosrc LIKE '%FROM articles%' AND prosrc LIKE '%stock_jour%'
            THEN 'oui' ELSE 'non' END::text,
       'oui'::text
  FROM pg_proc WHERE proname = 'reserver_stock_atomique'

UNION ALL
SELECT '3. et elle verrouille ce repli',
       (SELECT (LENGTH(prosrc) - LENGTH(REPLACE(prosrc, 'FOR UPDATE', '')))::int / 10
          FROM pg_proc WHERE proname = 'reserver_stock_atomique')::text,
       '2'::text

UNION ALL
SELECT '4. les variables sont rearmees a chaque tour',
       CASE WHEN prosrc LIKE '%v_actif := NULL;%' THEN 'oui' ELSE 'non' END::text,
       'oui'::text
  FROM pg_proc WHERE proname = 'reserver_stock_atomique'

UNION ALL
SELECT '5. droits d execution',
       (SELECT COUNT(*)::text FROM information_schema.routine_privileges
         WHERE routine_name = 'reserver_stock_atomique'
           AND grantee IN ('service_role','authenticated')
           AND privilege_type = 'EXECUTE'),
       '2'::text

-- ⚠️ CELUI-CI N'EST PAS UN CONTRÔLE, C'EST UNE MESURE DU TROU. Ce sont les
-- articles qui annonçaient un stock que le serveur ne tenait pas. Aucune valeur
-- n'est « attendue » : c'est le nombre de lignes qui étaient vendables sans
-- limite jusqu'à aujourd'hui.
UNION ALL
SELECT '6. articles qui etaient vendables SANS LIMITE (mesure, pas controle)',
       COUNT(*)::text,
       'a lire, aucune valeur attendue'::text
  FROM articles a
 WHERE COALESCE(a.stock_jour, 0) > 0
   AND NOT EXISTS (SELECT 1 FROM article_stock_jour s WHERE s.article_id = a.id)

UNION ALL
SELECT '7. articles avec une grille par jour (temoin)',
       COUNT(DISTINCT article_id)::text,
       'a lire'::text
  FROM article_stock_jour;
