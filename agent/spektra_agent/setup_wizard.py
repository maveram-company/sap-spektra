"""
Asistente interactivo de configuración.

Se ejecuta con: python -m spektra_agent.main --setup

Flujo:
1. Detecta automáticamente el producto SAP y la base de datos
2. Pide credenciales de sapcontrol al usuario
3. Valida la conexión a sapcontrol
4. Pide credenciales de la base de datos
5. Valida la conexión y verifica TODOS los permisos necesarios
6. Muestra los permisos que faltan con los comandos GRANT exactos
7. Guarda las credenciales encriptadas localmente (nunca se envían)
"""

import sys
import getpass
import logging
import requests
from lxml import etree

from spektra_agent.collectors import sap_detector
from spektra_agent.credential_store import save_credentials, credentials_exist
from spektra_agent.permission_validator import validate_database

logger = logging.getLogger("spektra-agent")

# ── Colores ANSI para la terminal ──
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"


def _ok(text):
    return f"  {GREEN}\u2713{RESET} {text}"

def _fail(text):
    return f"  {RED}\u2717{RESET} {text}"

def _warn(text):
    return f"  {YELLOW}!{RESET} {text}"

def _info(text):
    return f"  {CYAN}\u2022{RESET} {text}"

def _header(text):
    return f"\n{BOLD}{CYAN}── {text} ──{RESET}\n"

def _ask(prompt, default=""):
    """Pide input al usuario con un valor por defecto."""
    if default:
        raw = input(f"  {prompt} [{default}]: ").strip()
        return raw if raw else default
    return input(f"  {prompt}: ").strip()

def _ask_password(prompt):
    """Pide una contraseña sin mostrarla en pantalla."""
    return getpass.getpass(f"  {prompt}: ")

def _ask_yes_no(prompt, default=True):
    """Pregunta sí/no."""
    hint = "S/n" if default else "s/N"
    raw = input(f"  {prompt} [{hint}]: ").strip().lower()
    if not raw:
        return default
    return raw in ("s", "si", "sí", "y", "yes")


