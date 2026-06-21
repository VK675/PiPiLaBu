# ============================================================
#  fix-electron.ps1
#  Repara a instalacao do binario do Electron quando o download
#  automatico falha (tipico em redes escolares/corporativas).
#
#  Estrategia:
#   1. Procura um ZIP valido ja em cache (Cache do Electron / TEMP / pasta atual)
#   2. Se nao encontrar, tenta descarregar de mirrors
#   3. Extrai o ZIP COMPLETO para node_modules\electron\dist
#   4. Escreve o path.txt correto -> "electron.exe"
#
#  Correr:  powershell -ExecutionPolicy Bypass -File fix-electron.ps1
# ============================================================

$ErrorActionPreference = 'Stop'

$projectDir  = $PSScriptRoot
if (-not $projectDir) { $projectDir = (Get-Location).Path }
$electronDir = Join-Path $projectDir "node_modules\electron"
$distTarget  = Join-Path $electronDir "dist"

# Le a versao exata a partir do node_modules\electron\package.json
$version = "42.3.3"
$pkgPath = Join-Path $electronDir "package.json"
if (Test-Path $pkgPath) {
    try { $version = (Get-Content $pkgPath -Raw | ConvertFrom-Json).version } catch {}
}
$zipName = "electron-v$version-win32-x64.zip"
Write-Host ">> Electron alvo: v$version"

if (-not (Test-Path $electronDir)) {
    Write-Host "ERRO: node_modules\electron nao existe. Corre primeiro: npm install"
    exit 1
}

# ── 1. Procurar um ZIP valido ja existente ──────────────────
function Test-ValidZip($path) {
    if (-not $path -or -not (Test-Path $path)) { return $false }
    # Um ZIP real do Electron tem ~100-150 MB; paginas de erro tem alguns KB
    return ((Get-Item $path).Length -gt 50MB)
}

$candidates = @()
$cacheRoot = Join-Path $env:LOCALAPPDATA "electron\Cache"
if (Test-Path $cacheRoot) {
    $candidates += Get-ChildItem -Recurse -File -Filter $zipName $cacheRoot -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
}
$candidates += (Join-Path $env:TEMP $zipName)
$candidates += (Join-Path $projectDir $zipName)

$zipPath = $null
foreach ($c in $candidates) {
    if (Test-ValidZip $c) { $zipPath = $c; Write-Host ">> ZIP valido encontrado em cache: $c"; break }
}

# ── 2. Descarregar se nao houver cache valido ───────────────
if (-not $zipPath) {
    Write-Host ">> Sem ZIP em cache. A tentar descarregar..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $dest = Join-Path $env:TEMP $zipName
    $urls = @(
        "https://npmmirror.com/mirrors/electron/v$version/$zipName",
        "https://github.com/electron/electron/releases/download/v$version/$zipName",
        "https://registry.npmmirror.com/-/binary/electron/v$version/$zipName"
    )
    foreach ($url in $urls) {
        Write-Host "   Tentando: $url"
        try {
            (New-Object System.Net.WebClient).DownloadFile($url, $dest)
            if (Test-ValidZip $dest) { $zipPath = $dest; Write-Host "   Download OK!"; break }
            else { Write-Host "   Ficheiro invalido (provavel pagina de erro), a ignorar." }
        } catch { Write-Host "   Falhou: $($_.Exception.Message)" }
    }
}

if (-not $zipPath) {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "Nao foi possivel obter o Electron."
    Write-Host "Descarrega manualmente este ficheiro:"
    Write-Host "   https://github.com/electron/electron/releases/download/v$version/$zipName"
    Write-Host "Guarda-o em:  $env:TEMP\$zipName"
    Write-Host "e corre este script outra vez."
    Write-Host "========================================"
    exit 1
}

# ── 3. Extrair o ZIP COMPLETO para dist ─────────────────────
Write-Host ">> A limpar dist antiga..."
if (Test-Path $distTarget) { Remove-Item -Recurse -Force $distTarget }
New-Item -ItemType Directory -Force -Path $distTarget | Out-Null

Write-Host ">> A extrair $zipName (pode demorar)..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $distTarget)

$exe = Join-Path $distTarget "electron.exe"
if (-not (Test-Path $exe)) {
    Write-Host "ERRO: electron.exe nao encontrado apos extracao."
    exit 1
}

# ── 4. Escrever path.txt correto ────────────────────────────
[System.IO.File]::WriteAllText((Join-Path $electronDir "path.txt"), "electron.exe")

Write-Host ""
Write-Host "========================================"
Write-Host "Concluido! Electron v$version reparado."
Write-Host "Corre agora:  npm start"
Write-Host "========================================"
