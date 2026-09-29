-- DIAGNOSTIC : CE QUE L'ADMIN VOIT D'UNE FICHE PAS ENCORE PUBLIÉE (29/09/2026)
--
-- MIGRATION_ADMIN_PHOTOS.sql a listé 40 tables sans policy citant
-- `is_yoppaa_admin()`. Mais `commercants` y figure, alors que le mode admin la
-- lit : d'autres formes d'accès admin existent. Avant d'écrire quoi que ce
-- soit, on LIT les policies des 12 tables qui servent à relire une fiche.
--
-- ⚠️ UNE POLICY RESTRICTIVE PEUT BLOQUER L'ADMIN MÊME SI ON LUI AJOUTE UNE
-- PERMISSIVE : sans son texte, une migration pourrait ne rien corriger.
--
-- LECTURE SEULE. Uniquement le catalogue des policies : aucune ligne de
-- donnée, aucune donnée personnelle.

SELECT tablename || ' · ' || policyname AS controle,
       permissive || ' / ' || cmd || ' / ' || array_to_string(roles, ',')
         || ' / USING: ' || coalesce(left(qual, 400), '-')
         || ' / CHECK: ' || coalesce(left(with_check, 200), '-') AS valeur,
       'pour information' AS attendu
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN (
     'article_photos', 'article_variantes', 'article_options_groupes', 'article_options_valeurs',
     'commercant_lieux', 'fermetures_exceptionnelles', 'rdv_fermetures', 'creneaux_blocages',
     'livraison_config', 'livraison_creneaux', 'abonnement_formules', 'commercants'
   )
ORDER BY tablename, permissive, policyname;
