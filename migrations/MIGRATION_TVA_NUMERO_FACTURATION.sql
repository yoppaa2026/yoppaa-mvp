-- ═══════════════════════════════════════════════════════════════════════════
-- LE NUMÉRO DE TVA DU COMMERÇANT, POUR SES FACTURES YOPPAA
-- 22/09/2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- POURQUOI. Yoppaa facture ses abonnements et sa boutique à des entreprises
-- belges. Depuis le 01/01/2026, la facturation entre entreprises belges passe
-- par Peppol, et c'est BILLIT qui émet et envoie (décision d'Alex, 10/09 :
-- « Stripe encaisse, Billit facture »). Yoppaa doit donc lui fournir des
-- coordonnées exactes, dont le numéro de TVA.
--
-- 🔴 IL EST SAISI PAR LE COMMERÇANT, PAS DÉDUIT (décision d'Alex, 22/09). Le
-- déduire du numéro d'entreprise aurait évité cette colonne, puisqu'en Belgique
-- les deux numéros sont les mêmes chiffres. Mais c'est une mention légale sur
-- un document comptable : celui qui la porte doit l'avoir confirmée lui-même,
-- et les cas d'unité TVA existent.
--
-- ⚠️ ÊTRE ASSUJETTI EST UNE AUTRE QUESTION, ET ELLE A DÉJÀ SA COLONNE.
-- `commercants.tva_assujetti` existe depuis MIGRATION_TVA_EXPORT.sql, avec la
-- bonne sémantique : « false pour un commerce en franchise de TVA ». On ne la
-- recrée pas. Un commerce en franchise garde donc `tva_numero` à NULL, et
-- c'est un état normal, pas un dossier incomplet.
--
-- ⚠️ CETTE COLONNE N'A RIEN À FAIRE DANS LA VUE PUBLIQUE. Le numéro de TVA
-- d'un commerçant n'est pas un secret, mais `commercants_public` sert les
-- fiches à `anon` : tout ce qu'on y ajoute est servi au monde entier, et une
-- colonne de facturation n'a aucune raison d'y être. Le contrôle plus bas le
-- vérifie, plutôt que de le supposer.
--
-- AUCUNE DONNÉE PERSONNELLE N'EST LUE PAR CETTE MIGRATION : elle ajoute une
-- colonne vide et compte des lignes, sans jamais en afficher le contenu.

-- ═══════════════════════════════════════════════════════════════════════════
-- LE DDL, EN UN SEUL BLOC
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.commercants
  ADD COLUMN IF NOT EXISTS tva_numero text;

COMMENT ON COLUMN public.commercants.tva_numero IS
  'Numéro de TVA saisi par le commerçant, forme compacte BE + 10 chiffres. NULL tant qu''il ne l''a pas renseigné, et NULL légitimement pour un commerce en franchise (voir tva_assujetti). Sert aux factures Yoppaa émises par Billit via Peppol.';

-- 🔴 LA CONTRAINTE REFUSE CE QUI NE PARTIRA JAMAIS. Un numéro mal formé n'est
-- pas un détail d'affichage : Billit le transmet tel quel, et la facture est
-- rejetée par le réseau, après coup, sans que le commerçant en sache rien.
-- Autant refuser à l'écriture, où l'on peut encore le lui dire.
--
-- ⚠️ `NOT VALID` PUIS `VALIDATE` : la première pose la règle pour les écritures
-- à venir sans verrouiller la table, la seconde vérifie l'existant. Comme la
-- colonne vient d'être créée, tout est NULL et la validation est immédiate ;
-- l'ordre reste correct le jour où on rejouerait ce fichier sur une base déjà
-- remplie.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.commercants'::regclass
       AND conname  = 'commercants_tva_numero_format'
  ) THEN
    ALTER TABLE public.commercants
      ADD CONSTRAINT commercants_tva_numero_format
      CHECK (tva_numero IS NULL OR tva_numero ~ '^BE[0-9]{10}$') NOT VALID;
    ALTER TABLE public.commercants VALIDATE CONSTRAINT commercants_tva_numero_format;
  END IF;
END $$;

-- ⚠️ LE GRANT EST EXPLICITE, MÊME SUR UNE COLONNE AJOUTÉE. Une colonne hérite
-- des droits posés AU NIVEAU TABLE, mais pas des droits posés colonne par
-- colonne : si quelqu'un a un jour restreint `commercants` de cette façon, la
-- nouvelle colonne naîtrait invisible, et le commerçant lirait un champ vide
-- sans la moindre erreur. On l'écrit, on ne le suppose pas.
GRANT SELECT (tva_numero), UPDATE (tva_numero) ON public.commercants TO authenticated;

