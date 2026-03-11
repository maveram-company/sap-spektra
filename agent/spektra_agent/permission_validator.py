"""
Validador de permisos de base de datos.

Después de que el usuario ingresa credenciales, este módulo verifica
que el usuario de BD tenga todos los permisos necesarios para monitorear.

Para cada vista/tabla que el agente necesita consultar:
1. Intenta hacer SELECT
2. Si funciona → OK
3. Si falla por permisos → genera el GRANT statement exacto

Esto le dice al usuario exactamente qué permisos faltan y cómo arreglarlos.
"""

import logging

logger = logging.getLogger("spektra-agent")


# ════════════════════════════════════════════════════════════
# HANA
# ════════════════════════════════════════════════════════════

HANA_REQUIRED_VIEWS = [
    {
        "view": "SYS.M_DATABASE",
        "description": "Información general de la base de datos",
        "test_query": "SELECT VERSION FROM SYS.M_DATABASE",
        "grant": "GRANT SELECT ON SYS.M_DATABASE TO {user}",
    },
    {
        "view": "SYS.M_HOST_RESOURCE_UTILIZATION",
        "description": "CPU y memoria del host",
        "test_query": "SELECT TOP 1 HOST FROM SYS.M_HOST_RESOURCE_UTILIZATION",
        "grant": "GRANT SELECT ON SYS.M_HOST_RESOURCE_UTILIZATION TO {user}",
    },
    {
        "view": "SYS.M_DISK_USAGE",
        "description": "Uso de disco (data, log, trace)",
        "test_query": "SELECT TOP 1 USAGE_TYPE FROM SYS.M_DISK_USAGE",
        "grant": "GRANT SELECT ON SYS.M_DISK_USAGE TO {user}",
    },
    {
        "view": "SYS.M_BACKUP_CATALOG",
        "description": "Estado de backups",
        "test_query": "SELECT TOP 1 ENTRY_TYPE_NAME FROM SYS.M_BACKUP_CATALOG",
        "grant": "GRANT SELECT ON SYS.M_BACKUP_CATALOG TO {user}",
    },
    {
        "view": "SYS.M_SYSTEM_REPLICATION",
        "description": "Estado de replicación HA (HSR)",
        "test_query": "SELECT TOP 1 SITE_NAME FROM SYS.M_SYSTEM_REPLICATION",
        "grant": "GRANT SELECT ON SYS.M_SYSTEM_REPLICATION TO {user}",
    },
    {
        "view": "_SYS_STATISTICS.STATISTICS_CURRENT_ALERTS",
        "description": "Alertas activas de HANA",
        "test_query": "SELECT TOP 1 ALERT_ID FROM _SYS_STATISTICS.STATISTICS_CURRENT_ALERTS",
        "grant": "GRANT SELECT ON _SYS_STATISTICS.STATISTICS_CURRENT_ALERTS TO {user}",
    },
]


def validate_hana(host, port, username, password):
    """
    Valida la conexión y permisos en HANA.

    Retorna:
        (success, results)
        success: True si se pudo conectar
        results: lista de { view, description, status, grant_needed }
    """
    try:
        from hdbcli import dbapi
    except ImportError:
        return False, [{"error": "hdbcli no instalado. Instala con: pip install hdbcli"}]

    try:
        conn = dbapi.connect(
            address=host,
            port=port,
            user=username,
            password=password,
            encrypt=True,
        )
    except Exception as e:
        error_msg = str(e)
        if "authentication failed" in error_msg.lower() or "invalid" in error_msg.lower():
            return False, [{"error": f"Autenticación fallida: usuario o contraseña incorrectos"}]
        if "connection refused" in error_msg.lower() or "could not connect" in error_msg.lower():
            return False, [{"error": f"No se pudo conectar a {host}:{port}. Verifica host y puerto."}]
        return False, [{"error": f"Error de conexión: {error_msg}"}]

    results = []
    for req in HANA_REQUIRED_VIEWS:
        result = {
            "view": req["view"],
            "description": req["description"],
        }
        try:
            cursor = conn.cursor()
            cursor.execute(req["test_query"])
            cursor.fetchone()
            cursor.close()
            result["status"] = "ok"
            result["grant_needed"] = None
        except Exception as e:
            err = str(e).lower()
            if "privilege" in err or "permission" in err or "not authorized" in err:
                result["status"] = "permission_denied"
                result["grant_needed"] = req["grant"].format(user=username)
            elif "not exist" in err or "invalid table" in err:
                result["status"] = "not_available"
                result["grant_needed"] = None
            else:
                result["status"] = "error"
                result["grant_needed"] = None
                result["error"] = str(e)

        results.append(result)

    conn.close()
    return True, results


