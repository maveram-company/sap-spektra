#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  SAP Spektra v1.4 — Script de Despliegue
#
#  Este script empaqueta las 20 Lambdas, las sube a S3,
#  y despliega el stack de CloudFormation.
#
#  Uso:
#    ./scripts/deploy.sh                    # Despliegue completo
#    ./scripts/deploy.sh --package-only     # Solo empaquetar
#    ./scripts/deploy.sh --update-lambdas   # Solo actualizar código Lambda
#    ./scripts/deploy.sh --delete           # Eliminar el stack
#
#  Requisitos:
#    - AWS CLI v2 configurado
#    - Permisos para CloudFormation, S3, Lambda, IAM, etc.
#    - Node.js 20+ (para instalar dependencias)
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuración ───
STACK_NAME="${STACK_NAME:-sap-alwaysops-v14}"
S3_BUCKET="${S3_BUCKET:-}"
S3_PREFIX="${S3_PREFIX:-sap-alwaysops/v1.4/}"
AWS_REGION="${AWS_REGION:-us-east-1}"
CFN_TEMPLATE="cfn/sap-alwaysops-v1.4.yaml"

# Directorio del proyecto (un nivel arriba de scripts/)
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${PROJECT_DIR}/.build"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # Sin color

# ─── Funciones auxiliares ───

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# ─── Validar prerequisitos ───
check_prerequisites() {
  log_info "Verificando prerequisitos..."

  if ! command -v aws &> /dev/null; then
    log_error "AWS CLI no encontrado. Instalar: https://aws.amazon.com/cli/"
    exit 1
  fi

  if ! command -v node &> /dev/null; then
    log_error "Node.js no encontrado. Instalar: https://nodejs.org/"
    exit 1
  fi

  if [ -z "$S3_BUCKET" ]; then
    log_error "S3_BUCKET no configurado. Ejecutar: export S3_BUCKET=mi-bucket-deploy"
    exit 1
  fi

  # Verificar que el bucket existe
  if ! aws s3 ls "s3://${S3_BUCKET}" --region "${AWS_REGION}" &> /dev/null; then
    log_error "Bucket S3 '${S3_BUCKET}' no encontrado o sin acceso"
    exit 1
  fi

  # Verificar template CloudFormation
  if [ ! -f "${PROJECT_DIR}/${CFN_TEMPLATE}" ]; then
    log_error "Template CloudFormation no encontrado: ${CFN_TEMPLATE}"
    exit 1
  fi

  log_success "Prerequisitos verificados"
}

