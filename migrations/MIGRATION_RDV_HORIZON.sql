-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_RDV_HORIZON.sql
-- Jusqu'a quand on peut prendre rendez-vous.
--
-- CONTEXTE (Alex, 07/09). L'agenda de rendez-vous s'arrete a SOIXANTE JOURS,
-- ecrits en dur a trois endroits de la fiche. Personne ne l'a jamais choisi.
--
-- 🔴 ET CA BLOQUE DEJA LES ABONNEMENTS. Un carnet de dix seances a raison d'une
-- par semaine couvre SOIXANTE-DIX jours : l'abonne ne peut donc pas poser ses
-- deux dernieres seances, alors qu'il les a payees. Un studio de yoga, de
-- pilates ou de danse planifie son trimestre, parfois son annee.
--
-- ⚠️ ET LE DEFAUT NE BOUGE PAS. 60 jours restent 60 jours pour tout le parc :
-- un boulanger ou un coiffeur n'a aucune raison d'ouvrir son agenda sur un an,
-- et un horizon long a un cout reel (voir plus bas). C'est un reglage qu'on
-- OUVRE, pas une valeur qu'on change sous les pieds de tout le monde.
--
-- ⚠️ CE QUE COUTE UN HORIZON LONG, ET IL FAUT LE SAVOIR AVANT DE LE POUSSER :
-- la fiche charge TOUTES les reservations de la periode en une fois, pour
-- colorer les jours du mini-calendrier. Sur un studio a dix cours par jour et
-- douze places, une annee represente des dizaines de milliers de lignes qui
-- descendent dans le navigateur du visiteur. 180 jours est un maximum
-- raisonnable tant que ce chargement n'est pas decoupe par mois.
--
-- ⚠️ ETAPE 1 SEULEMENT. La colonne, et rien d'autre. La fiche publique ne lit
-- jamais `commercants` en direct : elle lit la vue `commercants_public`, dont
-- la definition ENREGISTREE DANS LE DEPOT EST PERIMEE (constat du 11/08, la
-- vue a ete recreee en base sans que le fichier suive). On ne reecrit pas une
-- vue de production sur une definition qu'on ne connait pas : le controle
-- ci-dessous la RELIT, et l'etape 2 s'ecrira dessus.
--
-- ⚠️ D'ici la, la fiche lira `undefined` et se repliera sur 60 jours. C'est
-- volontaire et c'est ecrit dans le code : le reglage se verra dans le tableau
-- de bord du commercant, il ne s'appliquera cote client qu'a l'etape 2.
--
-- Idempotente : re-executable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS rdv_horizon_jours int NOT NULL DEFAULT 60;

COMMENT ON COLUMN commercants.rdv_horizon_jours IS
  'Jusqu''a combien de jours a l''avance un client peut prendre rendez-vous. 60 par defaut. Un studio qui vend des carnets ou des abonnements a besoin de bien plus : dix seances hebdomadaires couvrent 70 jours.';

-- ⚠️ DES BORNES, PARCE QUE LES DEUX EXTREMES CASSENT QUELQUE CHOSE. En dessous
-- de sept jours, un client qui regarde le week-end prochain ne voit plus rien.
-- Au-dela d'un an, le chargement decrit plus haut devient intenable, et une
-- reservation posee a dix-huit mois ne sera pas honoree.
ALTER TABLE commercants DROP CONSTRAINT IF EXISTS commercants_rdv_horizon_check;
ALTER TABLE commercants
  ADD CONSTRAINT commercants_rdv_horizon_check
  CHECK (rdv_horizon_jours BETWEEN 7 AND 365);

-- La colonne herite des droits de la table, on le rend EXPLICITE : le jour ou
-- des droits par colonne apparaitraient, l'oubli serait MUET et tout le parc
-- se replierait sur 60 jours sans une seule erreur.
GRANT SELECT (rdv_horizon_jours) ON commercants TO anon, authenticated;
GRANT UPDATE (rdv_horizon_jours) ON commercants TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- CONTROLE — une ligne par verification, la valeur ET l'attendu, tout en text
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '1. colonne rdv_horizon_jours'::text AS controle,
       coalesce((SELECT data_type FROM information_schema.columns
                  WHERE table_name = 'commercants' AND column_name = 'rdv_horizon_jours'), 'ABSENTE')::text AS valeur,
       'integer'::text AS attendu
UNION ALL
SELECT '2. defaut inchange pour tout le parc'::text,
       coalesce((SELECT column_default FROM information_schema.columns
                  WHERE table_name = 'commercants' AND column_name = 'rdv_horizon_jours'), 'ABSENT')::text,
       '60'::text
UNION ALL
SELECT '3. bornes 7 a 365'::text,
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conname = 'commercants_rdv_horizon_check') THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
SELECT '4. anon et authenticated lisent la colonne'::text,
       (SELECT count(DISTINCT grantee)::text FROM information_schema.column_privileges
         WHERE table_name = 'commercants' AND column_name = 'rdv_horizon_jours'
           AND privilege_type = 'SELECT' AND grantee IN ('anon', 'authenticated')),
       '2'::text
UNION ALL
SELECT '5. le commercant peut la regler'::text,
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_name = 'commercants' AND column_name = 'rdv_horizon_jours'
           AND privilege_type = 'UPDATE' AND grantee = 'authenticated'),
       '1'::text
UNION ALL
SELECT '6. tous les commerces sont a 60'::text,
       (SELECT count(*)::text FROM commercants WHERE rdv_horizon_jours <> 60),
       '0'::text
UNION ALL
-- 🔴 CE QUE JE DOIS LIRE POUR ECRIRE L'ETAPE 2. La vue publique est recreee en
-- ENUMERANT ses colonnes : `CREATE OR REPLACE VIEW` n'autorise que l'AJOUT en
-- fin de liste, sans changer ni l'ordre ni les types. Il me faut donc la liste
-- vivante, dans l'ordre vivant.
SELECT '7. colonnes de commercants_public, DANS L ORDRE'::text,
       coalesce((SELECT string_agg(column_name, ',' ORDER BY ordinal_position)
                   FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants_public'), 'VUE ABSENTE')::text,
       'a recopier telle quelle'::text
UNION ALL
-- ⚠️ ET SON FILTRE. Le depot dit `statut_publication = 'publie'`, mais le
-- depot dit aussi 52 colonnes alors qu'il y en a plus : je ne suppose pas.
SELECT '8. le filtre de la vue'::text,
       coalesce(substring(pg_get_viewdef('commercants_public'::regclass, true) from 'WHERE[\s\S]*'), 'AUCUN FILTRE')::text,
       'a recopier tel quel'::text;
