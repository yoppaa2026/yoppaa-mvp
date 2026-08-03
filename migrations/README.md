# Migrations SQL

**Ces fichiers sont la seule trace du schéma de la base.** Supabase n'est
versionné nulle part ailleurs : le jour où il faut recréer la base, ou
comprendre pourquoi une colonne existe, ça se lit ici. On n'en supprime aucun.

## Comment ça marche

Chaque fichier se passe **à la main** dans l'éditeur SQL de Supabase, jamais
par un script. Claude Code fournit le SQL et attend le go, il n'exécute rien
et ne code aucun repli au cas où la migration n'aurait pas été passée : un
repli masquerait justement l'erreur qu'on veut voir.

Chaque migration est **idempotente** (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`,
blocs `DO $$`) et se termine par une **requête de vérification** dont le
résultat se relit à l'œil.

Toute migration qui crée une table porte ses `GRANT` explicites : sans eux,
la table est invisible en clé publique et les lectures échouent en silence.

## Ordre

Les fichiers ne sont pas numérotés : ils ont été passés au fil de l'eau et
sont datés par l'historique git. `git log --follow migrations/LE_FICHIER.sql`
donne le jour et le contexte.

## Le cas particulier

`DIAGNOSTIC_RLS_TABLES.sql` ne modifie rien : c'est la sonde d'audit des
policies, à relancer quand un doute apparaît sur les permissions.
