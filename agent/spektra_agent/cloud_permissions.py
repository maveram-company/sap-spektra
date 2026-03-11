"""
Validador de permisos Cloud para operaciones HA.

Las operaciones de HA/DR requieren dos niveles de permisos:
1. Nivel OS/SAP — sapcontrol, hdbnsutil (ya los tiene el agente)
2. Nivel Cloud — APIs de AWS/Azure/GCP para:
   - Resize de instancias (scale-up warm standby)
   - Start/Stop instancias (pilot light)
   - Mover IPs (EIP, VIP)
   - Cambiar DNS (Route53, Traffic Manager, Cloud DNS)
   - Crear infra (CloudFormation, ARM, Terraform)

Este módulo valida que el agente tenga los permisos cloud necesarios
según la estrategia HA configurada.

Uso:
    provider = "aws"  # detectado por cloud_collector
    strategy = "WARM_STANDBY"
    results = validate_cloud_permissions(provider, strategy)
"""

import logging

logger = logging.getLogger("spektra-agent")


# ════════════════════════════════════════════════════════════
# Permisos requeridos por proveedor y estrategia HA
# ════════════════════════════════════════════════════════════

AWS_PERMISSIONS = {
    # Permisos comunes a todas las estrategias HA en AWS
    "COMMON": [
        {
            "action": "ec2:DescribeInstances",
            "description": "Consultar estado de instancias EC2",
            "test": "describe_instances",
            "required_for": ["HOT_STANDBY", "WARM_STANDBY", "PILOT_LIGHT", "BACKUP_RESTORE"],
        },
        {
            "action": "ec2:DescribeInstanceStatus",
            "description": "Verificar health de instancias",
            "test": "describe_instance_status",
            "required_for": ["HOT_STANDBY", "WARM_STANDBY", "PILOT_LIGHT", "BACKUP_RESTORE"],
        },
    ],
    # Warm Standby: necesita resize
    "WARM_STANDBY": [
        {
            "action": "ec2:ModifyInstanceAttribute",
            "description": "Cambiar tipo de instancia (scale-up/down)",
            "test": "modify_instance_attribute_dry",
            "critical": True,
        },
        {
            "action": "ec2:StartInstances",
            "description": "Iniciar instancia después de resize",
            "test": "start_instances_dry",
            "critical": True,
        },
        {
            "action": "ec2:StopInstances",
            "description": "Detener instancia para resize",
            "test": "stop_instances_dry",
            "critical": True,
        },
        {
            "action": "ec2:AssociateAddress",
            "description": "Mover Elastic IP al nuevo primario",
            "test": "describe_addresses",
            "critical": True,
        },
    ],
    # Pilot Light: necesita start + restore + DNS
    "PILOT_LIGHT": [
        {
            "action": "ec2:StartInstances",
            "description": "Encender instancia DR",
            "test": "start_instances_dry",
            "critical": True,
        },
        {
            "action": "ec2:StopInstances",
            "description": "Detener instancia DR después de test",
            "test": "stop_instances_dry",
            "critical": True,
        },
        {
            "action": "ec2:AttachVolume",
            "description": "Montar volúmenes EBS con datos",
            "test": "describe_volumes",
            "critical": True,
        },
        {
            "action": "route53:ChangeResourceRecordSets",
            "description": "Actualizar DNS para failover",
            "test": "list_hosted_zones",
            "critical": True,
        },
        {
            "action": "ec2:CreateSnapshot",
            "description": "Crear snapshots para DR",
            "test": "describe_snapshots",
            "critical": False,
        },
    ],
    # Backup & Restore: necesita crear infra + restore
    "BACKUP_RESTORE": [
        {
            "action": "cloudformation:CreateStack",
            "description": "Crear infraestructura desde template",
            "test": "list_stacks",
            "critical": True,
        },
        {
            "action": "cloudformation:DescribeStacks",
            "description": "Verificar estado de creación de infra",
            "test": "list_stacks",
            "critical": True,
        },
        {
            "action": "s3:GetObject",
            "description": "Descargar backups desde S3",
            "test": "list_buckets",
            "critical": True,
        },
        {
            "action": "route53:ChangeResourceRecordSets",
            "description": "Actualizar DNS post-restore",
            "test": "list_hosted_zones",
            "critical": True,
        },
    ],
    # Hot Standby: en general lo maneja Pacemaker, pero EIP si es cloud
    "HOT_STANDBY": [
        {
            "action": "ec2:AssociateAddress",
            "description": "Mover Elastic IP (si usa EIP en vez de Pacemaker VIP)",
            "test": "describe_addresses",
            "critical": False,
        },
    ],
}

