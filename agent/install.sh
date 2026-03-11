#!/bin/bash
# ============================================================
# SAP Spektra Agent — Script de Instalación
# ============================================================
#
# Este script:
# 1. Verifica que Python 3 esté instalado
# 2. Crea un entorno virtual (venv)
# 3. Instala las dependencias
# 4. Crea directorios necesarios
# 5. Instala el servicio de systemd
# 6. Muestra instrucciones para configurar
#
# Uso:
#   sudo bash install.sh
#
# ============================================================

set -e  # Detener si hay algún error

# Colores para los mensajes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # Sin color

INSTALL_DIR="/opt/spektra-agent"
SERVICE_NAME="spektra-agent"
AGENT_USER="spektra"

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  SAP Spektra Agent — Instalador${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

# ── Verificar que se ejecuta como root ──
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}ERROR: Este script debe ejecutarse como root (sudo).${NC}"
    exit 1
fi

# ── Verificar Python 3 ──
echo -e "${YELLOW}[1/6]${NC} Verificando Python 3..."
if command -v python3 &>/dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1)
    echo "       Encontrado: $PYTHON_VERSION"
else
    echo -e "${RED}ERROR: Python 3 no está instalado.${NC}"
    echo "       Instálalo con:"
    echo "         RHEL/CentOS: sudo yum install python3"
    echo "         SUSE:        sudo zypper install python3"
    echo "         Ubuntu:      sudo apt install python3"
    exit 1
fi

# ── Crear usuario del agente (si no existe) ──
echo -e "${YELLOW}[2/6]${NC} Creando usuario '${AGENT_USER}'..."
if id "$AGENT_USER" &>/dev/null; then
    echo "       Usuario ya existe."
else
    useradd --system --no-create-home --shell /sbin/nologin "$AGENT_USER"
    echo "       Usuario creado."
fi

# ── Copiar archivos ──
echo -e "${YELLOW}[3/6]${NC} Instalando en ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"

# Copiar todo excepto el venv existente y __pycache__
cp -r spektra_agent "$INSTALL_DIR/"
cp requirements.txt "$INSTALL_DIR/"
cp config.yaml "$INSTALL_DIR/config.yaml.example"

# Si no existe config.yaml propio, copiar el ejemplo
if [ ! -f "$INSTALL_DIR/config.yaml" ]; then
    cp config.yaml "$INSTALL_DIR/config.yaml"
    echo "       Config de ejemplo copiada. ¡EDÍTALA antes de iniciar!"
fi

# ── Crear entorno virtual e instalar dependencias ──
echo -e "${YELLOW}[4/6]${NC} Creando entorno virtual e instalando dependencias..."
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip --quiet
"$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt" --quiet
echo "       Dependencias instaladas."

# ── Crear directorios necesarios ──
echo -e "${YELLOW}[5/6]${NC} Creando directorios..."
mkdir -p /var/log
mkdir -p /var/lib/spektra-agent/retry
touch /var/log/spektra-agent.log

# Permisos
chown -R "$AGENT_USER":"$AGENT_USER" "$INSTALL_DIR"
chown "$AGENT_USER":"$AGENT_USER" /var/log/spektra-agent.log
chown -R "$AGENT_USER":"$AGENT_USER" /var/lib/spektra-agent
echo "       Directorios creados."

# ── Instalar servicio de systemd ──
echo -e "${YELLOW}[6/6]${NC} Instalando servicio de systemd..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << 'EOF'
[Unit]
Description=SAP Spektra Agent — Monitoreo de sistemas SAP
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=spektra
Group=spektra
WorkingDirectory=/opt/spektra-agent
ExecStart=/opt/spektra-agent/venv/bin/python -m spektra_agent.main --config /opt/spektra-agent/config.yaml
Restart=always
RestartSec=30

# Variables de entorno para contraseñas (descomenta y configura)
# Environment=SPEKTRA_API_TOKEN=spk_xxxxxxxx
# Environment=SPEKTRA_SAP_PASSWORD=secret
# Environment=SPEKTRA_HANA_PASSWORD=secret

# Seguridad
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/log/spektra-agent.log /var/lib/spektra-agent /opt/spektra-agent/.credentials

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo "       Servicio instalado."

# ── Resumen ──
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Instalación completada${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  Próximos pasos:"
echo ""
echo -e "  ${YELLOW}1.${NC} Editar la configuración básica (SID, entorno, API):"
echo "     sudo nano $INSTALL_DIR/config.yaml"
echo ""
echo -e "  ${YELLOW}2.${NC} Configurar credenciales de forma segura (recomendado):"
echo "     cd $INSTALL_DIR"
echo "     sudo venv/bin/python -m spektra_agent.main --setup"
echo "     → Detecta automáticamente producto SAP y base de datos"
echo "     → Pide credenciales y valida permisos"
echo "     → Las guarda encriptadas localmente (nunca se envían al backend)"
echo ""
echo -e "  ${YELLOW}3.${NC} Iniciar el agente:"
echo "     sudo systemctl start ${SERVICE_NAME}"
echo "     sudo systemctl enable ${SERVICE_NAME}  # arranque automático"
echo ""
echo -e "  ${YELLOW}4.${NC} Verificar estado:"
echo "     sudo systemctl status ${SERVICE_NAME}"
echo "     sudo journalctl -u ${SERVICE_NAME} -f"
echo ""
echo -e "  ${YELLOW}5.${NC} Probar un solo ciclo (sin daemon):"
echo "     cd $INSTALL_DIR"
echo "     sudo venv/bin/python -m spektra_agent.main --once"
echo ""
