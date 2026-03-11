"""
Rutas y utilidades específicas de cada sistema operativo.

SAP corre en múltiples plataformas: Linux, Windows, AIX, HP-UX, Solaris.
Este módulo centraliza todas las rutas y operaciones que dependen del SO,
para que el resto del agente sea 100% multiplataforma.

Sistemas soportados:
- Linux   (SLES, RHEL, Ubuntu, Oracle Linux)
- Windows (Windows Server 2016+)
- AIX     (IBM Power)
- HP-UX   (Itanium)
- SunOS   (Oracle Solaris)
"""

import os
import sys
import platform
import subprocess
import logging

logger = logging.getLogger("spektra-agent")

# ── Detectar el sistema operativo una sola vez ──
OS_TYPE = platform.system()  # "Linux", "Windows", "AIX", "HP-UX", "SunOS"


# ════════════════════════════════════════════════════════════
# Rutas base según el SO
# ════════════════════════════════════════════════════════════

def get_install_dir():
    """Directorio donde se instala el agente."""
    if OS_TYPE == "Windows":
        return os.path.join(os.environ.get("ProgramData", r"C:\ProgramData"), "spektra-agent")
    # Linux, AIX, HP-UX, SunOS → todos usan /opt
    return "/opt/spektra-agent"


def get_credentials_path():
    """Ruta del archivo de credenciales encriptadas."""
    return os.path.join(get_install_dir(), ".credentials")


def get_log_file():
    """Ruta del archivo de log."""
    if OS_TYPE == "Windows":
        log_dir = os.path.join(get_install_dir(), "logs")
        os.makedirs(log_dir, exist_ok=True)
        return os.path.join(log_dir, "spektra-agent.log")
    return "/var/log/spektra-agent.log"


def get_retry_dir():
    """Directorio para guardar payloads que no se pudieron enviar."""
    if OS_TYPE == "Windows":
        return os.path.join(get_install_dir(), "retry")
    return "/var/lib/spektra-agent/retry"


# ════════════════════════════════════════════════════════════
# Identificación única de la máquina (para derivar clave AES)
# ════════════════════════════════════════════════════════════

def get_machine_id():
    """
    Obtiene un identificador único de la máquina.

    Según el SO, usa diferentes fuentes:
    - Linux:   /etc/machine-id o /var/lib/dbus/machine-id
    - Windows: Registro de Windows (MachineGuid)
    - AIX:     uname -f (machine serial)
    - HP-UX:   machinfo o uname
    - SunOS:   hostid
    """
    machine_id = None

    if OS_TYPE == "Linux":
        machine_id = _linux_machine_id()

    elif OS_TYPE == "Windows":
        machine_id = _windows_machine_id()

    elif OS_TYPE == "AIX":
        machine_id = _aix_machine_id()

    elif OS_TYPE == "HP-UX":
        machine_id = _hpux_machine_id()

    elif OS_TYPE == "SunOS":
        machine_id = _sunos_machine_id()

    # Fallback universal: hostname + platform
    if not machine_id:
        machine_id = f"{platform.node()}-{platform.machine()}-{OS_TYPE}"
        logger.warning(
            f"No se encontró un ID de máquina nativo para {OS_TYPE}. "
            "Usando fallback basado en hostname. "
            "Las credenciales podrían no sobrevivir un cambio de hostname."
        )

    return machine_id


def _linux_machine_id():
    """Linux: lee /etc/machine-id (systemd) o /var/lib/dbus/machine-id."""
    for path in ["/etc/machine-id", "/var/lib/dbus/machine-id"]:
        try:
            with open(path, "r") as f:
                mid = f.read().strip()
                if mid:
                    return mid
        except (FileNotFoundError, PermissionError):
            continue
    return None


def _windows_machine_id():
    """Windows: lee MachineGuid del registro."""
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Cryptography",
            0,
            winreg.KEY_READ,
        )
        value, _ = winreg.QueryValueEx(key, "MachineGuid")
        winreg.CloseKey(key)
        return value
    except Exception:
        pass

    # Fallback: wmic
    try:
        result = subprocess.run(
            ["wmic", "csproduct", "get", "UUID"],
            capture_output=True, text=True, timeout=10,
        )
        for line in result.stdout.strip().split("\n"):
            line = line.strip()
            if line and line != "UUID":
                return line
    except Exception:
        pass

    return None


def _aix_machine_id():
    """AIX: usa uname -f para obtener el serial de la máquina."""
    try:
        result = subprocess.run(
            ["uname", "-f"],
            capture_output=True, text=True, timeout=10,
        )
        mid = result.stdout.strip()
        if mid:
            return mid
    except Exception:
        pass

    # Alternativa: lsattr del procesador
    try:
        result = subprocess.run(
            ["uname", "-u"],
            capture_output=True, text=True, timeout=10,
        )
        mid = result.stdout.strip()
        if mid:
            return mid
    except Exception:
        pass

    return None