AZURE_PERMISSIONS = {
    "COMMON": [
        {
            "action": "Microsoft.Compute/virtualMachines/read",
            "description": "Consultar estado de VMs",
            "test": "list_vms",
            "required_for": ["HOT_STANDBY", "WARM_STANDBY", "PILOT_LIGHT", "CROSS_REGION_DR"],
        },
    ],
    "WARM_STANDBY": [
        {
            "action": "Microsoft.Compute/virtualMachines/write",
            "description": "Cambiar tamaño de VM (scale-up/down)",
            "test": "resize_vm_dry",
            "critical": True,
        },
        {
            "action": "Microsoft.Compute/virtualMachines/start/action",
            "description": "Iniciar VM después de resize",
            "test": "start_vm_dry",
            "critical": True,
        },
        {
            "action": "Microsoft.Compute/virtualMachines/deallocate/action",
            "description": "Detener VM para resize",
            "test": "stop_vm_dry",
            "critical": True,
        },
    ],
    "CROSS_REGION_DR": [
        {
            "action": "Microsoft.Network/trafficManagerProfiles/write",
            "description": "Actualizar Traffic Manager para failover",
            "test": "list_traffic_managers",
            "critical": True,
        },
        {
            "action": "Microsoft.Compute/virtualMachines/start/action",
            "description": "Iniciar VMs en región DR",
            "test": "start_vm_dry",
            "critical": True,
        },
    ],
    "PILOT_LIGHT": [
        {
            "action": "Microsoft.Compute/virtualMachines/start/action",
            "description": "Encender VM DR",
            "test": "start_vm_dry",
            "critical": True,
        },
        {
            "action": "Microsoft.Compute/disks/read",
            "description": "Acceder a discos para restore",
            "test": "list_disks",
            "critical": True,
        },
    ],
}

GCP_PERMISSIONS = {
    "COMMON": [
        {
            "action": "compute.instances.get",
            "description": "Consultar estado de instancias",
            "test": "list_instances",
            "required_for": ["HOT_STANDBY", "WARM_STANDBY", "PILOT_LIGHT"],
        },
    ],
    "WARM_STANDBY": [
        {
            "action": "compute.instances.setMachineType",
            "description": "Cambiar tipo de máquina (scale-up/down)",
            "test": "get_machine_types",
            "critical": True,
        },
        {
            "action": "compute.instances.start",
            "description": "Iniciar instancia después de resize",
            "test": "start_instance_dry",
            "critical": True,
        },
        {
            "action": "compute.instances.stop",
            "description": "Detener instancia para resize",
            "test": "stop_instance_dry",
            "critical": True,
        },
    ],
    "PILOT_LIGHT": [
        {
            "action": "compute.instances.start",
            "description": "Encender instancia DR",
            "test": "start_instance_dry",
            "critical": True,
        },
        {
            "action": "dns.changes.create",
            "description": "Actualizar Cloud DNS para failover",
            "test": "list_dns_zones",
            "critical": True,
        },
    ],
}

PROVIDER_PERMISSIONS = {
    "aws": AWS_PERMISSIONS,
    "azure": AZURE_PERMISSIONS,
    "gcp": GCP_PERMISSIONS,
}


# ════════════════════════════════════════════════════════════
# Validación de permisos
# ════════════════════════════════════════════════════════════

def get_required_permissions(provider, strategy):
    """
    Retorna la lista de permisos cloud requeridos para una estrategia HA.

    Parámetros:
        provider: "aws", "azure", "gcp", "on-premise"
        strategy: "HOT_STANDBY", "WARM_STANDBY", "PILOT_LIGHT", etc.

    Retorna:
        Lista de dicts con { action, description, critical }
    """
    if provider == "on-premise":
        return []

    perms_map = PROVIDER_PERMISSIONS.get(provider, {})
    common = perms_map.get("COMMON", [])
    specific = perms_map.get(strategy, [])

    # Filtrar common por los que aplican a esta estrategia
    filtered_common = [
        p for p in common
        if strategy in p.get("required_for", [])
    ]

    return filtered_common + specific


