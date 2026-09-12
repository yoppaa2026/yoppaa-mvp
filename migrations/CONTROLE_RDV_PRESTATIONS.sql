-- ============================================================================
-- LES PRESTATIONS DE CRÉNEAUX : RÉGRESSION, OU CONTRÔLE BIAISÉ ? (12/09/2026)
--
-- ⚠️ NE MODIFIE RIEN. Lecture seule, rôle toujours rendu, aucune donnée
-- personnelle.
--
-- CE QU'ON A VU. Le contrôle de non-régression donne « 5 vues sur 28 » pour
-- `rdv_creneau_prestations`, seule table sur dix à ne pas être au complet.
--
-- 🔴 DEUX EXPLICATIONS OPPOSÉES, ET IL FAUT TRANCHER AVANT DE TOUCHER À QUOI
-- QUE CE SOIT, parce que cette table sert la prise de rendez-vous :
--
--   A. RÉGRESSION RÉELLE : la nouvelle policy cache des prestations qui
--      devraient sortir, et des heures manquent sur les fiches.
--
--   B. MON CONTRÔLE EST BIAISÉ, et c'est l'hypothèse la plus probable. Pour
--      remonter au commerçant, ma requête joint `rdv_creneaux` — et cette
--      jointure, exécutée en rôle `anon`, subit la RLS de `rdv_creneaux`. Or la
--      policy, elle, passe par `rdv_creneau_lisible()`, qui est SECURITY
--      DEFINER et ignore donc cette RLS. Les deux ne mesurent pas la même
--      chose : si `anon` ne voit qu'une partie des créneaux, mon comptage
--      s'effondre sans que la policy des prestations y soit pour rien.
--
-- ⚠️ `rdv_creneaux` n'a JAMAIS eu de lecture `USING true` : elle n'était pas
-- dans la liste des dix tables du chantier, donc sa policy était déjà
-- conditionnelle avant. Elle n'a pas été touchée.
--
-- LA MÉTHODE : compter SANS jointure là où on est `anon`, et interroger
-- directement la règle.
--
-- Coller TOUT le bloc d'un coup.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE IF NOT EXISTS essai_rdv (
  ordre text, controle text, valeur text, attendu text, verdict text
);
TRUNCATE essai_rdv;

DO $$
DECLARE
  ids            uuid[];
  n_total        bigint;
  n_publies      bigint;
  n_anon_brut    bigint;
  n_cren_reels   bigint;
  n_cren_anon    bigint;
  n_regle_vraie  bigint;
BEGIN
  SELECT array_agg(id) INTO ids FROM public.commercants WHERE statut_publication = 'publie';

  -- ── Ce qui existe, sans aucun filtre de role ────────────────────────────
  SELECT count(*) INTO n_total FROM public.rdv_creneau_prestations;

  SELECT count(*) INTO n_publies
  FROM public.rdv_creneau_prestations cp
  WHERE EXISTS (SELECT 1 FROM public.rdv_creneaux k
                WHERE k.id = cp.creneau_id AND k.commercant_id = ANY(ids));

  SELECT count(*) INTO n_cren_reels
  FROM public.rdv_creneaux WHERE commercant_id = ANY(ids);

  -- ⚠️ LA MESURE QUI TRANCHE : ce que la REGLE dit, sans passer par aucune
  -- jointure soumise a la RLS. `rdv_creneau_lisible` est SECURITY DEFINER,
  -- c est exactement ce que la policy evalue.
  SELECT count(*) INTO n_regle_vraie
  FROM public.rdv_creneau_prestations cp
  WHERE public.rdv_creneau_lisible(cp.creneau_id);

  -- ── Ce qu un anonyme voit VRAIMENT, sans jointure ───────────────────────
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO n_anon_brut FROM public.rdv_creneau_prestations;
  SELECT count(*) INTO n_cren_anon FROM public.rdv_creneaux;
  EXECUTE 'RESET ROLE';

  INSERT INTO essai_rdv VALUES
    ('S01', 'Prestations de creneaux existantes (toutes)', n_total::text,
     'pour memoire', 'INFO'),
    ('S02', 'Dont le creneau appartient a un commerce publie', n_publies::text,
     'pour memoire', 'INFO'),

    -- 🎯 LE CHIFFRE QUI DECIDE : sans jointure, donc sans biais.
    ('S03', 'Prestations vues par un ANONYME (sans jointure)', n_anon_brut::text,
     'autant que S02 : ' || n_publies::text,
     CASE WHEN n_anon_brut >= n_publies THEN 'OK, aucune regression'
          ELSE '>>> REGRESSION REELLE' END),

    ('S04', 'Ce que la REGLE elle-meme autorise', n_regle_vraie::text,
     'autant que S02 : ' || n_publies::text,
     CASE WHEN n_regle_vraie >= n_publies THEN 'OK, la regle laisse passer'
          ELSE '>>> LA REGLE EST TROP STRICTE' END),

    -- L explication du biais, s il y en a un : anon ne voit pas tous les
    -- creneaux, donc ma jointure du controle precedent perdait des lignes.
    ('S05', 'Creneaux de RDV des publies : vus par anon / reels',
     n_cren_anon::text || ' / ' || n_cren_reels::text,
     'si anon en voit moins, mon controle precedent etait biaise',
     CASE WHEN n_cren_anon < n_cren_reels
          THEN 'BIAIS CONFIRME : rdv_creneaux filtre deja, et ce n est pas nouveau'
          ELSE 'pas de biais de ce cote' END);

  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- La policy de `rdv_creneaux`, pour comprendre ce qu'elle filtre. Elle n'a pas
-- ete touchee par le chantier : elle etait deja conditionnelle avant.
INSERT INTO essai_rdv
SELECT 'S06', 'rdv_creneaux · ' || policyname || ' [' || cmd || ']',
       permissive || ' | roles=' || array_to_string(roles::text[], ',')
       || ' | USING ' || COALESCE(left(qual, 160), '-'),
       'elle explique ce qu un anonyme ne voit pas',
       'A LIRE'
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'rdv_creneaux' AND cmd IN ('SELECT', 'ALL');

SELECT * FROM essai_rdv ORDER BY ordre;

COMMIT;

-- ============================================================================
-- COMMENT LIRE
--
--   • S03 est le chiffre qui décide. S'il est au niveau de S02, un anonyme voit
--     bien toutes les prestations des commerces publiés : AUCUNE régression, et
--     c'était mon contrôle qui perdait des lignes dans sa jointure.
--   • S04 confirme du côté de la règle : elle autorise, indépendamment de toute
--     jointure.
--   • S05 explique le biais : si `anon` voit moins de créneaux qu'il n'en
--     existe, c'est la policy de `rdv_creneaux` qui filtre, et elle le faisait
--     DÉJÀ avant le chantier.
--   • Si S03 est bas, alors c'est une vraie régression et on corrige tout de
--     suite : la prise de rendez-vous perdrait des heures.
-- ============================================================================
