-- DIAGNOSTIC (lecture seule) : la commande du 1er septembre que le Poste ne
-- montre pas chez MOMO (Alex, 01/10).
--
-- Le Poste charge : toutes les commandes ENCORE OUVERTES (en attente, en
-- préparation, prête), quelle que soit leur date, plus les commandes FERMÉES
-- des deux derniers jours. Il écarte « paiement_en_attente » (jamais payée).
-- Cette requête dit dans quel cas tombe chaque commande d'avant le 5 septembre.
--
-- ⚠️ AUCUNE DONNÉE PERSONNELLE : ni nom, ni email, ni téléphone, ni adresse.

SELECT
  c.nom::text                                                        AS commerce,
  (coalesce(k.numero_prefixe, '') || coalesce(k.numero_commande::text, '?'))::text AS reference,
  k.statut::text                                                     AS statut,
  k.mode_retrait::text                                               AS mode,
  coalesce(k.statut_livraison, '')::text                             AS etape_livraison,
  coalesce(k.date_commande::text, '(vide)')                          AS date_commande,
  to_char(k.created_at AT TIME ZONE 'Europe/Brussels', 'YYYY-MM-DD HH24:MI') AS creee_le,
  CASE
    WHEN k.statut = 'paiement_en_attente' THEN 'écartée : jamais payée'
    WHEN k.statut IN ('en_attente', 'en_preparation', 'pret') THEN 'devrait être au Poste (ouverte)'
    ELSE 'fermée : au Poste seulement si elle date des 2 derniers jours'
  END::text                                                          AS au_poste
FROM public.commandes k
JOIN public.commercants c ON c.id = k.commercant_id
WHERE c.nom ILIKE '%momo%'
  -- ⚠️ FENÊTRE ÉTROITE : l'éditeur Supabase coupe à 100 lignes. La première
  -- version (« avant le 5 septembre ») s'arrêtait au 10 août, avant la commande
  -- cherchée.
  AND k.created_at >= '2026-08-25' AND k.created_at < '2026-09-06'
ORDER BY k.created_at;
