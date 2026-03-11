"""
Cargador de configuración.

Lee el archivo config.yaml y lo convierte en un diccionario Python.
También soporta variables de entorno para datos sensibles (contraseñas).
"""

import os
import yaml
import logging

logger = logging.getLogger("spektra-agent")


def load_config(config_path="config.yaml"):
    """
    Carga la configuración desde un archivo YAML.

    Parámetros:
        config_path: ruta al archivo config.yaml

    Retorna:
        Diccionario con toda la configuración del agente.
    """
    # Leer el archivo YAML
    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    # ── Reemplazar contraseñas con variables de entorno si existen ──
    # Esto es más seguro que escribir la contraseña directamente en el archivo.
    # Ejemplo: export SPEKTRA_SAP_PASSWORD="miPassword123"

    env_sap_pass = os.environ.get("SPEKTRA_SAP_PASSWORD")
    if env_sap_pass:
        config["sapcontrol"]["password"] = env_sap_pass

    env_hana_pass = os.environ.get("SPEKTRA_HANA_PASSWORD")
    if env_hana_pass:
        config["hana"]["password"] = env_hana_pass

    env_api_token = os.environ.get("SPEKTRA_API_TOKEN")
    if env_api_token:
        config["api"]["token"] = env_api_token

    return config


def setup_logging(config):
    """
    Configura el sistema de logging según la configuración.

    Crea un logger que escribe tanto a archivo como a consola.
    """
    log_cfg = config.get("logging", {})
    level = getattr(logging, log_cfg.get("level", "INFO").upper(), logging.INFO)
    from spektra_agent.platform_paths import get_log_file
    log_file = log_cfg.get("file", get_log_file())
    max_bytes = log_cfg.get("max_size_mb", 50) * 1024 * 1024
    backup_count = log_cfg.get("backup_count", 5)

    # Formato del log: fecha + nivel + mensaje
    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # Logger principal
    root_logger = logging.getLogger("spektra-agent")
    root_logger.setLevel(level)

    # Handler: escribir a consola (siempre)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # Handler: escribir a archivo (con rotación)
    try:
        from logging.handlers import RotatingFileHandler
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=max_bytes,
            backupCount=backup_count
        )
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)
    except (PermissionError, FileNotFoundError) as e:
        root_logger.warning(f"No se pudo abrir el archivo de log '{log_file}': {e}")
        root_logger.warning("Solo se escribirá a consola.")

    return root_logger
