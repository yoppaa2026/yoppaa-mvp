-- ════════════════════════════════════════════════════════════════════
-- ACTIVATION DE LA RELECTURE EN PRODUCTION (14/10, veille de l'ouverture)
--
-- 🔴 POURQUOI. La lecture du 14/10 (LECTURE_AVANT_LANCEMENT_14_10.sql) a
-- montré que les 6 fiches PUBLIÉES en prod sont TOUTES des démos (Chez Momo,
-- Salon Nathalie…) : n'importe qui les voit, et la liste des comptes de
-- relecture est VIDE. L'activation prévue « le jour des approbations » n'avait
-- jamais été faite.
--
-- CE QUE ÇA FAIT, en une transaction (l'éditeur Supabase en est une) :
--   1. inscrit dans `comptes_relecture` les comptes d'Alex et le compte de
--      démonstration partagé avec Apple et Google, PAR IDENTIFIANT (on part de
--      l'adresse pour le retrouver, rien d'autre n'est stocké) ;
--   2. passe les démos de `publie` à `relecture` : elles disparaissent pour
--      tout le monde SAUF ces comptes, et sortent de Google, du Good Morning
--      et des notifications des favoris.
--
-- ⚠️ CE QUI NE CHANGE PAS : les vrais commerces (en attente aujourd'hui) ne
-- sont pas touchés. Tant qu'aucun n'est publié, un Yopper normal voit une
-- liste VIDE : c'est voulu, mieux vaut vide que des commerces inventés.
-- ⚠️ Une adresse qui n'existe pas n'insère rien : le contrôle dit lesquelles
-- ont été trouvées. Rien n'est supprimé, tout se défait en repassant les
-- fiches à `publie`.
--
-- À COLLER EN UNE FOIS, dans la base de PRODUCTION, après le « go ».
-- ════════════════════════════════════════════════════════════════════

-- 1) Les comptes qui voient les démos
INSERT INTO public.comptes_relecture (user_id, note)
SELECT u.id, 'activation 14/10 : ' || lower(u.email)
  FROM auth.users u
 WHERE lower(u.email) IN (
   'verstappenalexandre@gmail.com',               -- Alex
   'verstappenalexandre+yopper@gmail.com',        -- Alex, compte Yopper d'essai
   'verstappenalexandre+play@gmail.com',          -- compte de démo des relecteurs (Apple et Google)
   'verstappenalexandre+appstore@gmail.com',      -- au cas où (Apple)
   'verstappenalexandre+googleplay@gmail.com',    -- au cas où (Google)
   'verstappenalexandre+appstoredelete@gmail.com' -- 2e compte de démo d'Apple (suppression)
 )
ON CONFLICT (user_id) DO NOTHING;

-- 2) Les démos passent en relecture
UPDATE public.commercants
   SET statut_publication = 'relecture'
 WHERE statut_publication = 'publie'
   AND lower(btrim(nom)) IN (
     'boulangerie dupuis', 'chez mathilde', 'chez momo', 'le dressing de sophie',
     'salon nathalie', 'studio amandine', 'le traiteur alexandre', 'sushi yuki', 'new signup'
   );

-- ─── Contrôle : une ligne par vérification, valeur ET attendu ───────────────
SELECT 'A. démos encore PUBLIÉES (vues de tous)' AS controle,
       count(*)::text || ' : ' || coalesce(string_agg(nom, ' · ' ORDER BY nom), 'aucune') AS valeur,
       '0' AS attendu
  FROM public.commercants
 WHERE statut_publication = 'publie'
   AND lower(btrim(nom)) IN ('boulangerie dupuis', 'chez mathilde', 'chez momo', 'le dressing de sophie',
     'salon nathalie', 'studio amandine', 'le traiteur alexandre', 'sushi yuki', 'new signup')
UNION ALL
SELECT 'B. démos en RELECTURE',
       count(*)::text || ' : ' || coalesce(string_agg(nom, ' · ' ORDER BY nom), 'aucune'),
       '6 : les 6 démos'
  FROM public.commercants WHERE statut_publication = 'relecture'
UNION ALL
SELECT 'C. comptes qui voient la relecture',
       count(*)::text || ' : ' || coalesce(string_agg(u.email, ' · ' ORDER BY u.email), 'aucun'),
       'tes comptes + le compte de démo des stores (+play), PERSONNE d''autre'
  FROM public.comptes_relecture r LEFT JOIN auth.users u ON u.id = r.user_id
UNION ALL
SELECT 'D. 🔴 le compte de démo des stores est bien dans la liste',
       CASE WHEN EXISTS (SELECT 1 FROM public.comptes_relecture r JOIN auth.users u ON u.id = r.user_id
                          WHERE lower(u.email) = 'verstappenalexandre+play@gmail.com') THEN 'oui' ELSE 'NON' END,
       'oui (sinon : me donner l''adresse exacte du compte des relecteurs)'
UNION ALL
SELECT 'E. fiches PUBLIÉES restantes (vues de tous)',
       count(*)::text || ' : ' || coalesce(string_agg(nom, ' · ' ORDER BY nom), 'aucune'),
       '0 tant que tu n''as pas publié les vrais commerces'
  FROM public.commercants WHERE statut_publication = 'publie'
UNION ALL
SELECT 'F. un visiteur sans compte ne voit pas la relecture',
       public.est_compte_relecture()::text,
       'false';