# ════════════════════════════════════════════════════════════
# Oracle
# ════════════════════════════════════════════════════════════

ORACLE_REQUIRED_VIEWS = [
    {
        "view": "V$INSTANCE",
        "description": "Estado de la instancia",
        "test_query": "SELECT INSTANCE_NAME FROM V$INSTANCE",
        "grant": "GRANT SELECT ON V_$INSTANCE TO {user}",
    },
    {
        "view": "V$SGA",
        "description": "Memoria SGA",
        "test_query": "SELECT SUM(VALUE) FROM V$SGA",
        "grant": "GRANT SELECT ON V_$SGA TO {user}",
    },
    {
        "view": "V$PGASTAT",
        "description": "Memoria PGA",
        "test_query": "SELECT VALUE FROM V$PGASTAT WHERE ROWNUM = 1",
        "grant": "GRANT SELECT ON V_$PGASTAT TO {user}",
    },
    {
        "view": "DBA_DATA_FILES / DBA_FREE_SPACE",
        "description": "Uso de tablespaces",
        "test_query": "SELECT COUNT(*) FROM DBA_DATA_FILES",
        "grant": "GRANT SELECT ON DBA_DATA_FILES TO {user};\nGRANT SELECT ON DBA_FREE_SPACE TO {user}",
    },
    {
        "view": "V$SESSION",
        "description": "Sesiones activas",
        "test_query": "SELECT COUNT(*) FROM V$SESSION WHERE TYPE = 'USER'",
        "grant": "GRANT SELECT ON V_$SESSION TO {user}",
    },
    {
        "view": "V$RMAN_BACKUP_JOB_DETAILS",
        "description": "Estado de backups RMAN",
        "test_query": "SELECT COUNT(*) FROM V$RMAN_BACKUP_JOB_DETAILS",
        "grant": "GRANT SELECT ON V_$RMAN_BACKUP_JOB_DETAILS TO {user}",
    },
    {
        "view": "V$DATABASE",
        "description": "Información de la base de datos y Data Guard",
        "test_query": "SELECT DATABASE_ROLE FROM V$DATABASE",
        "grant": "GRANT SELECT ON V_$DATABASE TO {user}",
    },
]


def validate_oracle(host, port, service_name, username, password):
    """Valida la conexión y permisos en Oracle."""
    db_module = None
    try:
        import oracledb
        db_module = oracledb
    except ImportError:
        try:
            import cx_Oracle
            db_module = cx_Oracle
        except ImportError:
            return False, [{"error": "Ni oracledb ni cx_Oracle están instalados. Instala con: pip install oracledb"}]

    try:
        dsn = f"{host}:{port}/{service_name}"
        conn = db_module.connect(user=username, password=password, dsn=dsn)
    except Exception as e:
        return False, [{"error": f"Error de conexión: {e}"}]

    results = []
    for req in ORACLE_REQUIRED_VIEWS:
        result = {"view": req["view"], "description": req["description"]}
        try:
            cursor = conn.cursor()
            cursor.execute(req["test_query"])
            cursor.fetchone()
            cursor.close()
            result["status"] = "ok"
            result["grant_needed"] = None
        except Exception as e:
            err = str(e).lower()
            if "insufficient privileges" in err or "table or view does not exist" in err:
                result["status"] = "permission_denied"
                result["grant_needed"] = req["grant"].format(user=username)
            else:
                result["status"] = "error"
                result["grant_needed"] = None
                result["error"] = str(e)
        results.append(result)

    conn.close()
    return True, results