def run(config):
    """
    Ejecuta el asistente de configuración completo.
    """
    print()
    print(f"{BOLD}{CYAN}{'=' * 56}{RESET}")
    print(f"{BOLD}{CYAN}  SAP Spektra Agent — Asistente de Configuración{RESET}")
    print(f"{BOLD}{CYAN}{'=' * 56}{RESET}")

    # ── Verificar si ya hay credenciales ──
    if credentials_exist():
        print()
        print(_warn("Ya existen credenciales guardadas."))
        if not _ask_yes_no("¿Deseas reconfigurar? Se sobrescribirán las actuales", default=False):
            print("\n  Cancelado. Las credenciales actuales se mantienen.")
            return
        print()

    credentials = {}

    # ══════════════════════════════════════════════════════
    # PASO 1: Detección automática
    # ══════════════════════════════════════════════════════
    print(_header("Paso 1: Detección Automática"))
    print(f"  Analizando el sistema...")

    detection = sap_detector.detect(config)

    system_cfg = config.get("system", {})
    detected_product = detection.get("product", "Unknown")
    detected_db = detection.get("db_type", "Unknown")

    # Actualizar config con detección
    if detected_product != "Unknown":
        system_cfg["type"] = detected_product
    if detected_db != "Unknown":
        system_cfg["db_type"] = detected_db

    sid = system_cfg.get("sid", "???")
    print(_ok(f"SID: {BOLD}{sid}{RESET}"))
    print(_ok(f"Producto: {BOLD}{system_cfg.get('type', '?')}{RESET}"))
    print(_ok(f"Base de datos: {BOLD}{system_cfg.get('db_type', '?')}{RESET}"))
    print(_ok(f"Kernel: {detection.get('kernel_version', '?')}"))

    # Mostrar instancias detectadas
    instances = detection.get("detected_instances", [])
    if instances:
        print(_ok(f"Instancias encontradas: {len(instances)}"))
        for inst in instances:
            print(f"      {DIM}{inst.get('instance_nr', '??')} - "
                  f"{inst.get('type', '?')} ({inst.get('hostname', '?')}){RESET}")
    else:
        print(_warn("No se detectaron instancias automáticamente"))

    # Si no se detectó el producto o DB, preguntar
    if system_cfg.get("type", "Unknown") == "Unknown":
        print()
        print(_warn("No se pudo detectar el producto SAP automáticamente."))
        system_cfg["type"] = _ask("Tipo de producto (S/4HANA, ECC, BW, etc.)", "S/4HANA")

    if system_cfg.get("db_type", "Unknown") == "Unknown":
        print()
        print(_warn("No se pudo detectar la base de datos automáticamente."))
        system_cfg["db_type"] = _ask(
            "Tipo de BD (HANA, Oracle, DB2, MSSQL, ASE, MaxDB)", "HANA"
        )

    # ══════════════════════════════════════════════════════
    # PASO 2: Credenciales SAP (sapcontrol)
    # ══════════════════════════════════════════════════════
    print(_header("Paso 2: Credenciales SAP (sapcontrol)"))
    print(f"  El agente usa sapcontrol para monitorear instancias SAP.")
    print(f"  Necesita un usuario del SO con acceso a sapcontrol")
    print(f"  (normalmente {BOLD}{sid.lower()}adm{RESET}).")
    print()

    sap_user = _ask("Usuario", f"{sid.lower()}adm" if sid != "???" else "sapadm")
    sap_pass = _ask_password("Contraseña")

    # Intentar conectar a sapcontrol
    sap_ok = False
    sap_cfg = config.get("sapcontrol", {})
    test_instances = sap_cfg.get("instances", instances)

    if test_instances:
        inst = test_instances[0]
        hostname = inst.get("hostname", "localhost")
        port = inst.get("http_port", 50013)
        print(f"\n  Probando conexión a sapcontrol ({hostname}:{port})...")

        sap_ok = _test_sapcontrol(hostname, port, sap_user, sap_pass)
    else:
        # Pedir datos manualmente
        hostname = _ask("Hostname del servidor SAP", "localhost")
        inst_nr = _ask("Número de instancia (2 dígitos)", "01")
        port = int(f"5{inst_nr}13")
        print(f"\n  Probando conexión a sapcontrol ({hostname}:{port})...")
        sap_ok = _test_sapcontrol(hostname, port, sap_user, sap_pass)

    if sap_ok:
        print(_ok("Conexión a sapcontrol exitosa"))
        credentials["sapcontrol"] = {
            "username": sap_user,
            "password": sap_pass,
        }
    else:
        print(_fail("No se pudo conectar a sapcontrol"))
        print(_warn("El agente funcionará sin métricas SAP (solo OS y BD)"))
        if _ask_yes_no("¿Guardar las credenciales de todos modos?"):
            credentials["sapcontrol"] = {
                "username": sap_user,
                "password": sap_pass,
            }

    # ══════════════════════════════════════════════════════
    # PASO 3: Credenciales de Base de Datos
    # ══════════════════════════════════════════════════════
    db_type = system_cfg.get("db_type", "Unknown")

    if db_type != "Unknown":
        print(_header(f"Paso 3: Credenciales de Base de Datos ({db_type})"))
        print(f"  El agente necesita un usuario con permisos de {BOLD}solo lectura{RESET}")
        print(f"  en vistas de monitoreo. Se recomienda crear un usuario dedicado.")
        print()
        print(f"  {DIM}Recomendación: crear usuario 'SPEKTRA_MON' con permisos mínimos{RESET}")
        print()

        db_credentials = _collect_db_credentials(db_type, config)

        if db_credentials:
            credentials["database"] = {
                "type": db_type,
                **db_credentials,
            }

            # ── Validar permisos ──
            print(f"\n  Validando permisos en {db_type}...")
            conn_params = _build_connection_params(db_type, db_credentials, config)

            connected, results = validate_database(db_type, **conn_params)

            if not connected:
                for r in results:
                    if "error" in r:
                        print(_fail(r["error"]))
            else:
                ok_count = 0
                denied_count = 0
                grants_needed = []

                for r in results:
                    if r.get("status") == "ok":
                        print(_ok(f"{r['view']} — {r['description']}"))
                        ok_count += 1
                    elif r.get("status") == "permission_denied":
                        print(_fail(f"{r['view']} — {RED}PERMISO DENEGADO{RESET}"))
                        denied_count += 1
                        if r.get("grant_needed"):
                            grants_needed.append(r["grant_needed"])
                    elif r.get("status") == "not_available":
                        print(_warn(f"{r['view']} — No disponible (opcional)"))
                    else:
                        print(_warn(f"{r['view']} — {r.get('error', 'Error desconocido')}"))

                print()
                print(f"  Resultado: {GREEN}{ok_count} OK{RESET}, "
                      f"{RED if denied_count else GREEN}{denied_count} denegados{RESET}")

                if grants_needed:
                    print()
                    print(f"  {YELLOW}{BOLD}Ejecuta estos comandos como administrador de {db_type}:{RESET}")
                    print()
                    for grant in grants_needed:
                        for line in grant.split("\n"):
                            print(f"    {CYAN}{line};{RESET}")
                    print()

                    if not _ask_yes_no("¿Continuar de todos modos? (podrás corregir después)", default=True):
                        print("\n  Corrige los permisos y ejecuta --setup de nuevo.")
                        return

    else:
        print(_header("Paso 3: Base de Datos"))
        print(_warn(f"No se detectó tipo de base de datos. Saltando..."))

    # ══════════════════════════════════════════════════════
    # PASO 4: Permisos Cloud (para operaciones HA/DR)
    # ══════════════════════════════════════════════════════
    _check_cloud_permissions(config)

    # ══════════════════════════════════════════════════════
    # PASO 5: Guardar credenciales
    # ══════════════════════════════════════════════════════
    print(_header("Paso 5: Guardando Credenciales"))

    if not credentials:
        print(_warn("No hay credenciales para guardar."))
        return

    try:
        save_credentials(credentials)
        print(_ok("Credenciales encriptadas con AES (Fernet)"))
        print(_ok("Clave derivada de la identidad única de esta máquina"))
        print(_ok("Archivo con permisos 0600 (solo owner puede leer)"))
        print()
        print(f"  {BOLD}{GREEN}\u2713 Las credenciales NUNCA se envían al backend{RESET}")
        print(f"  {BOLD}{GREEN}\u2713 Solo pueden descifrarse en este servidor{RESET}")
    except Exception as e:
        print(_fail(f"Error guardando credenciales: {e}"))
        print(_warn("Puedes configurarlas manualmente con variables de entorno."))
        return

    # ── Resumen final ──
    print()
    print(f"{BOLD}{CYAN}{'=' * 56}{RESET}")
    print(f"{BOLD}{GREEN}  Configuración completada{RESET}")
    print(f"{BOLD}{CYAN}{'=' * 56}{RESET}")
    print()
    print(f"  Inicia el agente con:")
    print(f"    {CYAN}sudo systemctl start spektra-agent{RESET}")
    print()
    print(f"  Prueba un solo ciclo:")
    print(f"    {CYAN}sudo python -m spektra_agent.main --once{RESET}")
    print()
    print(f"  Re-configurar credenciales:")
    print(f"    {CYAN}sudo python -m spektra_agent.main --setup{RESET}")
    print()


