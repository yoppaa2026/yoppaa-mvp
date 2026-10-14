-- ════════════════════════════════════════════════════════════════════
-- LECTURE AVANT LE LANCEMENT (14/10) : qui voit quoi en PROD ?
--
-- LECTURE SEULE. Rien n'est modifié. À coller en UNE fois dans l'éditeur
-- SQL de la base de PRODUCTION. Une ligne par contrôle : valeur ET attendu.
--
-- La question d'Alex : « les commerçants de test sont-ils visibles
-- EXCLUSIVEMENT de mon compte et de ceux des relecteurs des stores ? Avec un
-- autre compte, il n'y aura bien que les vrais ? »
--
-- La règle (MIGRATION_RELECTURE_STORES.sql, passée le 03/10 sur les deux
-- bases) : une fiche `publie` est vue de TOUS ; une fiche `relecture` n'est
-- vue QUE des comptes de `comptes_relecture` ; toutes les autres de personne.
-- Donc un commerce de démo encore en `publie` est vu de TOUT LE MONDE.
-- ════════════════════════════════════════════════════════════════════

WITH demos(nom) AS (
  VALUES
    -- Les démos des relecteurs (liste du 03/10)
    ('boulangerie dupuis'), ('chez mathilde'), ('chez momo'), ('le dressing de sophie'),
    ('salon nathalie'), ('studio amandine'), ('le traiteur alexandre'), ('sushi yuki'),
    ('new signup'),
    -- Les anciens commerces de test (relevé du 15/09)
    ('ciseaux et soins'), ('ciseaux provisoires'), ('kebabistro'), ('la boutique témoin'),
    ('la mie de test'), ('la table d''essai'), ('sushi sushi'),
    ('centre respire - yoga et pilates'), ('le food trick'), ('dermae')
)
SELECT 'A. fiches PUBLIÉES (vues de TOUT LE MONDE)' AS controle,
       count(*)::text || ' : ' || coalesce(string_agg(c.nom, ' · ' ORDER BY c.nom), 'aucune') AS valeur,
       'uniquement de VRAIS commerces' AS attendu
  FROM public.commercants c WHERE c.statut_publication = 'publie'
UNION ALL
SELECT 'B. 🔴 démo ou test encore PUBLIÉ (vu de tous)',
       count(*)::text || ' : ' || coalesce(string_agg(c.nom, ' · ' ORDER BY c.nom), 'aucune'),
       '0'
  FROM public.commercants c
 WHERE c.statut_publication = 'publie'
   AND (lower(btrim(c.nom)) IN (SELECT nom FROM demos)
        OR lower(c.nom) LIKE '%test%' OR lower(c.nom) LIKE '%démo%' OR lower(c.nom) LIKE '%demo%'
        OR lower(c.nom) LIKE '%essai%' OR lower(c.nom) LIKE '%témoin%')
UNION ALL
SELECT 'C. fiches en RELECTURE (vues des seuls comptes de la liste)',
       count(*)::text || ' : ' || coalesce(string_agg(c.nom, ' · ' ORDER BY c.nom), 'aucune'),
       'les démos des relecteurs (Chez Momo, Salon Nathalie…)'
  FROM public.commercants c WHERE c.statut_publication = 'relecture'
UNION ALL
SELECT 'D. comptes qui voient la RELECTURE',
       count(*)::text || ' : ' || coalesce(string_agg(u.email, ' · ' ORDER BY u.email), 'aucun'),
       'tes comptes + ceux des relecteurs Apple et Google, PERSONNE d''autre'
  FROM public.comptes_relecture r LEFT JOIN auth.users u ON u.id = r.user_id
UNION ALL
SELECT 'E. fiches ni publiées ni en relecture (vues de personne)',
       coalesce(string_agg(s.statut_publication || ' ' || s.n, ' · ' ORDER BY s.statut_publication), 'aucune'),
       'pour info'
  FROM (SELECT coalesce(statut_publication, '(vide)') AS statut_publication, count(*)::text AS n
          FROM public.commercants
         WHERE statut_publication IS DISTINCT FROM 'publie' AND statut_publication IS DISTINCT FROM 'relecture'
         GROUP BY 1) s
UNION ALL
SELECT 'F. la vue publique applique la relecture',
       CASE WHEN pg_get_viewdef('public.commercants_public'::regclass, true) LIKE '%relecture%est_compte_relecture%' THEN 'oui' ELSE 'NON' END,
       'oui'
UNION ALL
SELECT 'G. commerces_publies() applique la relecture',
       CASE WHEN pg_get_functiondef('public.commerces_publies()'::regprocedure) LIKE '%relecture%est_compte_relecture%' THEN 'oui' ELSE 'NON' END,
       'oui'
UNION ALL
SELECT 'H. un visiteur sans compte n''est pas dans la liste',
       public.est_compte_relecture()::text,
       'false';
