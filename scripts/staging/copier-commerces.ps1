# SITE D'ESSAI : RECOPIER LES COMMERCES DE TEST DE LA PRODUCTION VERS yoppaa-test
#
# À lancer PAR ALEX, dans son propre terminal (jamais par l'assistant), APRÈS
# copier-structure.ps1 et STAGING_COMPLEMENTS_ESSAI.sql. Les deux adresses de
# connexion sont demandées en saisie masquée ; rien de secret n'est écrit.
#
# 🔴 CE QUI EST COPIÉ : LA CONFIGURATION DES SIX COMMERCES CHOISIS PAR ALEX LE
# 02/10, ET RIEN D'AUTRE. Fiche, lieux, photos, catalogue, options, variantes,
# prestations, praticiens, créneaux, fermetures, livraison, deals, actualités,
# plus les deux tables de référence (communes, taux de TVA).
# JAMAIS : clients, commandes, rendez-vous, avis, bons, cartes de fidélité,
# favoris, équipe, journaux. La boutique d'essai démarre sans aucun client.
#
# 🔴 LA PRODUCTION EST LUE EN LECTURE SEULE (`default_transaction_read_only`) :
# une faute dans ce script ne peut rien y écrire.
#
# 🔴 L'ESSAI EST ÉCRIT EN UNE SEULE TRANSACTION, qui s'arrête à la première
# erreur : soit tout est copié, soit rien.
#
# Le lien vers les comptes : les comptes de connexion de la production
# n'existent pas dans l'essai. La fiche est copiée SANS compte
# (`auth_user_id` vide), et l'adresse du compte est rangée dans
# `essai.comptes_a_relier`, hors de portée de l'API. Une fois les comptes créés
# dans l'essai, un SQL les relie par l'adresse.
#
# Les photos ne sont pas copiées : leurs adresses visent le stockage PUBLIC de
# la production, qui reste lisible. Seuls les nouveaux envois iront dans le
# stockage de l'essai.
#
# Fichiers de passage dans C:\Users\HP\yoppaa-staging\commerces (données des
# commerces de test) : supprimés à la fin, sauf en cas d'échec.

$ErrorActionPreference = 'Stop'
$REF_ESSAI = 'nmkvizwxoebevjxkfhkx'
$bin = 'C:\Program Files\PostgreSQL\17\bin'
$racine = 'C:\Users\HP\yoppaa-staging'
$dossier = "$racine\commerces"
$d = $dossier -replace '\\', '/'

# Les six commerces décidés par Alex le 02/10, comparés sans casse ni espaces
# en bord. Il en faut EXACTEMENT six, sinon rien n'est copié.
$NOMS = @('boulangerie dupuis', 'chez mathilde', 'chez momo', 'le dressing de sophie', 'salon nathalie', 'studio amandine')

if (-not (Test-Path "$bin\psql.exe")) { throw "psql introuvable dans $bin." }
New-Item -ItemType Directory -Force $dossier | Out-Null

