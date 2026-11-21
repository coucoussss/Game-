# Installe le boss rush Sans (v4) comme NOUVEAU projet GameMaker, sans toucher à VraisFanGames.
# Utilisation : clic droit sur ce fichier > « Exécuter avec PowerShell »,
# ou dans PowerShell :  powershell -ExecutionPolicy Bypass -File installer.ps1
$ErrorActionPreference = "Stop"
$base = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "GameMaker-Projets"
if (-not (Test-Path $base)) { $base = Join-Path $env:USERPROFILE "OneDrive\Documents\GameMaker-Projets" }
if (-not (Test-Path $base)) { New-Item -ItemType Directory -Path $base | Out-Null }
$dest = Join-Path $base "VraisFanGames-v4"
$zip  = Join-Path $env:TEMP "boss-rush-v4.zip"

# Source : la branche GitHub (dépôt coucoussss/Game-), ou un zip déjà téléchargé à côté de ce script
$local = Join-Path $PSScriptRoot "VraisFanGames-v4.zip"
if (Test-Path $local) { Copy-Item $local $zip -Force }
else {
  Write-Host "Téléchargement depuis GitHub..."
  Invoke-WebRequest "https://github.com/coucoussss/Game-/archive/refs/heads/claude/undertale-boss-rush-repo-xmbjhs.zip" -OutFile $zip
}

if (Test-Path $dest) {
  $old = "$dest-ancien-" + (Get-Date -Format "yyyyMMdd-HHmmss")
  Write-Host "Un dossier VraisFanGames-v4 existe déjà : il est renommé en $old"
  Rename-Item $dest $old
}
$tmp = Join-Path $env:TEMP ("boss-rush-" + [guid]::NewGuid())
Expand-Archive $zip $tmp
$yyp = Get-ChildItem $tmp -Recurse -Filter "VraisFanGames.yyp" | Select-Object -First 1
if (-not $yyp) { throw "VraisFanGames.yyp introuvable dans l'archive." }
Move-Item $yyp.DirectoryName $dest
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "Installé dans : $dest"
Write-Host "Ouverture du projet dans GameMaker..."
Start-Process (Join-Path $dest "VraisFanGames.yyp")