def _hpux_machine_id():
    """HP-UX: usa uname -i para el hardware identifier."""
    try:
        result = subprocess.run(
            ["uname", "-i"],
            capture_output=True, text=True, timeout=10,
        )
        mid = result.stdout.strip()
        if mid:
            return mid
    except Exception:
        pass
    return None


def _sunos_machine_id():
    """Solaris: usa hostid."""
    try:
        result = subprocess.run(
            ["hostid"],
            capture_output=True, text=True, timeout=10,
        )
        mid = result.stdout.strip()
        if mid:
            return mid
    except Exception:
        pass
    return None


# ════════════════════════════════════════════════════════════
# Permisos seguros de archivos
# ════════════════════════════════════════════════════════════

def secure_write_file(path, data):
    """
    Escribe un archivo con permisos restrictivos según el SO.

    - Linux/AIX/HP-UX/SunOS: permisos 0600 (solo owner)
    - Windows: ACL con acceso solo para el usuario actual y SYSTEM
    """
    # Crear directorio si no existe
    os.makedirs(os.path.dirname(path), exist_ok=True)

    if OS_TYPE == "Windows":
        _windows_secure_write(path, data)
    else:
        _unix_secure_write(path, data)


def _unix_secure_write(path, data):
    """Escribe con permisos 0600 en Unix/Linux/AIX/HP-UX."""
    import stat
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, data)
    finally:
        os.close(fd)
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)


def _windows_secure_write(path, data):
    """Escribe el archivo en Windows y restringe permisos con icacls."""
    with open(path, "wb") as f:
        f.write(data)

    # Restringir acceso: solo el usuario actual y SYSTEM
    try:
        username = os.environ.get("USERNAME", "")
        if username:
            subprocess.run(
                ["icacls", path, "/inheritance:r",
                 "/grant:r", f"{username}:(R,W)",
                 "/grant:r", "SYSTEM:(R,W)"],
                capture_output=True, timeout=10,
            )
    except Exception as e:
        logger.warning(f"No se pudieron restringir permisos en Windows: {e}")


def secure_delete_file(path):
    """Elimina un archivo de forma segura (sobrescribe con ceros)."""
    if not os.path.exists(path):
        return
    try:
        size = os.path.getsize(path)
        with open(path, "wb") as f:
            f.write(b"\x00" * size)
        os.remove(path)
    except Exception as e:
        logger.error(f"Error eliminando archivo de forma segura: {e}")


# ════════════════════════════════════════════════════════════
# Detección del nombre bonito del SO
# ════════════════════════════════════════════════════════════

def get_os_pretty_name():
    """
    Nombre descriptivo del SO, adaptado a cada plataforma.

    Ejemplos:
    - "SUSE Linux Enterprise Server 15 SP5"
    - "Windows Server 2022 Datacenter"
    - "AIX 7.3"
    - "HP-UX B.11.31"
    """
    if OS_TYPE == "Linux":
        return _linux_pretty_name()
    elif OS_TYPE == "Windows":
        return _windows_pretty_name()
    elif OS_TYPE == "AIX":
        return _aix_pretty_name()
    else:
        return f"{OS_TYPE} {platform.release()}"


def _linux_pretty_name():
    """Lee /etc/os-release para obtener el nombre del SO."""
    try:
        with open("/etc/os-release", "r") as f:
            for line in f:
                if line.startswith("PRETTY_NAME="):
                    return line.split("=", 1)[1].strip().strip('"')
    except (FileNotFoundError, PermissionError):
        pass
    return f"Linux {platform.release()}"


def _windows_pretty_name():
    """Nombre de Windows desde platform."""
    ver = platform.version()
    edition = platform.win32_edition() if hasattr(platform, "win32_edition") else ""
    return f"Windows {edition} {ver}".strip()


def _aix_pretty_name():
    """AIX: usa oslevel para obtener la versión."""
    try:
        result = subprocess.run(
            ["oslevel", "-s"],
            capture_output=True, text=True, timeout=10,
        )
        level = result.stdout.strip()
        if level:
            return f"AIX {level}"
    except Exception:
        pass
    return f"AIX {platform.release()}"


# ════════════════════════════════════════════════════════════
# Rutas de SAP según SO
# ════════════════════════════════════════════════════════════

def get_sap_base_dir():
    """Directorio base de instalación SAP."""
    if OS_TYPE == "Windows":
        # SAP en Windows típicamente usa D:\usr\sap o C:\usr\sap
        for drive in ["D:", "E:", "C:"]:
            path = os.path.join(drive, os.sep, "usr", "sap")
            if os.path.exists(path):
                return path
        return r"C:\usr\sap"
    # Linux, AIX, HP-UX, SunOS → siempre /usr/sap
    return "/usr/sap"


def get_sapcontrol_path():
    """Ruta al ejecutable sapcontrol."""
    if OS_TYPE == "Windows":
        sap_dir = get_sap_base_dir()
        # En Windows, sapcontrol está en el directorio del kernel
        # Ejemplo: D:\usr\sap\SID\SYS\exe\uc\NTAMD64\sapcontrol.exe
        return "sapcontrol.exe"  # Asume que está en PATH
    return "/usr/sap/hostctrl/exe/sapcontrol"
