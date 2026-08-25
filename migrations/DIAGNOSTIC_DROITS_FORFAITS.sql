-- ════════════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC — CE À QUOI CHAQUE COMMERÇANT A DROIT, ET CE QU'IL A VRAIMENT
--
-- LECTURE SEULE. Aucune ligne modifiée, aucun objet créé. À passer dans le
-- SQL Editor de Supabase, bloc par bloc.
--
-- ⚠️ Les blocs 3 et 4 COMPTENT des lignes dans des tables à données
-- personnelles (fidelite_cartes, rdv_reservations) : ils rendent des NOMBRES,
-- jamais un numéro ni un nom de client.
--
-- La matrice de référence est `lib/plans.js` (PLAN_FEATURES). Ce diagnostic ne
-- la recopie pas : il cherche les endroits où la BASE contredit la matrice.
--
-- Date : 2026-08-25
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1) QUI EST SUR QUOI ────────────────────────────────────────────────────
-- Attendu : uniquement exister / communiquer / vendre.
-- ⚠️ Toute autre valeur (on, full, publique, NULL, 'bientot') fait retomber
-- canDo() sur FALSE pour TOUT : le commerçant perd silencieusement ses droits.

SELECT
  coalesce(plan, '∅ NULL')                   AS forfait,
  coalesce(categorie, '∅ NULL')              AS categorie,
  coalesce(statut, '∅')                      AS statut,
  count(*)                                   AS combien
FROM commercants
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;


-- ─── 2) 🔴 CE QUI EST PAYANT ET QUI NE PAIE PAS ─────────────────────────────
-- Un forfait payant sans abonnement Stripe et sans exemption, c'est soit un
-- cadeau qu'on ne s'est pas rappelé avoir fait, soit un forfait que quelqu'un
-- s'est attribué lui-même (voir la note de sécurité en fin de fichier).
--
-- ⚠️ Pendant l'offre de lancement, un abonnement en essai est NORMAL : la
-- colonne subscription_status vaut alors 'trialing'. C'est l'ABSENCE totale
-- d'abonnement qui doit être expliquée, ligne par ligne.

SELECT
  nom, slug, plan, categorie,
  statut, statut_publication,
  coalesce(subscription_status, '∅ AUCUN ABONNEMENT') AS abonnement,
  billing_exempt,
  plan_actif_depuis,
  created_at
FROM commercants
WHERE plan IN ('communiquer', 'vendre', 'full')
  AND coalesce(billing_exempt, false) = false
  AND stripe_subscription_id IS NULL
ORDER BY created_at;


-- ─── 3) LES RÉGLAGES QUI CONTREDISENT LE FORFAIT ────────────────────────────
-- Un réglage resté à `true` après un passage au forfait inférieur ne se voit
-- nulle part : l'écran du commerçant masque l'onglet, donc il ne peut même
-- plus l'éteindre. La donnée, elle, reste allumée.

SELECT
  nom, slug, plan, categorie,
  rdv_actif, livraison_actif, fidelite_actif, bons_cadeaux_actif,
  accepte_paiement_cash, stripe_account_charges_enabled
FROM commercants
WHERE
  -- Le transactionnel n'appartient qu'à Vendre.
  (plan <> 'vendre' AND (
        coalesce(rdv_actif, false)
     OR coalesce(livraison_actif, false)
     OR coalesce(bons_cadeaux_actif, false)
     OR coalesce(accepte_paiement_cash, false)
     OR coalesce(stripe_account_charges_enabled, false)))
  -- La fidélité commence à Communiquer.
  OR (plan = 'exister' AND coalesce(fidelite_actif, false))
  -- Le rendez-vous ne vaut que pour un service, la livraison que pour
  -- l'alimentaire : le forfait ne suffit pas, la catégorie compte aussi.
  OR (coalesce(rdv_actif, false)       AND categorie <> 'vitrine')
  OR (coalesce(livraison_actif, false) AND categorie <> 'alimentaire')
ORDER BY plan, nom;


-- ─── 4) LES DONNÉES DÉJÀ CRÉÉES SOUS UN FORFAIT QUI NE LES PERMET PAS ───────
-- Le réglage du bloc 3 est un interrupteur, ceci est du CONTENU. C'est ce qui
-- décide de ce qu'on fait le jour d'un passage au forfait inférieur : on ne
-- jette pas les cartes de fidélité des clients d'un commerçant.

SELECT
  c.nom, c.slug, c.plan, c.categorie,
  (SELECT count(*) FROM yoppaa_deals d WHERE d.commercant_id = c.id)                          AS deals,
  (SELECT count(*) FROM actualites   a WHERE a.commercant_id = c.id)                          AS actus,
  (SELECT count(*) FROM articles     ar WHERE ar.commercant_id = c.id)                        AS articles,
  (SELECT count(*) FROM rdv_prestations p WHERE p.commercant_id = c.id)                       AS prestations,
  (SELECT count(*) FROM fidelite_cartes f WHERE f.commercant_id = c.id)                       AS cartes_fidelite,
  (SELECT count(*) FROM rdv_reservations r WHERE r.commercant_id = c.id)                      AS rdv_pris
FROM commercants c
WHERE c.plan <> 'vendre'
ORDER BY c.plan, c.nom;


-- ─── 5) LE DROIT D'ÉCRITURE SUR LE FORFAIT LUI-MÊME ─────────────────────────
-- 🔴 CE QUI A MOTIVÉ CE DIAGNOSTIC.
--
-- `commercants.plan` décide de TOUT : c'est l'entrée de canDo(). Or la RLS
-- travaille à la LIGNE et pas à la colonne, et le déclencheur
-- `commercants_colonnes_reservees` protège statut, statut_publication,
-- kyb_statut et les colonnes de facturation — mais PAS `plan`.
--
-- Conséquence : depuis la console de son navigateur, un commerçant en Exister
-- peut s'attribuer Vendre. Aucun contrôle serveur ne le rattrape, puisqu'ils
-- lisent tous cette même colonne.
--
-- Ces deux relevés montrent l'état des lieux AVANT correction.

SELECT policyname, cmd, permissive, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'commercants'
ORDER BY cmd, policyname;

SELECT tgname AS declencheur, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname = 'commercants' AND NOT t.tgisinternal
ORDER BY 1;
