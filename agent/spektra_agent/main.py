"""
SAP Spektra Agent — Punto de entrada principal.

Este es el archivo que se ejecuta para arrancar el agente.
Hace lo siguiente en un loop infinito:
1. Detecta automáticamente el producto SAP y la base de datos
2. Recolecta métricas del SO (CPU, RAM, disco, red)
3. Recolecta métricas de SAP (instancias, work processes)
4. Recolecta métricas de la base de datos (HANA, Oracle, DB2, MSSQL, ASE, MaxDB)
5. Detecta metadata cloud (AWS, Azure, GCP)
6. Empaqueta todo en un JSON
7. Envía el JSON al backend central de SAP Spektra
8. Espera N segundos y repite

Uso:
    python -m spektra_agent.main --config config.yaml
"""

import sys
import time
import signal
import argparse
import logging
from datetime import datetime, timezone

from spektra_agent import __version__
from spektra_agent.config import load_config, setup_logging
from spektra_agent.credential_store import load_credentials
from spektra_agent.collectors import (
    os_collector,
    sap_collector,
    sap_detector,
    hana_collector,
    oracle_collector,
    db2_collector,
    mssql_collector,
    ase_collector,
    maxdb_collector,
    cloud_collector,
)
from spektra_agent.sender import send

logger = logging.getLogger("spektra-agent")

# Flag para detener el agente limpiamente con Ctrl+C o SIGTERM
_running = True

# Mapa de collectors de base de datos por tipo detectado
DB_COLLECTORS = {
    "HANA":   hana_collector,
    "Oracle": oracle_collector,
    "DB2":    db2_collector,
    "MSSQL":  mssql_collector,
    "ASE":    ase_collector,
    "MaxDB":  maxdb_collector,
}


def signal_handler(signum, frame):
    """Manejador de señales — permite detener el agente limpiamente."""
    global _running
    logger.info(f"Señal recibida ({signum}). Deteniendo agente...")
    _running = False


def detect_system(config):
    """
    Ejecuta la detección automática de producto SAP y base de datos.
    Se ejecuta UNA vez al arrancar el agente.

    Retorna el resultado de la detección y actualiza la config
    con la información detectada.
    """
    logger.info("Detectando producto SAP y base de datos...")

    try:
        detection = sap_detector.detect(config)
    except Exception as e:
        logger.error(f"Error en detección automática: {e}")
        detection = {
            "product": config.get("system", {}).get("type", "Unknown"),
            "db_type": config.get("system", {}).get("db_type", "Unknown"),
            "detected_instances": [],
            "components": [],
        }

    # Actualizar la config con lo detectado (si se detectó algo mejor)
    system_cfg = config.get("system", {})
    if detection.get("product") and detection["product"] != "Unknown":
        system_cfg["type"] = detection["product"]
    if detection.get("db_type") and detection["db_type"] != "Unknown":
        system_cfg["db_type"] = detection["db_type"]
    if detection.get("product_version"):
        system_cfg["product_version"] = detection["product_version"]
    if detection.get("kernel_version"):
        system_cfg["kernel_version"] = detection["kernel_version"]

    logger.info(f"  Producto: {system_cfg.get('type', '?')}")
    logger.info(f"  Base de datos: {system_cfg.get('db_type', '?')}")
    logger.info(f"  Kernel: {detection.get('kernel_version', '?')}")
    logger.info(f"  Instancias encontradas: {len(detection.get('detected_instances', []))}")

    # Si se detectaron instancias y no hay configuradas, usar las detectadas
    sap_cfg = config.get("sapcontrol", {})
    if detection.get("detected_instances") and not sap_cfg.get("instances"):
        sap_cfg["instances"] = detection["detected_instances"]
        logger.info("  Instancias auto-configuradas desde detección.")

    return detection


