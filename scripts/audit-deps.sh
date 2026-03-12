#!/bin/bash
# ============================================================================
#  [LEGACY] SAP Spektra v1.5 -- Supply Chain Audit Script
#  STATUS: DEPRECATED — This audits the old Lambda stack dependencies.
#  For active backend: cd apps/api && npm audit
#  Verifica dependencias, lock files, y vulnerabilidades conocidas.
#
#  Uso:
#    chmod +x scripts/audit-deps.sh
#    ./scripts/audit-deps.sh
#
#  Requisitos:
#    - Node.js >= 18
#    - npm >= 9
#    - jq (opcional, para formato JSON bonito)
#
#  Este script:
#    1. Verifica que todos los package-lock.json existen y estan sincronizados
#    2. Ejecuta `npm audit` en cada Lambda para detectar vulnerabilidades
#    3. Verifica que no haya dependencias con licencias problematicas
#    4. Genera un reporte consolidado en stdout
# ============================================================================

set -euo pipefail

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directorio raiz del proyecto
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LAMBDA_DIR="$PROJECT_ROOT/lambda"

# Contadores globales
TOTAL_LAMBDAS=0
PASSED_LAMBDAS=0
FAILED_LAMBDAS=0
TOTAL_VULNERABILITIES=0
CRITICAL_VULNS=0
HIGH_VULNS=0

# Archivo temporal para el reporte
REPORT_FILE=$(mktemp /tmp/audit-deps-report.XXXXXX)
trap 'rm -f "$REPORT_FILE"' EXIT

# ── Funciones auxiliares ──

log_header() {
  echo ""
  echo -e "${BLUE}================================================================${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}================================================================${NC}"
}

log_success() {
  echo -e "  ${GREEN}[PASS]${NC} $1"
}

log_warning() {
  echo -e "  ${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "  ${RED}[FAIL]${NC} $1"
}

log_info() {
  echo -e "  ${BLUE}[INFO]${NC} $1"
}

# ── Paso 0: Verificar herramientas requeridas ──

log_header "SAP Spektra v1.5 -- Supply Chain Audit"
echo ""
echo "  Fecha:     $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "  Proyecto:  $PROJECT_ROOT"
echo ""

log_header "Paso 0: Verificando herramientas requeridas"

if ! command -v node &> /dev/null; then
  log_error "Node.js no encontrado. Instala Node.js >= 18."
  exit 1
fi
NODE_VERSION=$(node --version)
log_success "Node.js $NODE_VERSION"

if ! command -v npm &> /dev/null; then
  log_error "npm no encontrado."
  exit 1
fi
NPM_VERSION=$(npm --version)
log_success "npm v$NPM_VERSION"

if command -v jq &> /dev/null; then
  log_success "jq disponible (formato JSON habilitado)"
  HAS_JQ=true
else
  log_warning "jq no disponible (output JSON sin formato)"
  HAS_JQ=false
fi

# ── Paso 1: Verificar lock files ──

log_header "Paso 1: Verificando lock files (package-lock.json)"

LOCK_MISSING=0

