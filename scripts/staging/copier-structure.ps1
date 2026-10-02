# SITE D'ESSAI : COPIER LA STRUCTURE DE LA BASE DE PRODUCTION VERS yoppaa-test
#
# À lancer PAR ALEX, dans son propre terminal (jamais par l'assistant) : le
# script demande les deux adresses de connexion, mot de passe compris, en
# saisie masquée. Rien de secret n'est écrit sur le disque ni affiché.
#
# Ce qui est copié : la STRUCTURE du schéma public (tables, vues, fonctions,
# déclencheurs, règles RLS, droits). AUCUNE ligne de donnée : la copie des six
# commerces de test est une étape à part.
#
# Pourquoi pas nos fichiers de migration : une partie des tables a été créée à
# la main dans Supabase (commercants, articles, commandes...), elles n'ont
# aucun CREATE dans `migrations/`. Seule la base sait ce qu'elle contient.
#
# Résultat dans C:\Users\HP\yoppaa-staging :
#   structure-public.sql   la structure lue en production (sans secret)
#   restauration.log       ce que la base d'essai a répondu, erreurs comprises

$ErrorActionPreference = 'Stop'
$REF_ESSAI = 'nmkvizwxoebevjxkfhkx'
$bin = 'C:\Program Files\PostgreSQL\17\bin'
$dossier = 'C:\Users\HP\yoppaa-staging'

if (-not (Test-Path "$bin\pg_dump.exe")) { throw "pg_dump introuvable dans $bin : installe d'abord PostgreSQL 17 (outils en ligne de commande)." }
New-Item -ItemType Directory -Force $dossier | Out-Null

function Lire-Secret([string]$invite) {
  $s = Read-Host $invite -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($b) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

$prod = Lire-Secret 'Adresse PRODUCTION (Connect > Session pooler, mot de passe compris)'
$essai = Lire-Secret 'Adresse ESSAI yoppaa-test (Connect > Session pooler, mot de passe compris)'

# 🔴 LE GARDE-FOU : on n'écrit QUE dans yoppaa-test, et on ne lit JAMAIS
# depuis lui en croyant lire la production. Une adresse inversée arrête tout.
if ($essai -notmatch $REF_ESSAI) { throw "L'adresse d'ESSAI ne vise pas yoppaa-test ($REF_ESSAI). Rien n'a été fait." }
if ($prod -match $REF_ESSAI) { throw "L'adresse de PRODUCTION vise le projet d'essai. Rien n'a été fait." }
if ($prod -eq $essai) { throw 'Les deux adresses sont identiques. Rien n''a été fait.' }

Write-Host '1/2 Lecture de la structure en production (lecture seule)...'
$p = Start-Process -FilePath "$bin\pg_dump.exe" -NoNewWindow -Wait -PassThru `
  -ArgumentList @($prod, '--schema-only', '--schema=public', '--no-owner', '-f', "$dossier\structure-public.sql") `
  -RedirectStandardError "$dossier\lecture.log"
if ($p.ExitCode -ne 0) { throw "La lecture a échoué (code $($p.ExitCode)). Détail dans $dossier\lecture.log" }
Write-Host "   OK : $dossier\structure-public.sql"

Write-Host '2/2 Écriture dans yoppaa-test...'
$p = Start-Process -FilePath "$bin\psql.exe" -NoNewWindow -Wait -PassThru `
  -ArgumentList @($essai, '-v', 'ON_ERROR_STOP=0', '-q', '-f', "$dossier\structure-public.sql") `
  -RedirectStandardOutput "$dossier\restauration-sortie.log" -RedirectStandardError "$dossier\restauration.log"
Write-Host "   Terminé (code $($p.ExitCode)). Réponses de la base : $dossier\restauration.log"
Write-Host 'Dis à Claude « structure faite » : il lira les deux fichiers (aucun secret dedans).'
