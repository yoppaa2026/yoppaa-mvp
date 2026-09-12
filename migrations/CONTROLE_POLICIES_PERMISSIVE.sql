-- ============================================================================
-- CONTRÔLE N° 4 : PERMISSIVE OU RESTRICTIVE ? (12/09/2026)
--
-- ⚠️ NE MODIFIE RIEN. Lecture de métadonnées uniquement.
--
-- POURQUOI IL EXISTE : PARCE QUE MON CONTRÔLE N° 3 NE PROUVAIT RIEN.
--
-- Les policies `zz_commerce_ouvert` portent une condition VRAIE POUR PRESQUE
-- TOUTES LES LIGNES :
--
--     (commercant_id IS NULL) OR (NOT (commercant_id IN (mes_commerces_bloques())))
--
-- Lue seule, elle a l'air d'ouvrir toute la table. Tout dépend du TYPE, que
-- PostgreSQL ne montre PAS dans `qual` :
--
--   • RESTRICTIVE → les policies se combinent en ET. La condition large devient
--     une contrainte EN PLUS de la règle stricte. Le modèle tient.
--   • PERMISSIVE (LE DÉFAUT quand on n'écrit rien) → elles se combinent en OU.
--     Il suffit qu'une seule passe : la règle stricte devient décorative, et
--     n'importe quel compte connecté lit toute la table.
--
-- Une vérification du 24/08 dit que les 43 tables du verrou portent bien
-- RESTRICTIVE. Mais des policies ont été ajoutées depuis (le module restaurant),
-- et surtout : UNE REQUÊTE QUI NE RAMÈNE PAS LA COLONNE `permissive` NE PROUVE
-- RIEN. La mienne ne la ramenait pas. Celle-ci la ramène.
--
-- Coller TOUT le bloc d'un coup.
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
         permissive::text AS type, roles::text[] AS roles,
         (COALESCE(qual, '') || ' ' || COALESCE(with_check, ''))::text AS expr
  FROM pg_policies WHERE schemaname = 'public'
)

-- ─── R. LE VERROU : toutes les zz_commerce_ouvert, avec leur TYPE ───────────
SELECT 'R01'::text AS ordre,
       'zz_commerce_ouvert en PERMISSIVE (ouvrirait tout)'::text AS controle,
       COALESCE(string_agg(tbl, ', ' ORDER BY tbl), 'aucune')::text AS valeur,
       'aucune : elles doivent TOUTES etre RESTRICTIVE'::text AS attendu,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE '>>> GRAVE' END::text AS verdict
FROM pol WHERE nom = 'zz_commerce_ouvert' AND type <> 'RESTRICTIVE'

UNION ALL
SELECT 'R02', 'zz_commerce_ouvert en RESTRICTIVE (attendu)', count(*)::text,
       'le meme nombre que de tables verrouillees', 'INFO'
FROM pol WHERE nom = 'zz_commerce_ouvert' AND type = 'RESTRICTIVE'

-- ─── S. LE CAS GÉNÉRAL : une policy PERMISSIVE large sur des donnees perso ──
-- ⚠️ C'est la forme du défaut, quel que soit le nom de la policy : elle
-- s'ajoute en OU, donc sa condition large suffit à elle seule. Une policy
-- PERMISSIVE qui ne nomme PAS l'appelant ouvre la table à tous ses rôles.
UNION ALL
SELECT 'S',
       (p.tbl || ' · ' || p.nom || ' [' || p.commande || ']'),
       ('PERMISSIVE | roles=' || array_to_string(p.roles, ',')
        || ' | ' || left(p.expr, 160)),
       'une policy PERMISSIVE doit nommer l appelant',
       '>>> OUVRE CETTE TABLE'
FROM pol p
JOIN perso pe ON pe.nom = p.tbl
WHERE p.type = 'PERMISSIVE'
  AND p.expr !~ '(auth\.uid|auth\.email|auth\.jwt|is_admin|is_yoppaa_admin)'

-- ─── T. Repere : la repartition des types ──────────────────────────────────
UNION ALL
SELECT 'T', 'policies RESTRICTIVE au total', count(*)::text, 'pour memoire', 'INFO'
FROM pol WHERE type = 'RESTRICTIVE'
UNION ALL
SELECT 'T', 'policies PERMISSIVE au total', count(*)::text, 'pour memoire', 'INFO'
FROM pol WHERE type = 'PERMISSIVE'

ORDER BY 1, 5 DESC, 2;