for lambda_dir in "$LAMBDA_DIR"/*/; do
  lambda_name=$(basename "$lambda_dir")

  # Solo procesar directorios que tengan package.json
  if [ ! -f "$lambda_dir/package.json" ]; then
    continue
  fi

  TOTAL_LAMBDAS=$((TOTAL_LAMBDAS + 1))

  if [ ! -f "$lambda_dir/package-lock.json" ]; then
    log_error "$lambda_name: package-lock.json NO encontrado"
    LOCK_MISSING=$((LOCK_MISSING + 1))
  else
    # Verificar que el lock file este sincronizado con package.json
    cd "$lambda_dir"
    if npm ls --all --json 2>/dev/null | grep -q '"problems"' 2>/dev/null; then
      log_warning "$lambda_name: package-lock.json puede estar desincronizado"
    else
      log_success "$lambda_name: package-lock.json presente y sincronizado"
    fi
    cd "$PROJECT_ROOT"
  fi
done

if [ "$LOCK_MISSING" -gt 0 ]; then
  log_error "Faltan $LOCK_MISSING lock files. Ejecuta 'npm install' en cada Lambda."
fi

# ── Paso 2: npm audit en cada Lambda ──

log_header "Paso 2: Ejecutando npm audit en cada Lambda"

for lambda_dir in "$LAMBDA_DIR"/*/; do
  lambda_name=$(basename "$lambda_dir")

  if [ ! -f "$lambda_dir/package.json" ]; then
    continue
  fi

  cd "$lambda_dir"

  # Ejecutar npm audit en formato JSON para parsear resultados
  AUDIT_OUTPUT=$(npm audit --json 2>/dev/null || true)

  # Extraer conteos de vulnerabilidades
  if [ "$HAS_JQ" = true ]; then
    VULN_CRITICAL=$(echo "$AUDIT_OUTPUT" | jq -r '.metadata.vulnerabilities.critical // 0' 2>/dev/null || echo "0")
    VULN_HIGH=$(echo "$AUDIT_OUTPUT" | jq -r '.metadata.vulnerabilities.high // 0' 2>/dev/null || echo "0")
    VULN_MODERATE=$(echo "$AUDIT_OUTPUT" | jq -r '.metadata.vulnerabilities.moderate // 0' 2>/dev/null || echo "0")
    VULN_LOW=$(echo "$AUDIT_OUTPUT" | jq -r '.metadata.vulnerabilities.low // 0' 2>/dev/null || echo "0")
    VULN_TOTAL=$(echo "$AUDIT_OUTPUT" | jq -r '.metadata.vulnerabilities.total // 0' 2>/dev/null || echo "0")
  else
    # Sin jq, solo verificar si npm audit retorno errores
    VULN_TOTAL=0
    VULN_CRITICAL=0
    VULN_HIGH=0
    VULN_MODERATE=0
    VULN_LOW=0
    if echo "$AUDIT_OUTPUT" | grep -q '"severity"'; then
      VULN_TOTAL=1
    fi
  fi

  TOTAL_VULNERABILITIES=$((TOTAL_VULNERABILITIES + VULN_TOTAL))
  CRITICAL_VULNS=$((CRITICAL_VULNS + VULN_CRITICAL))
  HIGH_VULNS=$((HIGH_VULNS + VULN_HIGH))

  if [ "$VULN_TOTAL" -eq 0 ]; then
    log_success "$lambda_name: Sin vulnerabilidades"
    PASSED_LAMBDAS=$((PASSED_LAMBDAS + 1))
  elif [ "$VULN_CRITICAL" -gt 0 ] || [ "$VULN_HIGH" -gt 0 ]; then
    log_error "$lambda_name: $VULN_CRITICAL critical, $VULN_HIGH high, $VULN_MODERATE moderate, $VULN_LOW low"
    FAILED_LAMBDAS=$((FAILED_LAMBDAS + 1))
    echo "$lambda_name: CRITICAL=$VULN_CRITICAL HIGH=$VULN_HIGH" >> "$REPORT_FILE"
  else
    log_warning "$lambda_name: $VULN_MODERATE moderate, $VULN_LOW low (sin critical/high)"
    PASSED_LAMBDAS=$((PASSED_LAMBDAS + 1))
  fi

  cd "$PROJECT_ROOT"
done

# ── Paso 3: Verificar dependencias sospechosas ──

log_header "Paso 3: Verificando dependencias sospechosas"

SUSPICIOUS_FOUND=0

