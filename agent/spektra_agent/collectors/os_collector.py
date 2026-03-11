"""
Collector de métricas del Sistema Operativo.

Usa la librería 'psutil' para leer:
- CPU: porcentaje de uso, número de cores, load average
- Memoria RAM: total, usada, porcentaje
- Disco: uso por cada punto de montaje
- Red: bytes enviados y recibidos
- Procesos: los 10 que más CPU y RAM consumen
"""

import platform
import logging
import psutil

logger = logging.getLogger("spektra-agent")


def collect(config):
    """
    Recolecta todas las métricas del sistema operativo.

    Retorna un diccionario con la estructura:
    {
        "hostname": "sap-ep1-app01",
        "os": "Linux 5.14.0",
        "cpu": { ... },
        "memory": { ... },
        "disk": [ ... ],
        "network": { ... },
        "top_processes": [ ... ]
    }
    """
    logger.debug("Recolectando métricas del SO...")

    data = {
        "hostname": platform.node(),
        "os": f"{platform.system()} {platform.release()}",
        "os_pretty": _get_os_pretty_name(),
        "architecture": platform.machine(),
        "cpu": _collect_cpu(),
        "memory": _collect_memory(),
        "disk": _collect_disk(),
        "network": _collect_network(),
        "top_processes": _collect_top_processes(),
    }

    logger.debug(
        f"SO: CPU={data['cpu']['percent']}%, "
        f"RAM={data['memory']['percent']}%, "
        f"Discos={len(data['disk'])}"
    )

    return data


def _get_os_pretty_name():
    """Nombre descriptivo del SO (multiplataforma)."""
    from spektra_agent.platform_paths import get_os_pretty_name
    return get_os_pretty_name()


def _collect_cpu():
    """Métricas de CPU."""
    load_1, load_5, load_15 = psutil.getloadavg()
    return {
        "percent": psutil.cpu_percent(interval=1),
        "cores_physical": psutil.cpu_count(logical=False) or 0,
        "cores_logical": psutil.cpu_count(logical=True) or 0,
        "load_avg_1m": round(load_1, 2),
        "load_avg_5m": round(load_5, 2),
        "load_avg_15m": round(load_15, 2),
    }


def _collect_memory():
    """Métricas de memoria RAM."""
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    return {
        "total_gb": round(mem.total / (1024 ** 3), 2),
        "used_gb": round(mem.used / (1024 ** 3), 2),
        "available_gb": round(mem.available / (1024 ** 3), 2),
        "percent": mem.percent,
        "swap_total_gb": round(swap.total / (1024 ** 3), 2),
        "swap_used_gb": round(swap.used / (1024 ** 3), 2),
        "swap_percent": swap.percent,
    }


def _collect_disk():
    """Métricas de disco por cada punto de montaje."""
    disks = []
    for partition in psutil.disk_partitions(all=False):
        # Saltar sistemas de archivos virtuales
        if partition.fstype in ("tmpfs", "devtmpfs", "squashfs", "overlay"):
            continue
        try:
            usage = psutil.disk_usage(partition.mountpoint)
            disks.append({
                "mount": partition.mountpoint,
                "device": partition.device,
                "fstype": partition.fstype,
                "total_gb": round(usage.total / (1024 ** 3), 2),
                "used_gb": round(usage.used / (1024 ** 3), 2),
                "free_gb": round(usage.free / (1024 ** 3), 2),
                "percent": usage.percent,
            })
        except PermissionError:
            # Algunos montajes no permiten lectura
            continue
    return disks


def _collect_network():
    """Métricas de red (totales del sistema)."""
    net = psutil.net_io_counters()
    return {
        "bytes_sent": net.bytes_sent,
        "bytes_recv": net.bytes_recv,
        "packets_sent": net.packets_sent,
        "packets_recv": net.packets_recv,
        "errors_in": net.errin,
        "errors_out": net.errout,
    }


def _collect_top_processes(limit=10):
    """
    Los procesos que más recursos consumen.
    Útil para ver qué está usando CPU/RAM en el servidor SAP.
    """
    procs = []
    for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent", "username"]):
        try:
            info = proc.info
            procs.append({
                "pid": info["pid"],
                "name": info["name"],
                "user": info["username"],
                "cpu_percent": round(info["cpu_percent"] or 0, 1),
                "memory_percent": round(info["memory_percent"] or 0, 1),
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    # Ordenar por CPU descendente, tomar los top N
    procs.sort(key=lambda p: p["cpu_percent"], reverse=True)
    return procs[:limit]
