-- SITE D'ESSAI : RELIER LES COMPTES DE CONNEXION À LEURS COMMERCES (02/10/2026)
--
-- 🔴 À COLLER DANS L'ÉDITEUR SQL DU PROJET yoppaa-test, JAMAIS EN PRODUCTION
-- (la table `essai.comptes_a_relier` n'existe que dans l'essai : en
-- production, la requête échoue sans rien toucher).
--
-- Les six commerces ont été copiés SANS compte : ceux de la production
-- n'existent pas ici. Leur adresse est rangée dans `essai.comptes_a_relier`.
-- Une fois les comptes créés dans Authentication → Users (même adresse), ce
-- SQL relie chaque commerce au compte qui porte son adresse.
--
-- Le déclencheur `trg_commercants_colonnes_reservees` laisse passer : dans
-- l'éditeur SQL, `auth.uid()` est vide. Aucun objet créé, donc pas de GRANT.
-- Une seule transaction.

UPDATE public.commercants c
   SET auth_user_id = u.id
  FROM essai.comptes_a_relier m
  JOIN auth.users u ON lower(u.email) = m.email
 WHERE c.id = m.commercant_id
   AND c.auth_user_id IS NULL;

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
SELECT 'L1' AS n, 'commerces relies a leur compte' AS controle,
       (SELECT count(*) FROM public.commercants c
          JOIN essai.comptes_a_relier m ON m.commercant_id = c.id
          JOIN auth.users u ON u.id = c.auth_user_id AND lower(u.email) = m.email)::text AS valeur,
       '6' AS attendu
UNION ALL
SELECT 'L2', 'commerces encore sans compte',
       (SELECT count(*) FROM public.commercants WHERE auth_user_id IS NULL)::text, '0'
UNION ALL
SELECT 'L3', 'adresses dont le compte manque (a creer dans Authentication)',
       coalesce((SELECT string_agg(m.email, ', ' ORDER BY m.email)
                   FROM essai.comptes_a_relier m
                  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = m.email)), 'aucune'),
       'aucune';
