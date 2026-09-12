-- ============================================================================
-- CONTRÔLE DE SÉCURITÉ N° 3 : LES COMPTES CONNECTÉS (12/09/2026)
--
-- ⚠️ NE MODIFIE RIEN. Lecture de métadonnées uniquement.
--
-- LA QUESTION. Les deux premiers contrôles ont regardé ce qu'un visiteur
-- ANONYME peut faire. Restent les policies qui ne visent que les comptes
-- connectés : celles de `commandes`, `rdv_reservations`, `admin_impersonations`
-- n'apparaissaient dans aucun des deux, parce qu'elles ne visent ni `anon` ni
-- `public`. Un commerçant connecté peut-il voir au-delà de ses propres lignes ?
--
-- ⚠️ ET LE SOCLE, QUE JE N'AVAIS PAS REGARDÉ. Une dizaine de policies se
-- reposent entièrement sur `is_admin()` et `is_yoppaa_admin()`. Si l'une de ces
-- deux fonctions rend `true` trop largement, TOUTES ces policies s'ouvrent d'un
-- coup, et aucun contrôle de policy ne le verrait : elles auraient toutes l'air
-- parfaitement conditionnelles. On lit donc leur définition (section N).
--
-- Coller TOUT le bloc d'un coup dans l'éditeur SQL de Supabase.
-- ============================================================================

WITH perso(nom) AS (
  VALUES ('clients'), ('commandes'), ('commande_articles'), ('rdv_reservations'),
         ('favoris'), ('avis'), ('abonnements'), ('client_preferences'),
         ('fidelite_cartes'), ('fidelite_mouvements'), ('bons_cadeaux'),
         ('bons_cadeaux_mouvements'), ('pre_inscriptions'), ('rdv_attente'),
         ('suggestions_commercants'), ('admin_impersonations'),
         ('demandes_commande'), ('yoppers')
),
pol AS (
  SELECT tablename::text AS tbl, policyname::text AS nom, cmd::text AS commande,
         roles::text[] AS roles, qual::text AS lecture, with_check::text AS ecriture,
         (COALESCE(qual, '') || ' ' || COALESCE(with_check, ''))::text AS expr
  FROM pg_policies
  WHERE schemaname = 'public'
)

-- ─── O. LA CHASSE PRINCIPALE : toute policy ouverte, quel que soit le role ──
-- ⚠️ C'est le défaut du 13/07 sur `commandes` : `USING (true)` laissait lire
-- toutes les commandes de tous les commerçants. Une seule ligne ici vaut audit.
SELECT 'O'::text AS ordre,
       (tbl || ' · ' || nom || ' [' || commande || ']')::text AS objet,
       ('roles=' || array_to_string(roles, ',')
        || ' | USING ' || COALESCE(left(lecture, 100), '-')
        || ' | CHECK ' || COALESCE(left(ecriture, 100), '-'))::text AS detail,
       'aucune policy ne doit valoir true'::text AS attendu,
       '>>> OUVERTE A TOUT COMPTE'::text AS verdict
FROM pol
WHERE COALESCE(lecture, '') = 'true' OR COALESCE(ecriture, '') = 'true'

-- ─── L. Policies sur donnees personnelles qui n invoquent AUCUNE identite ───
-- Une policy saine nomme celui qui agit : `auth.uid()`, ou une fonction qui s en
-- sert. Une policy qui ne parle que de colonnes metier ne verifie PERSONNE :
-- c est mot pour mot le defaut du 04/09 sur l agenda.
UNION ALL
SELECT 'L',
       (p.tbl || ' · ' || p.nom || ' [' || p.commande || ']'),
       ('roles=' || array_to_string(p.roles, ',')
        || ' | USING ' || COALESCE(left(p.lecture, 120), '-')
        || ' | CHECK ' || COALESCE(left(p.ecriture, 120), '-')),
       'doit citer auth.uid() ou une fonction d identite',
       '>>> A JUSTIFIER'
FROM pol p
JOIN perso pe ON pe.nom = p.tbl
WHERE p.expr !~ '(auth\.uid|auth\.jwt|is_admin|is_yoppaa_admin)'

-- ─── M. Le detail complet des trois tables jamais inspectees ───────────────
UNION ALL
SELECT 'M',
       (tbl || ' · ' || nom || ' [' || commande || ']'),
       ('roles=' || array_to_string(roles, ',')
        || ' | USING ' || COALESCE(left(lecture, 150), '-')
        || ' | CHECK ' || COALESCE(left(ecriture, 150), '-')),
       'chaque ligne limitee a son proprietaire, ou a l admin',
       'A LIRE'
FROM pol
WHERE tbl IN ('commandes', 'rdv_reservations', 'admin_impersonations')

-- ─── N. LE SOCLE : que disent vraiment les fonctions d identite ? ──────────
UNION ALL
SELECT 'N',
       p.proname::text,
       replace(left(pg_get_functiondef(p.oid), 600), E'\n', ' ')::text,
       'compare l identite de l appelant, et rien d autre',
       '>>> A LIRE MOT A MOT'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_admin', 'is_yoppaa_admin')

-- ─── P. Tables a donnees personnelles SANS aucune policy de lecture ────────
-- Sans policy SELECT, seule la cle de service lit : c est l etat le plus ferme.
-- On le note pour savoir ou l on se tient, ce n est pas un defaut.
UNION ALL
SELECT 'P',
       pe.nom,
       'aucune policy SELECT : lecture reservee a la cle de service',
       'etat le plus ferme',
       'INFO'
FROM perso pe
WHERE NOT EXISTS (
  SELECT 1 FROM pol p WHERE p.tbl = pe.nom AND p.commande IN ('SELECT', 'ALL')
)

-- ─── Q. Reperes ────────────────────────────────────────────────────────────
UNION ALL
SELECT 'Q', 'policies au total', count(*)::text, 'pour memoire', 'INFO' FROM pol
UNION ALL
SELECT 'Q', 'policies visant authenticated seul', count(*)::text, 'pour memoire', 'INFO'
FROM pol WHERE 'authenticated' = ANY(roles) AND NOT ('public' = ANY(roles))

ORDER BY 1, 2;
