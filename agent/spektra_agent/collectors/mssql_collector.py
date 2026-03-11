"""
Collector de métricas de Microsoft SQL Server.

Se conecta usando pymssql y consulta DMVs (Dynamic Management Views).

Vistas principales:
- sys.dm_os_sys_info → información del sistema
- sys.dm_exec_sessions → sesiones activas
- sys.master_files + FILEPROPERTY → uso de archivos de datos
- msdb.dbo.backupset → historial de backups
- sys.dm_hadr_availability_replica_states → estado de Always On AG

Requisitos:
    pip install pymssql
"""

import logging

logger = logging.getLogger("spektra-agent")


def collect(config):
    """
    Recolecta métricas de SQL Server.

    Retorna:
    {
        "status": "running",
        "version": "SQL Server 2019",
        "type": "MSSQL",
        "databases": [...],
        "sessions": { "total": 95, "active": 20 },
        "memory": { ... },
        "backup": { ... },
        "always_on": { ... }
    }
    """
    mssql_cfg = config.get("mssql", {})
    if not mssql_cfg.get("host"):
        import os
        mssql_cfg = {
            "host": os.environ.get("MSSQL_HOST", ""),
            "port": int(os.environ.get("MSSQL_PORT", "1433")),
            "database": os.environ.get("MSSQL_DATABASE", "master"),
            "username": os.environ.get("SPEKTRA_MSSQL_USERNAME", "sa"),
            "password": os.environ.get("SPEKTRA_MSSQL_PASSWORD", ""),
        }

    if not mssql_cfg.get("host"):
        logger.debug("MSSQL no configurado, saltando...")
        return None

    try:
        import pymssql
    except ImportError:
        logger.warning("pymssql no está instalado. Instala con: pip install pymssql")
        return None

    conn = None
    try:
        conn = pymssql.connect(
            server=mssql_cfg["host"],
            port=mssql_cfg.get("port", 1433),
            user=mssql_cfg.get("username", "sa"),
            password=mssql_cfg.get("password", ""),
            database=mssql_cfg.get("database", "master"),
        )

        logger.debug("Conectado a SQL Server, recolectando métricas...")

        data = {
            "status": "running",
            "type": "MSSQL",
            "version": _get_version(conn),
            "databases": _get_databases(conn),
            "sessions": _get_sessions(conn),
            "memory": _get_memory(conn),
            "cpu": _get_cpu(conn),
            "backup": _get_backup_status(conn),
            "always_on": _get_always_on_status(conn),
        }

        return data

    except Exception as e:
        logger.error(f"Error conectando a SQL Server: {e}")
        return {"status": "error", "type": "MSSQL", "error": str(e)}
    finally:
        if conn:
            conn.close()


def _get_version(conn):
    """Versión de SQL Server."""
    cursor = conn.cursor()
    cursor.execute("SELECT @@VERSION")
    row = cursor.fetchone()
    cursor.close()
    if row:
        # Tomar solo la primera línea
        return row[0].split("\n")[0].strip()
    return "unknown"


def _get_databases(conn):
    """Tamaño y uso de cada base de datos."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            db.name,
            CAST(SUM(mf.size) * 8.0 / 1024 AS DECIMAL(10,2)) AS total_mb,
            CAST(SUM(CASE WHEN mf.type = 0
                THEN CAST(FILEPROPERTY(mf.name, 'SpaceUsed') AS BIGINT) * 8.0 / 1024
                ELSE 0 END) AS DECIMAL(10,2)) AS used_mb,
            db.state_desc
        FROM sys.databases db
        JOIN sys.master_files mf ON db.database_id = mf.database_id
        WHERE db.database_id > 4  -- Excluir DBs del sistema
        GROUP BY db.name, db.state_desc
        ORDER BY total_mb DESC
    """)

    databases = []
    for row in cursor.fetchall():
        total = float(row[1]) if row[1] else 0
        used = float(row[2]) if row[2] else 0
        pct = round((used / total * 100), 1) if total > 0 else 0
        databases.append({
            "name": row[0],
            "total_mb": total,
            "used_mb": used,
            "percent": pct,
            "state": row[3],
        })

    cursor.close()
    return databases


