"""
Collector de métricas SAP via sapcontrol SOAP API.

sapcontrol es un servicio web que corre en CADA instancia SAP.
Se accede por HTTP en el puerto 5<NR>13 (ej: 50113 para instancia 01).

Funciones que usamos:
- GetSystemInstanceList → lista de todas las instancias del sistema
- GetProcessList → procesos de una instancia (disp+work, igswd, etc.)
- ABAPGetWPTable → tabla de work processes (diálogo, batch, update, etc.)
"""

import logging
import requests
from lxml import etree

logger = logging.getLogger("spektra-agent")

# ── Timeout para peticiones HTTP a sapcontrol ──
TIMEOUT = 15


def collect(config):
    """
    Recolecta métricas SAP de todas las instancias configuradas.

    Retorna una lista de diccionarios, uno por instancia:
    [
        {
            "instance_nr": "01",
            "type": "PAS",
            "hostname": "sap-ep1-app01",
            "status": "running",
            "processes": [...],
            "work_processes": { "dialog": {...}, "batch": {...} }
        },
        ...
    ]
    """
    sap_cfg = config.get("sapcontrol", {})
    instances_cfg = sap_cfg.get("instances", [])
    username = sap_cfg.get("username", "")
    password = sap_cfg.get("password", "")

    instances = []

    for inst_cfg in instances_cfg:
        inst_nr = inst_cfg["instance_nr"]
        hostname = inst_cfg.get("hostname", "localhost")
        inst_type = inst_cfg.get("type", "UNKNOWN")
        http_port = inst_cfg.get("http_port", int(f"5{inst_nr}13"))

        base_url = f"http://{hostname}:{http_port}"
        auth = (username, password) if username else None

        logger.debug(f"Consultando instancia {inst_nr} ({inst_type}) en {base_url}")

        instance_data = {
            "instance_nr": inst_nr,
            "type": inst_type,
            "hostname": hostname,
            "port": http_port,
            "status": "unknown",
            "processes": [],
            "work_processes": {},
        }

        # ── Obtener lista de procesos ──
        try:
            processes = _get_process_list(base_url, auth)
            instance_data["processes"] = processes

            # El estado de la instancia se determina por sus procesos
            if all(p["status"] == "GREEN" for p in processes):
                instance_data["status"] = "running"
            elif any(p["status"] == "RED" for p in processes):
                instance_data["status"] = "error"
            elif any(p["status"] == "YELLOW" for p in processes):
                instance_data["status"] = "warning"
            else:
                instance_data["status"] = "unknown"

        except Exception as e:
            logger.warning(f"Error al consultar procesos de instancia {inst_nr}: {e}")
            instance_data["status"] = "unreachable"

        # ── Obtener work processes (solo para instancias ABAP: PAS, AAS) ──
        if inst_type in ("PAS", "AAS"):
            try:
                wp_data = _get_work_processes(base_url, auth)
                instance_data["work_processes"] = wp_data
            except Exception as e:
                logger.warning(f"Error al consultar work processes de instancia {inst_nr}: {e}")

        instances.append(instance_data)

    logger.info(f"SAP: {len(instances)} instancias consultadas")
    return instances


def _soap_request(base_url, action, auth=None):
    """
    Envía una petición SOAP a sapcontrol y retorna el XML de respuesta.

    Cada función de sapcontrol se llama con un "body" SOAP específico.
    La respuesta es XML que parseamos con lxml.
    """
    # Envelope SOAP mínimo — sapcontrol acepta este formato
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


def _get_process_list(base_url, auth=None):
    """
    Obtiene la lista de procesos SAP de una instancia.

    Ejemplo de procesos que retorna:
    - disp+work (Dispatcher + Work Processes)
    - igswd (Internet Graphics Server)
    - gwrd (SAP Gateway)
    - icman (Internet Communication Manager)
    """
    tree = _soap_request(base_url, "GetProcessList", auth)

    # Buscar todos los elementos "item" dentro de la respuesta
    ns = {"ns": "urn:SAPControl"}
    items = tree.findall(".//ns:item", ns)

    processes = []
    for item in items:
        name = _xml_text(item, "ns:name", ns)
        status = _xml_text(item, "ns:dispstatus", ns)
        description = _xml_text(item, "ns:description", ns)
        pid = _xml_text(item, "ns:pid", ns)
        start_time = _xml_text(item, "ns:starttime", ns)
        elapsed = _xml_text(item, "ns:elapsedtime", ns)

        processes.append({
            "name": name,
            "description": description,
            "status": status,  # GREEN, YELLOW, RED, GRAY
            "pid": int(pid) if pid else 0,
            "start_time": start_time,
            "elapsed_time": elapsed,
        })

    return processes


def _get_work_processes(base_url, auth=None):
    """
    Obtiene la tabla de work processes (ABAPGetWPTable).

    Work processes son los "hilos" de SAP que procesan solicitudes:
    - DIA (Dialog) — procesan solicitudes de usuarios en tiempo real
    - BTC (Batch) — procesan jobs en background
    - UPD (Update) — procesan actualizaciones a la base de datos
    - SPO (Spool) — procesan impresiones
    """
    tree = _soap_request(base_url, "ABAPGetWPTable", auth)

    ns = {"ns": "urn:SAPControl"}
    items = tree.findall(".//ns:item", ns)

    # Contar work processes por tipo
    counts = {}
    for item in items:
        wp_type = _xml_text(item, "ns:Typ", ns) or "UNKNOWN"
        wp_status = _xml_text(item, "ns:Status", ns) or ""

        if wp_type not in counts:
            counts[wp_type] = {"total": 0, "busy": 0, "free": 0}

        counts[wp_type]["total"] += 1

        # "Run" o "Hold" = busy, el resto = free
        if wp_status.lower() in ("run", "hold", "on hold"):
            counts[wp_type]["busy"] += 1
        else:
            counts[wp_type]["free"] += 1

    # Mapear a nombres más legibles
    result = {}
    type_map = {"DIA": "dialog", "BTC": "batch", "UPD": "update", "SPO": "spool"}
    for sap_type, friendly_name in type_map.items():
        if sap_type in counts:
            result[friendly_name] = counts[sap_type]

    return result


def _xml_text(element, path, namespaces):
    """Helper: extrae el texto de un elemento XML, o retorna cadena vacía."""
    node = element.find(path, namespaces)
    return node.text if node is not None and node.text else ""
