-- SITE D'ESSAI : QUELS COMPTES CRÉER (02/10/2026)
--
-- 🔴 À COLLER DANS L'ÉDITEUR SQL DU PROJET yoppaa-test. LECTURE SEULE.
-- Donne, pour chacun des six commerces copiés, l'adresse du compte à créer
-- dans Authentication → Users, et s'il existe déjà.

SELECT c.nom AS commerce,
       m.email AS compte_a_creer,
       (u.id IS NOT NULL)::text AS deja_cree
  FROM essai.comptes_a_relier m
  JOIN public.commercants c ON c.id = m.commercant_id
  LEFT JOIN auth.users u ON lower(u.email) = m.email
 ORDER BY c.nom;