function Lire-Secret([string]$invite) {
  $s = Read-Host $invite -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($b) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

$prod = Lire-Secret 'Adresse PRODUCTION (Session pooler, mot de passe compris)'
$essai = Lire-Secret 'Adresse ESSAI yoppaa-test (Session pooler, mot de passe compris)'
if ($essai -notmatch $REF_ESSAI) { throw "L'adresse d'ESSAI ne vise pas yoppaa-test ($REF_ESSAI). Rien n'a été fait." }
if ($prod -match $REF_ESSAI) { throw "L'adresse de PRODUCTION vise le projet d'essai. Rien n'a été fait." }

$listeNoms = ($NOMS | ForEach-Object { "'" + $_ + "'" }) -join ', '
$C = "WITH c AS (SELECT id FROM public.commercants WHERE lower(btrim(nom)) IN ($listeNoms))"
$ARTICLES = "SELECT a.id FROM public.articles a WHERE a.commercant_id IN (SELECT id FROM c)"

# Ordre = parents avant enfants. [table, requête de lecture, mode d'import]
# mode 'direct' : copié tel quel ; 'commercants' et 'actualites' : retouchés
# avant insertion (voir plus bas).
$TABLES = @(
  @('communes',                   "SELECT * FROM public.communes", 'direct'),
  @('tva_taux_reference',         "SELECT * FROM public.tva_taux_reference", 'direct'),
  @('commercants',                "$C SELECT t.* FROM public.commercants t WHERE t.id IN (SELECT id FROM c)", 'commercants'),
  @('commercant_lieux',           "$C SELECT t.* FROM public.commercant_lieux t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('commercant_photos',          "$C SELECT t.* FROM public.commercant_photos t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('onboarding_commercants',     "$C SELECT t.* FROM public.onboarding_commercants t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('articles',                   "$C SELECT t.* FROM public.articles t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('rdv_prestations',            "$C SELECT t.* FROM public.rdv_prestations t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('rdv_praticiens',             "$C SELECT t.* FROM public.rdv_praticiens t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('livraison_config',           "$C SELECT t.* FROM public.livraison_config t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('livraison_creneaux',         "$C SELECT t.* FROM public.livraison_creneaux t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('fermetures_exceptionnelles', "$C SELECT t.* FROM public.fermetures_exceptionnelles t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('rdv_fermetures',             "$C SELECT t.* FROM public.rdv_fermetures t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('abonnement_formules',        "$C SELECT t.* FROM public.abonnement_formules t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('article_stock_jour',         "$C SELECT t.* FROM public.article_stock_jour t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('stock_jours',                "$C SELECT t.* FROM public.stock_jours t WHERE t.article_id IN ($ARTICLES)", 'direct'),
  @('creneaux',                   "$C SELECT t.* FROM public.creneaux t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('creneaux_blocages',          "$C SELECT t.* FROM public.creneaux_blocages t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('rdv_creneaux',               "$C SELECT t.* FROM public.rdv_creneaux t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('rdv_creneau_prestations',    "$C SELECT t.* FROM public.rdv_creneau_prestations t WHERE t.creneau_id IN (SELECT r.id FROM public.rdv_creneaux r WHERE r.commercant_id IN (SELECT id FROM c))", 'direct'),
  @('rdv_prestation_praticiens',  "$C SELECT t.* FROM public.rdv_prestation_praticiens t WHERE t.prestation_id IN (SELECT p.id FROM public.rdv_prestations p WHERE p.commercant_id IN (SELECT id FROM c))", 'direct'),
  @('article_photos',             "$C SELECT t.* FROM public.article_photos t WHERE t.article_id IN ($ARTICLES)", 'direct'),
  @('article_variantes',          "$C SELECT t.* FROM public.article_variantes t WHERE t.article_id IN ($ARTICLES)", 'direct'),
  @('article_options_groupes',    "$C SELECT t.* FROM public.article_options_groupes t WHERE t.article_id IN ($ARTICLES)", 'direct'),
  @('article_options_valeurs',    "$C SELECT t.* FROM public.article_options_valeurs t WHERE t.groupe_id IN (SELECT g.id FROM public.article_options_groupes g WHERE g.article_id IN ($ARTICLES))", 'direct'),
  @('yoppaa_deals',               "$C SELECT t.* FROM public.yoppaa_deals t WHERE t.commercant_id IN (SELECT id FROM c)", 'direct'),
  @('actualites',                 "$C SELECT t.* FROM public.actualites t WHERE t.commercant_id IN (SELECT id FROM c)", 'actualites')
)

# ─── 1. LECTURE EN PRODUCTION, EN LECTURE SEULE ────────────────────────────
$lecture = @()
$lecture += 'SET default_transaction_read_only = on;'
$lecture += '\set ON_ERROR_STOP on'
# Le garde-fou : exactement six commerces trouvés, sinon on s'arrête là.
$lecture += "SELECT count(*) = $($NOMS.Count) AS six_trouves, count(*) AS trouves FROM public.commercants WHERE lower(btrim(nom)) IN ($listeNoms) \gset"
$lecture += '\if :six_trouves'
$lecture += '\else'
$lecture += "\echo 'ARRET : il faut exactement $($NOMS.Count) commerces, trouves :' :trouves"
$lecture += "SELECT nom FROM public.commercants WHERE lower(btrim(nom)) IN ($listeNoms) ORDER BY nom;"
$lecture += "DO `$`$ BEGIN RAISE EXCEPTION 'ARRET : il faut exactement $($NOMS.Count) commerces. Rien n est copie.'; END `$`$;"
$lecture += '\endif'
foreach ($t in $TABLES) {
  $lecture += "\echo LU $($t[0])"
  $lecture += "\copy ($($t[1])) TO '$d/$($t[0]).csv' WITH (FORMAT csv, HEADER)"
}
$lecture += '\echo LU comptes_a_relier'
$lecture += "\copy ($C SELECT t.id AS commercant_id, lower(u.email) AS email FROM public.commercants t JOIN auth.users u ON u.id = t.auth_user_id WHERE t.id IN (SELECT id FROM c)) TO '$d/comptes_a_relier.csv' WITH (FORMAT csv, HEADER)"
# Sans en-tête UTF-8 : psql le lirait comme une instruction.
[IO.File]::WriteAllLines("$racine\lecture-commerces.sql", [string[]]$lecture, (New-Object Text.UTF8Encoding($false)))

Write-Host '1/2 Lecture des six commerces en production (lecture seule)...'
$p = Start-Process -FilePath "$bin\psql.exe" -NoNewWindow -Wait -PassThru `
  -ArgumentList @($prod, '-f', "$racine\lecture-commerces.sql") `
  -RedirectStandardOutput "$racine\lecture-commerces.log" -RedirectStandardError "$racine\lecture-commerces-erreurs.log"
if ($p.ExitCode -ne 0) { throw "La lecture s'est arrêtée (code $($p.ExitCode)). Rien n'a été écrit dans l'essai. Détail : $racine\lecture-commerces.log et lecture-commerces-erreurs.log" }

# ─── 2. ÉCRITURE DANS L'ESSAI, EN UNE TRANSACTION ──────────────────────────
$ecriture = @()
$ecriture += '\set ON_ERROR_STOP on'
$ecriture += 'BEGIN;'
# Une base qui a déjà des commerces : on ne double pas la copie.
$ecriture += 'SELECT NOT EXISTS (SELECT 1 FROM public.commercants) AS base_vide \gset'
$ecriture += '\if :base_vide'
$ecriture += '\else'
$ecriture += "\echo 'ARRET : l essai contient deja des commerces. Rien n a ete ecrit.'"
$ecriture += "DO `$`$ BEGIN RAISE EXCEPTION 'ARRET : l essai contient deja des commerces. Rien n a ete ecrit.'; END `$`$;"
$ecriture += '\endif'
foreach ($t in $TABLES) {
  $nom = $t[0]
  $fichier = "'$d/$nom.csv' WITH (FORMAT csv, HEADER MATCH)"
  switch ($t[2]) {
    'direct' {
      $ecriture += "\copy public.$nom FROM $fichier"
    }
    'commercants' {
      # Sans compte : ceux de la production n'existent pas ici.
      $ecriture += 'CREATE TEMP TABLE tmp_commercants (LIKE public.commercants) ON COMMIT DROP;'
      $ecriture += "\copy tmp_commercants FROM $fichier"
      $ecriture += 'UPDATE tmp_commercants SET auth_user_id = NULL, kyb_valide_par = NULL;'
      $ecriture += 'INSERT INTO public.commercants SELECT * FROM tmp_commercants;'
    }
    'actualites' {
      # Le module « services publics » est éteint et sa table n'est pas copiée.
      $ecriture += 'CREATE TEMP TABLE tmp_actualites (LIKE public.actualites) ON COMMIT DROP;'
      $ecriture += "\copy tmp_actualites FROM $fichier"
      $ecriture += 'UPDATE tmp_actualites SET service_id = NULL;'
      $ecriture += 'INSERT INTO public.actualites SELECT * FROM tmp_actualites;'
    }
  }
}
# Les compteurs de la production n'ont rien à faire dans l'essai.
$ecriture += 'UPDATE public.yoppaa_deals SET vues = 0, clics = 0, cta_clics = 0;'
# Les comptes à relier, hors de portée de l'API (schéma non exposé, fermé à
# anon et authenticated).
$ecriture += 'CREATE SCHEMA IF NOT EXISTS essai;'
$ecriture += 'REVOKE ALL ON SCHEMA essai FROM PUBLIC, anon, authenticated;'
$ecriture += 'CREATE TABLE IF NOT EXISTS essai.comptes_a_relier (commercant_id uuid PRIMARY KEY REFERENCES public.commercants(id) ON DELETE CASCADE, email text NOT NULL);'
$ecriture += 'REVOKE ALL ON essai.comptes_a_relier FROM PUBLIC, anon, authenticated;'
$ecriture += "\copy essai.comptes_a_relier FROM '$d/comptes_a_relier.csv' WITH (FORMAT csv, HEADER MATCH)"
$ecriture += 'COMMIT;'
# Le relevé : combien de lignes par table, des chiffres seulement.
$comptes = ($TABLES | ForEach-Object { "SELECT '$($_[0])' AS table_copiee, count(*)::text AS lignes FROM public.$($_[0])" }) -join ' UNION ALL '
$ecriture += "$comptes UNION ALL SELECT 'comptes a relier (adresses distinctes)', count(DISTINCT email)::text FROM essai.comptes_a_relier;"
[IO.File]::WriteAllLines("$racine\ecriture-commerces.sql", [string[]]$ecriture, (New-Object Text.UTF8Encoding($false)))

Write-Host '2/2 Écriture dans yoppaa-test (une seule transaction)...'
$p = Start-Process -FilePath "$bin\psql.exe" -NoNewWindow -Wait -PassThru `
  -ArgumentList @($essai, '-f', "$racine\ecriture-commerces.sql") `
  -RedirectStandardOutput "$racine\ecriture-commerces.log" -RedirectStandardError "$racine\ecriture-commerces-erreurs.log"
if ($p.ExitCode -ne 0) { throw "L'écriture s'est arrêtée (code $($p.ExitCode)) : RIEN n'a été copié (transaction annulée). Détail : $racine\ecriture-commerces-erreurs.log" }

Remove-Item -Recurse -Force $dossier
Write-Host '   Terminé. Les fichiers de passage sont supprimés.'
Write-Host 'Dis à Claude « commerces copiés » : il lira le relevé (des chiffres seulement).'