def collect_all(config, detection):
    """
    Ejecuta todos los collectors y arma el payload completo.

    Usa la detección para decidir qué collector de DB usar.
    """
    collection_cfg = config.get("collection", {})
    system_cfg = config.get("system", {})

    payload = {
        "agent_version": __version__,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "system": {
            "sid": system_cfg.get("sid", "???"),
            "type": system_cfg.get("type", ""),
            "environment": system_cfg.get("environment", ""),
            "description": system_cfg.get("description", ""),
            "db_type": system_cfg.get("db_type", ""),
            "product_version": system_cfg.get("product_version", ""),
            "kernel_version": system_cfg.get("kernel_version", ""),
        },
        "detection": {
            "components": detection.get("components", []),
            "detected_instances": detection.get("detected_instances", []),
        },
    }

    # ── 1. Métricas del Sistema Operativo ──
    if collection_cfg.get("os_metrics", True):
        try:
            payload["host"] = os_collector.collect(config)
        except Exception as e:
            logger.error(f"Error en OS collector: {e}")
            payload["host"] = {"error": str(e)}

    # ── 2. Metadata Cloud ──
    if collection_cfg.get("cloud_metadata", True):
        try:
            payload["cloud"] = cloud_collector.collect(config)
        except Exception as e:
            logger.error(f"Error en Cloud collector: {e}")
            payload["cloud"] = {"provider": "unknown", "error": str(e)}

    # ── 3. Métricas SAP (instancias, work processes) ──
    if collection_cfg.get("sap_metrics", True):
        try:
            payload["instances"] = sap_collector.collect(config)
        except Exception as e:
            logger.error(f"Error en SAP collector: {e}")
            payload["instances"] = []

    # ── 4. Métricas de Base de Datos (automático según detección) ──
    db_type = system_cfg.get("db_type", "").strip()
    db_collector = DB_COLLECTORS.get(db_type)

    if db_collector:
        try:
            db_data = db_collector.collect(config)
            if db_data:
                payload["database"] = db_data
            else:
                logger.debug(f"DB collector ({db_type}) retornó None — posible falta de config")
        except Exception as e:
            logger.error(f"Error en {db_type} collector: {e}")
            payload["database"] = {"status": "error", "type": db_type, "error": str(e)}
    else:
        if db_type and db_type != "Unknown":
            logger.warning(f"No hay collector implementado para base de datos: {db_type}")

    return payload


def run_cycle(config, detection):
    """Ejecuta un ciclo completo: recolectar + enviar."""
    start = time.time()

    logger.debug("Iniciando ciclo de recolección...")
    payload = collect_all(config, detection)

    elapsed_collect = round(time.time() - start, 2)
    logger.debug(f"Recolección completada en {elapsed_collect}s")

    # Enviar al backend
    success = send(payload, config)

    elapsed_total = round(time.time() - start, 2)
    sid = config.get("system", {}).get("sid", "???")
    status = "OK" if success else "FALLO"
    logger.info(f"Ciclo [{sid}]: {status} ({elapsed_total}s)")


def _inject_credentials(config):
    """
    Carga las credenciales encriptadas y las inyecta en la config.

    Las credenciales se guardaron con --setup y están encriptadas
    con una clave derivada de la identidad de esta máquina.
    Si no existen, el agente funciona con lo que haya en config.yaml
    o variables de entorno.
    """
    creds = load_credentials()
    if not creds:
        logger.debug("No hay credenciales encriptadas. Usando config.yaml / env vars.")
        return

    logger.info("Credenciales encriptadas cargadas correctamente.")

    # Inyectar credenciales de sapcontrol
    if "sapcontrol" in creds:
        sap_cfg = config.setdefault("sapcontrol", {})
        sap_cfg["username"] = creds["sapcontrol"]["username"]
        sap_cfg["password"] = creds["sapcontrol"]["password"]

    # Inyectar credenciales de base de datos
    if "database" in creds:
        db_creds = creds["database"]
        db_type = db_creds.get("type", "")

        if db_type == "HANA":
            hana_cfg = config.setdefault("hana", {})
            hana_cfg["host"] = db_creds.get("host", hana_cfg.get("host"))
            hana_cfg["port"] = db_creds.get("port", hana_cfg.get("port"))
            hana_cfg["username"] = db_creds["username"]
            hana_cfg["password"] = db_creds["password"]

        elif db_type == "Oracle":
            ora_cfg = config.setdefault("oracle", {})
            ora_cfg["host"] = db_creds.get("host", ora_cfg.get("host"))
            ora_cfg["port"] = db_creds.get("port", ora_cfg.get("port"))
            ora_cfg["service_name"] = db_creds.get("service_name", ora_cfg.get("service_name"))
            ora_cfg["username"] = db_creds["username"]
            ora_cfg["password"] = db_creds["password"]

        elif db_type == "DB2":
            db2_cfg = config.setdefault("db2", {})
            db2_cfg["hostname"] = db_creds.get("hostname", db2_cfg.get("hostname"))
            db2_cfg["port"] = db_creds.get("port", db2_cfg.get("port"))
            db2_cfg["database"] = db_creds.get("database", db2_cfg.get("database"))
            db2_cfg["username"] = db_creds["username"]
            db2_cfg["password"] = db_creds["password"]

        elif db_type in ("MSSQL", "ASE"):
            key = db_type.lower()
            db_cfg = config.setdefault(key, {})
            db_cfg["host"] = db_creds.get("host", db_cfg.get("host"))
            db_cfg["port"] = db_creds.get("port", db_cfg.get("port"))
            db_cfg["username"] = db_creds["username"]
            db_cfg["password"] = db_creds["password"]

        elif db_type == "MaxDB":
            maxdb_cfg = config.setdefault("maxdb", {})
            maxdb_cfg["database"] = db_creds.get("database", maxdb_cfg.get("database"))
            maxdb_cfg["username"] = db_creds["username"]
            maxdb_cfg["password"] = db_creds["password"]


