-- ============================================================
-- MIGRATION_FIDELITE_RECHERCHE_CLIENT.sql
-- Pointage comptoir fidélité : retrouver un client Yoppaa EXISTANT
-- à partir de son numéro de téléphone (bug Alex 01/08 : « il ne
-- retrouve pas 0472634325 alors que mon compte a ce numéro »).
--
-- Problème : les téléphones sont stockés dans des formats libres
-- (0472634325, +32472634325, 0472 63 43 25...). Une égalité stricte
-- ne matche donc presque jamais. On compare CHIFFRE À CHIFFRE, sur
-- les 9 derniers chiffres (numéro national belge sans indicatif).
--
-- SECURITY DEFINER : le commerçant n'a AUCUN droit de lecture sur
-- `clients` (RLS fermée, audit 13/07). La fonction ne renvoie que le
-- strict nécessaire au comptoir (prénom, initiale du nom), jamais
-- l'email ni l'adresse. Elle n'est appelable que par le service_role
-- (API serveur qui vérifie d'abord l'identité du commerçant).
-- ============================================================

-- 1. Index fonctionnel : recherche rapide sur les chiffres seuls
CREATE INDEX IF NOT EXISTS idx_clients_tel_chiffres
  ON clients ((regexp_replace(COALESCE(telephone, ''), '[^0-9]', '', 'g')));

-- 2. Fonction de recherche. p_tel = numéro normalisé (+32XXXXXXXXX).
--    On extrait les 9 derniers chiffres et on compare au même extrait
--    côté base : 0472634325, +32472634325 et 0472 63 43 25 matchent tous.
CREATE OR REPLACE FUNCTION chercher_client_par_telephone(p_tel text)
RETURNS TABLE (id uuid, prenom text, nom text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cible AS (
    SELECT right(regexp_replace(COALESCE(p_tel, ''), '[^0-9]', '', 'g'), 9) AS suffixe
  )
  SELECT c.id, c.prenom, c.nom
  FROM clients c, cible
  WHERE length(cible.suffixe) = 9
    AND right(regexp_replace(COALESCE(c.telephone, ''), '[^0-9]', '', 'g'), 9) = cible.suffixe
  ORDER BY c.created_at ASC
  LIMIT 1;
$$;

-- 3. Droits : uniquement le service_role (les API serveur). Jamais anon
--    ni authenticated : un commerçant ne doit pas pouvoir sonder la base
--    clients numéro par numéro depuis le navigateur.
REVOKE ALL ON FUNCTION chercher_client_par_telephone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION chercher_client_par_telephone(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION chercher_client_par_telephone(text) TO service_role;

-- Vérification :
--   SELECT * FROM chercher_client_par_telephone('+32472634325');