-- ⚠️ ET RIEN POUR `anon`. C'est une donnée de facturation : elle se lit
-- connecté, sur son propre dossier, jamais depuis une fiche publique.

-- ═══════════════════════════════════════════════════════════════════════════
-- LE CONTRÔLE : UNE LIGNE PAR VÉRIFICATION, LA VALEUR ET L'ATTENDU
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ TOUT EN `text`, ET UNE SEULE REQUÊTE. L'éditeur SQL de Supabase n'affiche
-- que le résultat du DERNIER ordre : des contrôles séparés ne se verraient pas,
-- et des types mélangés dans un UNION font échouer la requête entière.

SELECT 'la colonne tva_numero existe'::text AS controle,
       COALESCE((SELECT data_type::text FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name = 'tva_numero'), 'ABSENTE')::text AS valeur,
       'text'::text AS attendu

UNION ALL
SELECT 'elle accepte le vide (pas de NOT NULL)'::text,
       COALESCE((SELECT is_nullable::text FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name = 'tva_numero'), 'ABSENTE')::text,
       'YES'::text

UNION ALL
SELECT 'la contrainte de format existe'::text,
       COALESCE((SELECT conname::text FROM pg_constraint
                  WHERE conrelid = 'public.commercants'::regclass
                    AND conname = 'commercants_tva_numero_format'), 'ABSENTE')::text,
       'commercants_tva_numero_format'::text

UNION ALL
SELECT 'et elle est VALIDÉE sur l''existant'::text,
       COALESCE((SELECT convalidated::text FROM pg_constraint
                  WHERE conrelid = 'public.commercants'::regclass
                    AND conname = 'commercants_tva_numero_format'), 'ABSENTE')::text,
       'true'::text

UNION ALL
SELECT 'la colonne porte son commentaire'::text,
       COALESCE((SELECT CASE WHEN length(col_description('public.commercants'::regclass, a.attnum)) > 40
                             THEN 'présent' ELSE 'trop court ou absent' END
                   FROM pg_attribute a
                  WHERE a.attrelid = 'public.commercants'::regclass
                    AND a.attname = 'tva_numero'), 'ABSENTE')::text,
       'présent'::text

UNION ALL
SELECT 'authenticated peut la LIRE'::text,
       (SELECT CASE WHEN count(*) > 0 THEN 'oui' ELSE 'NON' END
          FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'commercants'
           AND column_name = 'tva_numero' AND grantee = 'authenticated'
           AND privilege_type = 'SELECT')::text,
       'oui'::text

UNION ALL
SELECT 'authenticated peut l''ÉCRIRE'::text,
       (SELECT CASE WHEN count(*) > 0 THEN 'oui' ELSE 'NON' END
          FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'commercants'
           AND column_name = 'tva_numero' AND grantee = 'authenticated'
           AND privilege_type = 'UPDATE')::text,
       'oui'::text

UNION ALL
SELECT '🔴 anon ne peut PAS la lire'::text,
       (SELECT CASE WHEN count(*) = 0 THEN 'aucun droit' ELSE 'DROIT ACCORDÉ' END
          FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'commercants'
           AND column_name = 'tva_numero' AND grantee = 'anon')::text,
       'aucun droit'::text

UNION ALL
SELECT '🔴 la vue publique ne l''expose pas'::text,
       (SELECT CASE WHEN count(*) = 0 THEN 'absente de la vue' ELSE 'EXPOSÉE' END
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants_public'
           AND column_name = 'tva_numero')::text,
       'absente de la vue'::text

UNION ALL
SELECT 'la colonne tva_assujetti existe déjà (non recréée)'::text,
       COALESCE((SELECT data_type::text FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name = 'tva_assujetti'), 'ABSENTE')::text,
       'boolean'::text

UNION ALL
SELECT 'aucun numéro ne viole le format'::text,
       (SELECT count(*)::text FROM public.commercants
         WHERE tva_numero IS NOT NULL AND tva_numero !~ '^BE[0-9]{10}$')::text,
       '0'::text

UNION ALL
SELECT 'combien de commerçants ont déjà renseigné leur TVA'::text,
       (SELECT count(*)::text FROM public.commercants WHERE tva_numero IS NOT NULL)::text,
       '0 juste après la migration'::text

UNION ALL
SELECT 'combien devront le faire (assujettis, sans numéro)'::text,
       (SELECT count(*)::text FROM public.commercants
         WHERE tva_assujetti IS NOT FALSE AND tva_numero IS NULL)::text,
       'le nombre de commerçants assujettis'::text;
