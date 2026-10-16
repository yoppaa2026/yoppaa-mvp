-- ═══════════════════════════════════════════════════════════════════════════
-- FERMER LES COMMANDES OU LES RENDEZ-VOUS SANS FERMER LE COMMERCE (16/10 soir)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ✅ ALEX, 16/10 soir (tableau) : « dans la liste unique ». Une fermeture dit
-- ce qu'elle ferme : tout le commerce, seulement les commandes en ligne, ou
-- seulement les rendez-vous (les tables pour un restaurant). Cas d'origine :
-- Aux Délices des 7 Abbayes publient leur fiche un vendredi soir et ne
-- prennent les commandes qu'à partir du lundi, boutique ouverte.
--
-- CE QUE FAIT CE SQL :
--   1. `fermetures_exceptionnelles` gagne `portee` : 'tout' (le sens
--      d'aujourd'hui, valeur par défaut), 'commandes' ou 'rdv'.
--   2. Seule une fermeture COMPLÈTE a une portée : des horaires adaptés
--      changent les heures de tout le commerce.
--
-- ⚠️ SANS DANGER POUR LE CODE EN LIGNE : toutes les lignes existantes valent
-- 'tout', et le code actuel ne lit pas la colonne.
--
-- Lancer TOUT le fichier en un seul coller. La dernière requête rend une ligne
-- par contrôle : valeur ET attendu.

ALTER TABLE public.fermetures_exceptionnelles ADD COLUMN IF NOT EXISTS portee text NOT NULL DEFAULT 'tout';

ALTER TABLE public.fermetures_exceptionnelles DROP CONSTRAINT IF EXISTS fermetures_exceptionnelles_portee_valide;
ALTER TABLE public.fermetures_exceptionnelles ADD CONSTRAINT fermetures_exceptionnelles_portee_valide CHECK (
  portee IN ('tout', 'commandes', 'rdv')
);
ALTER TABLE public.fermetures_exceptionnelles DROP CONSTRAINT IF EXISTS fermetures_exceptionnelles_portee_fermeture;
ALTER TABLE public.fermetures_exceptionnelles ADD CONSTRAINT fermetures_exceptionnelles_portee_fermeture CHECK (
  portee = 'tout' OR plage1_debut IS NULL
);

-- Droits explicites (inchangés : le propriétaire écrit, le public lit).
GRANT SELECT ON public.fermetures_exceptionnelles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fermetures_exceptionnelles TO authenticated;

-- ─── CONTRÔLES : une ligne par contrôle, valeur ET attendu ──────────────────
SELECT * FROM (
  SELECT 1 AS n, 'la colonne portee existe, en text, obligatoire, « tout » par défaut' AS controle,
    (SELECT data_type || ' · ' || is_nullable || ' · ' || coalesce(column_default, 'aucun') FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fermetures_exceptionnelles' AND column_name = 'portee') AS valeur,
    'text · NO · ''tout''::text' AS attendu
  UNION ALL
  SELECT 2, 'les deux contraintes posées',
    (SELECT count(*)::text FROM pg_constraint
      WHERE conname IN ('fermetures_exceptionnelles_portee_valide', 'fermetures_exceptionnelles_portee_fermeture')),
    '2'
  UNION ALL
  SELECT 3, 'lignes existantes qui valent « tout »',
    (SELECT count(*)::text || ' sur ' || (SELECT count(*) FROM public.fermetures_exceptionnelles)::text
       FROM public.fermetures_exceptionnelles WHERE portee = 'tout'),
    'toutes'
  UNION ALL
  SELECT 4, 'anon lit la portée (fiche publique)',
    has_column_privilege('anon', 'public.fermetures_exceptionnelles', 'portee', 'SELECT')::text,
    'true'
  UNION ALL
  SELECT 5, 'authenticated écrit la portée (tableau de bord)',
    (has_column_privilege('authenticated', 'public.fermetures_exceptionnelles', 'portee', 'INSERT')
     AND has_column_privilege('authenticated', 'public.fermetures_exceptionnelles', 'portee', 'UPDATE'))::text,
    'true'
  UNION ALL
  SELECT 6, 'policies de la liste unique toujours en place, avec leur type',
    (SELECT string_agg(policyname || ' = ' || permissive, ' · ' ORDER BY policyname) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles'
        AND policyname IN ('fermetures_exceptionnelles_proprietaire', 'fermetures_exceptionnelles_lecture_publique', 'Admin Yoppaa FULL')),
    'Admin Yoppaa FULL = PERMISSIVE · fermetures_exceptionnelles_lecture_publique = PERMISSIVE · fermetures_exceptionnelles_proprietaire = PERMISSIVE'
  UNION ALL
  SELECT 7, 'la base refuse une portée inconnue',
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'fermetures_exceptionnelles_portee_valide'),
    'CHECK ((portee = ANY (ARRAY[''tout''::text, ''commandes''::text, ''rdv''::text])))'
  UNION ALL
  SELECT 8, 'la base refuse une portée sur des horaires adaptés',
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'fermetures_exceptionnelles_portee_fermeture'),
    'CHECK (((portee = ''tout''::text) OR (plage1_debut IS NULL)))'
) c ORDER BY n;