def _check_cloud_permissions(config):
    """
    Paso 4: Detecta proveedor cloud y valida permisos para HA/DR.

    Si el servidor está en cloud, pregunta qué estrategia HA usa
    y valida que tenga los permisos necesarios en AWS/Azure/GCP.
    """
    print(_header("Paso 4: Permisos Cloud (HA/DR)"))

    # Detectar cloud provider
    print(f"  Detectando proveedor cloud...")
    try:
        from spektra_agent.collectors import cloud_collector
        cloud = cloud_collector.collect(config)
        provider = cloud.get("provider", "on-premise")
    except Exception:
        provider = "on-premise"

    if provider == "on-premise":
        print(_info("Sistema on-premise detectado."))
        print(_info("Los permisos de HA se manejan a nivel de SO/Pacemaker."))
        print(_info("No se requieren credenciales cloud."))
        return

    print(_ok(f"Proveedor: {BOLD}{provider.upper()}{RESET}"))
    if cloud.get("instance_type"):
        print(_ok(f"Instancia: {cloud.get('instance_type')}"))
    if cloud.get("region"):
        print(_ok(f"Región: {cloud.get('region')}"))
    print()

    # Preguntar si va a usar HA/DR
    if not _ask_yes_no("¿Este sistema usará operaciones HA/DR desde SAP Spektra?", default=True):
        print(_info("Saltando validación de permisos cloud."))
        return

    # Preguntar estrategia
    print()
    print(f"  {BOLD}Estrategias HA disponibles:{RESET}")
    print(f"    {CYAN}1{RESET} — Hot Standby    (réplica sync, failover inmediato)")
    print(f"    {CYAN}2{RESET} — Warm Standby   (réplica async, secundario más pequeño)")
    print(f"    {CYAN}3{RESET} — Pilot Light    (secundario apagado, encender bajo demanda)")
    print(f"    {CYAN}4{RESET} — Backup/Restore (sin secundario, reconstruir desde backup)")
    print(f"    {CYAN}5{RESET} — Cross-Region   (DR entre regiones cloud)")
    print()

    strategy_map = {
        "1": "HOT_STANDBY",
        "2": "WARM_STANDBY",
        "3": "PILOT_LIGHT",
        "4": "BACKUP_RESTORE",
        "5": "CROSS_REGION_DR",
    }
    choice = _ask("Estrategia HA (1-5)", "1")
    strategy = strategy_map.get(choice, "HOT_STANDBY")

    print(f"\n  Validando permisos {provider.upper()} para {BOLD}{strategy}{RESET}...")

    try:
        from spektra_agent.cloud_permissions import validate_cloud_permissions

        connected, results = validate_cloud_permissions(provider, strategy)

        if not connected:
            for r in results:
                if "error" in r:
                    print(_fail(r["error"]))
                if "grant_hint" in r:
                    print()
                    print(f"  {YELLOW}{BOLD}Cómo configurar:{RESET}")
                    for line in r["grant_hint"].split("\n"):
                        print(f"    {CYAN}{line}{RESET}")
            return

        ok_count = 0
        denied_count = 0
        inferred_count = 0
        hints = []

        for r in results:
            status = r.get("status", "")
            if status == "ok":
                print(_ok(f"{r['action']} — {r['description']}"))
                ok_count += 1
            elif status == "inferred":
                print(_info(f"{r['action']} — {r['description']} (probable OK)"))
                inferred_count += 1
            elif status == "denied":
                critical = " [CRÍTICO]" if r.get("critical") else ""
                print(_fail(f"{r['action']} — {RED}DENEGADO{RESET}{critical}"))
                denied_count += 1
                if r.get("grant_hint"):
                    hints.append(r["grant_hint"])
            elif status == "not_applicable":
                print(_info(r["description"]))
            elif status == "skipped":
                print(_warn(f"{r['action']} — {r.get('note', 'No validado')}"))
            else:
                print(_warn(f"{r['action']} — {r.get('error', 'Error desconocido')}"))

        print()
        print(f"  Resultado: {GREEN}{ok_count} OK{RESET}, "
              f"{CYAN}{inferred_count} probable{RESET}, "
              f"{RED if denied_count else GREEN}{denied_count} denegados{RESET}")

        if denied_count > 0 and hints:
            print()
            print(f"  {YELLOW}{BOLD}Permisos faltantes — agrega esto al IAM Role/Policy:{RESET}")
            print()
            for hint in hints:
                for line in hint.split("\n"):
                    print(f"    {CYAN}{line}{RESET}")
            print()
            print(_warn(
                "Sin estos permisos, las operaciones HA que requieren "
                "escalar instancias, mover IPs o cambiar DNS NO funcionarán."
            ))
            print(_info(
                "Las operaciones a nivel de OS/SAP (sapcontrol, hdbnsutil) "
                "SÍ funcionarán normalmente."
            ))

    except ImportError:
        print(_warn("Módulo cloud_permissions no disponible."))
        print(_info("Instala boto3 (AWS), azure-identity (Azure) o google-auth (GCP) según tu proveedor."))
    except Exception as e:
        print(_warn(f"Error validando permisos cloud: {e}"))
        print(_info("Puedes verificar los permisos manualmente."))


