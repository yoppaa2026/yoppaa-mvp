-- ════════════════════════════════════════════════════════════════════════════
-- LE SCHÉMA RÉEL, POUR QUE L'AUDIT CESSE DE DEVINER
--
-- 🔴 D'OÙ ÇA VIENT (27/08). Le mail « ton colis est prêt » ne partait pas :
-- `commandes.client_prenom` n'existe pas, la colonne avait été recopiée depuis
-- un select de `rdv_reservations`, qui l'a. Toute la requête échouait, et la
-- route annonçait « Commande introuvable » sur une commande bien présente.
--
-- ⚠️ ET LE MÊME DÉFAUT AVAIT DÉJÀ ÉTÉ TROUVÉ LE 28/07 sur le récapitulatif du
-- matin. Corrigé DANS CETTE ROUTE-LÀ, avec un commentaire de six lignes. Cinq
-- autres routes le portaient encore un mois plus tard.
--
-- `scripts/audit-colonnes-select.mjs` confronte désormais tous les `select` du
-- dépôt au schéma. Mais il reconstruit ce schéma DEPUIS LES MIGRATIONS, et
-- vingt-quatre tables n'y ont pas de `CREATE TABLE` — elles sont antérieures au
-- dossier `migrations/`. Parmi elles : `commandes`, `commercants`, `articles`,
-- `clients`.
--
-- ⚠️ AUTREMENT DIT, EN L'ÉTAT, L'AUDIT N'AURAIT PAS ATTRAPÉ LE DÉFAUT DE CE
-- SOIR. Il faut le dire, et le réparer : c'est exactement le genre d'outil
-- rassurant qui ne protège rien.
--
-- CETTE REQUÊTE REND LE SCHÉMA RÉEL, une ligne par table. Le résultat se colle
-- dans `scripts/schema-supabase.txt`, et l'audit s'appuiera dessus au lieu de
-- deviner.
--
-- ⚠️ ELLE NE LIT AUCUNE DONNÉE. `information_schema.columns` ne contient que
-- des NOMS de tables et de colonnes : ni un email, ni un numéro, ni un montant.
-- C'est la seule raison pour laquelle elle peut être lancée sans précaution.
--
-- Date : 2026-08-27
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. LE SCHÉMA COMPLET, UNE LIGNE PAR TABLE ──────────────────────────────
-- Format : « table: col1,col2,col3 ». À recopier tel quel.
SELECT
  c.table_name || ': ' || string_agg(c.column_name, ',' ORDER BY c.column_name) AS schema
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND t.table_type IN ('BASE TABLE', 'VIEW')
GROUP BY c.table_name
ORDER BY c.table_name;

-- ─── 2. LES TROIS COLONNES QUE L'AUDIT NE SAIT PAS TRANCHER ─────────────────
-- Attendu : trois lignes à `true`. Une seule à `false` est un défaut à corriger
-- tout de suite, et le code qui la lit tombe en silence.
--
-- ⚠️ `rdv_reservations.annulation_token` porte le lien « annuler mon
-- rendez-vous » des emails : sans elle, aucun client ne peut annuler seul.
SELECT
  'rdv_reservations.annulation_token' AS colonne,
  EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rdv_reservations'
      AND column_name = 'annulation_token') AS existe
UNION ALL
SELECT
  'pre_inscriptions.slug_kit',
  EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pre_inscriptions'
      AND column_name = 'slug_kit')
UNION ALL
SELECT
  'rdv_fidelite_progression.nb_rdv_total',
  EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rdv_fidelite_progression'
      AND column_name = 'nb_rdv_total');
