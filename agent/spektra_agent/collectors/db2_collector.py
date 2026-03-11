"""
Collector de métricas de IBM DB2.

Se conecta a DB2 usando ibm_db y consulta vistas de monitoreo.

Vistas principales:
- SYSIBMADM.TBSP_UTILIZATION → uso de tablespaces
- SYSIBMADM.SNAPDB → snapshot de la base de datos
- SYSIBMADM.APPLICATIONS → aplicaciones/sesiones conectadas
- SYSIBMADM.DB_HISTORY → historial de backups
- SYSIBMADM.HADR_PEER_WINDOW → estado de HADR (HA/DR)

Requisitos:
    pip install ibm_db
"""

import logging

logger = logging.getLogger("spektra-agent")


def collect(config):
    """
    Recolecta métricas de DB2.

    Retorna:
    {
        "status": "running",
        "version": "11.5.8",
        "type": "DB2",
        "tablespaces": [...],
        "sessions": { "total": 80, "active": 12 },
        "memory": { ... },
        "backup": { ... },
        "hadr": { ... }
    }
    """
    db2_cfg = config.get("db2", {})
    if not db2_cfg.get("database"):
        # Intentar variables de entorno
        import os
        db2_cfg = {
            "database": os.environ.get("DB2_DATABASE", ""),
            "hostname": os.environ.get("DB2_HOST", "localhost"),
            "port": os.environ.get("DB2_PORT", "50000"),
            "username": os.environ.get("SPEKTRA_DB2_USERNAME", "db2adm"),
            "password": os.environ.get("SPEKTRA_DB2_PASSWORD", ""),
        }

    if not db2_cfg.get("database"):
        logger.debug("DB2 no configurado, saltando...")
        return None

    try:
        import ibm_db
    except ImportError:
        logger.warning("ibm_db no está instalado. Instala con: pip install ibm_db")
        return None

    conn = None
    try:
        conn_str = (
            f"DATABASE={db2_cfg['database']};"
            f"HOSTNAME={db2_cfg.get('hostname', 'localhost')};"
            f"PORT={db2_cfg.get('port', '50000')};"
            f"PROTOCOL=TCPIP;"
            f"UID={db2_cfg.get('username', '')};"
            f"PWD={db2_cfg.get('password', '')};"
        )
        conn = ibm_db.connect(conn_str, "", "")

        logger.debug("Conectado a DB2, recolectando métricas...")

        data = {
            "status": "running",
            "type": "DB2",
            "version": _get_version(conn, ibm_db),
            "tablespaces": _get_tablespaces(conn, ibm_db),
            "sessions": _get_sessions(conn, ibm_db),
            "memory": _get_memory(conn, ibm_db),
            "backup": _get_backup_status(conn, ibm_db),
            "hadr": _get_hadr_status(conn, ibm_db),
        }

        return data

    except Exception as e:
        logger.error(f"Error conectando a DB2: {e}")
        return {"status": "error", "type": "DB2", "error": str(e)}
    finally:
        if conn:
            ibm_db.close(conn)


def _query(conn, ibm_db, sql):
    """Ejecuta una query y retorna las filas como lista de tuplas."""
    stmt = ibm_db.exec_immediate(conn, sql)
    rows = []
    row = ibm_db.fetch_tuple(stmt)
    while row:
        rows.append(row)
        row = ibm_db.fetch_tuple(stmt)
    return rows


def _get_version(conn, ibm_db):
    """Versión de DB2."""
    rows = _query(conn, ibm_db, "SELECT SERVICE_LEVEL FROM SYSIBMADM.ENV_INST_INFO FETCH FIRST 1 ROWS ONLY")
    return rows[0][0] if rows else "unknown"


def _get_tablespaces(conn, ibm_db):
    """Uso de tablespaces."""
    rows = _query(conn, ibm_db, """
        SELECT
            TBSP_NAME,
            TBSP_TOTAL_SIZE_KB / 1024 AS total_mb,
            TBSP_USED_SIZE_KB / 1024 AS used_mb,
            TBSP_FREE_SIZE_KB / 1024 AS free_mb,
            TBSP_UTILIZATION_PERCENT
        FROM SYSIBMADM.TBSP_UTILIZATION
        ORDER BY TBSP_UTILIZATION_PERCENT DESC
    """)

    tablespaces = []
    for row in rows:
        tablespaces.append({
            "name": row[0],
            "total_mb": round(float(row[1]), 2) if row[1] else 0,
            "used_mb": round(float(row[2]), 2) if row[2] else 0,
            "free_mb": round(float(row[3]), 2) if row[3] else 0,
            "percent": round(float(row[4]), 1) if row[4] else 0,
        })
    return tablespaces


def _get_sessions(conn, ibm_db):
    """Sesiones conectadas."""
    rows = _query(conn, ibm_db, """
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN APPL_STATUS = 'UOWEXEC' THEN 1 ELSE 0 END) AS active
        FROM SYSIBMADM.APPLICATIONS
    """)
    if rows:
        return {"total": int(rows[0][0] or 0), "active": int(rows[0][1] or 0)}
    return {"total": 0, "active": 0}


def _get_memory(conn, ibm_db):
    """Uso de memoria del buffer pool."""
    rows = _query(conn, ibm_db, """
        SELECT
            BP_NAME,
            POOL_DATA_L_READS + POOL_INDEX_L_READS AS logical_reads,
            POOL_DATA_P_READS + POOL_INDEX_P_READS AS physical_reads
        FROM SYSIBMADM.BP_READ_IO
    """)

    pools = []
    for row in rows:
        logical = int(row[1] or 0)
        physical = int(row[2] or 0)
        hit_ratio = round((1 - physical / logical) * 100, 1) if logical > 0 else 100
        pools.append({
            "name": row[0],
            "logical_reads": logical,
            "physical_reads": physical,
            "hit_ratio": hit_ratio,
        })
    return {"buffer_pools": pools}


def _get_backup_status(conn, ibm_db):
    """Último backup."""
    rows = _query(conn, ibm_db, """
        SELECT
            OPERATION,
            OPERATIONTYPE,
            START_TIME,
            END_TIME,
            SQLCODE
        FROM SYSIBMADM.DB_HISTORY
        WHERE OPERATION = 'B'
        ORDER BY START_TIME DESC
        FETCH FIRST 1 ROWS ONLY
    """)
    if not rows:
        return {"status": "no_backup_found"}
    return {
        "type": "Full" if rows[0][1] == "F" else "Incremental" if rows[0][1] == "I" else rows[0][1],
        "status": "successful" if rows[0][4] == 0 else "failed",
        "start_time": str(rows[0][2]) if rows[0][2] else None,
        "end_time": str(rows[0][3]) if rows[0][3] else None,
    }


def _get_hadr_status(conn, ibm_db):
    """Estado de HADR (High Availability Disaster Recovery)."""
    try:
        rows = _query(conn, ibm_db, """
            SELECT
                HADR_ROLE,
                HADR_STATE,
                HADR_SYNCMODE,
                HADR_CONNECT_STATUS,
                HADR_LOG_GAP
            FROM SYSIBMADM.SNAPHADR
            FETCH FIRST 1 ROWS ONLY
        """)
        if not rows:
            return {"enabled": False}
        return {
            "enabled": True,
            "role": rows[0][0],
            "state": rows[0][1],
            "sync_mode": rows[0][2],
            "connect_status": rows[0][3],
            "log_gap": rows[0][4],
        }
    except Exception:
        return {"enabled": False}
