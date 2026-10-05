-- ════════════════════════════════════════════════════════════════════════════
-- I5 : « Annulée par le commerce » et « Retirée au magasin » (05/10)
-- Décisions d'Alex du 05/10 (« ok pour les deux »).
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1. UN VRAI STATUT `annulee_commercant`. Jusqu'ici une commande annulée et
--    remboursée par le commerce (ou depuis le tableau Stripe) devenait
--    « Annulée par client » : l'historique du client et l'export mentaient.
--
-- 2. `statut_livraison = 'retiree_magasin'`. Le livreur a sonné, personne ; le
--    client vient finalement chercher sa commande au comptoir. Elle se termine
--    « récupérée », et le suivi dit « retirée au magasin ». Les frais de
--    livraison restent dus (le livreur s'est déplacé).
--
-- 3. 🔴 LES FONCTIONS QUI EXCLUENT LES ANNULÉES PAR UNE LISTE apprennent le
--    nouveau statut, sinon une commande annulée par le commerce continuerait
--    de consommer du stock :
--      • reserver_stock_atomique (le serveur, au paiement) ;
--      • vendu_par_offre (le plafond d'une offre) ;
--      • stock_commande_par_article (le stock affiché sur la fiche).
--    ⚠️ ET LA DERNIÈRE AVAIT DÉJÀ UN DÉFAUT : elle n'excluait que
--    `non_retire`. Une commande annulée et remboursée comptait encore dans le
--    stock AFFICHÉ, alors que le serveur l'ignorait : le client voyait « plus
--    que 2 » là où il en restait 5. Elle s'aligne ici sur le serveur.
--    `charge_preparation_par_creneau` et `charge_creneaux_par_jour` comptent par
--    une liste POSITIVE des statuts en cours : rien à changer.
--
-- ⚠️ LES FONCTIONS NE SONT PAS RECOPIÉES, ELLES SONT RELUES EN BASE
-- (`pg_get_functiondef`) et seul leur filtre de statut change. Recopier une
-- définition depuis un fichier risquait d'écraser une version plus récente.
-- Si le filtre attendu n'est pas trouvé, tout s'arrête et RIEN n'est modifié
-- (l'éditeur SQL est une seule transaction) : colle-moi alors l'erreur.
--
-- ⚠️ À PASSER AVANT LE DÉPLOIEMENT DU CODE I5 : le code écrit ces deux valeurs,
-- et la contrainte actuelle les refuserait. Sans le code, elle ne change rien.
--
-- GRANT : aucun objet créé. `CREATE OR REPLACE FUNCTION` garde les droits
-- existants ; le contrôle le vérifie.
-- Date : 2026-10-05
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1 et 2. Les contraintes de statut ──────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.commandes'::regclass AND contype = 'c'
       AND (pg_get_constraintdef(oid) ILIKE '%statut_livraison%'
            OR pg_get_constraintdef(oid) ILIKE '%annulee_paiement_ko%')
  LOOP
    EXECUTE format('ALTER TABLE public.commandes DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.commandes
  ADD CONSTRAINT commandes_statut_check
  CHECK (statut IN (
    'paiement_en_attente', 'en_attente', 'en_preparation', 'pret', 'recupere',
    'non_retire', 'annulee_client_refund', 'annulee_paiement_ko', 'annulee_commercant'
  ));

ALTER TABLE public.commandes
  ADD CONSTRAINT commandes_statut_livraison_check
  CHECK (statut_livraison IS NULL
         OR statut_livraison IN ('preparee', 'en_livraison', 'livree', 'retiree_magasin'));

-- ─── 3. Les fonctions qui excluent les annulées ─────────────────────────────
DO $$
DECLARE
  r record;
  avant text;
  apres text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('reserver_stock_atomique', 'vendu_par_offre', 'stock_commande_par_article')
  LOOP
    avant := pg_get_functiondef(r.oid);
    IF position('annulee_commercant' IN avant) > 0 THEN CONTINUE; END IF;  -- déjà fait
    apres := replace(avant, '''annulee_client_refund''', '''annulee_client_refund'', ''annulee_commercant''');
    apres := replace(apres, 'c.statut <> ''non_retire''',
      'c.statut NOT IN (''non_retire'', ''annulee_paiement_ko'', ''annulee_client_refund'', ''annulee_commercant'')');
    IF apres = avant THEN
      RAISE EXCEPTION 'Fonction % : filtre de statut non reconnu, rien n''a été modifié', r.proname;
    END IF;
    EXECUTE apres;
  END LOOP;
END $$;

-- ─── Contrôle : une ligne par vérification, valeur ET attendu ───────────────
SELECT * FROM (
  SELECT 1 AS n, 'I5 statut : annulee_commercant accepte' AS controle,
         (SELECT CASE WHEN count(*) = 1 THEN 'oui' ELSE count(*)::text || ' contrainte(s)' END
            FROM pg_constraint WHERE conrelid = 'public.commandes'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%annulee_commercant%')::text AS valeur,
         'oui' AS attendu
  UNION ALL SELECT 2, 'I5 statut_livraison : retiree_magasin accepte',
         (SELECT CASE WHEN count(*) = 1 THEN 'oui' ELSE count(*)::text || ' contrainte(s)' END
            FROM pg_constraint WHERE conrelid = 'public.commandes'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%retiree_magasin%')::text,
         'oui'
  UNION ALL SELECT 3, '🔴 I5 les 3 fonctions de stock connaissent annulee_commercant',
         (SELECT string_agg(p.proname || ':' || CASE WHEN p.prosrc LIKE '%annulee_commercant%' THEN 'oui' ELSE 'NON' END, ', ' ORDER BY p.proname)
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('reserver_stock_atomique', 'vendu_par_offre', 'stock_commande_par_article'))::text,
         'reserver_stock_atomique:oui, stock_commande_par_article:oui, vendu_par_offre:oui'
  UNION ALL SELECT 4, '🔴 le stock affiche exclut enfin les annulees',
         (SELECT CASE WHEN p.prosrc LIKE '%annulee_client_refund%' AND p.prosrc NOT LIKE '%<> ''non_retire''%' THEN 'oui' ELSE 'NON' END
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'stock_commande_par_article')::text,
         'oui'
  UNION ALL SELECT 5, 'les fonctions restent SECURITY DEFINER',
         (SELECT string_agg(p.proname || ':' || CASE WHEN p.prosecdef THEN 'oui' ELSE 'NON' END, ', ' ORDER BY p.proname)
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('reserver_stock_atomique', 'vendu_par_offre', 'stock_commande_par_article'))::text,
         'reserver_stock_atomique:oui, stock_commande_par_article:oui, vendu_par_offre:oui'
  UNION ALL SELECT 6, 'la fiche lit toujours le stock et les offres (anon)',
         (SELECT string_agg(p.proname || ':' || CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'oui' ELSE 'NON' END, ', ' ORDER BY p.proname)
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('vendu_par_offre', 'stock_commande_par_article'))::text,
         'stock_commande_par_article:oui, vendu_par_offre:oui'
  UNION ALL SELECT 7, 'les commandes existantes respectent les contraintes',
         (SELECT count(*) FROM public.commandes
           WHERE statut NOT IN ('paiement_en_attente', 'en_attente', 'en_preparation', 'pret', 'recupere',
                                'non_retire', 'annulee_client_refund', 'annulee_paiement_ko', 'annulee_commercant')
              OR (statut_livraison IS NOT NULL AND statut_livraison NOT IN ('preparee', 'en_livraison', 'livree', 'retiree_magasin')))::text,
         '0'
) t ORDER BY n;