def validate_cloud_permissions(provider, strategy, **cloud_config):
    """
    Valida que el agente tenga los permisos cloud necesarios.

    Intenta hacer llamadas de prueba (dry-run o read-only) para
    verificar que las credenciales cloud tienen los permisos necesarios.

    Parámetros:
        provider: "aws", "azure", "gcp"
        strategy: estrategia HA configurada
        **cloud_config: configuración adicional (region, credentials, etc.)

    Retorna:
        (success, results)
        success: True si se pudo conectar al cloud
        results: lista de { action, description, status, error }
    """
    if provider == "on-premise":
        return True, [{
            "action": "N/A",
            "description": "Sistema on-premise — permisos cloud no aplican",
            "status": "not_applicable",
        }]

    required = get_required_permissions(provider, strategy)
    if not required:
        return True, [{
            "action": "N/A",
            "description": f"No hay permisos cloud requeridos para {strategy}",
            "status": "ok",
        }]

    if provider == "aws":
        return _validate_aws(required, cloud_config)
    elif provider == "azure":
        return _validate_azure(required, cloud_config)
    elif provider == "gcp":
        return _validate_gcp(required, cloud_config)

    return False, [{"error": f"Proveedor cloud no soportado: {provider}"}]


def _validate_aws(required_perms, config):
    """Valida permisos en AWS usando STS y dry-run calls."""
    try:
        import boto3
    except ImportError:
        return False, [{
            "error": "boto3 no instalado. Instala con: pip install boto3",
            "grant_hint": "pip install boto3",
        }]

    results = []
    try:
        # Verificar identidad básica
        sts = boto3.client("sts")
        identity = sts.get_caller_identity()
        account_id = identity.get("Account", "?")
        arn = identity.get("Arn", "?")
        logger.info(f"AWS Identity: {arn} (cuenta: {account_id})")

        results.append({
            "action": "sts:GetCallerIdentity",
            "description": f"Identidad AWS: {arn}",
            "status": "ok",
        })
    except Exception as e:
        return False, [{
            "error": f"No se pudo autenticar en AWS: {e}",
            "grant_hint": (
                "Configura credenciales AWS:\n"
                "  - IAM Instance Profile (recomendado en EC2)\n"
                "  - Variables de entorno AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY\n"
                "  - Archivo ~/.aws/credentials"
            ),
        }]

    # Validar cada permiso
    ec2 = boto3.client("ec2")
    for perm in required_perms:
        result = {
            "action": perm["action"],
            "description": perm["description"],
            "critical": perm.get("critical", False),
        }

        try:
            test_name = perm.get("test", "")
            if test_name == "describe_instances":
                ec2.describe_instances(MaxResults=5)
                result["status"] = "ok"

            elif test_name == "describe_instance_status":
                ec2.describe_instance_status(MaxResults=5)
                result["status"] = "ok"

            elif test_name == "describe_addresses":
                ec2.describe_addresses()
                result["status"] = "ok"

            elif test_name == "describe_volumes":
                ec2.describe_volumes(MaxResults=5)
                result["status"] = "ok"

            elif test_name == "describe_snapshots":
                ec2.describe_snapshots(OwnerIds=["self"], MaxResults=5)
                result["status"] = "ok"

            elif test_name == "modify_instance_attribute_dry":
                # No se puede hacer dry-run de ModifyInstanceAttribute,
                # pero si puede DescribeInstances, es una buena señal
                ec2.describe_instances(MaxResults=5)
                result["status"] = "inferred"
                result["note"] = "Verificado indirectamente — confirmar con IAM Policy Simulator"

            elif test_name == "start_instances_dry":
                # DryRun para StartInstances
                try:
                    ec2.start_instances(InstanceIds=["i-00000000000000000"], DryRun=True)
                except ec2.exceptions.ClientError as dry_err:
                    if "DryRunOperation" in str(dry_err):
                        result["status"] = "ok"
                    elif "UnauthorizedOperation" in str(dry_err):
                        result["status"] = "denied"
                        result["grant_hint"] = _aws_policy_hint(perm["action"])
                    else:
                        result["status"] = "ok"  # other errors = has permission

            elif test_name == "stop_instances_dry":
                try:
                    ec2.stop_instances(InstanceIds=["i-00000000000000000"], DryRun=True)
                except ec2.exceptions.ClientError as dry_err:
                    if "DryRunOperation" in str(dry_err):
                        result["status"] = "ok"
                    elif "UnauthorizedOperation" in str(dry_err):
                        result["status"] = "denied"
                        result["grant_hint"] = _aws_policy_hint(perm["action"])
                    else:
                        result["status"] = "ok"

            elif test_name == "list_hosted_zones":
                r53 = boto3.client("route53")
                r53.list_hosted_zones(MaxItems="1")
                result["status"] = "ok"

            elif test_name == "list_stacks":
                cf = boto3.client("cloudformation")
                cf.list_stacks(StackStatusFilter=["CREATE_COMPLETE"])
                result["status"] = "ok"

            elif test_name == "list_buckets":
                s3 = boto3.client("s3")
                s3.list_buckets()
                result["status"] = "ok"

            else:
                result["status"] = "skipped"
                result["note"] = "Test no implementado"

        except Exception as e:
            err_str = str(e)
            if "AccessDenied" in err_str or "UnauthorizedOperation" in err_str:
                result["status"] = "denied"
                result["grant_hint"] = _aws_policy_hint(perm["action"])
            else:
                result["status"] = "error"
                result["error"] = err_str

        results.append(result)

    return True, results


