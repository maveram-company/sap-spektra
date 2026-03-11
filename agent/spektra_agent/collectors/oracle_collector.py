"""
Collector de métricas de Oracle Database.

Se conecta a Oracle usando cx_Oracle (o oracledb) y consulta
vistas de monitoreo del diccionario de datos.

Vistas principales:
- V$INSTANCE → estado de la instancia
- V$SGA → memoria SGA
- V$PGA → memoria PGA
- DBA_TABLESPACES + DBA_DATA_FILES → uso de tablespaces
- V$SESSION → sesiones activas
- V$RMAN_BACKUP_JOB_DETAILS → estado del último backup
- V$ARCHIVE_LOG → estado de archive logs
- V$DATAGUARD_STATUS → estado de Data Guard (HA/DR)

Requisitos:
    pip install oracledb
    (o: pip install cx_Oracle + Oracle Instant Client)
"""

import logging

logger = logging.getLogger("spektra-agent")


def collect(config):
    """
    Recolecta métricas de Oracle Database.

    Retorna:
    {
        "status": "running",
        "version": "19.21.0",
        "instance_name": "EP1",
        "cpu_percent": 25.3,
        "memory": { "sga_gb": 48.0, "pga_gb": 8.5 },
        "tablespaces": [...],
        "sessions": { "total": 150, "active": 35 },
        "backup": { ... },
        "dataguard": { ... }
    }
    """
    ora_cfg = config.get("oracle", {})
    if not ora_cfg.get("host"):
        # Intentar leer de variables de entorno estándar de Oracle
        import os
        ora_cfg = {
            "host": os.environ.get("ORACLE_HOST", "localhost"),
            "port": int(os.environ.get("ORACLE_PORT", "1521")),
            "service_name": os.environ.get("ORACLE_SERVICE", ""),
            "username": os.environ.get("SPEKTRA_ORA_USERNAME", "SYSTEM"),
            "password": os.environ.get("SPEKTRA_ORA_PASSWORD", ""),
        }

    if not ora_cfg.get("service_name"):
        logger.debug("Oracle no configurado, saltando...")
        return None

    # Intentar importar oracledb (nuevo) o cx_Oracle (legado)
    db_module = _import_oracle_driver()
    if not db_module:
        return None

    conn = None
    try:
        dsn = f'{ora_cfg["host"]}:{ora_cfg.get("port", 1521)}/{ora_cfg["service_name"]}'
        conn = db_module.connect(
            user=ora_cfg.get("username", "SYSTEM"),
            password=ora_cfg.get("password", ""),
            dsn=dsn,
        )

        logger.debug("Conectado a Oracle, recolectando métricas...")

        data = {
            "status": "running",
            "type": "Oracle",
            "version": _get_version(conn),
            "instance": _get_instance_info(conn),
            "memory": _get_memory(conn),
            "tablespaces": _get_tablespaces(conn),
            "sessions": _get_sessions(conn),
            "backup": _get_backup_status(conn),
            "dataguard": _get_dataguard_status(conn),
            "archive_log": _get_archive_log_info(conn),
        }

        logger.debug(f"Oracle: sessions={data['sessions']}")
        return data

    except Exception as e:
        logger.error(f"Error conectando a Oracle: {e}")
        return {"status": "error", "type": "Oracle", "error": str(e)}
    finally:
        if conn:
            conn.close()


def _import_oracle_driver():
    """Intenta importar oracledb (nuevo) o cx_Oracle (legado)."""
    try:
        import oracledb
        return oracledb
    except ImportError:
        pass
    try:
        import cx_Oracle
        return cx_Oracle
    except ImportError:
        logger.warning(
            "Ni oracledb ni cx_Oracle están instalados. "
            "Instala con: pip install oracledb"
        )
        return None


def _get_version(conn):
    """Obtiene la versión de Oracle."""
    cursor = conn.cursor()
    cursor.execute("SELECT VERSION_FULL FROM V$INSTANCE")
    row = cursor.fetchone()
    cursor.close()
    return row[0] if row else "unknown"


def _get_instance_info(conn):
    """Información de la instancia Oracle."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            INSTANCE_NAME,
            HOST_NAME,
            STATUS,
            DATABASE_STATUS,
            INSTANCE_ROLE,
            STARTUP_TIME
        FROM V$INSTANCE
    """)
    row = cursor.fetchone()
    cursor.close()
    if not row:
        return {}
    return {
        "instance_name": row[0],
        "host_name": row[1],
        "status": row[2],
        "db_status": row[3],
        "role": row[4],
        "startup_time": str(row[5]) if row[5] else None,
    }