# ─── Empaquetar Lambdas ───
package_lambdas() {
  log_info "Empaquetando 20 Lambdas..."

  # Limpiar y crear directorio de build
  rm -rf "${BUILD_DIR}"
  mkdir -p "${BUILD_DIR}"

  # Lista de todas las Lambdas
  LAMBDAS=(
    "universal-collector"
    "ha-monitor"
    "runbook-engine"
    "approval-gateway"
    "bedrock-advisor"
    "preventive-engine"
    "email-agent"
    "teams-agent"
    "dashboard-api"
    "movidesk-agent"
    "escalation-engine"
    "audit-reporter"
    "chatbot-agent"
    "scheduler-engine"
    "slack-agent"
    "servicenow-agent"
    "alert-rules-engine"
    "benchmark-engine"
    "discovery-engine"
    "ewa-generator"
  )

  for LAMBDA_NAME in "${LAMBDAS[@]}"; do
    LAMBDA_DIR="${PROJECT_DIR}/lambda/${LAMBDA_NAME}"

    if [ ! -d "${LAMBDA_DIR}" ]; then
      log_warn "Directorio no encontrado: lambda/${LAMBDA_NAME}, saltando..."
      continue
    fi

    log_info "  Empaquetando ${LAMBDA_NAME}..."

    # Crear directorio temporal
    TEMP_DIR="${BUILD_DIR}/tmp-${LAMBDA_NAME}"
    mkdir -p "${TEMP_DIR}"

    # Copiar código (index.js + cualquier módulo adicional .js)
    cp "${LAMBDA_DIR}/index.js" "${TEMP_DIR}/"
    cp "${LAMBDA_DIR}/package.json" "${TEMP_DIR}/"
    # Copiar módulos extra (ej: audit-reporter/compliance.js)
    for EXTRA_JS in "${LAMBDA_DIR}"/*.js; do
      [ "$(basename "${EXTRA_JS}")" = "index.js" ] && continue
      [ -f "${EXTRA_JS}" ] && cp "${EXTRA_JS}" "${TEMP_DIR}/"
    done

    # Instalar dependencias de producción
    if [ -f "${TEMP_DIR}/package.json" ]; then
      (cd "${TEMP_DIR}" && npm install --production --no-optional --silent 2>&1) || {
        log_warn "  npm install fallo para ${LAMBDA_NAME} (puede no tener dependencias)"
      }
    fi

    # Crear ZIP
    (cd "${TEMP_DIR}" && zip -r "${BUILD_DIR}/${LAMBDA_NAME}.zip" . -q)

    # Limpiar temporal
    rm -rf "${TEMP_DIR}"

    ZIP_SIZE=$(du -h "${BUILD_DIR}/${LAMBDA_NAME}.zip" | cut -f1)
    log_success "  ${LAMBDA_NAME}.zip (${ZIP_SIZE})"
  done

  log_success "Todas las Lambdas empaquetadas en ${BUILD_DIR}/"
}

# ─── Subir a S3 ───
upload_to_s3() {
  log_info "Subiendo ZIPs a s3://${S3_BUCKET}/${S3_PREFIX}..."

  for ZIP_FILE in "${BUILD_DIR}"/*.zip; do
    if [ -f "${ZIP_FILE}" ]; then
      FILENAME=$(basename "${ZIP_FILE}")
      aws s3 cp "${ZIP_FILE}" "s3://${S3_BUCKET}/${S3_PREFIX}${FILENAME}" \
        --region "${AWS_REGION}" \
        --quiet
      log_success "  ${FILENAME} -> s3://${S3_BUCKET}/${S3_PREFIX}${FILENAME}"
    fi
  done

  log_success "Todos los ZIPs subidos a S3"
}

# ─── Desplegar CloudFormation ───
deploy_stack() {
  log_info "Desplegando stack CloudFormation: ${STACK_NAME}..."

  # Verificar si el stack ya existe
  STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" 2>/dev/null && echo "true" || echo "false")

  CFN_ACTION="create-stack"
  if [ "${STACK_EXISTS}" = "true" ]; then
    CFN_ACTION="update-stack"
    log_info "Stack existente, actualizando..."
  else
    log_info "Stack nuevo, creando..."
  fi

  # Desplegar
  CFN_OUTPUT=$(aws cloudformation ${CFN_ACTION} \
    --stack-name "${STACK_NAME}" \
    --template-body "file://${PROJECT_DIR}/${CFN_TEMPLATE}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "${AWS_REGION}" \
    --parameters \
      ParameterKey=LambdaS3Bucket,ParameterValue="${S3_BUCKET}" \
      ParameterKey=LambdaS3Prefix,ParameterValue="${S3_PREFIX}" \
    --tags \
      Key=Project,Value=SAP-Spektra \
      Key=Version,Value=1.4 \
    2>&1)
  CFN_EXIT=$?

  if [ ${CFN_EXIT} -ne 0 ]; then
    # Si el error es "No updates are to be performed", no es un error real
    if echo "${CFN_OUTPUT}" | grep -q "No updates are to be performed"; then
      log_warn "No hay cambios en el stack (sin cambios pendientes)"
      return 0
    else
      log_error "Error de CloudFormation: ${CFN_OUTPUT}"
      return 1
    fi
  fi

  log_info "Esperando a que el stack termine de desplegarse..."
  aws cloudformation wait stack-${CFN_ACTION//-stack/}-complete \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" 2>/dev/null || {
    log_warn "El wait fallo, verificar estado manualmente"
  }

  # Mostrar outputs
  log_info "Outputs del stack:"
  aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
    --output table 2>/dev/null || true

  log_success "Stack desplegado exitosamente"
}

# ─── Actualizar solo el código Lambda (sin CloudFormation) ───
update_lambdas_only() {
  log_info "Actualizando código de Lambdas..."

  LAMBDAS=(
    "sap-alwaysops-universal-collector:universal-collector"
    "sap-alwaysops-ha-monitor:ha-monitor"
    "sap-alwaysops-runbook-engine:runbook-engine"
    "sap-alwaysops-approval-gateway:approval-gateway"
    "sap-alwaysops-bedrock-advisor:bedrock-advisor"
    "sap-alwaysops-preventive-engine:preventive-engine"
    "sap-alwaysops-email-agent:email-agent"
    "sap-alwaysops-teams-agent:teams-agent"
    "sap-alwaysops-dashboard-api:dashboard-api"
    "sap-alwaysops-movidesk-agent:movidesk-agent"
    "sap-alwaysops-escalation-engine:escalation-engine"
    "sap-alwaysops-audit-reporter:audit-reporter"
    "sap-alwaysops-chatbot-agent:chatbot-agent"
    "sap-alwaysops-scheduler-engine:scheduler-engine"
    "sap-alwaysops-slack-agent:slack-agent"
    "sap-alwaysops-servicenow-agent:servicenow-agent"
    "sap-alwaysops-alert-rules-engine:alert-rules-engine"
    "sap-alwaysops-benchmark-engine:benchmark-engine"
    "sap-alwaysops-discovery-engine:discovery-engine"
    "sap-alwaysops-ewa-generator:ewa-generator"
  )

  for ENTRY in "${LAMBDAS[@]}"; do
    FUNC_NAME="${ENTRY%%:*}"
    ZIP_NAME="${ENTRY##*:}"

    if [ -f "${BUILD_DIR}/${ZIP_NAME}.zip" ]; then
      log_info "  Actualizando ${FUNC_NAME}..."
      aws lambda update-function-code \
        --function-name "${FUNC_NAME}" \
        --s3-bucket "${S3_BUCKET}" \
        --s3-key "${S3_PREFIX}${ZIP_NAME}.zip" \
        --region "${AWS_REGION}" \
        --no-cli-pager \
        --query 'FunctionName' \
        --output text 2>/dev/null && \
        log_success "  ${FUNC_NAME} actualizado" || \
        log_warn "  ${FUNC_NAME} no encontrado (puede ser condicional)"
    fi
  done

  log_success "Código Lambda actualizado"
}

# ─── Eliminar stack ───
delete_stack() {
  log_warn "Eliminando stack ${STACK_NAME}..."
  read -p "Estas seguro? Esto eliminara TODOS los recursos. [y/N] " -n 1 -r
  echo

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    aws cloudformation delete-stack \
      --stack-name "${STACK_NAME}" \
      --region "${AWS_REGION}"

    log_info "Esperando eliminacion..."
    aws cloudformation wait stack-delete-complete \
      --stack-name "${STACK_NAME}" \
      --region "${AWS_REGION}" 2>/dev/null || true

    log_success "Stack eliminado"
  else
    log_info "Cancelado"
  fi
}

# ─── Build Frontend React ───
build_frontend() {
  FRONTEND_DIR="${PROJECT_DIR}/frontend"

  if [ ! -d "${FRONTEND_DIR}" ]; then
    log_warn "Directorio frontend/ no encontrado, saltando build de frontend"
    return 0
  fi

  log_info "Construyendo frontend React..."

  # Obtener outputs del stack para configurar env vars
  COGNITO_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
    --output text 2>/dev/null || echo "")

  COGNITO_CLIENT_ID=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --query 'Stacks[0].Outputs[?OutputKey==`CognitoClientId`].OutputValue' \
    --output text 2>/dev/null || echo "")

  API_URL=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --query 'Stacks[0].Outputs[?OutputKey==`DashboardApiUrl`].OutputValue' \
    --output text 2>/dev/null || echo "")

  # Crear .env para el build
  cat > "${FRONTEND_DIR}/.env.production" <<EOF
VITE_API_URL=${API_URL}
VITE_COGNITO_USER_POOL_ID=${COGNITO_POOL_ID}
VITE_COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID}
VITE_AWS_REGION=${AWS_REGION}
EOF

  log_info "  Variables de entorno configuradas"

  # Instalar dependencias y construir
  (cd "${FRONTEND_DIR}" && npm install --silent && npm run build) || {
    log_error "Error construyendo frontend"
    return 1
  }

  log_success "Frontend construido en frontend/dist/"
}

# ─── Deploy Frontend a S3 + invalidar CloudFront ───
deploy_frontend() {
  FRONTEND_DIR="${PROJECT_DIR}/frontend"
  DIST_DIR="${FRONTEND_DIR}/dist"

  if [ ! -d "${DIST_DIR}" ]; then
    log_warn "frontend/dist/ no encontrado, ejecuta build_frontend primero"
    return 0
  fi

  # Obtener nombre del bucket frontend
  FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' \
    --output text 2>/dev/null || echo "")

  if [ -z "${FRONTEND_BUCKET}" ]; then
    log_warn "FrontendBucketName no encontrado en outputs del stack"
    return 0
  fi

  log_info "Subiendo frontend a s3://${FRONTEND_BUCKET}/..."

  aws s3 sync "${DIST_DIR}" "s3://${FRONTEND_BUCKET}/" \
    --region "${AWS_REGION}" \
    --delete \
    --quiet

  log_success "Frontend subido a S3"

  # Invalidar caché de CloudFront
  CF_DIST_ID=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
    --output text 2>/dev/null || echo "")

  if [ -n "${CF_DIST_ID}" ]; then
    log_info "Invalidando cache de CloudFront (${CF_DIST_ID})..."
    aws cloudfront create-invalidation \
      --distribution-id "${CF_DIST_ID}" \
      --paths "/*" \
      --region us-east-1 \
      --no-cli-pager \
      --query 'Invalidation.Id' \
      --output text 2>/dev/null && \
      log_success "Cache de CloudFront invalidado" || \
      log_warn "No se pudo invalidar cache de CloudFront"
  fi

  # Mostrar URL del frontend
  CF_DOMAIN=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDomainName`].OutputValue' \
    --output text 2>/dev/null || echo "")

  if [ -n "${CF_DOMAIN}" ]; then
    echo ""
    log_success "Frontend disponible en: https://${CF_DOMAIN}"
  fi
}

# ─── Main ───
main() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  SAP Spektra v1.4 — Deploy Script${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
  echo ""

  case "${1:-}" in
    --package-only)
      check_prerequisites
      package_lambdas
      ;;
    --update-lambdas)
      check_prerequisites
      package_lambdas
      upload_to_s3
      update_lambdas_only
      ;;
    --delete)
      delete_stack
      ;;
    --frontend)
      build_frontend
      deploy_frontend
      ;;
    *)
      check_prerequisites
      package_lambdas
      upload_to_s3
      deploy_stack
      build_frontend
      deploy_frontend
      ;;
  esac

  echo ""
  log_success "Proceso completado"
}

main "$@"
