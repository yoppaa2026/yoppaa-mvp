-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_RLS_FUITE_COMMANDES_PAYEES.sql
-- 🚨 URGENT : ferme une fuite de données personnelles.
--
-- CONSTAT (audit du 03/08/2026). La vue `commandes_payees` était lisible par
-- le rôle anon, c'est-à-dire par quiconque dispose de la clé publique. Or
-- cette clé est publique par construction : elle est embarquée dans le
-- JavaScript envoyé à chaque navigateur.
--
-- Cette vue expose client_nom, client_email, client_telephone, le montant de
-- chaque commande et les identifiants Stripe. Autrement dit, la totalité du
-- fichier clients avec les coordonnées, téléchargeable par une simple requête
-- HTTP. Vérifié en conditions réelles : 42 lignes lues avec la clé publique.
--
-- Au regard du RGPD, il s'agit d'une violation de données au sens de
-- l'article 4.12 : accès non autorisé à des données à caractère personnel.
--
-- AUCUN CODE N'UTILISE CETTE VUE. Recherche exhaustive sur app/ et lib/ :
-- zéro occurrence. C'est un vestige d'une version antérieure, resté ouvert.
-- Sa fermeture ne casse donc rien.
--
-- Le choix est de RÉVOQUER plutôt que de supprimer : la révocation est
-- immédiate, réversible, et ne détruit aucun objet au cas où une requête
-- d'administration s'y appuierait. Le rôle service_role, utilisé uniquement
-- côté serveur, conserve son accès.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON commandes_payees FROM anon;
REVOKE ALL ON commandes_payees FROM authenticated;

-- Ceinture et bretelles : les vues héritent des droits par défaut accordés au
-- schéma. On neutralise aussi l'octroi automatique pour les objets à venir.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- ⚠️ La ligne ci-dessus ne s'applique qu'aux objets CRÉÉS PLUS TARD par le
-- rôle qui exécute cette migration. Elle ne retire aucun droit existant : les
-- tables déjà ouvertes volontairement (articles, commercants_public, etc.)
-- continuent de fonctionner. C'est justement le but : que la prochaine vue
-- créée ne soit pas publique par accident.

-- ─── Vérification ──────────────────────────────────────────────────────────
-- Doit ne renvoyer AUCUNE ligne pour anon sur commandes_payees.
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name = 'commandes_payees'
   AND grantee IN ('anon', 'authenticated');