def _get_memory(conn):
    """Métricas de memoria: SGA + PGA."""
    cursor = conn.cursor()

    # SGA
    cursor.execute("SELECT SUM(VALUE) FROM V$SGA")
    sga_row = cursor.fetchone()
    sga_bytes = sga_row[0] if sga_row else 0

    # PGA
    cursor.execute("""
        SELECT VALUE FROM V$PGASTAT
        WHERE NAME = 'total PGA allocated'
    """)
    pga_row = cursor.fetchone()
    pga_bytes = pga_row[0] if pga_row else 0

    cursor.close()
    return {
        "sga_gb": round(sga_bytes / (1024 ** 3), 2),
        "pga_gb": round(pga_bytes / (1024 ** 3), 2),
        "total_gb": round((sga_bytes + pga_bytes) / (1024 ** 3), 2),
    }


def _get_tablespaces(conn):
    """Uso de tablespaces — equivalente a comprobar disco de la DB."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            df.TABLESPACE_NAME,
            ROUND(df.TOTAL_MB, 2) AS total_mb,
            ROUND(df.TOTAL_MB - NVL(fs.FREE_MB, 0), 2) AS used_mb,
            ROUND(NVL(fs.FREE_MB, 0), 2) AS free_mb,
            ROUND((df.TOTAL_MB - NVL(fs.FREE_MB, 0)) / df.TOTAL_MB * 100, 1) AS pct_used
        FROM (
            SELECT TABLESPACE_NAME, SUM(BYTES) / 1048576 AS TOTAL_MB
            FROM DBA_DATA_FILES
            GROUP BY TABLESPACE_NAME
        ) df
        LEFT JOIN (
            SELECT TABLESPACE_NAME, SUM(BYTES) / 1048576 AS FREE_MB
            FROM DBA_FREE_SPACE
            GROUP BY TABLESPACE_NAME
        ) fs ON df.TABLESPACE_NAME = fs.TABLESPACE_NAME
        ORDER BY pct_used DESC
    """)

    tablespaces = []
    for row in cursor.fetchall():
        tablespaces.append({
            "name": row[0],
            "total_mb": float(row[1]),
            "used_mb": float(row[2]),
            "free_mb": float(row[3]),
            "percent": float(row[4]),
        })

    cursor.close()
    return tablespaces


def _get_sessions(conn):
    """Conteo de sesiones activas."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN STATUS = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN STATUS = 'INACTIVE' THEN 1 ELSE 0 END) AS inactive
        FROM V$SESSION
        WHERE TYPE = 'USER'
    """)
    row = cursor.fetchone()
    cursor.close()
    return {
        "total": row[0] or 0,
        "active": row[1] or 0,
        "inactive": row[2] or 0,
    }


def _get_backup_status(conn):
    """Estado del último backup RMAN."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            INPUT_TYPE,
            STATUS,
            START_TIME,
            END_TIME,
            OUTPUT_BYTES_DISPLAY
        FROM V$RMAN_BACKUP_JOB_DETAILS
        WHERE INPUT_TYPE LIKE '%DB%'
        ORDER BY START_TIME DESC
        FETCH FIRST 1 ROWS ONLY
    """)
    row = cursor.fetchone()
    cursor.close()

    if not row:
        return {"status": "no_backup_found"}
    return {
        "type": row[0],
        "status": row[1],
        "start_time": str(row[2]) if row[2] else None,
        "end_time": str(row[3]) if row[3] else None,
        "size": row[4],
    }


def _get_dataguard_status(conn):
    """Estado de Oracle Data Guard (HA/DR)."""
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                DATABASE_ROLE,
                PROTECTION_MODE,
                PROTECTION_LEVEL,
                SWITCHOVER_STATUS
            FROM V$DATABASE
        """)
        row = cursor.fetchone()
        cursor.close()
        if not row:
            return {"enabled": False}
        return {
            "enabled": row[0] != "PRIMARY" or row[3] != "NOT ALLOWED",
            "role": row[0],
            "protection_mode": row[1],
            "protection_level": row[2],
            "switchover_status": row[3],
        }
    except Exception:
        cursor.close()
        return {"enabled": False}


def _get_archive_log_info(conn):
    """Información de archive logs."""
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                LOG_MODE,
                (SELECT COUNT(*) FROM V$ARCHIVED_LOG WHERE DELETED = 'NO') AS archived_count,
                (SELECT MAX(COMPLETION_TIME) FROM V$ARCHIVED_LOG) AS last_archive
            FROM V$DATABASE
        """)
        row = cursor.fetchone()
        cursor.close()
        return {
            "log_mode": row[0],
            "archived_count": row[1] or 0,
            "last_archive": str(row[2]) if row[2] else None,
        }
    except Exception:
        cursor.close()
        return {}
