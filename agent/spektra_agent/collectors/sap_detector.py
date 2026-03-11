"""
Detector automático de productos SAP y base de datos.

Lee la configuración de las instancias SAP instaladas en el servidor
para detectar automáticamente:
- Qué producto SAP está instalado (S/4HANA, ECC, BW, etc.)
- Qué versión del kernel SAP corre
- Qué base de datos usa el sistema
- Qué instancias existen (PAS, AAS, ASCS, HANA, etc.)

Fuentes de información:
1. sapcontrol GetInstanceProperties → propiedades detalladas
2. sapcontrol GetSystemInstanceList → lista de instancias
3. Archivo DEFAULT.PFL → perfil del sistema SAP
4. /usr/sap/<SID>/SYS/profile/ → perfiles de instancia
5. /usr/sap/<SID>/ → estructura de directorios
"""

import os
import re
import glob
import logging
import requests
from lxml import etree

logger = logging.getLogger("spektra-agent")

TIMEOUT = 15

# ── Mapas de detección ──

# Detectar producto SAP por el componente de software instalado
PRODUCT_SIGNATURES = {
    "S4CORE":       "S/4HANA",
    "SAP_ABA":      "ECC",           # Si tiene SAP_ABA pero NO S4CORE → ECC
    "BW4HANA":      "BW/4HANA",
    "SAP_BW":       "BW",            # SAP BW clásico (sin BW4HANA)
    "ST":           "Solution Manager",
    "LMSERVICE":    "Solution Manager",
    "SAP_GWFND":    "SAP Gateway",
    "XI_MAIN":      "Process Orchestration",
    "XS_USAGE":     "HANA XS",
}

# Detectar la base de datos por el string del DBMS
DB_SIGNATURES = {
    "HDB":    "HANA",
    "hdb":    "HANA",
    "ORA":    "Oracle",
    "ora":    "Oracle",
    "DB6":    "DB2",
    "db6":    "DB2",
    "MSS":    "MSSQL",
    "mss":    "MSSQL",
    "SYB":    "ASE",
    "syb":    "ASE",
    "ADA":    "MaxDB",
    "ada":    "MaxDB",
}

# Tipos de instancia SAP por features
INSTANCE_TYPE_MAP = {
    "ABAP":              "PAS",
    "MESSAGESERVER":     "ASCS",
    "ENQREP":            "ERS",
    "J2EE":              "JAVA",
    "GATEWAY":           "Gateway",
    "WEBDISP":           "Web Dispatcher",
    "HDB":               "HANA",
}


def detect(config):
    """
    Detecta automáticamente el producto SAP, base de datos e instancias.

    Retorna:
    {
        "product": "S/4HANA",
        "product_version": "2023",
        "kernel_version": "793",
        "kernel_patch": "100",
        "db_type": "HANA",
        "db_version": "2.00.070",
        "detected_instances": [
            { "instance_nr": "01", "type": "PAS", "hostname": "...", "features": "..." },
            { "instance_nr": "00", "type": "HANA", "hostname": "...", "features": "..." },
        ],
        "components": [ { "name": "S4CORE", "version": "106" }, ... ]
    }
    """
    sid = config.get("system", {}).get("sid", "")
    sap_cfg = config.get("sapcontrol", {})
    instances_cfg = sap_cfg.get("instances", [])
    username = sap_cfg.get("username", "")
    password = sap_cfg.get("password", "")

    result = {
        "product": "Unknown",
        "product_version": "",
        "kernel_version": "",
        "kernel_patch": "",
        "db_type": "Unknown",
        "db_version": "",
        "detected_instances": [],
        "components": [],
    }

    # ── Paso 1: Intentar leer de sapcontrol ──
    for inst_cfg in instances_cfg:
        hostname = inst_cfg.get("hostname", "localhost")
        http_port = inst_cfg.get("http_port", 50013)
        base_url = f"http://{hostname}:{http_port}"
        auth = (username, password) if username else None

        try:
            # Obtener propiedades de la instancia
            props = _get_instance_properties(base_url, auth)
            if props:
                _extract_from_properties(props, result)

            # Obtener lista de instancias del sistema
            instances = _get_system_instance_list(base_url, auth)
            if instances:
                result["detected_instances"] = instances

            # Si ya tenemos datos, no seguir consultando más instancias
            if result["product"] != "Unknown":
                break

        except Exception as e:
            logger.debug(f"No se pudo consultar sapcontrol en {base_url}: {e}")
            continue

    # ── Paso 2: Si no se detectó por sapcontrol, leer perfiles ──
    if result["product"] == "Unknown" and sid:
        _detect_from_profiles(sid, result)

    # ── Paso 3: Si no se detectó la DB, intentar por directorios ──
    if result["db_type"] == "Unknown" and sid:
        _detect_db_from_filesystem(sid, result)

    # ── Paso 4: Refinar el nombre del producto ──
    _refine_product_name(result)

    logger.info(
        f"Detección: producto={result['product']}, "
        f"db={result['db_type']}, "
        f"instancias={len(result['detected_instances'])}"
    )

    return result


