-- ════════════════════════════════════════════════════════════════════════════
-- RECHARGER LE SCHÉMA DE POSTGREST (16/09)
--
-- 🔴 POURQUOI. PostgREST, l'API que Supabase expose, garde le schéma EN CACHE.
-- Une colonne ajoutée par une migration existe en base immédiatement, mais elle
-- reste INVISIBLE pour l'API tant que ce cache n'a pas été rechargé.
--
-- ⚠️ ET UNE COLONNE INVISIBLE FAIT ÉCHOUER TOUTE LA REQUÊTE, pas seulement
-- elle : un `select` qui la nomme ne rend plus RIEN. C'est exactement ce qui
-- s'est passé après `MIGRATION_EMPREINTE_COMPTEUR_ENVOIS.sql` : le SMS et
-- l'email du lien « confirme ta table » ne partaient plus, parce que la route
-- ne parvenait plus à lire la réservation.
--
-- Supabase recharge normalement ce cache tout seul après un DDL. Quand il tarde,
-- cette ligne le fait tout de suite. Elle ne modifie RIEN : c'est un signal.
-- ════════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ─── CONTRÔLE : la colonne est-elle lisible, et vue par l'API ? ──────────────
SELECT * FROM (

  SELECT 1 AS n,
    'C1. la colonne existe en base' AS controle,
    coalesce((
      SELECT 'oui' FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'rdv_reservations'
        AND column_name = 'empreinte_demande_envois'
    ), 'NON')::text AS valeur,
    'oui' AS attendu

  UNION ALL
  -- Si celle-ci passe, la lecture de l'API passera aussi : c'est la même
  -- colonne, lue par le même moteur.
  SELECT 2,
    'C2. elle se lit vraiment (somme des envois)',
    (SELECT coalesce(sum(empreinte_demande_envois), 0)::text FROM rdv_reservations),
    'un nombre, pas une erreur'

  UNION ALL
  SELECT 3,
    'C3. le signal de rechargement est parti',
    'envoye',
    'envoye'

) AS controle_rechargement
ORDER BY n;
