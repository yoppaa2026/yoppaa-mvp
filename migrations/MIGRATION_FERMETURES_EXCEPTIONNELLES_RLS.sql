-- LES FERMETURES EXCEPTIONNELLES S'ÉCRIVENT ET SE LISENT DE NOUVEAU,
-- ET L'ADMIN LIT TOUT CE QU'UNE FICHE PORTE (29/09/2026)
--
-- ═══ 1) LES FERMETURES EXCEPTIONNELLES ══════════════════════════════════════
--
-- DIAGNOSTIC_FERMETURES_EXCEPTIONNELLES.sql a rendu :
--   A1 RLS active = true, A2 policies permissives = 0, A3 lignes = 0.
-- Sous RLS, sans AUCUNE policy permissive, personne ne lit ni n'écrit depuis
-- le navigateur. Le commerçant qui cliquait « Ajouter une fermeture » (onglet
-- Créneaux) recevait une erreur ; la fiche publique ne pouvait afficher
-- aucune fermeture. Seul le serveur de commande (clé de service) lisait la
-- table, et il la trouvait vide. Trouvé en cherchant pourquoi l'admin ne voit
-- pas les photos d'une fiche non publiée.
--
-- ⚠️ LA TABLE EST VIDE : rien de visible ne change tant qu'aucun commerçant
-- n'ajoute de fermeture. Sans risque pour l'examen Play.
--
-- Trois règles, sur le modèle exact de `creneaux_blocages`, sa voisine :
-- le commerçant gère les siennes ; tout le monde lit celles d'un commerce
-- lisible (`commerce_lisible` : publié, le sien, ou l'admin — vérifié en base
-- par B1 du diagnostic) ; l'admin gère tout. La RESTRICTIVE
-- `zz_commerce_ouvert` reste : un compte non validé ne touche toujours à rien.
--
-- ═══ 2) L'ADMIN LIT LES RÉGLAGES D'UNE FICHE NON PUBLIÉE ═══════════════════
--
-- Alex, 29/09 : « tu peux me donner l'accès au reste depuis admin ». Quatre
-- tables restaient aveugles en mode admin sur une fiche non publiée : la
-- livraison désactivée, ses créneaux, les fermetures de l'agenda, les
-- formules d'abonnement pas en vente.
--
-- ⚠️ EN LECTURE SEULE, ET C'EST VOULU. Relire une fiche avant de la publier
-- demande de VOIR ; modifier les réglages d'un commerçant depuis sa session
-- est une autre décision, qui ne se prend pas en passant.
--
-- Idempotent. Une seule transaction.

BEGIN;

DROP POLICY IF EXISTS fermetures_exceptionnelles_proprietaire ON public.fermetures_exceptionnelles;
CREATE POLICY fermetures_exceptionnelles_proprietaire ON public.fermetures_exceptionnelles
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (commercant_id IN (SELECT c.id FROM public.commercants c WHERE c.auth_user_id = auth.uid()))
  WITH CHECK (commercant_id IN (SELECT c.id FROM public.commercants c WHERE c.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS fermetures_exceptionnelles_lecture_publique ON public.fermetures_exceptionnelles;
CREATE POLICY fermetures_exceptionnelles_lecture_publique ON public.fermetures_exceptionnelles
  AS PERMISSIVE
  FOR SELECT TO anon, authenticated
  USING (public.commerce_lisible(commercant_id));

DROP POLICY IF EXISTS "Admin Yoppaa FULL" ON public.fermetures_exceptionnelles;
CREATE POLICY "Admin Yoppaa FULL" ON public.fermetures_exceptionnelles
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.is_yoppaa_admin())
  WITH CHECK (public.is_yoppaa_admin());

GRANT SELECT ON public.fermetures_exceptionnelles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fermetures_exceptionnelles TO authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['livraison_config', 'livraison_creneaux', 'rdv_fermetures', 'abonnement_formules'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admin Yoppaa lecture" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Admin Yoppaa lecture" ON public.%I AS PERMISSIVE FOR SELECT TO authenticated USING (public.is_yoppaa_admin())', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
SELECT 'A1' AS n, 'fermetures : policies permissives' AS controle,
       (SELECT count(*)::text FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles' AND permissive = 'PERMISSIVE') AS valeur,
       '3' AS attendu
UNION ALL
SELECT 'A2', 'fermetures : le commercant gere les siennes',
       coalesce((SELECT permissive || ' / ' || cmd || ' / '
                        || CASE WHEN qual LIKE '%auth.uid()%' AND with_check LIKE '%auth.uid()%' THEN 'oui' ELSE 'NON' END
                   FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles'
                    AND policyname = 'fermetures_exceptionnelles_proprietaire'), 'ABSENTE'),
       'PERMISSIVE / ALL / oui'
UNION ALL
SELECT 'A3', 'fermetures : lecture par commerce_lisible',
       coalesce((SELECT permissive || ' / ' || cmd || ' / ' || array_to_string(roles, ',') || ' / '
                        || CASE WHEN qual LIKE '%commerce_lisible(commercant_id)%' THEN 'oui' ELSE 'NON' END
                   FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles'
                    AND policyname = 'fermetures_exceptionnelles_lecture_publique'), 'ABSENTE'),
       'PERMISSIVE / SELECT / anon,authenticated / oui'
UNION ALL
SELECT 'A4', 'fermetures : l admin gere tout',
       coalesce((SELECT permissive || ' / ' || cmd || ' / '
                        || CASE WHEN qual LIKE '%is_yoppaa_admin()%' THEN 'oui' ELSE 'NON' END
                   FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles'
                    AND policyname = 'Admin Yoppaa FULL'), 'ABSENTE'),
       'PERMISSIVE / ALL / oui'
UNION ALL
SELECT 'A5', 'fermetures : le verrou des comptes non valides reste en place',
       coalesce((SELECT permissive || ' / ' || cmd FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles'
                    AND policyname = 'zz_commerce_ouvert'), 'ABSENTE'),
       'RESTRICTIVE / ALL'
UNION ALL
SELECT 'A6', 'fermetures : authenticated lit et ecrit',
       (has_table_privilege('authenticated', 'public.fermetures_exceptionnelles', 'SELECT')
        AND has_table_privilege('authenticated', 'public.fermetures_exceptionnelles', 'INSERT')
        AND has_table_privilege('authenticated', 'public.fermetures_exceptionnelles', 'DELETE'))::text,
       'true'
UNION ALL
SELECT 'B' || row_number() OVER (ORDER BY t.nom),
       'admin lit ' || t.nom,
       coalesce((SELECT permissive || ' / ' || cmd || ' / '
                        || CASE WHEN qual LIKE '%is_yoppaa_admin()%' THEN 'oui' ELSE 'NON' END
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = t.nom AND policyname = 'Admin Yoppaa lecture'), 'ABSENTE'),
       'PERMISSIVE / SELECT / oui'
  FROM (VALUES ('abonnement_formules'), ('livraison_config'), ('livraison_creneaux'), ('rdv_fermetures')) AS t(nom)
ORDER BY 1;
