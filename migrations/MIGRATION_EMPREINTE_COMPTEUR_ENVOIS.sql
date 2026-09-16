-- ════════════════════════════════════════════════════════════════════════════
-- LE NOMBRE DE FOIS QUE LE LIEN « CONFIRME TA TABLE » A ÉTÉ ENVOYÉ
--
-- Demande d'Alex, 16/09 : « il faudrait ajouter un numéro dans le DB avec le
-- nombre de relances SMS ou email pour qu'ils aient un repère ».
--
-- Aujourd'hui l'agenda dit « Lien déjà envoyé par SMS, pas encore confirmé »,
-- sans dire COMBIEN DE FOIS. Le restaurateur ne sait donc pas s'il relance pour
-- la première ou la quatrième fois, et un client relancé quatre fois sans
-- réponse n'appelle pas la même décision qu'un client prévenu une seule fois.
--
-- ⚠️ CE COMPTEUR COMPTE LES ENVOIS RÉUSSIS, jamais les tentatives. Un SMS qui
-- n'est pas parti n'est pas une relance : le compter ferait croire le client
-- prévenu, exactement le défaut corrigé aujourd'hui sur `empreinte_demande_at`.
--
-- ⚠️ AUCUN NOUVEL OBJET N'EST CRÉÉ, donc aucun GRANT à poser : c'est une colonne
-- de plus sur `rdv_reservations`, qui garde ses droits et sa RLS. Le contrôle
-- le vérifie quand même, parce qu'une migration qui l'affirme sans le montrer
-- ne vaut rien.
--
-- 🔴 À PASSER AVANT LE DÉPLOIEMENT DU CODE QUI LA LIT. Une colonne absente d'un
-- select fait échouer TOUTE la requête, pas seulement la colonne : c'est le
-- défaut le plus fréquent de ce projet, sept fois cette année.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS empreinte_demande_envois integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN rdv_reservations.empreinte_demande_envois IS
  'Nombre de fois que le lien « confirme ta table » est REELLEMENT parti (SMS ou email). Les envois rates ne comptent pas.';

-- Les lignes qui portent déjà une demande partie avant cette migration valent
-- au moins un envoi : les laisser à zéro afficherait « jamais envoyé » sur un
-- lien que le client a bel et bien reçu.
UPDATE rdv_reservations
   SET empreinte_demande_envois = 1
 WHERE empreinte_demande_at IS NOT NULL
   AND empreinte_demande_envois = 0;

-- ─── CONTRÔLE : une ligne par vérification, avec sa valeur ET l'attendu ──────
SELECT * FROM (

  SELECT 1 AS n,
    'C1. la colonne existe' AS controle,
    coalesce((
      SELECT 'oui' FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'rdv_reservations'
        AND column_name = 'empreinte_demande_envois'
    ), 'NON')::text AS valeur,
    'oui' AS attendu

  UNION ALL
  SELECT 2,
    'C2. son type et son defaut',
    coalesce((
      SELECT data_type || ' / defaut ' || coalesce(column_default, 'AUCUN')
        || ' / ' || CASE WHEN is_nullable = 'NO' THEN 'NOT NULL' ELSE 'NULLABLE' END
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'rdv_reservations'
        AND column_name = 'empreinte_demande_envois'
    ), 'COLONNE ABSENTE'),
    'integer / defaut 0 / NOT NULL'

  UNION ALL
  SELECT 3,
    'C3. aucune ligne ne reste a NULL',
    (SELECT count(*)::text FROM rdv_reservations WHERE empreinte_demande_envois IS NULL),
    '0'

  UNION ALL
  -- Le rattrapage : toute demande deja partie vaut au moins un envoi.
  SELECT 4,
    'C4. demandes parties encore comptees a zero',
    (SELECT count(*)::text FROM rdv_reservations
      WHERE empreinte_demande_at IS NOT NULL AND empreinte_demande_envois = 0),
    '0'

  UNION ALL
  SELECT 5,
    'C5. lignes rattrapees (au moins un envoi compte)',
    (SELECT count(*)::text FROM rdv_reservations WHERE empreinte_demande_envois > 0),
    'autant que de liens deja envoyes'

  UNION ALL
  -- ⚠️ LA RLS N'EST PAS TOUCHEE PAR UN AJOUT DE COLONNE, et on le MONTRE.
  SELECT 6,
    'C6. la RLS de la table reste active',
    (SELECT CASE WHEN relrowsecurity THEN 'oui' ELSE 'NON' END
       FROM pg_class WHERE relname = 'rdv_reservations'),
    'oui'

  UNION ALL
  -- ⚠️ UNE LECTURE DE POLICIES NOMME TOUJOURS `permissive` : une RESTRICTIVE
  -- large a l'air d'ouvrir, et comptee parmi les permissives elle donne un
  -- faux vert. Regle du depot depuis le 15/09.
  SELECT 7,
    'C7. policies de la table (permissives / restrictives)',
    (SELECT count(*) FILTER (WHERE permissive = 'PERMISSIVE')::text || ' / '
          || count(*) FILTER (WHERE permissive = 'RESTRICTIVE')::text
       FROM pg_policies WHERE schemaname = 'public' AND tablename = 'rdv_reservations'),
    'inchange par rapport a avant la migration'

) AS controle_compteur_envois
ORDER BY n;
