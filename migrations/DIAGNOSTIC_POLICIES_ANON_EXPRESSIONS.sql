-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUE LES POLICIES ATTEIGNABLES PAR `anon` LAISSENT VRAIMENT PASSER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 CE QU'ON SAIT DÉJÀ (diagnostic précédent) : douze tables personnelles
-- donnent des droits à `anon`, et sur NEUF d'entre elles au moins une policy
-- PERMISSIVE est évaluée pour lui.
--
-- ⚠️ ET C'EST TOUT CE QU'ON SAIT. Une policy ÉVALUÉE ne rend pas forcément des
-- lignes : son expression `USING` peut la vider entièrement pour un visiteur
-- sans compte (`auth.uid()` vaut NULL, `auth.jwt()` ne porte aucun email). Un
-- nom en « _own » le suggère ; il ne le prouve pas. C'est l'EXPRESSION qui
-- décide, et elle seule.
--
-- ⚠️ ON REGARDE AUSSI `WITH CHECK`, pas seulement `USING` : une policy INSERT
-- sans contrainte d'écriture laisserait un visiteur créer des lignes
-- arbitraires, ce qui est une faille d'un autre genre mais du même niveau.
--
-- ⚠️ AUCUNE DONNÉE PERSONNELLE NE SORT D'ICI : que des définitions de règles.
--
-- Une ligne par policy. La colonne `expression` est ce qu'il faut lire.

SELECT
  (p.tablename || ' / ' || p.policyname)::text AS controle,
  (p.cmd
    || ' | roles=' || array_to_string(p.roles, ',')
    || ' | USING=' || COALESCE(p.qual, '(aucune)')
    || ' | CHECK=' || COALESCE(p.with_check, '(aucune)')
  )::text AS expression,
  'doit exclure un visiteur sans compte'::text AS attendu
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.permissive = 'PERMISSIVE'
  AND ('anon' = ANY(p.roles) OR 'public' = ANY(p.roles))
  AND p.tablename IN (
    'bons_cadeaux', 'clients', 'avis', 'abonnements',
    'fidelite_cartes', 'fidelite_mouvements', 'demandes_commande',
    'rdv_reservations', 'commercants'
  )

UNION ALL

-- ─── LE VERDICT EN UNE LIGNE ────────────────────────────────────────────────
--
-- Une policy est DANGEREUSE pour un visiteur sans compte si son `USING` ne
-- mentionne NI `auth.uid()`, NI `auth.jwt()`, NI `auth.email()` : sans l'un des
-- trois, elle ne peut pas distinguer qui demande, donc elle rend tout.
--
-- ⚠️ Le test est volontairement GROSSIER et penche du mauvais côté : il peut
-- accuser une policy saine (par exemple une sous-requête qui remonte à
-- `auth.uid()` par un autre chemin). Une garde qui réclame un examen de trop
-- vaut mieux qu'une garde qui rassure à tort.
SELECT
  'POLICIES SANS AUCUN LIEN A L IDENTITE'::text,
  (SELECT count(*)::text FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND p.permissive = 'PERMISSIVE'
     AND ('anon' = ANY(p.roles) OR 'public' = ANY(p.roles))
     AND p.tablename IN (
       'bons_cadeaux', 'clients', 'avis', 'abonnements',
       'fidelite_cartes', 'fidelite_mouvements', 'demandes_commande')
     AND COALESCE(p.qual, '') !~ 'auth\.(uid|jwt|email)'
     AND COALESCE(p.with_check, '') !~ 'auth\.(uid|jwt|email)'),
  '0'::text

ORDER BY 1;
