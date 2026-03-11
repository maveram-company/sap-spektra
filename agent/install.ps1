# ============================================================
# SAP Spektra Agent — Script de Instalacion para Windows
# ============================================================
#
# Este script:
# 1. Verifica que Python 3 este instalado
# 2. Crea el directorio de instalacion
# 3. Crea un entorno virtual (venv)
# 4. Instala las dependencias
# 5. Registra el agente como servicio de Windows (NSSM)
# 6. Muestra instrucciones para configurar
#
# Uso:
#   Ejecutar PowerShell como Administrador:
#   .\install.ps1
#
# ============================================================

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$INSTALL_DIR = "$env:ProgramData\spektra-agent"
$SERVICE_NAME = "SpektraAgent"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  SAP Spektra Agent — Instalador Windows"    -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# -- Verificar Python 3 --
Write-Host "[1/5] Verificando Python 3..." -ForegroundColor Yellow
$pythonCmd = $null
foreach ($cmd in @("python", "python3")) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python 3") {
            $pythonCmd = $cmd
            Write-Host "       Encontrado: $ver"
            break
        }
    } catch { }
}

if (-not $pythonCmd) {
    Write-Host "ERROR: Python 3 no esta instalado." -ForegroundColor Red
    Write-Host "       Descargalo de https://www.python.org/downloads/"
    Write-Host "       Asegurate de marcar 'Add Python to PATH' al instalar."
    exit 1
}

# -- Crear directorio de instalacion --
Write-Host "[2/5] Instalando en $INSTALL_DIR..." -ForegroundColor Yellow
if (-not (Test-Path $INSTALL_DIR)) {
    New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
}

# Copiar archivos del agente
Copy-Item -Recurse -Force "spektra_agent" "$INSTALL_DIR\"
Copy-Item -Force "requirements.txt" "$INSTALL_DIR\"
Copy-Item -Force "config.yaml" "$INSTALL_DIR\config.yaml.example"

if (-not (Test-Path "$INSTALL_DIR\config.yaml")) {
    Copy-Item -Force "config.yaml" "$INSTALL_DIR\config.yaml"
    Write-Host "       Config de ejemplo copiada. EDITALA antes de iniciar!"
}

# -- Crear entorno virtual e instalar dependencias --
Write-Host "[3/5] Creando entorno virtual e instalando dependencias..." -ForegroundColor Yellow
& $pythonCmd -m venv "$INSTALL_DIR\venv"
& "$INSTALL_DIR\venv\Scripts\pip.exe" install --upgrade pip --quiet
& "$INSTALL_DIR\venv\Scripts\pip.exe" install -r "$INSTALL_DIR\requirements.txt" --quiet
Write-Host "       Dependencias instaladas."

# -- Crear directorios auxiliares --
Write-Host "[4/5] Creando directorios..." -ForegroundColor Yellow
$logsDir = "$INSTALL_DIR\logs"
$retryDir = "$INSTALL_DIR\retry"
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }
if (-not (Test-Path $retryDir)) { New-Item -ItemType Directory -Path $retryDir -Force | Out-Null }
Write-Host "       Directorios creados."

# -- Registrar como servicio de Windows --
Write-Host "[5/5] Registrando servicio de Windows..." -ForegroundColor Yellow

# Opcion A: Usar NSSM (Non-Sucking Service Manager) si esta disponible
$nssmPath = Get-Command nssm -ErrorAction SilentlyContinue
if ($nssmPath) {
    & nssm install $SERVICE_NAME "$INSTALL_DIR\venv\Scripts\python.exe" "-m spektra_agent.main --config `"$INSTALL_DIR\config.yaml`""
    & nssm set $SERVICE_NAME AppDirectory "$INSTALL_DIR"
    & nssm set $SERVICE_NAME DisplayName "SAP Spektra Agent"
    & nssm set $SERVICE_NAME Description "SAP Spektra Agent - Monitoreo de sistemas SAP"
    & nssm set $SERVICE_NAME Start SERVICE_AUTO_START
    & nssm set $SERVICE_NAME AppStdout "$logsDir\service-stdout.log"
    & nssm set $SERVICE_NAME AppStderr "$logsDir\service-stderr.log"
    Write-Host "       Servicio registrado con NSSM."
} else {
    # Opcion B: Crear un script .bat para ejecutar manualmente o con Task Scheduler
    $batContent = @"
@echo off
cd /d "$INSTALL_DIR"
"$INSTALL_DIR\venv\Scripts\python.exe" -m spektra_agent.main --config "$INSTALL_DIR\config.yaml"
"@
    Set-Content -Path "$INSTALL_DIR\start-agent.bat" -Value $batContent
    Write-Host "       NSSM no encontrado. Se creo start-agent.bat"
    Write-Host "       Para servicio automatico, instala NSSM: https://nssm.cc/download"
    Write-Host "       y ejecuta este instalador de nuevo."
}

# -- Resumen --
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Instalacion completada"                     -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Proximos pasos:" -ForegroundColor White
Write-Host ""
Write-Host "  1." -ForegroundColor Yellow -NoNewline
Write-Host " Editar la configuracion basica (SID, entorno, API):"
Write-Host "     notepad $INSTALL_DIR\config.yaml"
Write-Host ""
Write-Host "  2." -ForegroundColor Yellow -NoNewline
Write-Host " Configurar credenciales de forma segura (recomendado):"
Write-Host "     cd $INSTALL_DIR"
Write-Host "     .\venv\Scripts\python.exe -m spektra_agent.main --setup"
Write-Host "     -> Detecta automaticamente producto SAP y base de datos"
Write-Host "     -> Pide credenciales y valida permisos"
Write-Host "     -> Las guarda encriptadas localmente (nunca se envian al backend)"
Write-Host ""
Write-Host "  3." -ForegroundColor Yellow -NoNewline
Write-Host " Iniciar el agente:"
if ($nssmPath) {
    Write-Host "     net start $SERVICE_NAME"
} else {
    Write-Host "     .\start-agent.bat"
    Write-Host "     (o configura una Tarea Programada en Windows)"
}
Write-Host ""
Write-Host "  4." -ForegroundColor Yellow -NoNewline
Write-Host " Probar un solo ciclo:"
Write-Host "     cd $INSTALL_DIR"
Write-Host "     .\venv\Scripts\python.exe -m spektra_agent.main --once"
Write-Host ""
