-- DIAGNOSTIC — « La Table du Stock » affichée « Suspendu » sans l avoir jamais été
--
-- 16/09. Lecture SEULE, aucune écriture, aucune donnée personnelle en sortie :
-- ni email, ni téléphone, ni adresse. Uniquement des statuts et des dates.
--
-- CE QU ON CHERCHE. L admin n affiche que quatre statuts de publication
-- (publie, en_attente, rejete, suspendu) et retombe sur « Suspendu » pour tout
-- le reste, pendant que la modale d édition, elle, retombe sur « publie ».
-- Une fiche restée en `brouillon` est donc annoncée suspendue dans la liste et
-- publiée dans la fenêtre qui sert à la modifier.
--
-- ⚠️ ET LE CONTRÔLE 5 EST LE PLUS IMPORTANT : il compte les FRÈRES. Si
-- plusieurs fiches sont dans ce cas, ce sont autant d inscriptions arrêtées en
-- route dont personne n a jamais été prévenu.

SELECT 'A. statut_publication de La Table du Stock'::text AS controle,
       coalesce(c.statut_publication, '(VIDE / NULL)')::text AS valeur,
       'brouillon attendu si l inscription n a jamais ete soumise'::text AS attendu
  FROM commercants c WHERE c.nom = 'La Table du Stock'
UNION ALL
SELECT 'B. statut (la porte du tableau de bord)'::text,
       coalesce(c.statut, '(VIDE / NULL)')::text,
       'en_cours_onboarding attendu ; ni valide ni actif'::text
  FROM commercants c WHERE c.nom = 'La Table du Stock'
UNION ALL
SELECT 'C. slug'::text,
       coalesce(c.slug, '(VIDE / NULL)')::text,
       'vide : le slug ne naît qu à la validation'::text
  FROM commercants c WHERE c.nom = 'La Table du Stock'
UNION ALL
SELECT 'D. inscrite le'::text,
       coalesce(to_char(c.created_at, 'DD/MM/YYYY HH24:MI'), '(VIDE)')::text,
       'la date dit depuis combien de temps il attend'::text
  FROM commercants c WHERE c.nom = 'La Table du Stock'
UNION ALL
SELECT 'E. son dossier d onboarding'::text,
       coalesce((SELECT o.statut FROM onboarding_commercants o
                  WHERE o.commercant_id = c.id ORDER BY o.created_at DESC LIMIT 1),
                '(AUCUNE LIGNE)')::text,
       'pas en_attente_validation : il n a jamais clique le dernier bouton'::text
  FROM commercants c WHERE c.nom = 'La Table du Stock'
UNION ALL
SELECT 'F. completed_at de l onboarding'::text,
       coalesce((SELECT to_char(o.completed_at, 'DD/MM/YYYY HH24:MI')
                   FROM onboarding_commercants o
                  WHERE o.commercant_id = c.id ORDER BY o.created_at DESC LIMIT 1),
                '(JAMAIS TERMINE)')::text,
       'vide : confirme que la soumission n a jamais eu lieu'::text
  FROM commercants c WHERE c.nom = 'La Table du Stock'
UNION ALL
-- ⚠️ LES FRÈRES. Combien d autres fiches portent un statut que l admin
-- n affiche pas, et sont donc annoncées « Suspendu » a tort ?
SELECT 'G. FRERES : fiches au statut inconnu de l admin'::text,
       count(*)::text,
       'chacune est affichee « Suspendu » a tort dans la liste'::text
  FROM commercants c
 WHERE c.statut_publication IS NULL
    OR c.statut_publication NOT IN ('publie', 'en_attente', 'rejete', 'suspendu')
UNION ALL
-- Et leur repartition, pour savoir de quoi il s agit exactement.
SELECT 'H. repartition de TOUS les statuts de publication'::text,
       string_agg(t.etat || ' = ' || t.n::text, ' · ' ORDER BY t.n DESC)::text,
       'brouillon = inscriptions commencees et jamais soumises'::text
  FROM (SELECT coalesce(statut_publication, '(NULL)') AS etat, count(*) AS n
          FROM commercants GROUP BY 1) t
UNION ALL
-- ⚠️ ET CEUX QUI ATTENDENT VRAIMENT UNE REPONSE D ALEX, a ne pas confondre
-- avec les abandons : ceux-la ont ete soumis et personne ne leur a repondu.
SELECT 'I. fiches soumises en attente de ta validation'::text,
       count(*)::text,
       'celles-la attendent une reponse, pas un rappel'::text
  FROM commercants c WHERE c.statut_publication = 'en_attente';
