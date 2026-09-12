-- ============================================================================
-- LE PUSH DU GOOD MORNING A-T-IL QUELQU'UN À QUI PARLER ? (12/09/2026)
--
-- ⚠️ NE MODIFIE RIEN, ET NE SORT AUCUNE DONNÉE PERSONNELLE. Que des COMPTAGES :
-- pas un nom, pas un email, pas un code postal individuel. La table `clients`
-- est interrogée uniquement par `count(*)` et par regroupement.
--
-- POURQUOI. « Je ne sais plus si j'ai reçu le push. » Le souvenir ne tranche
-- pas, et trois causes très différentes produisent le même silence :
--
--   1. le cron n'avait rien à envoyer ce matin-là ;
--   2. il avait du contenu, mais AUCUN Yopper n'était ciblable dans la commune
--      (personne, ou personne avec un code postal renseigné) ;
--   3. le push est bien parti, et c'est la RÉCEPTION qui a échoué — et sur
--      iPhone hors PWA installée, c'est normal, Apple l'interdit.
--
-- Ce contrôle répond aux deux premières. La troisième se lit dans OneSignal
-- (Delivery) et dans les journaux Vercel du cron.
--
-- Coller TOUT le bloc d'un coup.
-- ============================================================================

-- ─── G. Y a-t-il des Yoppers a joindre, commune par commune ? ──────────────
SELECT 'G01'::text AS ordre,
       ('Yoppers joignables a ' || c.nom)::text AS controle,
       count(cl.id)::text AS valeur,
       'plus de zero, sinon le push n a personne a qui parler'::text AS attendu,
       CASE WHEN count(cl.id) > 0 THEN 'OK' ELSE 'PERSONNE DANS CETTE COMMUNE' END::text AS verdict
FROM public.communes c
LEFT JOIN public.clients cl ON cl.code_postal = ANY(c.codes_postaux)
WHERE c.active = true
GROUP BY c.nom

-- ⚠️ UN YOPPER SANS CODE POSTAL N'EST CIBLE PAR AUCUNE COMMUNE. Le cron
-- selectionne `clients.code_postal IN (codes de la commune)` : sans lui, la
-- personne existe mais ne recevra jamais le Good Morning.
UNION ALL
SELECT 'G02', 'Yoppers SANS code postal (invisibles pour le push)',
       count(*)::text, 'zero, idealement',
       CASE WHEN count(*) = 0 THEN 'OK' ELSE 'CES YOPPERS NE RECOIVENT RIEN' END
FROM public.clients WHERE code_postal IS NULL OR code_postal = ''

UNION ALL
SELECT 'G03', 'Yoppers au total', count(*)::text, 'pour memoire', 'INFO'
FROM public.clients

-- ─── H. Le cron a-t-il retenu du contenu ces sept derniers jours ? ─────────
-- `push_envoye_at` n'est pose qu'UNE fois, au premier passage : ces dates sont
-- donc les matins ou une actu est REELLEMENT entree dans l'edition.
UNION ALL
SELECT 'H01',
       ('Actus entrees dans l edition le ' || to_char(a.push_envoye_at AT TIME ZONE 'Europe/Brussels', 'DD/MM')),
       count(*)::text,
       'un matin ou le push avait de la matiere',
       'INFO'
FROM public.actualites a
WHERE a.push_envoye_at IS NOT NULL
  AND a.push_envoye_at > now() - interval '7 days'
GROUP BY to_char(a.push_envoye_at AT TIME ZONE 'Europe/Brussels', 'DD/MM')

UNION ALL
SELECT 'H02',
       ('Deals retenus pour le matin du ' || to_char(d.date_deal, 'DD/MM')),
       count(*)::text,
       'un matin ou le push avait de la matiere',
       'INFO'
FROM public.yoppaa_deals d
WHERE d.statut_morning = 'envoye'
  AND d.date_deal > (now() - interval '7 days')::date
GROUP BY to_char(d.date_deal, 'DD/MM')

UNION ALL
SELECT 'H03', 'Actus en attente du prochain cron (jamais poussees)',
       count(*)::text, 'elles partiront demain matin', 'INFO'
FROM public.actualites
WHERE actif = true AND inclus_gmy = true AND push_envoye_at IS NULL
  AND date_fin >= (now() AT TIME ZONE 'Europe/Brussels')::date

ORDER BY 1, 2;

-- ============================================================================
-- COMMENT LIRE
--
--   • G01 a zero pour ta commune → le push n'avait personne a joindre. Ce n'est
--     pas une panne, c'est une audience vide.
--   • G02 superieur a zero → ces Yoppers existent mais ne sont cibles par
--     aucune commune, faute de code postal. Ils ne recevront jamais rien.
--   • H01/H02 vides sur sept jours → le cron n'avait aucune matiere : aucun
--     push n'est parti, et c'est normal.
--   • H01/H02 remplis alors que G01 est bon → le push est parti. Le silence
--     vient donc de la RECEPTION : OneSignal (Delivery) le confirmera, et sur
--     iPhone hors PWA installee, Apple interdit purement et simplement le
--     push web.
-- ============================================================================