def main():
    """Punto de entrada del agente."""
    # ── Parsear argumentos de línea de comandos ──
    parser = argparse.ArgumentParser(
        description="SAP Spektra Agent — Monitoreo de sistemas SAP"
    )
    parser.add_argument(
        "--config", "-c",
        default="config.yaml",
        help="Ruta al archivo de configuración (default: config.yaml)"
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Ejecutar solo un ciclo y salir (útil para pruebas)"
    )
    parser.add_argument(
        "--detect-only",
        action="store_true",
        help="Solo detectar producto y DB, mostrar resultado y salir"
    )
    parser.add_argument(
        "--setup",
        action="store_true",
        help="Ejecutar asistente de configuración (credenciales seguras)"
    )
    args = parser.parse_args()

    # ── Cargar configuración ──
    try:
        config = load_config(args.config)
    except FileNotFoundError:
        print(f"ERROR: No se encontró el archivo de configuración: {args.config}")
        print("Crea uno basándote en config.yaml.example")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR al leer configuración: {e}")
        sys.exit(1)

    # ── Configurar logging ──
    setup_logging(config)

    # ── Modo setup: asistente interactivo de credenciales ──
    if args.setup:
        from spektra_agent.setup_wizard import run as run_setup
        run_setup(config)
        return

    # ── Cargar credenciales encriptadas e inyectarlas en la config ──
    _inject_credentials(config)

    # ── Registrar señales para parada limpia ──
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    sid = config.get("system", {}).get("sid", "???")
    interval = config.get("collection", {}).get("interval", 60)

    logger.info("=" * 60)
    logger.info(f"SAP Spektra Agent v{__version__}")
    logger.info(f"Sistema: {sid}")
    logger.info("=" * 60)

    # ── Detección automática (se ejecuta una sola vez al arrancar) ──
    detection = detect_system(config)

    # ── Modo "solo detectar" ──
    if args.detect_only:
        import json
        print("\n=== Resultado de detección ===")
        print(json.dumps(detection, indent=2, ensure_ascii=False))
        print(f"\nProducto: {config.get('system', {}).get('type', '?')}")
        print(f"Base de datos: {config.get('system', {}).get('db_type', '?')}")
        print(f"Instancias: {len(detection.get('detected_instances', []))}")
        return

    logger.info("-" * 60)
    logger.info(f"Entorno: {config.get('system', {}).get('environment', '?')}")
    logger.info(f"Intervalo: {interval}s")
    logger.info(f"API: {config.get('api', {}).get('url', 'NO CONFIGURADA')}")
    logger.info(f"DB Collector: {config.get('system', {}).get('db_type', 'ninguno')}")
    logger.info("-" * 60)

    # ── Modo "una sola vez" (para pruebas) ──
    if args.once:
        logger.info("Modo --once: ejecutando un solo ciclo...")
        run_cycle(config, detection)
        logger.info("Ciclo completado. Saliendo.")
        return

    # ── Loop principal ──
    logger.info("Agente iniciado. Presiona Ctrl+C para detener.")

    while _running:
        try:
            run_cycle(config, detection)
        except Exception as e:
            logger.error(f"Error inesperado en ciclo: {e}", exc_info=True)

        # Esperar el intervalo, pero verificar _running cada segundo
        wait_until = time.time() + interval
        while _running and time.time() < wait_until:
            time.sleep(1)

    logger.info("Agente detenido.")


if __name__ == "__main__":
    main()
