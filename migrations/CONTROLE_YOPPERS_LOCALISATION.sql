-- ============================================================================
-- OÙ HABITENT LES YOPPERS, ET QUI LE SAIT ? (12/09/2026)
--
-- ⚠️ NE MODIFIE RIEN. COMPTAGES SEULEMENT : pas un nom, pas un email, pas un
-- code postal individuel. La table `clients` n'est lue qu'en `count(*)`.
--
-- CE QU'ON VIENT DE DÉCOUVRIR. Sur 23 Yoppers, **22 n'ont pas de code postal**,
-- et le Good Morning ne peut donc en joindre qu'UN SEUL. Le cron cible par
-- `clients.code_postal`.
--
-- 🔴 OR IL Y A DEUX SOURCES DE VÉRITÉ POUR LA LOCALISATION :
--   • `commune_id` : la commune que le Yopper CHOISIT lui-même (« Tu es à
--     Mettet ? »), posée par /api/yopper/client, action `set-commune` ;
--   • `code_postal` : posée AU PASSAGE par /api/yopper/sync-tags, la route des
--     tags OneSignal, en *best-effort* et seulement si un tag valide arrive.
--
-- Un Yopper qui a dit où il habite mais n'a jamais activé les notifications a
-- donc une commune... et pas de code postal. Le Good Morning l'ignore.
--
-- CE CONTRÔLE MESURE L'ÉCART. S'il y a beaucoup de Yoppers avec `commune_id`
-- et sans `code_postal`, la correction est simple et son effet immédiat : le
-- cron doit cibler les DEUX. Sinon, le problème est en amont, dans le parcours
-- qui ne demande jamais où l'on habite.
--
-- Coller TOUT le bloc d'un coup.
-- ============================================================================

SELECT 'Y01'::text AS ordre,
       'Yoppers au total'::text AS controle,
       count(*)::text AS valeur,
       'pour memoire'::text AS attendu,
       'INFO'::text AS verdict
FROM public.clients

-- 🎯 LA LIGNE QUI DECIDE : ceux que le Good Morning pourrait joindre demain
-- matin si le cron ciblait aussi la commune choisie.
UNION ALL
SELECT 'Y02',
       'Yoppers AVEC commune choisie mais SANS code postal',
       count(*)::text,
       'autant de personnes que le Good Morning ignore aujourd hui pour rien',
       CASE WHEN count(*) > 0 THEN '>>> AUDIENCE PERDUE' ELSE 'aucune' END
FROM public.clients
WHERE commune_id IS NOT NULL AND (code_postal IS NULL OR code_postal = '')

UNION ALL
SELECT 'Y03',
       'Yoppers AVEC code postal (joignables aujourd hui)',
       count(*)::text, 'pour memoire', 'INFO'
FROM public.clients
WHERE code_postal IS NOT NULL AND code_postal <> ''

UNION ALL
SELECT 'Y04',
       'Yoppers AVEC commune choisie',
       count(*)::text, 'pour memoire', 'INFO'
FROM public.clients WHERE commune_id IS NOT NULL

-- Ceux-la ne sont joignables par AUCUN des deux chemins : on ne sait pas ou ils
-- habitent. C'est le parcours d'inscription qu'il faudrait regarder, pas le cron.
UNION ALL
SELECT 'Y05',
       'Yoppers sans commune NI code postal (localisation inconnue)',
       count(*)::text,
       'ceux-la demandent une correction en amont, pas dans le cron',
       CASE WHEN count(*) > 0 THEN 'A REGARDER' ELSE 'aucune' END
FROM public.clients
WHERE commune_id IS NULL AND (code_postal IS NULL OR code_postal = '')

-- Combien seraient joignables si le cron ciblait les DEUX colonnes.
UNION ALL
SELECT 'Y06',
       'Audience du Good Morning si le cron ciblait aussi la commune',
       count(*)::text,
       'a comparer avec Y03 : c est le gain de la correction',
       'INFO'
FROM public.clients
WHERE commune_id IS NOT NULL OR (code_postal IS NOT NULL AND code_postal <> '')

ORDER BY 1;

-- ============================================================================
-- COMMENT LIRE
--
--   • Y02 est le chiffre qui compte : ces Yoppers ont DIT où ils habitent, et
--     le Good Morning les ignore quand même. C'est de l'audience perdue pour
--     rien, et la correction tient en une requête du cron.
--   • Y05 : ceux-là, on ne sait vraiment pas où ils sont. Le problème est dans
--     le parcours qui ne le demande jamais, pas dans le cron.
--   • Y06 moins Y03 = le nombre de personnes que la correction ferait gagner
--     dès demain matin.
-- ============================================================================