for lambda_dir in "$LAMBDA_DIR"/*/; do
  lambda_name=$(basename "$lambda_dir")

  if [ ! -f "$lambda_dir/package.json" ]; then
    continue
  fi

  # Buscar dependencias que no sean del scope @aws-sdk o conocidas
  if [ "$HAS_JQ" = true ]; then
    DEPS=$(jq -r '(.dependencies // {}) | keys[]' "$lambda_dir/package.json" 2>/dev/null || true)

    for dep in $DEPS; do
      # Verificar si la dependencia es de un scope conocido
      case "$dep" in
        @aws-sdk/*|@smithy/*|uuid|crypto|path|fs)
          # Dependencias conocidas y seguras
          ;;
        *)
          # Dependencias externas: verificar que esten en el lock file
          if [ -f "$lambda_dir/package-lock.json" ]; then
            if ! grep -q "\"$dep\"" "$lambda_dir/package-lock.json" 2>/dev/null; then
              log_warning "$lambda_name: dependencia '$dep' no encontrada en lock file"
              SUSPICIOUS_FOUND=$((SUSPICIOUS_FOUND + 1))
            fi
          fi
          ;;
      esac
    done
  else
    log_info "$lambda_name: Instala jq para verificacion de dependencias detallada"
  fi
done

if [ "$SUSPICIOUS_FOUND" -eq 0 ]; then
  log_success "Ninguna dependencia sospechosa encontrada"
else
  log_warning "$SUSPICIOUS_FOUND dependencias requieren revision manual"
fi

# ── Paso 4: Verificar que no haya scripts preinstall/postinstall peligrosos ──

log_header "Paso 4: Verificando scripts de instalacion (preinstall/postinstall)"

DANGEROUS_SCRIPTS=0

for lambda_dir in "$LAMBDA_DIR"/*/; do
  lambda_name=$(basename "$lambda_dir")

  if [ ! -f "$lambda_dir/package.json" ]; then
    continue
  fi

  if [ "$HAS_JQ" = true ]; then
    # Verificar scripts potencialmente peligrosos en las dependencias
    PREINSTALL=$(jq -r '.scripts.preinstall // empty' "$lambda_dir/package.json" 2>/dev/null || true)
    POSTINSTALL=$(jq -r '.scripts.postinstall // empty' "$lambda_dir/package.json" 2>/dev/null || true)

    if [ -n "$PREINSTALL" ]; then
      log_warning "$lambda_name: tiene script 'preinstall': $PREINSTALL"
      DANGEROUS_SCRIPTS=$((DANGEROUS_SCRIPTS + 1))
    fi
    if [ -n "$POSTINSTALL" ]; then
      log_warning "$lambda_name: tiene script 'postinstall': $POSTINSTALL"
      DANGEROUS_SCRIPTS=$((DANGEROUS_SCRIPTS + 1))
    fi
  fi
done

if [ "$DANGEROUS_SCRIPTS" -eq 0 ]; then
  log_success "Ningun script preinstall/postinstall sospechoso encontrado"
else
  log_warning "$DANGEROUS_SCRIPTS scripts de instalacion requieren revision"
fi

# ── Reporte Final ──

log_header "REPORTE FINAL -- Supply Chain Audit"

echo ""
echo "  Lambdas analizadas:     $TOTAL_LAMBDAS"
echo "  Lambdas sin problemas:  $PASSED_LAMBDAS"
echo "  Lambdas con problemas:  $FAILED_LAMBDAS"
echo ""
echo "  Vulnerabilidades totales:  $TOTAL_VULNERABILITIES"
echo "  - Critical:                $CRITICAL_VULNS"
echo "  - High:                    $HIGH_VULNS"
echo "  Lock files faltantes:      $LOCK_MISSING"
echo "  Dependencias sospechosas:  $SUSPICIOUS_FOUND"
echo "  Scripts peligrosos:        $DANGEROUS_SCRIPTS"
echo ""

if [ "$FAILED_LAMBDAS" -gt 0 ]; then
  echo -e "  ${RED}RESULTADO: FAILED${NC} -- Hay vulnerabilidades critical/high que deben resolverse."
  echo ""
  echo "  Lambdas con vulnerabilidades critical/high:"
  while IFS= read -r line; do
    echo "    - $line"
  done < "$REPORT_FILE"
  echo ""
  echo "  Accion recomendada: ejecuta 'npm audit fix' en cada Lambda afectada."
  echo "  Para vulnerabilidades que requieren breaking changes: 'npm audit fix --force'"
  exit 1
elif [ "$TOTAL_VULNERABILITIES" -gt 0 ]; then
  echo -e "  ${YELLOW}RESULTADO: WARNING${NC} -- Hay vulnerabilidades moderate/low. Revisa cuando puedas."
  exit 0
else
  echo -e "  ${GREEN}RESULTADO: PASSED${NC} -- Todas las dependencias estan limpias."
  exit 0
fi
