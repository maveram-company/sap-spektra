"""
Sender — Envía los datos recolectados al backend central de SAP Spektra.

Empaqueta toda la información en un JSON y hace un POST al API.
Si falla, guarda los datos localmente para reintentar después.
"""

import json
import os
import time
import logging
import requests

logger = logging.getLogger("spektra-agent")

# Directorio donde se guardan los payloads que no se pudieron enviar
from spektra_agent.platform_paths import get_retry_dir
RETRY_DIR = get_retry_dir()


def send(payload, config):
    """
    Envía el payload al API central.

    Parámetros:
        payload: diccionario con todos los datos recolectados
        config: configuración del agente (tiene url y token)

    Retorna:
        True si se envió exitosamente, False si falló.
    """
    api_cfg = config.get("api", {})
    url = api_cfg.get("url", "").rstrip("/")
    token = api_cfg.get("token", "")
    timeout = api_cfg.get("timeout", 30)
    verify_ssl = api_cfg.get("verify_ssl", True)

    if not url:
        logger.error("No hay URL del API configurada. No se puede enviar datos.")
        return False

    endpoint = f"{url}/api/v1/agent/metrics"

    # Seguridad: eliminar cualquier dato sensible antes de enviar
    payload = _sanitize_payload(payload)

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "X-Agent-Version": payload.get("agent_version", "unknown"),
        "X-System-SID": payload.get("system", {}).get("sid", "unknown"),
    }

    try:
        response = requests.post(
            endpoint,
            json=payload,
            headers=headers,
            timeout=timeout,
            verify=verify_ssl,
        )

        if response.status_code == 200:
            logger.info(
                f"Datos enviados OK — "
                f"SID={payload.get('system', {}).get('sid')} "
                f"({_payload_size_kb(payload)} KB)"
            )
            # Intentar enviar datos pendientes si los hay
            _retry_pending(config)
            return True

        elif response.status_code == 401:
            logger.error("Token de API inválido o expirado (401). Verifica tu token.")
            return False

        elif response.status_code == 429:
            logger.warning("Rate limit alcanzado (429). Reintentando en el próximo ciclo.")
            _save_for_retry(payload)
            return False

        else:
            logger.warning(
                f"API respondió con código {response.status_code}: "
                f"{response.text[:200]}"
            )
            _save_for_retry(payload)
            return False

    except requests.ConnectionError:
        logger.warning(
            f"No se pudo conectar al API ({endpoint}). "
            "Guardando datos para reintento."
        )
        _save_for_retry(payload)
        return False

    except requests.Timeout:
        logger.warning(f"Timeout al enviar datos (>{timeout}s). Guardando para reintento.")
        _save_for_retry(payload)
        return False

    except Exception as e:
        logger.error(f"Error inesperado al enviar datos: {e}")
        _save_for_retry(payload)
        return False


def _sanitize_payload(payload):
    """
    Elimina cualquier dato sensible del payload antes de enviarlo.

    Las credenciales NUNCA deben salir del servidor. Esta función
    es una capa de seguridad adicional que recorre el payload
    y elimina campos que podrían contener contraseñas.
    """
    import copy
    clean = copy.deepcopy(payload)

    # Campos sensibles que nunca se deben enviar
    sensitive_keys = {"password", "secret", "token", "credentials", "private_key"}

    def _strip(obj):
        if isinstance(obj, dict):
            for key in list(obj.keys()):
                if key.lower() in sensitive_keys:
                    del obj[key]
                else:
                    _strip(obj[key])
        elif isinstance(obj, list):
            for item in obj:
                _strip(item)

    _strip(clean)
    return clean


def _save_for_retry(payload):
    """
    Guarda un payload en disco para reintentar después.
    Cada payload se guarda como un archivo JSON con timestamp.
    """
    try:
        os.makedirs(RETRY_DIR, exist_ok=True)
        filename = f"retry_{int(time.time())}.json"
        filepath = os.path.join(RETRY_DIR, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(payload, f)

        # Limpiar archivos viejos (máximo 100 archivos de retry)
        _cleanup_retry_dir(max_files=100)

        logger.debug(f"Payload guardado para reintento: {filename}")
    except Exception as e:
        logger.error(f"No se pudo guardar payload para reintento: {e}")


def _retry_pending(config):
    """
    Intenta enviar payloads guardados previamente.
    Se ejecuta después de cada envío exitoso.
    """
    if not os.path.exists(RETRY_DIR):
        return

    files = sorted(os.listdir(RETRY_DIR))
    if not files:
        return

    logger.info(f"Reintentando {len(files)} envíos pendientes...")

    api_cfg = config.get("api", {})
    url = api_cfg.get("url", "").rstrip("/")
    token = api_cfg.get("token", "")
    timeout = api_cfg.get("timeout", 30)
    verify_ssl = api_cfg.get("verify_ssl", True)
    endpoint = f"{url}/api/v1/agent/metrics"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }

    sent_count = 0
    for filename in files[:10]:  # Máximo 10 reintentos por ciclo
        filepath = os.path.join(RETRY_DIR, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                payload = json.load(f)

            response = requests.post(
                endpoint,
                json=payload,
                headers=headers,
                timeout=timeout,
                verify=verify_ssl,
            )

            if response.status_code == 200:
                os.remove(filepath)
                sent_count += 1
            else:
                break  # Si falla, parar para no saturar

        except Exception:
            break

    if sent_count > 0:
        logger.info(f"Reintento: {sent_count} envíos pendientes completados")


def _cleanup_retry_dir(max_files=100):
    """Elimina los archivos más viejos si hay demasiados."""
    try:
        files = sorted(os.listdir(RETRY_DIR))
        while len(files) > max_files:
            oldest = files.pop(0)
            os.remove(os.path.join(RETRY_DIR, oldest))
    except Exception:
        pass


def _payload_size_kb(payload):
    """Calcula el tamaño aproximado del payload en KB."""
    return round(len(json.dumps(payload)) / 1024, 1)
