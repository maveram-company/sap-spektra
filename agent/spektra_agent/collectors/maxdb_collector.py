"""
Collector de métricas de SAP MaxDB.

MaxDB no tiene un driver Python estándar ampliamente disponible.
Se conecta usando el comando dbmcli (Database Manager CLI)
que está instalado en cada servidor con MaxDB.

Comandos principales:
- dbmcli -d <DB> -u <user>,<pass> db_state → estado de la DB
- dbmcli ... info state → info del estado
- dbmcli ... db_volumes → volúmenes (archivos de datos)
- dbmcli ... db_size → tamaño de la base de datos
- dbmcli ... backup_history_list → historial de backups
- dbmcli ... db_cons show all → parámetros y sesiones

Requisitos:
    dbmcli debe estar instalado y accesible en el PATH
    (viene con la instalación de MaxDB)
"""

import os
import logging
import subprocess

logger = logging.getLogger("spektra-agent")

TIMEOUT = 15


def collect(config):
    """
    Recolecta métricas de MaxDB via dbmcli.

    Retorna:
    {
        "status": "running",
        "version": "7.9.10.11",
        "type": "MaxDB",
        "state": "ONLINE",
        "size": { ... },
        "volumes": [...],
        "sessions": { ... },
        "backup": { ... }
    }
    """
    maxdb_cfg = config.get("maxdb", {})
    if not maxdb_cfg.get("database"):
        env_db = os.environ.get("MAXDB_DATABASE", "")
        if not env_db:
            logger.debug("MaxDB no configurado, saltando...")
            return None
        maxdb_cfg = {
            "database": env_db,
            "username": os.environ.get("SPEKTRA_MAXDB_USERNAME", "SUPERDBA"),
            "password": os.environ.get("SPEKTRA_MAXDB_PASSWORD", ""),
        }

    # Verificar que dbmcli está disponible
    if not _dbmcli_available():
        logger.warning("dbmcli no encontrado en el PATH. MaxDB no puede ser monitoreado.")
        return None

    db_name = maxdb_cfg["database"]
    username = maxdb_cfg.get("username", "SUPERDBA")
    password = maxdb_cfg.get("password", "")

    try:
        data = {
            "type": "MaxDB",
            "database": db_name,
            "state": _get_state(db_name, username, password),
            "version": _get_version(db_name, username, password),
            "size": _get_size(db_name, username, password),
            "volumes": _get_volumes(db_name, username, password),
            "sessions": _get_sessions(db_name, username, password),
            "backup": _get_backup_history(db_name, username, password),
        }

        data["status"] = "running" if data["state"] == "ONLINE" else "error"

        logger.debug(f"MaxDB: state={data['state']}")
        return data

    except Exception as e:
        logger.error(f"Error consultando MaxDB: {e}")
        return {"status": "error", "type": "MaxDB", "error": str(e)}


def _dbmcli_available():
    """Verifica que el comando dbmcli está en el PATH."""
    try:
        subprocess.run(
            ["dbmcli", "--version"],
            capture_output=True, timeout=5
        )
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _run_dbmcli(db_name, username, password, command):
    """
    Ejecuta un comando dbmcli y retorna la salida como texto.

    dbmcli se conecta a la base de datos local y ejecuta un comando
    de administración. La salida es texto plano.
    """
    cmd = [
        "dbmcli",
        "-d", db_name,
        "-u", f"{username},{password}",
        command,
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=TIMEOUT,
    )

    if result.returncode != 0:
        error_msg = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"dbmcli error: {error_msg}")

    return result.stdout.strip()


def _get_state(db_name, username, password):
    """Estado de la base de datos: ONLINE, OFFLINE, ADMIN, etc."""
    try:
        output = _run_dbmcli(db_name, username, password, "db_state")
        # La salida tiene formato: "OK\nState\nONLINE"
        lines = output.strip().split("\n")
        for line in lines:
            line = line.strip()
            if line in ("ONLINE", "OFFLINE", "ADMIN", "STANDBY"):
                return line
        return "UNKNOWN"
    except Exception as e:
        logger.debug(f"Error obteniendo estado de MaxDB: {e}")
        return "UNREACHABLE"


def _get_version(db_name, username, password):
    """Versión de MaxDB."""
    try:
        output = _run_dbmcli(db_name, username, password, "db_version")
        # Buscar línea con el número de versión
        for line in output.split("\n"):
            if "VERSION" in line.upper() or "." in line:
                parts = line.strip().split()
                for part in parts:
                    if "." in part and part[0].isdigit():
                        return part
        return "unknown"
    except Exception:
        return "unknown"


def _get_size(db_name, username, password):
    """Tamaño general de la base de datos."""
    try:
        output = _run_dbmcli(db_name, username, password, "db_size")
        result = {}
        for line in output.split("\n"):
            line = line.strip()
            if "=" in line:
                key, _, value = line.partition("=")
                key = key.strip().lower().replace(" ", "_")
                value = value.strip()
                try:
                    result[key] = int(value)
                except ValueError:
                    result[key] = value
        return result
    except Exception as e:
        logger.debug(f"Error obteniendo tamaño de MaxDB: {e}")
        return {}


def _get_volumes(db_name, username, password):
    """Volúmenes de datos y log."""
    try:
        output = _run_dbmcli(db_name, username, password, "db_volumes")
        volumes = []
        for line in output.split("\n"):
            line = line.strip()
            if not line or line.startswith("OK") or line.startswith("END"):
                continue
            parts = line.split("|") if "|" in line else line.split()
            if len(parts) >= 3:
                volumes.append({
                    "name": parts[0].strip(),
                    "type": parts[1].strip() if len(parts) > 1 else "",
                    "size": parts[2].strip() if len(parts) > 2 else "",
                })
        return volumes
    except Exception:
        return []


def _get_sessions(db_name, username, password):
    """Sesiones conectadas."""
    try:
        output = _run_dbmcli(db_name, username, password, "db_cons show all")
        lines = [l.strip() for l in output.split("\n") if l.strip() and not l.startswith("OK")]
        # Contar sesiones (cada línea no vacía es una sesión)
        session_count = max(0, len(lines) - 1)  # -1 por la línea de cabecera
        return {"total": session_count}
    except Exception:
        return {"total": 0}


def _get_backup_history(db_name, username, password):
    """Historial de backups."""
    try:
        output = _run_dbmcli(db_name, username, password, "backup_history_list")
        lines = output.strip().split("\n")

        # Buscar el último backup exitoso
        for line in reversed(lines):
            line = line.strip()
            if not line or line.startswith("OK") or line.startswith("END"):
                continue
            parts = line.split("|") if "|" in line else line.split()
            if len(parts) >= 3:
                return {
                    "status": "found",
                    "last_entry": line.strip(),
                }

        return {"status": "no_backup_found"}
    except Exception:
        return {"status": "no_backup_found"}
