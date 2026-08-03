-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_RLS_CRENEAUX.sql
-- Dernier trou d'écriture ouvert à tous : les créneaux de retrait.
--
-- Le relevé du 03/08 montre sur `creneaux` une policy « Gestion creneaux »,
-- ALL, {public}, USING (true) : exactement la signature du trou fermé sur
-- `articles`. Avec la seule clé anon, n'importe qui peut supprimer TOUS les
-- créneaux de retrait de TOUS les commerçants — plus personne ne peut alors
-- passer commande — ou en créer de faux à des heures de fermeture.
--
-- Les autres tables du catalogue ont été vérifiées dans le même relevé et
-- sont saines : article_variantes, article_options_groupes,
-- article_options_valeurs, article_stock_jour, article_photos,
-- commercant_photos, yoppaa_deals, actualites, livraison_config,
-- livraison_creneaux, foodtruck_emplacements portent toutes une condition
-- réelle sur le propriétaire, même quand le rôle est {public}.
--
-- La lecture publique des créneaux reste ouverte : le Yopper doit voir les
-- heures de retrait disponibles avant de commander.
--
-- Idempotente : ré-exécutable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Gestion creneaux" ON creneaux;

DROP POLICY IF EXISTS "creneaux_gestion_proprietaire" ON creneaux;
CREATE POLICY "creneaux_gestion_proprietaire"
  ON creneaux FOR ALL
  TO authenticated
  USING (
    commercant_id IN (SELECT id FROM commercants WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    commercant_id IN (SELECT id FROM commercants WHERE auth_user_id = auth.uid())
  );

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Il ne doit rester que : Admin Yoppaa FULL, la lecture publique, et la
-- nouvelle policy limitée au propriétaire.
SELECT tablename, policyname, cmd, roles::text,
       COALESCE(qual, '—') AS using_clause
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename = 'creneaux'
 ORDER BY cmd, policyname;
