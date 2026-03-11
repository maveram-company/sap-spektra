"""
Collector de métricas de SAP ASE (Adaptive Server Enterprise, antes Sybase).

Se conecta usando pymssql (compatible con el protocolo TDS de ASE)
y consulta tablas de monitoreo del sistema.

Tablas principales:
- master..monState → estado del servidor
- master..monProcessActivity → actividad de procesos
- master..sysdevices + master..sysusages → uso de dispositivos/disco
- master..sysdatabases → bases de datos
- sp_helpdb → información detallada de cada DB

Requisitos:
    pip install pymssql
"""

import logging

logger = logging.getLogger("spektra-agent")


def collect(config):
    """
    Recolecta métricas de SAP ASE.

    Retorna:
    {
        "status": "running",
        "version": "16.0 SP04",
        "type": "ASE",
        "databases": [...],
        "sessions": { ... },
        "memory": { ... },
        "engines": { ... },
        "backup": { ... }
    }
    """
    ase_cfg = config.get("ase", {})
    if not ase_cfg.get("host"):
        import os
        ase_cfg = {
            "host": os.environ.get("ASE_HOST", ""),
            "port": int(os.environ.get("ASE_PORT", "5000")),
            "database": os.environ.get("ASE_DATABASE", "master"),
            "username": os.environ.get("SPEKTRA_ASE_USERNAME", "sa"),
            "password": os.environ.get("SPEKTRA_ASE_PASSWORD", ""),
        }

    if not ase_cfg.get("host"):
        logger.debug("ASE no configurado, saltando...")
        return None

    try:
        import pymssql
    except ImportError:
        logger.warning("pymssql no está instalado. Instala con: pip install pymssql")
        return None

    conn = None
    try:
        conn = pymssql.connect(
            server=ase_cfg["host"],
            port=ase_cfg.get("port", 5000),
            user=ase_cfg.get("username", "sa"),
            password=ase_cfg.get("password", ""),
            database=ase_cfg.get("database", "master"),
        )

        logger.debug("Conectado a SAP ASE, recolectando métricas...")

        data = {
            "status": "running",
            "type": "ASE",
            "version": _get_version(conn),
            "databases": _get_databases(conn),
            "sessions": _get_sessions(conn),
            "engines": _get_engines(conn),
            "memory": _get_memory(conn),
            "backup": _get_backup_status(conn),
        }

        return data

    except Exception as e:
        logger.error(f"Error conectando a SAP ASE: {e}")
        return {"status": "error", "type": "ASE", "error": str(e)}
    finally:
        if conn:
            conn.close()


def _get_version(conn):
    """Versión de ASE."""
    cursor = conn.cursor()
    cursor.execute("SELECT @@version")
    row = cursor.fetchone()
    cursor.close()
    if row:
        return row[0].split("\n")[0].strip()
    return "unknown"


def _get_databases(conn):
    """Bases de datos con uso de espacio."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            db.name,
            CEILING(SUM(u.size) * @@maxpagesize / 1048576.0) AS total_mb,
            db.status
        FROM master..sysdatabases db
        JOIN master..sysusages u ON db.dbid = u.dbid
        WHERE db.dbid > 3
        GROUP BY db.name, db.status
        ORDER BY total_mb DESC
    """)

    databases = []
    for row in cursor.fetchall():
        databases.append({
            "name": row[0],
            "total_mb": round(float(row[1]), 2) if row[1] else 0,
            "status": row[2],
        })

    cursor.close()

    # Para cada DB, intentar obtener espacio usado con sp_spaceused
    for db_info in databases:
        try:
            cursor = conn.cursor()
            cursor.execute(f"USE [{db_info['name']}]")
            cursor.execute("sp_spaceused")
            row = cursor.fetchone()
            if row:
                # sp_spaceused retorna strings con unidades: "1234 MB"
                db_size_str = str(row[0]).replace("MB", "").replace("KB", "").strip()
                try:
                    db_info["used_mb"] = round(float(db_size_str), 2)
                except ValueError:
                    pass
            cursor.close()
        except Exception:
            pass
        finally:
            # Volver a master
            try:
                cursor = conn.cursor()
                cursor.execute("USE master")
                cursor.close()
            except Exception:
                pass

    return databases


def _get_sessions(conn):
    """Sesiones/procesos activos."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'runnable' OR status = 'running' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status = 'sleeping' THEN 1 ELSE 0 END) AS sleeping
        FROM master..sysprocesses
        WHERE hostprocess IS NOT NULL
    """)
    row = cursor.fetchone()
    cursor.close()
    return {
        "total": row[0] or 0,
        "active": row[1] or 0,
        "sleeping": row[2] or 0,
    }


def _get_engines(conn):
    """Estado de los engines (CPUs) de ASE."""
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                EngineNumber,
                Status,
                Utilization
            FROM master..monEngine
        """)
        engines = []
        for row in cursor.fetchall():
            engines.append({
                "engine": row[0],
                "status": row[1],
                "utilization": float(row[2]) if row[2] else 0,
            })
        cursor.close()

        avg_util = sum(e["utilization"] for e in engines) / len(engines) if engines else 0
        return {
            "count": len(engines),
            "avg_utilization": round(avg_util, 1),
            "engines": engines,
        }
    except Exception:
        cursor.close()
        return {"count": 0, "avg_utilization": 0}


def _get_memory(conn):
    """Uso de memoria de ASE."""
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                @@total_physical_memory_kb / 1024 AS total_mb,
                (SELECT SUM(ConfigValue)
                 FROM master..sysconfigures
                 WHERE name LIKE '%memory%' AND name LIKE '%max%') AS max_memory_pages
            FROM master..monState
        """)
        row = cursor.fetchone()
        cursor.close()
        return {
            "total_physical_mb": int(row[0]) if row and row[0] else 0,
        }
    except Exception:
        cursor.close()
        return {}


def _get_backup_status(conn):
    """Último backup de dump database."""
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT TOP 1
                dbname,
                type,
                start_time,
                finish_time
            FROM master..syslogshold
            ORDER BY start_time DESC
        """)
        row = cursor.fetchone()
        cursor.close()
        if not row:
            return {"status": "no_backup_found"}
        return {
            "database": row[0],
            "type": row[1],
            "start_time": str(row[2]) if row[2] else None,
            "end_time": str(row[3]) if row[3] else None,
        }
    except Exception:
        cursor.close()
        return {"status": "no_backup_found"}