def _test_sapcontrol(hostname, port, username, password):
    """Intenta conectar a sapcontrol y hacer GetProcessList."""
    try:
        soap_body = """<?xml version="1.0" encoding="UTF-8"?>
        <SOAP-ENV:Envelope
            xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
            xmlns:ns1="urn:SAPControl">
            <SOAP-ENV:Body>
                <ns1:GetProcessList />
            </SOAP-ENV:Body>
        </SOAP-ENV:Envelope>"""

        response = requests.post(
            f"http://{hostname}:{port}/",
            data=soap_body,
            headers={
                "Content-Type": "text/xml; charset=utf-8",
                "SOAPAction": '"urn:SAPControl:GetProcessList"',
            },
            auth=(username, password) if username else None,
            timeout=10,
        )
        return response.status_code == 200
    except Exception:
        return False


def _collect_db_credentials(db_type, config):
    """Pide credenciales de BD según el tipo."""
    creds = {}

    if db_type == "HANA":
        hana_cfg = config.get("hana", {})
        creds["host"] = _ask("Host de HANA", hana_cfg.get("host", "localhost"))
        creds["port"] = int(_ask("Puerto SQL", str(hana_cfg.get("port", 30015))))
        creds["username"] = _ask("Usuario", "SPEKTRA_MON")
        creds["password"] = _ask_password("Contraseña")

    elif db_type == "Oracle":
        creds["host"] = _ask("Host de Oracle", "localhost")
        creds["port"] = int(_ask("Puerto", "1521"))
        creds["service_name"] = _ask("Service Name", config.get("system", {}).get("sid", ""))
        creds["username"] = _ask("Usuario", "SPEKTRA_MON")
        creds["password"] = _ask_password("Contraseña")

    elif db_type == "DB2":
        creds["hostname"] = _ask("Host de DB2", "localhost")
        creds["port"] = _ask("Puerto", "50000")
        creds["database"] = _ask("Database", config.get("system", {}).get("sid", ""))
        creds["username"] = _ask("Usuario", "spektra_mon")
        creds["password"] = _ask_password("Contraseña")

    elif db_type == "MSSQL":
        creds["host"] = _ask("Host de SQL Server", "localhost")
        creds["port"] = int(_ask("Puerto", "1433"))
        creds["username"] = _ask("Usuario", "spektra_mon")
        creds["password"] = _ask_password("Contraseña")

    elif db_type == "ASE":
        creds["host"] = _ask("Host de ASE", "localhost")
        creds["port"] = int(_ask("Puerto", "5000"))
        creds["username"] = _ask("Usuario", "spektra_mon")
        creds["password"] = _ask_password("Contraseña")

    elif db_type == "MaxDB":
        creds["database"] = _ask("Database", config.get("system", {}).get("sid", ""))
        creds["username"] = _ask("Usuario DBM", "SUPERDBA")
        creds["password"] = _ask_password("Contraseña")

    else:
        print(_warn(f"Tipo de BD no soportado: {db_type}"))
        return None

    return creds


def _build_connection_params(db_type, creds, config):
    """Construye los parámetros para el validador según el tipo de DB."""
    if db_type == "HANA":
        return {
            "host": creds["host"],
            "port": creds["port"],
            "username": creds["username"],
            "password": creds["password"],
        }
    elif db_type == "Oracle":
        return {
            "host": creds["host"],
            "port": creds["port"],
            "service_name": creds["service_name"],
            "username": creds["username"],
            "password": creds["password"],
        }
    elif db_type == "DB2":
        return {
            "database": creds["database"],
            "hostname": creds["hostname"],
            "port": creds["port"],
            "username": creds["username"],
            "password": creds["password"],
        }
    elif db_type in ("MSSQL", "ASE"):
        return {
            "host": creds["host"],
            "port": creds["port"],
            "username": creds["username"],
            "password": creds["password"],
        }
    return {}
