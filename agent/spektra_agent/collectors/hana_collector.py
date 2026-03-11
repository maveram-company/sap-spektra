"""
Collector de métricas de SAP HANA Database.

Se conecta directamente a HANA usando la librería hdbcli
y consulta vistas de monitoreo del esquema SYS.

Vistas principales:
- M_HOST_RESOURCE_UTILIZATION → CPU y memoria por host
- M_DISK_USAGE → espacio usado en disco (data, log, trace)
- M_BACKUP_CATALOG → estado del último backup
- M_SYSTEM_REPLICATION → estado de replicación HA/DR
- M_DATABASE → información general de la base de datos
"""

import logging

logger = logging.getLogger("spektra-agent")


def collect(config):
    """
    Recolecta métricas de HANA Database.

    Retorna un diccionario con:
    {
        "status": "running",
        "version": "2.00.070",
        "cpu_percent": 30.5,
        "memory_percent": 65.0,
        "memory_total_gb": 512,
        "memory_used_gb": 332.8,
        "disk_data_percent": 55.0,
        "disk_log_percent": 25.0,
        "backup": { ... },
        "replication": { ... },
        "alerts": [ ... ]
    }
    """
    hana_cfg = config.get("hana", {})

    if not hana_cfg.get("host"):
        logger.debug("HANA no configurado, saltando...")
        return None

    # Intentar importar hdbcli — es opcional
    try:
        from hdbcli import dbapi
    except ImportError:
        logger.warning(
            "hdbcli no está instalado. Para monitorear HANA, instálalo con: "
            "pip install hdbcli"
        )
        return None

    conn = None
    try:
        # ── Conectar a HANA ──
        conn = dbapi.connect(
            address=hana_cfg["host"],
            port=hana_cfg.get("port", 30015),
            user=hana_cfg.get("username", "SYSTEM"),
            password=hana_cfg.get("password", ""),
            encrypt=hana_cfg.get("encrypt", True),
        )

        logger.debug("Conectado a HANA, recolectando métricas...")

        data = {
            "status": "running",
            "version": _get_version(conn),
            **_get_resource_utilization(conn),
            "disk": _get_disk_usage(conn),
            "backup": _get_backup_status(conn),
            "replication": _get_replication_status(conn),
            "alerts": _get_alerts(conn),
        }

        logger.debug(
            f"HANA: CPU={data.get('cpu_percent')}%, "
            f"MEM={data.get('memory_percent')}%"
        )

        return data

    except Exception as e:
        logger.error(f"Error conectando a HANA: {e}")
        return {
            "status": "error",
            "error": str(e),
        }
    finally:
        if conn:
            conn.close()


def _get_version(conn):
    """Obtiene la versión de HANA."""
    cursor = conn.cursor()
    cursor.execute("SELECT VERSION FROM M_DATABASE")
    row = cursor.fetchone()
    cursor.close()
    return row[0] if row else "unknown"


def _get_resource_utilization(conn):
    """
    CPU y memoria del host donde corre HANA.
    Vista: SYS.M_HOST_RESOURCE_UTILIZATION
    """
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            HOST,
            TO_DECIMAL(ROUND(CPU, 2)) AS cpu_percent,
            USED_PHYSICAL_MEMORY,
            FREE_PHYSICAL_MEMORY
        FROM SYS.M_HOST_RESOURCE_UTILIZATION
    """)
    row = cursor.fetchone()
    cursor.close()

    if not row:
        return {"cpu_percent": 0, "memory_percent": 0, "memory_total_gb": 0, "memory_used_gb": 0}

    used_bytes = row[2] or 0
    free_bytes = row[3] or 0
    total_bytes = used_bytes + free_bytes
    mem_percent = round((used_bytes / total_bytes * 100), 1) if total_bytes > 0 else 0

    return {
        "hana_host": row[0],
        "cpu_percent": float(row[1]) if row[1] else 0,
        "memory_percent": mem_percent,
        "memory_total_gb": round(total_bytes / (1024 ** 3), 2),
        "memory_used_gb": round(used_bytes / (1024 ** 3), 2),
    }


def _get_disk_usage(conn):
    """
    Uso de disco de HANA (data, log, trace).
    Vista: SYS.M_DISK_USAGE
    """
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            USAGE_TYPE,
            SUM(USED_SIZE) AS used_bytes,
            SUM(TOTAL_SIZE) AS total_bytes
        FROM SYS.M_DISK_USAGE
        GROUP BY USAGE_TYPE
    """)

    disks = {}
    for row in cursor.fetchall():
        usage_type = row[0]  # DATA, LOG, TRACE, etc.
        used = row[1] or 0
        total = row[2] or 0
        percent = round((used / total * 100), 1) if total > 0 else 0

        disks[usage_type.lower()] = {
            "used_gb": round(used / (1024 ** 3), 2),
            "total_gb": round(total / (1024 ** 3), 2),
            "percent": percent,
        }

    cursor.close()
    return disks


def _get_backup_status(conn):
    """
    Estado del último backup completo.
    Vista: SYS.M_BACKUP_CATALOG
    """
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            ENTRY_TYPE_NAME,
            STATE_NAME,
            UTC_START_TIME,
            UTC_END_TIME,
            COMMENT
        FROM SYS.M_BACKUP_CATALOG
        WHERE ENTRY_TYPE_NAME = 'complete data backup'
        ORDER BY UTC_START_TIME DESC
        LIMIT 1
    """)
    row = cursor.fetchone()
    cursor.close()

    if not row:
        return {"status": "no_backup_found", "last_backup": None}

    return {
        "type": row[0],
        "status": row[1],  # "successful", "failed", "running"
        "start_time": str(row[2]) if row[2] else None,
        "end_time": str(row[3]) if row[3] else None,
        "comment": row[4],
    }


def _get_replication_status(conn):
    """
    Estado de System Replication (HSR) para Alta Disponibilidad.
    Vista: SYS.M_SYSTEM_REPLICATION
    """
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                SITE_NAME,
                REPLICATION_MODE,
                REPLICATION_STATUS,
                REPLICATION_STATUS_DETAILS
            FROM SYS.M_SYSTEM_REPLICATION
        """)
        rows = cursor.fetchall()
        cursor.close()

        if not rows:
            return {"enabled": False}

        sites = []
        for row in rows:
            sites.append({
                "site_name": row[0],
                "mode": row[1],        # PRIMARY, SYNC, ASYNC, etc.
                "status": row[2],      # ACTIVE, ERROR, UNKNOWN
                "details": row[3],
            })

        return {"enabled": True, "sites": sites}

    except Exception:
        cursor.close()
        return {"enabled": False, "error": "Vista no disponible"}


def _get_alerts(conn):
    """
    Alertas activas de HANA.
    Vista: SYS._SYS_STATISTICS.STATISTICS_CURRENT_ALERTS
    """
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                ALERT_ID,
                ALERT_RATING,
                ALERT_NAME,
                ALERT_DETAILS,
                ALERT_TIMESTAMP
            FROM _SYS_STATISTICS.STATISTICS_CURRENT_ALERTS
            WHERE ALERT_RATING >= 3
            ORDER BY ALERT_TIMESTAMP DESC
            LIMIT 20
        """)
        alerts = []
        for row in cursor.fetchall():
            alerts.append({
                "id": row[0],
                "rating": row[1],     # 1=Info, 2=Low, 3=Medium, 4=High, 5=Critical
                "name": row[2],
                "details": row[3],
                "timestamp": str(row[4]) if row[4] else None,
            })
        cursor.close()
        return alerts
    except Exception:
        cursor.close()
        return []