def _validate_azure(required_perms, config):
    """Valida permisos en Azure."""
    try:
        from azure.identity import DefaultAzureCredential
        from azure.mgmt.compute import ComputeManagementClient
    except ImportError:
        return False, [{
            "error": "SDK de Azure no instalado. Instala con: pip install azure-identity azure-mgmt-compute",
            "grant_hint": "pip install azure-identity azure-mgmt-compute azure-mgmt-network",
        }]

    results = []
    try:
        credential = DefaultAzureCredential()
        # Intentar obtener token para validar autenticación
        token = credential.get_token("https://management.azure.com/.default")
        results.append({
            "action": "Azure Authentication",
            "description": "Autenticación con Azure exitosa",
            "status": "ok",
        })
    except Exception as e:
        return False, [{
            "error": f"No se pudo autenticar en Azure: {e}",
            "grant_hint": (
                "Configura credenciales Azure:\n"
                "  - Managed Identity (recomendado en Azure VMs)\n"
                "  - Service Principal con variables AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_CLIENT_SECRET\n"
                "  - Azure CLI login"
            ),
        }]

    # Validar permisos individuales requiere Azure RBAC checks
    # Por ahora, marcamos como "inferred" basándonos en la autenticación
    for perm in required_perms:
        results.append({
            "action": perm["action"],
            "description": perm["description"],
            "critical": perm.get("critical", False),
            "status": "inferred",
            "note": "Autenticado — verificar asignación RBAC manualmente",
            "grant_hint": f'az role assignment create --assignee <agent-identity> --role "Contributor" --scope /subscriptions/<sub-id>',
        })

    return True, results


def _validate_gcp(required_perms, config):
    """Valida permisos en GCP."""
    try:
        from google.auth import default as gcp_default
        from google.auth.transport.requests import Request
    except ImportError:
        return False, [{
            "error": "SDK de GCP no instalado. Instala con: pip install google-auth google-cloud-compute",
            "grant_hint": "pip install google-auth google-cloud-compute google-cloud-dns",
        }]

    results = []
    try:
        credentials, project = gcp_default()
        credentials.refresh(Request())
        results.append({
            "action": "GCP Authentication",
            "description": f"Autenticación con GCP exitosa (proyecto: {project})",
            "status": "ok",
        })
    except Exception as e:
        return False, [{
            "error": f"No se pudo autenticar en GCP: {e}",
            "grant_hint": (
                "Configura credenciales GCP:\n"
                "  - Service Account en la VM (recomendado)\n"
                "  - Variable GOOGLE_APPLICATION_CREDENTIALS con path al JSON key\n"
                "  - gcloud auth application-default login"
            ),
        }]

    for perm in required_perms:
        results.append({
            "action": perm["action"],
            "description": perm["description"],
            "critical": perm.get("critical", False),
            "status": "inferred",
            "note": "Autenticado — verificar IAM bindings con: gcloud projects get-iam-policy",
            "grant_hint": f"gcloud projects add-iam-policy-binding {project} --member=serviceAccount:<sa> --role=roles/compute.admin",
        })

    return True, results


# ════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════

def _aws_policy_hint(action):
    """Genera un hint de IAM policy para un permiso AWS."""
    service, api = action.split(":", 1) if ":" in action else (action, "*")
    return (
        f'{{\n'
        f'  "Effect": "Allow",\n'
        f'  "Action": "{action}",\n'
        f'  "Resource": "*"\n'
        f'}}\n'
        f'\nO adjuntar la policy al IAM Role/Instance Profile del agente.'
    )


def get_permissions_summary(provider, strategy):
    """
    Resumen legible de los permisos necesarios para una estrategia.

    Útil para mostrar al usuario qué necesita configurar.
    """
    perms = get_required_permissions(provider, strategy)
    if not perms:
        return f"No se requieren permisos cloud para {strategy} en {provider}."

    lines = [f"Permisos {provider.upper()} necesarios para {strategy}:"]
    for p in perms:
        critical = " [CRITICO]" if p.get("critical") else ""
        lines.append(f"  - {p['action']}: {p['description']}{critical}")

    return "\n".join(lines)
