-- ════════════════════════════════════════════════════════════════════════════
-- La zone de livraison en étoile : 12 distances autour du commerce
-- Chantier zone, 05/10 (décisions d'Alex du 25/09 et du 05/10)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Une colonne sur `livraison_config` : 12 distances en mètres, la première vers
-- le nord, puis tous les 30° dans le sens des aiguilles d'une montre. Le centre
-- est la position de la fiche (`commercants.latitude/longitude`).
--
-- ⚠️ NULL = PAS D'ÉTOILE : le commerce garde sa liste de codes postaux, comme
-- avant. Un commerce qui dessine son étoile n'est plus jugé QUE par elle
-- (décision d'Alex, 05/10) : deux règles à la fois feraient refuser par l'une
-- un client accepté par l'autre.
--
-- ⚠️ LA CONTRAINTE REPREND EXACTEMENT `zoneValide` (lib/zone-etoile.js) :
-- 12 valeurs, aucune vide, chacune entre 300 m et 30 km. Le commerçant écrit
-- cette table depuis son navigateur (policy « Commercant gere sa config
-- livraison ») : c'est la base qui garantit la forme, pas l'écran.
--
-- Lisible par tous comme le reste de `livraison_config` (une zone n'est pas une
-- donnée personnelle). GRANT : aucun objet créé, les droits de la table valent.
-- Date : 2026-10-05
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.livraison_config
  ADD COLUMN IF NOT EXISTS zone_rayons_m integer[];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.livraison_config'::regclass
                    AND conname = 'livraison_config_zone_rayons_check') THEN
    ALTER TABLE public.livraison_config
      ADD CONSTRAINT livraison_config_zone_rayons_check CHECK (
        zone_rayons_m IS NULL OR (
          cardinality(zone_rayons_m) = 12
          AND array_ndims(zone_rayons_m) = 1
          AND array_position(zone_rayons_m, NULL) IS NULL
          AND 300 <= ALL (zone_rayons_m)
          AND 30000 >= ALL (zone_rayons_m)
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.livraison_config.zone_rayons_m IS
  'Zone de livraison en étoile : 12 distances en mètres depuis la position du commerce, nord d''abord, tous les 30° dans le sens horaire. NULL = pas d''étoile, les codes postaux décident.';

-- ─── Contrôle : une ligne par vérification, valeur ET attendu ───────────────
SELECT * FROM (
  SELECT 1 AS n, 'colonne zone_rayons_m' AS controle,
         (SELECT data_type FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'livraison_config'
             AND column_name = 'zone_rayons_m')::text AS valeur,
         'ARRAY' AS attendu
  UNION ALL SELECT 2, 'contrainte de forme presente',
         (SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.livraison_config'::regclass
             AND conname = 'livraison_config_zone_rayons_check')::text,
         'livraison_config_zone_rayons_check'
  UNION ALL SELECT 3, 'la contrainte en base porte les 4 regles',
         (SELECT CASE WHEN def LIKE '%cardinality(zone_rayons_m) = 12%'
                       AND def LIKE '%array_position(zone_rayons_m, NULL%'
                       AND def LIKE '%300 <= ALL (zone_rayons_m)%'
                       AND def LIKE '%30000 >= ALL (zone_rayons_m)%'
                      THEN 'oui' ELSE 'NON : ' || def END
            FROM (SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
                   WHERE conrelid = 'public.livraison_config'::regclass
                     AND conname = 'livraison_config_zone_rayons_check') d)::text,
         'oui'
  UNION ALL SELECT 4, 'etoiles deja dessinees (pour information)',
         (SELECT count(*) FROM public.livraison_config WHERE zone_rayons_m IS NOT NULL)::text,
         '0'
  UNION ALL SELECT 5, 'policies de livraison_config (nom:commande:type)',
         (SELECT string_agg(policyname || ':' || cmd || ':' || permissive, ', ' ORDER BY policyname)
            FROM pg_policies WHERE schemaname = 'public' AND tablename = 'livraison_config')::text,
         'pour information : lecture publique + gestion par le commercant + admin'
) t ORDER BY n;