# ════════════════════════════════════════════════════════════
# DB2
# ════════════════════════════════════════════════════════════

DB2_REQUIRED_VIEWS = [
    {
        "view": "SYSIBMADM.ENV_INST_INFO",
        "description": "Información de la instancia",
        "test_query": "SELECT SERVICE_LEVEL FROM SYSIBMADM.ENV_INST_INFO FETCH FIRST 1 ROWS ONLY",
        "grant": "GRANT SELECT ON SYSIBMADM.ENV_INST_INFO TO {user}",
    },
    {
        "view": "SYSIBMADM.TBSP_UTILIZATION",
        "description": "Uso de tablespaces",
        "test_query": "SELECT TBSP_NAME FROM SYSIBMADM.TBSP_UTILIZATION FETCH FIRST 1 ROWS ONLY",
        "grant": "GRANT SELECT ON SYSIBMADM.TBSP_UTILIZATION TO {user}",
    },
    {
        "view": "SYSIBMADM.APPLICATIONS",
        "description": "Sesiones conectadas",
        "test_query": "SELECT COUNT(*) FROM SYSIBMADM.APPLICATIONS",
        "grant": "GRANT SELECT ON SYSIBMADM.APPLICATIONS TO {user}",
    },
    {
        "view": "SYSIBMADM.DB_HISTORY",
        "description": "Historial de backups",
        "test_query": "SELECT OPERATION FROM SYSIBMADM.DB_HISTORY FETCH FIRST 1 ROWS ONLY",
        "grant": "GRANT SELECT ON SYSIBMADM.DB_HISTORY TO {user}",
    },
    {
        "view": "SYSIBMADM.BP_READ_IO",
        "description": "Buffer pool I/O",
        "test_query": "SELECT BP_NAME FROM SYSIBMADM.BP_READ_IO FETCH FIRST 1 ROWS ONLY",
        "grant": "GRANT SELECT ON SYSIBMADM.BP_READ_IO TO {user}",
    },
]


def validate_db2(database, hostname, port, username, password):
    """Valida la conexión y permisos en DB2."""
    try:
        import ibm_db
    except ImportError:
        return False, [{"error": "ibm_db no instalado. Instala con: pip install ibm_db"}]

    try:
        conn_str = (
            f"DATABASE={database};HOSTNAME={hostname};PORT={port};"
            f"PROTOCOL=TCPIP;UID={username};PWD={password};"
        )
        conn = ibm_db.connect(conn_str, "", "")
    except Exception as e:
        return False, [{"error": f"Error de conexión: {e}"}]

    results = []
    for req in DB2_REQUIRED_VIEWS:
        result = {"view": req["view"], "description": req["description"]}
        try:
            stmt = ibm_db.exec_immediate(conn, req["test_query"])
            ibm_db.fetch_tuple(stmt)
            result["status"] = "ok"
            result["grant_needed"] = None
        except Exception as e:
            err = str(e).lower()
            if "privilege" in err or "authorization" in err:
                result["status"] = "permission_denied"
                result["grant_needed"] = req["grant"].format(user=username)
            else:
                result["status"] = "error"
                result["grant_needed"] = None
                result["error"] = str(e)
        results.append(result)

    ibm_db.close(conn)
    return True, results


# ════════════════════════════════════════════════════════════
# MSSQL
# ════════════════════════════════════════════════════════════

MSSQL_REQUIRED_VIEWS = [
    {
        "view": "sys.dm_os_sys_info",
        "description": "Información del sistema",
        "test_query": "SELECT TOP 1 physical_memory_kb FROM sys.dm_os_sys_info",
        "grant": "GRANT VIEW SERVER STATE TO {user}",
    },
    {
        "view": "sys.dm_exec_sessions",
        "description": "Sesiones activas",
        "test_query": "SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1",
        "grant": "GRANT VIEW SERVER STATE TO {user}",
    },
    {
        "view": "sys.databases / sys.master_files",
        "description": "Bases de datos y archivos",
        "test_query": "SELECT COUNT(*) FROM sys.databases",
        "grant": "GRANT VIEW ANY DATABASE TO {user}",
    },
    {
        "view": "msdb.dbo.backupset",
        "description": "Historial de backups",
        "test_query": "SELECT TOP 1 database_name FROM msdb.dbo.backupset",
        "grant": "GRANT SELECT ON msdb.dbo.backupset TO {user}",
    },
]