def _soap_request(base_url, action, auth=None):
    """Envía una petición SOAP a sapcontrol."""
    soap_body = f"""<?xml version="1.0" encoding="UTF-8"?>
    <SOAP-ENV:Envelope
        xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
        xmlns:ns1="urn:SAPControl">
        <SOAP-ENV:Body>
            <ns1:{action} />
        </SOAP-ENV:Body>
    </SOAP-ENV:Envelope>"""

    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": f'"urn:SAPControl:{action}"',
    }

    response = requests.post(
        f"{base_url}/",
        data=soap_body,
        headers=headers,
        auth=auth,
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    return etree.fromstring(response.content)


def _get_instance_properties(base_url, auth=None):
    """
    Obtiene las propiedades de la instancia via GetInstanceProperties.

    Retorna un diccionario con todas las propiedades:
    { "SAPSYSTEMNAME": "EP1", "SAPLOCALHOST": "sap-ep1-app01", ... }
    """
    tree = _soap_request(base_url, "GetInstanceProperties", auth)
    ns = {"ns": "urn:SAPControl"}
    items = tree.findall(".//ns:item", ns)

    props = {}
    for item in items:
        prop = item.find("ns:property", ns)
        val = item.find("ns:value", ns)
        if prop is not None and val is not None:
            props[prop.text] = val.text or ""

    return props


def _get_system_instance_list(base_url, auth=None):
    """
    Obtiene la lista de TODAS las instancias del sistema SAP.

    GetSystemInstanceList retorna todas las instancias del SID,
    no solo la instancia local. Esto permite descubrir la topología.
    """
    tree = _soap_request(base_url, "GetSystemInstanceList", auth)
    ns = {"ns": "urn:SAPControl"}
    items = tree.findall(".//ns:item", ns)

    instances = []
    for item in items:
        hostname = _xml_text(item, "ns:hostname", ns)
        instance_nr = _xml_text(item, "ns:instanceNr", ns)
        features = _xml_text(item, "ns:features", ns)
        status = _xml_text(item, "ns:dispstatus", ns)
        http_port = _xml_text(item, "ns:httpPort", ns)

        # Determinar el tipo de instancia por sus features
        inst_type = _detect_instance_type(features)

        instances.append({
            "hostname": hostname,
            "instance_nr": instance_nr.zfill(2) if instance_nr else "",
            "type": inst_type,
            "features": features,
            "status": status,
            "http_port": int(http_port) if http_port else 0,
        })

    return instances


def _detect_instance_type(features):
    """
    Determina el tipo de instancia SAP basándose en sus features.

    Ejemplos de features:
    - "MESSAGESERVER|ENQUE" → ASCS
    - "ABAP|GATEWAY|ICMAN|IGS" → PAS
    - "ABAP|GATEWAY" → AAS (si ya hay un PAS)
    - "HDB|HDB_WORKER" → HANA
    - "WEBDISP" → Web Dispatcher
    """
    if not features:
        return "UNKNOWN"

    features_upper = features.upper()

    if "MESSAGESERVER" in features_upper and "ENQUE" in features_upper:
        return "ASCS"
    if "MESSAGESERVER" in features_upper:
        return "SCS"
    if "ENQREP" in features_upper:
        return "ERS"
    if "HDB" in features_upper:
        return "HANA"
    if "WEBDISP" in features_upper:
        return "WDP"
    if "J2EE" in features_upper:
        return "JAVA"
    if "ABAP" in features_upper:
        # PAS o AAS — se distingue después viendo si hay message server
        return "ABAP"

    return "UNKNOWN"


def _extract_from_properties(props, result):
    """
    Extrae información del producto y DB de las propiedades de la instancia.

    Propiedades clave:
    - SAPSYSTEM, SAPSYSTEMNAME → SID
    - SAP KERNEL → versión del kernel
    - DBMS → tipo de base de datos
    - ICM → software components (si disponible)
    """
    # Kernel
    kernel = props.get("Kernel Version", "")
    if kernel:
        result["kernel_version"] = kernel

    kernel_patch = props.get("Kernel Patch Number", "")
    if kernel_patch:
        result["kernel_patch"] = kernel_patch

    # Base de datos
    dbms = props.get("DBMS", "") or props.get("Database", "")
    if dbms:
        for sig, db_name in DB_SIGNATURES.items():
            if sig in dbms:
                result["db_type"] = db_name
                break
        # Intentar extraer versión de DB
        db_version = props.get("Database Version", "")
        if db_version:
            result["db_version"] = db_version

    # Componentes de software (si están disponibles)
    # Algunos sapcontrol retornan una lista de componentes
    for key, value in props.items():
        for sig, product in PRODUCT_SIGNATURES.items():
            if sig in key or sig in str(value):
                result["components"].append({
                    "name": sig,
                    "description": product,
                    "version": value if value else "",
                })


def _detect_from_profiles(sid, result):
    """
    Lee los perfiles de SAP para detectar producto y base de datos.

    El archivo DEFAULT.PFL contiene parámetros como:
    - SAPDBHOST → host de la DB
    - dbms/type → tipo de DB (hdb, ora, db6, mss, syb, ada)
    - rdisp/mshost → message server host

    Multiplataforma: usa platform_paths para la ruta base de SAP.
    """
    from spektra_agent.platform_paths import get_sap_base_dir
    profile_dir = os.path.join(get_sap_base_dir(), sid, "SYS", "profile")

    # ── Leer DEFAULT.PFL ──
    default_pfl = os.path.join(profile_dir, "DEFAULT.PFL")
    if os.path.exists(default_pfl):
        try:
            params = _read_profile(default_pfl)

            # Detectar DB por dbms/type
            db_type_param = params.get("dbms/type", "").strip()
            if db_type_param:
                for sig, db_name in DB_SIGNATURES.items():
                    if sig.lower() == db_type_param.lower():
                        result["db_type"] = db_name
                        break

            logger.debug(f"Perfil DEFAULT.PFL leído: dbms/type={db_type_param}")

        except Exception as e:
            logger.debug(f"Error leyendo {default_pfl}: {e}")

    # ── Leer perfiles de instancia para detectar componentes ──
    instance_profiles = glob.glob(os.path.join(profile_dir, f"{sid}_*"))
    for profile_path in instance_profiles:
        try:
            params = _read_profile(profile_path)
            # Si tiene rdisp/wp_no_dia → es instancia ABAP
            if "rdisp/wp_no_dia" in params:
                result["product"] = "ABAP System"
        except Exception:
            continue


def _detect_db_from_filesystem(sid, result):
    """
    Detecta la base de datos por la estructura de directorios.

    Multiplataforma:
    - Linux/AIX/HP-UX: /usr/sap/<SID>/HDB*, /hana/data, /oracle, /db2, etc.
    - Windows: D:\\usr\\sap\\<SID>\\HDB*, busca en drives D:, E:, C:
    """
    from spektra_agent.platform_paths import get_sap_base_dir, OS_TYPE
    sap_base = get_sap_base_dir()

    # Rutas que siempre aplican (relativas al directorio SAP)
    checks = [
        (os.path.join(sap_base, sid, "HDB*"), "HANA"),
        (os.path.join(sap_base, sid, "ORA*"), "Oracle"),
        (os.path.join(sap_base, sid, "SYB*"), "ASE"),
    ]

    # Rutas adicionales específicas de Unix
    if OS_TYPE != "Windows":
        checks.extend([
            (f"/hana/data/{sid}", "HANA"),
            (f"/hana/shared/{sid}", "HANA"),
            (f"/oracle/{sid}", "Oracle"),
            (f"/db2/{sid}", "DB2"),
            (f"/sybase/{sid}", "ASE"),
            (f"/sapdb/{sid}", "MaxDB"),
        ])
    else:
        # En Windows, buscar en los drives comunes
        for drive in ["D:", "E:", "C:"]:
            checks.extend([
                (os.path.join(drive, os.sep, "hana", "data", sid), "HANA"),
                (os.path.join(drive, os.sep, "oracle", sid), "Oracle"),
                (os.path.join(drive, os.sep, "db2", sid), "DB2"),
            ])

    for pattern, db_name in checks:
        # Si el patrón tiene wildcard, usar glob
        if "*" in pattern:
            if glob.glob(pattern):
                result["db_type"] = db_name
                logger.debug(f"DB detectada por directorio: {pattern} → {db_name}")
                return
        else:
            if os.path.exists(pattern):
                result["db_type"] = db_name
                logger.debug(f"DB detectada por directorio: {pattern} → {db_name}")
                return

    # Verificar variable de entorno ORACLE_HOME
    if os.environ.get("ORACLE_HOME"):
        result["db_type"] = "Oracle"
        logger.debug("DB detectada por $ORACLE_HOME → Oracle")


def _refine_product_name(result):
    """
    Refina el nombre del producto basado en los componentes detectados.

    Prioridad:
    1. S4CORE → S/4HANA
    2. BW4HANA → BW/4HANA
    3. SAP_BW (sin BW4HANA) → BW
    4. ST / LMSERVICE → Solution Manager
    5. XI_MAIN → Process Orchestration
    6. SAP_ABA (solo) → ECC
    """
    component_names = [c["name"] for c in result.get("components", [])]

    for sig, product in PRODUCT_SIGNATURES.items():
        if sig in component_names:
            # S4CORE tiene prioridad sobre SAP_ABA
            if sig == "SAP_ABA" and "S4CORE" in component_names:
                continue
            # SAP_BW clásico solo si no hay BW4HANA
            if sig == "SAP_BW" and "BW4HANA" in component_names:
                continue
            result["product"] = product
            return

    # Si es HANA y hay instancias ABAP, asumir al menos un sistema ABAP
    if result["db_type"] == "HANA" and result["product"] == "Unknown":
        has_abap = any(
            i.get("type") in ("PAS", "AAS", "ABAP")
            for i in result.get("detected_instances", [])
        )
        if has_abap:
            result["product"] = "ABAP on HANA"


def _read_profile(filepath):
    """
    Lee un archivo de perfil SAP y retorna un dict de parámetros.

    Formato del perfil:
        parametro/subparametro = valor
        # Líneas de comentario
    """
    params = {}
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                params[key.strip()] = value.strip()
    return params


def _xml_text(element, path, namespaces):
    """Helper: extrae texto de un nodo XML."""
    node = element.find(path, namespaces)
    return node.text if node is not None and node.text else ""