def _get_sessions(conn):
    """Sesiones activas."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status = 'sleeping' THEN 1 ELSE 0 END) AS sleeping
        FROM sys.dm_exec_sessions
        WHERE is_user_process = 1
    """)
    row = cursor.fetchone()
    cursor.close()
    return {
        "total": row[0] or 0,
        "active": row[1] or 0,
        "sleeping": row[2] or 0,
    }


def _get_memory(conn):
    """Uso de memoria de SQL Server."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            physical_memory_kb / 1024 AS physical_mb,
            committed_kb / 1024 AS committed_mb,
            committed_target_kb / 1024 AS target_mb
        FROM sys.dm_os_sys_info
    """)
    row = cursor.fetchone()
    cursor.close()
    if not row:
        return {}
    committed = row[1] or 0
    target = row[2] or 0
    return {
        "physical_mb": row[0] or 0,
        "committed_mb": committed,
        "target_mb": target,
        "percent": round((committed / target * 100), 1) if target > 0 else 0,
    }


def _get_cpu(conn):
    """Uso de CPU reciente de SQL Server."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT TOP 1
            SQLProcessUtilization AS sql_cpu,
            100 - SystemIdle AS total_cpu
        FROM (
            SELECT
                record.value('(./Record/SchedulerMonitorEvent/SystemHealth/SQLProcessUtilization)[1]', 'int') AS SQLProcessUtilization,
                record.value('(./Record/SchedulerMonitorEvent/SystemHealth/SystemIdle)[1]', 'int') AS SystemIdle
            FROM (
                SELECT CAST(record AS XML) AS record
                FROM sys.dm_os_ring_buffers
                WHERE ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR'
                AND record LIKE N'%<SystemHealth>%'
            ) AS x
        ) AS y
        ORDER BY total_cpu DESC
    """)
    row = cursor.fetchone()
    cursor.close()
    if not row:
        return {}
    return {
        "sql_cpu_percent": row[0] or 0,
        "total_cpu_percent": row[1] or 0,
    }


def _get_backup_status(conn):
    """Último backup de cada base de datos."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            bs.database_name,
            bs.type AS backup_type,
            MAX(bs.backup_finish_date) AS last_backup,
            MAX(CASE WHEN bs.is_damaged = 0 THEN 'successful' ELSE 'failed' END) AS status
        FROM msdb.dbo.backupset bs
        WHERE bs.database_name NOT IN ('master', 'model', 'msdb', 'tempdb')
        GROUP BY bs.database_name, bs.type
        ORDER BY last_backup DESC
    """)

    backups = []
    for row in cursor.fetchall():
        backups.append({
            "database": row[0],
            "type": "Full" if row[1] == "D" else "Differential" if row[1] == "I" else "Log",
            "last_backup": str(row[2]) if row[2] else None,
            "status": row[3],
        })
    cursor.close()
    return backups[:5]  # Top 5 más recientes


def _get_always_on_status(conn):
    """Estado de Always On Availability Groups."""
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                ag.name AS ag_name,
                ars.role_desc,
                ars.operational_state_desc,
                ars.synchronization_health_desc
            FROM sys.dm_hadr_availability_replica_states ars
            JOIN sys.availability_groups ag ON ars.group_id = ag.group_id
            WHERE ars.is_local = 1
        """)
        rows = cursor.fetchall()
        cursor.close()

        if not rows:
            return {"enabled": False}

        groups = []
        for row in rows:
            groups.append({
                "group_name": row[0],
                "role": row[1],
                "state": row[2],
                "sync_health": row[3],
            })
        return {"enabled": True, "groups": groups}

    except Exception:
        cursor.close()
        return {"enabled": False}