def validate_mssql(host, port, username, password, database="master"):
    """Valida la conexión y permisos en SQL Server."""
    try:
        import pymssql
    except ImportError:
        return False, [{"error": "pymssql no instalado. Instala con: pip install pymssql"}]

    try:
        conn = pymssql.connect(
            server=host, port=port,
            user=username, password=password,
            database=database,
        )
    except Exception as e:
        return False, [{"error": f"Error de conexión: {e}"}]

    results = []
    for req in MSSQL_REQUIRED_VIEWS:
        result = {"view": req["view"], "description": req["description"]}
        try:
            cursor = conn.cursor()
            cursor.execute(req["test_query"])
            cursor.fetchone()
            cursor.close()
            result["status"] = "ok"
            result["grant_needed"] = None
        except Exception as e:
            result["status"] = "permission_denied"
            result["grant_needed"] = req["grant"].format(user=username)
        results.append(result)

    conn.close()
    return True, results


# ════════════════════════════════════════════════════════════
# ASE
# ════════════════════════════════════════════════════════════

ASE_REQUIRED_VIEWS = [
    {
        "view": "master..sysprocesses",
        "description": "Procesos/sesiones",
        "test_query": "SELECT COUNT(*) FROM master..sysprocesses",
        "grant": "GRANT SELECT ON master..sysprocesses TO {user}",
    },
    {
        "view": "master..sysdatabases",
        "description": "Bases de datos",
        "test_query": "SELECT COUNT(*) FROM master..sysdatabases",
        "grant": "GRANT SELECT ON master..sysdatabases TO {user}",
    },
    {
        "view": "master..monEngine",
        "description": "Estado de engines (CPU)",
        "test_query": "SELECT TOP 1 EngineNumber FROM master..monEngine",
        "grant": "sp_role 'mon_role', 'grant', {user}",
    },
]


def validate_ase(host, port, username, password):
    """Valida la conexión y permisos en SAP ASE."""
    try:
        import pymssql
    except ImportError:
        return False, [{"error": "pymssql no instalado. Instala con: pip install pymssql"}]

    try:
        conn = pymssql.connect(
            server=host, port=port,
            user=username, password=password,
            database="master",
        )
    except Exception as e:
        return False, [{"error": f"Error de conexión: {e}"}]

    results = []
    for req in ASE_REQUIRED_VIEWS:
        result = {"view": req["view"], "description": req["description"]}
        try:
            cursor = conn.cursor()
            cursor.execute(req["test_query"])
            cursor.fetchone()
            cursor.close()
            result["status"] = "ok"
            result["grant_needed"] = None
        except Exception as e:
            result["status"] = "permission_denied"
            result["grant_needed"] = req["grant"].format(user=username)
        results.append(result)

    conn.close()
    return True, results


# ════════════════════════════════════════════════════════════
# Dispatcher — llama al validador correcto según el tipo de DB
# ════════════════════════════════════════════════════════════

def validate_database(db_type, **connection_params):
    """
    Valida conexión y permisos para cualquier tipo de base de datos.

    Parámetros:
        db_type: "HANA", "Oracle", "DB2", "MSSQL", "ASE", "MaxDB"
        **connection_params: parámetros de conexión específicos de cada DB

    Retorna:
        (connected, results)
    """
    validators = {
        "HANA": validate_hana,
        "Oracle": validate_oracle,
        "DB2": validate_db2,
        "MSSQL": validate_mssql,
        "ASE": validate_ase,
    }

    validator = validators.get(db_type)
    if not validator:
        if db_type == "MaxDB":
            return True, [{"view": "dbmcli", "status": "ok",
                          "description": "MaxDB usa dbmcli (no necesita validación SQL)"}]
        return False, [{"error": f"No hay validador para: {db_type}"}]

    return validator(**connection_params)
