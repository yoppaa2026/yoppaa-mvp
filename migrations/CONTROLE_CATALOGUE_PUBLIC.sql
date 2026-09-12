-- ============================================================================
-- CONTRÔLE N° 5 : LE CATALOGUE PUBLIC (12/09/2026)
--
-- ⚠️ NE MODIFIE RIEN. Lecture de métadonnées uniquement.
--
-- CE QU'ON PRÉPARE. Dix tables de catalogue se lisent avec `USING true` : leur
-- contenu sort donc de l'API même pour un commerce qui n'est PAS publié (en
-- préparation, refusé, ou parti). L'écran, lui, bloque bien la fiche non
-- publiée (`app/commander/[slug]/page.js:1828`) — mais c'est une garde d'écran,
-- et une garde d'écran n'est jamais une réponse.
--
-- POURQUOI CE CONTRÔLE AVANT LA MIGRATION. Pour écrire la règle il faut savoir
-- DEUX choses que je ne veux pas deviner :
--   1. par quelle colonne chaque table se rattache à un commerçant (certaines
--      n'ont pas de `commercant_id` et passent par `article_id`, `creneau_id`…) ;
--   2. quelles policies existent déjà dessus, ÉCRITURES COMPRISES. Je connais
--      leurs lectures, pas le reste, et une migration qui remplace une policy
--      sans connaître ses voisines casse ce qu'elle ne voit pas.
--
-- 🔴 LE PIÈGE À ÉVITER : si la nouvelle règle oublie « ou je suis le
-- propriétaire », le tableau de bord de TOUT commerce non encore publié se
-- vide, et c'est exactement le moment de l'onboarding.
--
-- `tva_taux_reference` est volontairement hors périmètre : c'est une table de
-- référence globale, sans commerçant, publique par nature.
--
-- Coller TOUT le bloc d'un coup.
-- ============================================================================

WITH cibles(nom) AS (
  VALUES ('articles'), ('article_photos'), ('article_variantes'),
         ('article_options_groupes'), ('article_options_valeurs'),
         ('article_stock_jour'), ('creneaux'), ('creneaux_blocages'),
         ('commercant_lieux'), ('rdv_creneau_prestations')
)

-- ─── U. Par quelle colonne chaque table se rattache-t-elle ? ────────────────
SELECT 'U'::text AS ordre,
       c.table_name::text AS objet,
       ('colonnes de rattachement : '
        || COALESCE(string_agg(c.column_name::text, ', ' ORDER BY c.column_name::text), 'AUCUNE'))::text AS detail,
       'une colonne qui mene au commercant, directement ou non'::text AS attendu,
       CASE WHEN count(*) = 0 THEN '>>> AUCUN LIEN TROUVE' ELSE 'A LIRE' END::text AS verdict
FROM information_schema.columns c
JOIN cibles ci ON ci.nom = c.table_name
WHERE c.table_schema = 'public'
  AND c.column_name IN ('commercant_id', 'article_id', 'creneau_id', 'groupe_id',
                        'prestation_id', 'option_id', 'variante_id', 'lieu_id')
GROUP BY c.table_name

-- ─── V. Toutes les policies de ces tables, ecritures comprises ─────────────
UNION ALL
SELECT 'V',
       (p.tablename || ' · ' || p.policyname || ' [' || p.cmd || ']'),
       (p.permissive || ' | roles=' || array_to_string(p.roles::text[], ',')
        || ' | USING ' || COALESCE(left(p.qual, 120), '-')
        || ' | CHECK ' || COALESCE(left(p.with_check, 120), '-')),
       'la lecture publique doit devenir conditionnelle, le reste ne bouge pas',
       CASE WHEN COALESCE(p.qual, '') = 'true' THEN '>>> A REMPLACER' ELSE 'A CONSERVER' END
FROM pg_policies p
JOIN cibles ci ON ci.nom = p.tablename
WHERE p.schemaname = 'public'

-- ─── W. Les valeurs reelles de statut_publication ──────────────────────────
-- ⚠️ On ecrit la regle sur la valeur EXACTE. Le depot dit 'publie' ; on verifie
-- qu'aucune autre orthographe ne circule, sinon la regle exclurait des commerces
-- parfaitement publies.
UNION ALL
SELECT 'W',
       COALESCE(c.statut_publication, 'NULL'),
       ('commerces portant cette valeur : ' || count(*)::text),
       'publie pour les fiches en ligne',
       'A LIRE'
FROM commercants c
GROUP BY c.statut_publication

-- ─── X. La fonction d identite existe-t-elle deja sous une forme reutilisable ?
UNION ALL
SELECT 'X',
       p.proname::text,
       ('security_definer=' || p.prosecdef::text
        || ' | search_path=' || COALESCE(array_to_string(p.proconfig, ','), 'ABSENT')),
       'pour savoir sur quoi s appuyer',
       'A LIRE'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_yoppaa_admin', 'is_admin', 'mes_commerces_bloques', 'commerce_lisible')

ORDER BY 1, 2;
