-- ============================================================================
-- LE CLIENT N'ÉCRIT PLUS DIRECTEMENT DANS SON RENDEZ-VOUS (audit du 12/09/2026)
--
-- ✅ PASSÉE PAR ALEX LE 12/09/2026. Y01 : la policy n'existe plus. Y02 : le
-- commerçant garde ses quatre policies (voir, créer, modifier, supprimer).
-- Y03 : le client garde ses deux policies de lecture. Y04 : huit policies
-- restantes, soit les neuf listées par le contrôle n° 3 moins celle-ci.
--
-- LE DÉFAUT. La policy `Client peut annuler son RDV` autorise un compte
-- connecté à faire UPDATE sur ses propres rendez-vous :
--
--   USING      client_id ∈ (ses clients) AND statut = 'confirme'
--   WITH CHECK statut = ANY (ARRAY['confirme', 'annule_client'])
--
-- Le `USING` choisit bien les LIGNES visées. Mais le `WITH CHECK`, qui décide
-- de ce que la ligne a le droit de DEVENIR, ne vérifie QUE LE STATUT. Or la RLS
-- travaille à la LIGNE, jamais à la colonne : rien n'empêche donc de modifier
-- au passage la date, l'heure, la prestation, le nombre de couverts, le prix ou
-- l'acompte, pourvu que le statut final reste dans la liste.
--
-- 🔴 C'est le cousin exact du défaut du 04/09 (`9d1eb34`) : une policy
-- d'écriture qui vérifie un CHAMP MÉTIER au lieu de vérifier CE QUI CHANGE.
--
-- POURQUOI LA RETIRER PLUTÔT QUE LA RÉPARER. Elle n'a aucun consommateur :
-- vérifié le 12/09, AUCUN code du navigateur n'écrit dans `rdv_reservations`.
-- L'annulation passe par `/api/rdv/cancel`, une route serveur en clé de
-- service, qui ignore la RLS et fait bien davantage que changer un statut
-- (remboursements, bons rendus, séance rendue à l'abonnement, emails). La
-- réparer reviendrait à entretenir une seconde porte que personne n'emprunte.
--
-- C'est le même raisonnement que le 13/07 sur `Insert commande USING(true)`,
-- retirée comme « trou de forge sans consommateur légitime ».
--
-- CE QUI NE CHANGE PAS : le commerçant garde ses quatre policies (voir, créer,
-- modifier, supprimer ses rendez-vous), le client garde la LECTURE des siens,
-- et l'admin garde tout. Seule l'écriture directe du client disparaît.
--
-- Idempotent. Transactionnel.
-- Date : 2026-09-12
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Client peut annuler son RDV" ON public.rdv_reservations;

COMMIT;


-- ============================================================================
-- CONTRÔLE — une ligne par vérification, avec sa valeur ET l'attendu.
-- ============================================================================

SELECT 'Y01'::text AS ordre,
       'La policy d ecriture du client existe encore'::text AS controle,
       CASE WHEN count(*) = 0 THEN 'non' ELSE 'OUI' END::text AS valeur,
       'non'::text AS attendu,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE '>>> ECHEC' END::text AS verdict
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'rdv_reservations'
  AND policyname = 'Client peut annuler son RDV'

-- ⚠️ LA VÉRIFICATION QUI COMPTE VRAIMENT : on a retiré UNE porte, pas les
-- autres. Sans cette ligne, un DROP trop large passerait pour une réussite.
UNION ALL
SELECT 'Y02',
       'Le commercant garde ses policies sur son agenda',
       COALESCE(string_agg(policyname::text, ', ' ORDER BY policyname::text), 'AUCUNE'),
       'voir, creer, modifier et supprimer : quatre',
       CASE WHEN count(*) = 4 THEN 'OK' ELSE '>>> A REGARDER' END
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'rdv_reservations'
  AND policyname LIKE 'Commercant%'

UNION ALL
SELECT 'Y03',
       'Le client garde la LECTURE de ses rendez-vous',
       COALESCE(string_agg(policyname::text, ', ' ORDER BY policyname::text), 'AUCUNE'),
       'au moins une policy SELECT cote client',
       CASE WHEN count(*) >= 1 THEN 'OK' ELSE '>>> ECHEC, l espace client serait vide' END
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'rdv_reservations'
  AND policyname LIKE 'Client voit%' AND cmd = 'SELECT'

UNION ALL
SELECT 'Y04',
       'Policies restantes sur rdv_reservations',
       count(*)::text,
       -- ⚠️ NEUF AVANT, HUIT APRES. Ce chiffre se COMPTE, il ne se devine pas :
       -- la premiere version de cette ligne annoncait « dix au lieu de onze »,
       -- inventes, alors que le controle n 3 venait de lister les neuf. Un
       -- attendu faux est pire qu absent, il apprend a ignorer la colonne.
       'huit (les neuf listees par le controle n 3, moins celle-ci)',
       'A LIRE'
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'rdv_reservations'

ORDER BY 1;


-- ============================================================================
-- ⚠️ LA QUESTION, AVANT DE PASSER CECI
--
-- Mon avis : retirer. La porte ne sert à personne, et elle laisse modifier le
-- prix d'un rendez-vous depuis le navigateur.
--
-- Mais c'est ta décision, parce qu'elle ferme une possibilité : si tu voulais
-- un jour que le client annule SANS passer par nos routes (une application
-- mobile native, par exemple), il faudrait une fonction dédiée en base plutôt
-- que cette policy. Je ne connais aucun usage actuel.
--
-- À TESTER APRÈS : annuler un rendez-vous depuis l'espace client. Ça doit
-- marcher exactement comme avant, puisque ça passe par `/api/rdv/cancel`.
-- ============================================================================
