# Applique la v4 du boss rush Sans à TON projet GameMaker existant (VraisFanGames).
# - sauvegarde d'abord scr_game.gml, datafiles\ et VraisFanGames.yyp
# - remplace scripts\scr_game\scr_game.gml et les fichiers de datafiles\
# - ajoute les nouveaux fichiers aux « Included Files » du .yyp
# Utilisation : mets ce script à côté de VraisFanGames-v4.zip, ferme GameMaker,
# puis clic droit > « Exécuter avec PowerShell ».
$ErrorActionPreference = "Stop"

# 1. Trouver le projet
$cands = @(
  (Join-Path $env:USERPROFILE "OneDrive\Documents\GameMaker-Projets\VraisFanGames"),
  (Join-Path ([Environment]::GetFolderPath("MyDocuments")) "GameMaker-Projets\VraisFanGames"),
  (Join-Path $env:USERPROFILE "Documents\GameMaker-Projets\VraisFanGames")
)
$proj = $cands | Where-Object { Test-Path (Join-Path $_ "VraisFanGames.yyp") } | Select-Object -First 1
if (-not $proj) { $proj = Read-Host "Chemin du dossier VraisFanGames (celui qui contient VraisFanGames.yyp)" }
$yypPath = Join-Path $proj "VraisFanGames.yyp"
if (-not (Test-Path $yypPath)) { throw "VraisFanGames.yyp introuvable dans $proj" }
if (Get-Process -Name "GameMaker*" -ErrorAction SilentlyContinue) { throw "Ferme GameMaker avant de lancer ce script." }
Write-Host "Projet : $proj"

# 2. Récupérer la v4 (zip à côté du script, sinon GitHub)
$zip = Join-Path $PSScriptRoot "VraisFanGames-v4.zip"
if (-not (Test-Path $zip)) {
  $zip = Join-Path $env:TEMP "boss-rush-v4.zip"
  Write-Host "Téléchargement depuis GitHub..."
  Invoke-WebRequest "https://github.com/coucoussss/Game-/archive/refs/heads/claude/undertale-boss-rush-repo-xmbjhs.zip" -OutFile $zip
}
$tmp = Join-Path $env:TEMP ("boss-rush-" + [guid]::NewGuid())
Expand-Archive $zip $tmp
$src = (Get-ChildItem $tmp -Recurse -Filter "VraisFanGames.yyp" | Select-Object -First 1).DirectoryName
if (-not $src) { throw "Archive invalide : VraisFanGames.yyp introuvable." }

# 3. Sauvegarde
$bak = Join-Path (Split-Path $proj -Parent) ("sauvegarde-avant-v4-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $bak | Out-Null
Copy-Item (Join-Path $proj "scripts\scr_game\scr_game.gml") $bak -ErrorAction SilentlyContinue
Copy-Item $yypPath $bak
if (Test-Path (Join-Path $proj "datafiles")) { Copy-Item (Join-Path $proj "datafiles") (Join-Path $bak "datafiles") -Recurse }
Write-Host "Sauvegarde : $bak"

# 4. Copie du moteur et des données
New-Item -ItemType Directory -Force -Path (Join-Path $proj "scripts\scr_game") | Out-Null
Copy-Item (Join-Path $src "scripts\scr_game\scr_game.gml") (Join-Path $proj "scripts\scr_game\scr_game.gml") -Force
$added = @()
Get-ChildItem (Join-Path $src "datafiles") -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring((Join-Path $src "datafiles").Length + 1)
  $dst = Join-Path (Join-Path $proj "datafiles") $rel
  New-Item -ItemType Directory -Force -Path (Split-Path $dst -Parent) | Out-Null
  Copy-Item $_.FullName $dst -Force
  $folder = "datafiles" + $(if ((Split-Path $rel -Parent) -ne "") { "/" + ((Split-Path $rel -Parent) -replace '\\', '/') } else { "" })
  $added += ,@($_.Name, $folder)
}

# 5. Ajout des nouveaux fichiers inclus dans le .yyp
$yyp = Get-Content $yypPath -Raw -Encoding UTF8
$ins = ""
foreach ($a in $added) {
  $name = $a[0]; $folder = $a[1]
  if ($yyp -notmatch ('"name":"' + [regex]::Escape($name) + '","resourceType":"GMIncludedFile"')) {
    $ins += "`n    {`"`$GMIncludedFile`":`"`",`"%Name`":`"$name`",`"CopyToMask`":-1,`"filePath`":`"$folder`",`"name`":`"$name`",`"resourceType`":`"GMIncludedFile`",`"resourceVersion`":`"2.0`",},"
  }
}
if ($ins -ne "") {
  $k = $yyp.IndexOf('"IncludedFiles":[')
  if ($k -lt 0) { throw "Section IncludedFiles introuvable dans le .yyp (rien n'a été modifié dans le .yyp)." }
  $k += '"IncludedFiles":['.Length
  $yyp = $yyp.Substring(0, $k) + $ins + $yyp.Substring($k)
  [IO.File]::WriteAllText($yypPath, $yyp, (New-Object Text.UTF8Encoding($false)))
}
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "Terminé. Fichiers copiés : $($added.Count). Ouvre VraisFanGames.yyp et appuie sur F5."
Write-Host "Pour revenir en arrière : recopie le contenu de $bak dans $proj."
