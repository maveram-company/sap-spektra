"""
Collector de metadata Cloud.

Detecta automáticamente si el servidor corre en AWS, Azure o GCP
usando los servicios de metadata de cada proveedor.
Si no es cloud, retorna provider="on-premise".

Servicios de metadata:
- AWS:   http://169.254.169.254/latest/meta-data/
- Azure: http://169.254.169.254/metadata/instance?api-version=2021-02-01
- GCP:   http://metadata.google.internal/computeMetadata/v1/instance/
"""

import logging
import requests

logger = logging.getLogger("spektra-agent")

# Timeout corto — si no hay metadata service, falla rápido
TIMEOUT = 3


def collect(config):
    """
    Detecta el proveedor cloud y recolecta metadata del servidor.

    Retorna:
    {
        "provider": "aws" | "azure" | "gcp" | "on-premise",
        "instance_id": "i-0abc123def456",
        "instance_type": "r5.4xlarge",
        "region": "us-east-1",
        "zone": "us-east-1a",
        "account_id": "123456789012",
        "tags": { ... }
    }
    """
    logger.debug("Detectando proveedor cloud...")

    # Intentar cada proveedor en orden
    # El primero que responda gana
    for detector in [_detect_aws, _detect_azure, _detect_gcp]:
        result = detector()
        if result:
            logger.info(f"Cloud detectado: {result['provider']}")
            return result

    logger.info("No se detectó cloud — sistema on-premise")
    return {"provider": "on-premise"}


def _detect_aws():
    """
    Detecta AWS y obtiene metadata de EC2.

    AWS usa el IMDSv2 (Instance Metadata Service v2) que requiere
    primero obtener un token y luego hacer las consultas.
    """
    try:
        # Paso 1: Obtener token IMDSv2
        token_response = requests.put(
            "http://169.254.169.254/latest/api/token",
            headers={"X-aws-ec2-metadata-token-ttl-seconds": "300"},
            timeout=TIMEOUT,
        )
        if token_response.status_code != 200:
            return None

        token = token_response.text
        headers = {"X-aws-ec2-metadata-token": token}

        # Paso 2: Consultar metadata con el token
        def get_meta(path):
            r = requests.get(
                f"http://169.254.169.254/latest/meta-data/{path}",
                headers=headers,
                timeout=TIMEOUT,
            )
            return r.text if r.status_code == 200 else ""

        # Paso 3: Consultar identity document (tiene más datos)
        identity = {}
        try:
            import json
            r = requests.get(
                "http://169.254.169.254/latest/dynamic/instance-identity/document",
                headers=headers,
                timeout=TIMEOUT,
            )
            if r.status_code == 200:
                identity = json.loads(r.text)
        except Exception:
            pass

        return {
            "provider": "aws",
            "instance_id": get_meta("instance-id"),
            "instance_type": get_meta("instance-type"),
            "region": identity.get("region", ""),
            "zone": get_meta("placement/availability-zone"),
            "account_id": identity.get("accountId", ""),
            "ami_id": get_meta("ami-id"),
            "private_ip": get_meta("local-ipv4"),
            "public_ip": get_meta("public-ipv4"),
            "vpc_id": identity.get("vpcId", ""),
        }

    except (requests.ConnectionError, requests.Timeout):
        return None


def _detect_azure():
    """
    Detecta Azure y obtiene metadata de la VM.

    Azure usa un endpoint de metadata con el header "Metadata: true".
    """
    try:
        response = requests.get(
            "http://169.254.169.254/metadata/instance",
            params={"api-version": "2021-02-01"},
            headers={"Metadata": "true"},
            timeout=TIMEOUT,
        )
        if response.status_code != 200:
            return None

        data = response.json()
        compute = data.get("compute", {})
        network = data.get("network", {})

        # Obtener IP privada de la primera interfaz
        private_ip = ""
        interfaces = network.get("interface", [])
        if interfaces:
            ipv4_addrs = interfaces[0].get("ipv4", {}).get("ipAddress", [])
            if ipv4_addrs:
                private_ip = ipv4_addrs[0].get("privateIpAddress", "")

        return {
            "provider": "azure",
            "instance_id": compute.get("vmId", ""),
            "instance_type": compute.get("vmSize", ""),
            "region": compute.get("location", ""),
            "zone": compute.get("zone", ""),
            "subscription_id": compute.get("subscriptionId", ""),
            "resource_group": compute.get("resourceGroupName", ""),
            "vm_name": compute.get("name", ""),
            "private_ip": private_ip,
            "os_type": compute.get("osType", ""),
            "tags": compute.get("tags", ""),
        }

    except (requests.ConnectionError, requests.Timeout):
        return None


def _detect_gcp():
    """
    Detecta Google Cloud Platform y obtiene metadata de la instancia.

    GCP usa un header especial "Metadata-Flavor: Google".
    """
    try:
        base = "http://metadata.google.internal/computeMetadata/v1"
        headers = {"Metadata-Flavor": "Google"}

        def get_meta(path):
            r = requests.get(f"{base}/{path}", headers=headers, timeout=TIMEOUT)
            return r.text if r.status_code == 200 else ""

        # Verificar que es GCP
        project_id = get_meta("project/project-id")
        if not project_id:
            return None

        # Extraer zona y región del path completo
        # Formato: projects/123/zones/us-central1-a
        zone_full = get_meta("instance/zone")
        zone = zone_full.split("/")[-1] if zone_full else ""
        region = "-".join(zone.split("-")[:-1]) if zone else ""

        return {
            "provider": "gcp",
            "instance_id": get_meta("instance/id"),
            "instance_type": get_meta("instance/machine-type").split("/")[-1],
            "region": region,
            "zone": zone,
            "project_id": project_id,
            "instance_name": get_meta("instance/name"),
            "private_ip": get_meta("instance/network-interfaces/0/ip"),
            "public_ip": get_meta("instance/network-interfaces/0/access-configs/0/external-ip"),
        }

    except (requests.ConnectionError, requests.Timeout):
        return None
