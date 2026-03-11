"""
Almacén seguro de credenciales — Multiplataforma.

Encripta las credenciales con AES (Fernet) usando una clave derivada
de la identidad única de la máquina. Los datos encriptados se guardan
en un archivo local con permisos restrictivos (solo root/agent user).

Las credenciales NUNCA salen de este servidor:
- No se incluyen en los payloads enviados al backend
- La clave de encriptación es única por máquina
- Si copias el archivo a otro servidor, no se puede descifrar

Soporta: Linux, Windows, AIX, HP-UX, Solaris.

Dependencia: pip install cryptography
"""

import os
import json
import logging
import base64

from spektra_agent.platform_paths import (
    get_credentials_path,
    get_machine_id,
    secure_write_file,
    secure_delete_file,
)

logger = logging.getLogger("spektra-agent")

# Sal fija del agente (no es secreto, solo agrega entropía)
_AGENT_SALT = b"SAP-Spektra-Agent-v1-Maveram-2026"


def _derive_key():
    """
    Deriva la clave de encriptación a partir de la identidad de la máquina.

    Usa PBKDF2-HMAC-SHA256 con 600,000 iteraciones (recomendación OWASP 2024).
    La clave resultante es compatible con Fernet (32 bytes, base64).
    """
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes

    machine_id = get_machine_id().encode("utf-8")

    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_AGENT_SALT,
        iterations=600_000,
    )

    key = kdf.derive(machine_id)
    return base64.urlsafe_b64encode(key)


def save_credentials(credentials, path=None):
    """
    Encripta y guarda las credenciales en disco.

    Parámetros:
        credentials: diccionario con las credenciales, ejemplo:
            {
                "sapcontrol": { "username": "ep1adm", "password": "..." },
                "database": { "type": "HANA", "username": "SPEKTRA_MON", "password": "..." }
            }
        path: ruta del archivo (default: /opt/spektra-agent/.credentials)
    """
    from cryptography.fernet import Fernet

    if path is None:
        path = get_credentials_path()

    # Encriptar
    key = _derive_key()
    fernet = Fernet(key)

    plaintext = json.dumps(credentials, ensure_ascii=False).encode("utf-8")
    encrypted = fernet.encrypt(plaintext)

    # Escribir con permisos seguros (multiplataforma)
    secure_write_file(path, encrypted)

    logger.info(f"Credenciales encriptadas guardadas en: {path}")
    logger.info("Archivo protegido con permisos restrictivos.")


def load_credentials(path=None):
    """
    Carga y desencripta las credenciales desde disco.

    Retorna:
        Diccionario con las credenciales, o None si no existen.
    """
    from cryptography.fernet import Fernet, InvalidToken

    if path is None:
        path = get_credentials_path()

    if not os.path.exists(path):
        logger.debug(f"No se encontró archivo de credenciales en: {path}")
        return None

    try:
        with open(path, "rb") as f:
            encrypted = f.read()

        key = _derive_key()
        fernet = Fernet(key)
        plaintext = fernet.decrypt(encrypted)

        return json.loads(plaintext.decode("utf-8"))

    except InvalidToken:
        logger.error(
            "No se pudieron descifrar las credenciales. "
            "Esto puede pasar si se copió el archivo desde otro servidor "
            "o si cambió el machine-id. Ejecuta --setup de nuevo."
        )
        return None
    except Exception as e:
        logger.error(f"Error leyendo credenciales: {e}")
        return None


def delete_credentials(path=None):
    """Elimina el archivo de credenciales de forma segura."""
    if path is None:
        path = get_credentials_path()

    secure_delete_file(path)
    logger.info("Credenciales eliminadas de forma segura.")


def credentials_exist(path=None):
    """Verifica si ya existen credenciales guardadas."""
    if path is None:
        path = get_credentials_path()
    return os.path.exists(path)
