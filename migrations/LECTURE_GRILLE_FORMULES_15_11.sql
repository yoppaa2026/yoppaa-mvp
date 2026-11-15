-- ═══════════════════════════════════════════════════════════════════════════
-- LECTURE SEULE · 15/11 · audit « nouvelle grille : Exister gratuit, Vendre 45 € »
-- À coller UNE fois dans l'éditeur SQL de la PROD. Rien n'est écrit.
-- Un seul résultat : bloc | ordre | cle | valeur | attendu.
-- Aucune donnée personnelle : les commerces sont désignés par un préfixe d'id.
--
-- A = commerçants par formule (alias hérités traduits : on → exister, full → vendre)
-- B = essais et dates de première facture
-- C = détail anonymisé, un commerce par ligne
-- D = IA depuis le 1er octobre (volume, jetons, par modèle, par surface, par formule)
-- Z = contrôles (valeur ET attendu)
-- ═══════════════════════════════════════════════════════════════════════════
WITH c AS (
  SELECT
    id,
    CASE lower(coalesce(plan, 'exister'))
      WHEN 'on'   THEN 'exister'
      WHEN 'full' THEN 'vendre'
      ELSE lower(coalesce(plan, 'exister'))
    END                                              AS forfait,
    essai_plan,
    created_at,
    subscription_status,
    subscription_trial_end,
    coalesce(billing_exempt, false)                  AS exempt,
    stripe_subscription_id IS NOT NULL               AS a_abonnement,
    statut,
    statut_publication,
    categorie,
    -- même règle que lib/lancement.js finEssai : inscription + 100 jours,
    -- jamais avant le 9 janvier 2027 (instant de la première facture)
    greatest(created_at + interval '100 days',
             timestamptz '2027-01-09 00:00:00+01')   AS premiere_facture_calculee
  FROM commercants
),
ia AS (
  SELECT g.*, c.forfait
  FROM ia_generations g
  LEFT JOIN c ON c.id = g.commercant_id
  WHERE g.created_at >= timestamptz '2026-10-01 00:00:00+02'
),
lignes AS (
  -- A · par formule
  SELECT 'A' AS bloc, 1 AS ordre, 'commerces · ' || forfait || CASE WHEN exempt THEN ' (gratuit à vie, démo/partenaire)' ELSE '' END AS cle,
         count(*)::text AS valeur, '' AS attendu
  FROM c GROUP BY forfait, exempt
  UNION ALL
  SELECT 'A', 2, 'statut Stripe · ' || forfait || ' · ' || coalesce(subscription_status, '(aucun)'),
         count(*)::text, ''
  FROM c WHERE NOT exempt GROUP BY forfait, subscription_status
  UNION ALL
  SELECT 'A', 3, 'abonnement Stripe présent · ' || forfait, count(*)::text, ''
  FROM c WHERE a_abonnement AND NOT exempt GROUP BY forfait
  UNION ALL
  SELECT 'A', 4, 'publiés · ' || forfait, count(*)::text, ''
  FROM c WHERE statut_publication = 'publie' AND NOT exempt GROUP BY forfait

  -- B · essais
  UNION ALL
  SELECT 'B', 1, 'essai demandé · formule choisie ' || forfait || ' → essai ' || essai_plan,
         count(*)::text, ''
  FROM c WHERE essai_plan IS NOT NULL AND NOT exempt GROUP BY forfait, essai_plan
  UNION ALL
  SELECT 'B', 2, 'première facture calculée · ' || to_char(premiere_facture_calculee AT TIME ZONE 'Europe/Brussels', 'YYYY-MM'),
         count(*)::text, ''
  FROM c WHERE NOT exempt GROUP BY 3
  UNION ALL
  SELECT 'B', 3, 'inscrits après le 1er octobre (leur essai finit APRÈS le 8 janvier)',
         count(*)::text, ''
  FROM c WHERE NOT exempt AND created_at > timestamptz '2026-10-01 00:00:00+02'

  -- C · détail anonymisé
  UNION ALL
  SELECT 'C', 1,
         'C-' || left(id::text, 6) || ' · ' || forfait || ' · ' || coalesce(categorie, '?') || ' · ' || coalesce(statut_publication, '?'),
         'inscrit ' || to_char(created_at AT TIME ZONE 'Europe/Brussels', 'DD/MM/YY')
           || ' · essai ' || coalesce(essai_plan, '-')
           || ' · Stripe ' || coalesce(subscription_status, '-')
           || ' · fin Stripe ' || coalesce(to_char(subscription_trial_end AT TIME ZONE 'Europe/Brussels', 'DD/MM/YY'), '-')
           || ' · 1re facture calculée ' || to_char(premiere_facture_calculee AT TIME ZONE 'Europe/Brussels', 'DD/MM/YY'),
         ''
  FROM c WHERE NOT exempt

  -- D · IA depuis le 1er octobre
  UNION ALL
  SELECT 'D', 1, 'générations · total', count(*)::text, '' FROM ia
  UNION ALL
  SELECT 'D', 2, 'générations · modèle ' || coalesce(modele, '?'),
         count(*)::text || ' gén. · ' || count(DISTINCT commercant_id)::text || ' commerces · jetons moyens entrée '
           || coalesce(round(avg(tokens_in))::text, '0') || ' / sortie ' || coalesce(round(avg(tokens_out))::text, '0')
           || ' · total entrée ' || coalesce(sum(tokens_in)::text, '0') || ' / sortie ' || coalesce(sum(tokens_out)::text, '0'),
         ''
  FROM ia GROUP BY modele
  UNION ALL
  SELECT 'D', 3, 'générations · surface ' || coalesce(type, '?') || ' · ' || coalesce(modele, '?'),
         count(*)::text, ''
  FROM ia GROUP BY type, modele
  UNION ALL
  SELECT 'D', 4, 'générations · formule ' || coalesce(forfait, '(commerce supprimé)'),
         count(*)::text || ' gén. · ' || count(DISTINCT commercant_id)::text || ' commerces', ''
  FROM ia GROUP BY forfait
  UNION ALL
  SELECT 'D', 5, 'générations · mois ' || to_char(created_at AT TIME ZONE 'Europe/Brussels', 'YYYY-MM'),
         count(*)::text, ''
  FROM ia GROUP BY 3
  UNION ALL
  SELECT 'D', 6, 'générations · le commerce le plus actif sur un mois',
         coalesce(max(n)::text, '0'), ''
  FROM (SELECT commercant_id, date_trunc('month', created_at) m, count(*) n FROM ia GROUP BY 1, 2) x

  -- Z · contrôles
  UNION ALL
  SELECT 'Z', 1, 'total des commerces = somme du bloc A1',
         (SELECT count(*) FROM c)::text, '= somme des lignes A1'
  UNION ALL
  SELECT 'Z', 2, 'valeurs de plan inconnues (ni exister, ni communiquer, ni vendre)',
         (SELECT count(*) FROM c WHERE forfait NOT IN ('exister', 'communiquer', 'vendre'))::text, '0'
  UNION ALL
  SELECT 'Z', 3, 'formule payante SANS abonnement Stripe (hors gratuit à vie)',
         (SELECT count(*) FROM c WHERE forfait <> 'exister' AND NOT a_abonnement AND NOT exempt)::text, 'pour information'
)
SELECT bloc, ordre, cle, valeur, attendu
FROM lignes
ORDER BY bloc, ordre, cle;
