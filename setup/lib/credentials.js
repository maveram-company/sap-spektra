// ============================================================================
//  Avvale SAP AlwaysOps v1.0 — Setup Portal — Gestion de credenciales AWS
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { sanitizeProfileName } = require('../../lambda/utilidades/input-validator');

const AWS_DIR = path.join(os.homedir(), '.aws');
const CREDENTIALS_FILE = path.join(AWS_DIR, 'credentials');
const CONFIG_FILE = path.join(AWS_DIR, 'config');

// ── Parsear archivo INI simple (compatible con AWS credentials) ──
function parseIni(content) {
  const result = {};
  let currentSection = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

    // Seccion: [nombre] o [profile nombre]
    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      result[currentSection] = result[currentSection] || {};
      continue;
    }

    // Key = value
    if (currentSection) {
      const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
      if (kvMatch) {
        result[currentSection][kvMatch[1].trim()] = kvMatch[2].trim();
      }
    }
  }

  return result;
}

// ── Serializar objeto a formato INI ──
function stringifyIni(data) {
  let output = '';
  for (const [section, values] of Object.entries(data)) {
    output += `[${section}]\n`;
    for (const [key, value] of Object.entries(values)) {
      output += `${key} = ${value}\n`;
    }
    output += '\n';
  }
  return output;
}

// ── Listar perfiles AWS existentes ──
function listProfiles() {
  const profiles = [];

  // Leer credentials
  let credData = {};
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      credData = parseIni(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
    } catch (e) { /* archivo corrupto, ignorar */ }
  }

  // Leer config para regiones
  let configData = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      configData = parseIni(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) { /* ignorar */ }
  }

  // Construir lista de perfiles
  for (const [name, creds] of Object.entries(credData)) {
    const hasAccessKey = !!creds.aws_access_key_id;
    // En config, el perfil se llama "profile nombre" excepto "default"
    const configKey = name === 'default' ? 'default' : `profile ${name}`;
    const region = configData[configKey]?.region || null;

    profiles.push({
      name,
      hasAccessKey,
      accessKeyPrefix: hasAccessKey ? creds.aws_access_key_id.substring(0, 4) + '****' + creds.aws_access_key_id.slice(-4) : null,
      region
    });
  }

  return profiles;
}

// ── Guardar credenciales en ~/.aws/ ──
function saveCredentials(profileName, accessKeyId, secretAccessKey, region, sessionToken) {
  // 1. Crear directorio ~/.aws/ si no existe
  if (!fs.existsSync(AWS_DIR)) {
    fs.mkdirSync(AWS_DIR, { recursive: true, mode: 0o700 });
  }

  // 2. Leer o crear archivo de credenciales
  let credData = {};
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      credData = parseIni(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
    } catch (e) { /* empezar fresco */ }
  }

  // 3. Establecer perfil
  credData[profileName] = {
    aws_access_key_id: accessKeyId,
    aws_secret_access_key: secretAccessKey
  };
  if (sessionToken) {
    credData[profileName].aws_session_token = sessionToken;
  }

  // 4. Escribir con permisos restrictivos
  fs.writeFileSync(CREDENTIALS_FILE, stringifyIni(credData), { mode: 0o600 });

  // 5. Actualizar config con la region
  let configData = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      configData = parseIni(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) { /* empezar fresco */ }
  }

  const configKey = profileName === 'default' ? 'default' : `profile ${profileName}`;
  configData[configKey] = { ...configData[configKey], region };

  fs.writeFileSync(CONFIG_FILE, stringifyIni(configData), { mode: 0o600 });

  // 6. Establecer variables de entorno para el proceso actual
  process.env.AWS_PROFILE = profileName;
  process.env.AWS_REGION = region;
  process.env.AWS_ACCESS_KEY_ID = accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = secretAccessKey;
  if (sessionToken) {
    process.env.AWS_SESSION_TOKEN = sessionToken;
  }

  return { success: true, profile: profileName, region };
}

// ── Validar credenciales con STS (sin guardar) ──
async function validateCredentials(accessKeyId, secretAccessKey, region, sessionToken) {
  const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

  const credentials = { accessKeyId, secretAccessKey };
  if (sessionToken) credentials.sessionToken = sessionToken;

  const client = new STSClient({ region, credentials });

  try {
    const identity = await client.send(new GetCallerIdentityCommand({}));
    return {
      success: true,
      account: identity.Account,
      arn: identity.Arn,
      userId: identity.UserId,
      region
    };
  } catch (err) {
    // Clasificar el error
    let errorType = 'unknown';
    if (err.name === 'InvalidClientTokenId' || err.message.includes('InvalidClientTokenId')) {
      errorType = 'invalid_key';
    } else if (err.name === 'SignatureDoesNotMatch') {
      errorType = 'invalid_secret';
    } else if (err.name === 'ExpiredTokenException') {
      errorType = 'expired_token';
    } else if (err.code === 'ENOTFOUND' || err.code === 'ENETUNREACH') {
      errorType = 'network';
    }

    return {
      success: false,
      errorType,
      error: err.message,
      help: getCredentialErrorHelp(errorType)
    };
  }
}

// ── Activar un perfil existente ──
function activateProfile(profileName) {
  const profiles = listProfiles();
  const profile = profiles.find(p => p.name === profileName);

  if (!profile || !profile.hasAccessKey) {
    return { success: false, error: `Perfil '${profileName}' no encontrado o sin access key` };
  }

  // Leer credenciales del perfil
  let credData = {};
  if (fs.existsSync(CREDENTIALS_FILE)) {
    credData = parseIni(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
  }

  const creds = credData[profileName];
  if (!creds?.aws_access_key_id) {
    return { success: false, error: 'No se encontro access key en el perfil' };
  }

  // Establecer variables de entorno
  process.env.AWS_PROFILE = profileName;
  process.env.AWS_ACCESS_KEY_ID = creds.aws_access_key_id;
  process.env.AWS_SECRET_ACCESS_KEY = creds.aws_secret_access_key;
  if (creds.aws_session_token) {
    process.env.AWS_SESSION_TOKEN = creds.aws_session_token;
  }

  // Region desde config
  let configData = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try { configData = parseIni(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch (e) {}
  }
  const configKey = profileName === 'default' ? 'default' : `profile ${profileName}`;
  const region = configData[configKey]?.region;
  if (region) process.env.AWS_REGION = region;

  return { success: true, profile: profileName, region: region || null };
}

// ── Listar perfiles SSO existentes en ~/.aws/config ──
// Soporta ambos formatos:
//   Formato legacy:  sso_start_url directamente en el perfil
//   Formato v2:      sso_session = NombreSesion (referencia a bloque [sso-session])
function listSsoProfiles() {
  const profiles = [];

  if (!fs.existsSync(CONFIG_FILE)) return profiles;

  let configData = {};
  try {
    configData = parseIni(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (e) { return profiles; }

  // Construir mapa de sso-sessions: nombre → { sso_start_url, sso_region }
  const ssoSessions = {};
  for (const [section, values] of Object.entries(configData)) {
    if (section.startsWith('sso-session ')) {
      const sessionName = section.replace('sso-session ', '');
      ssoSessions[sessionName] = {
        ssoStartUrl: values.sso_start_url,
        ssoRegion: values.sso_region
      };
    }
  }

  for (const [section, values] of Object.entries(configData)) {
    // Solo procesar secciones de perfil (profile X o default)
    if (section.startsWith('sso-session ')) continue;

    let ssoStartUrl = null;
    let ssoRegion = null;
    let ssoSessionName = null;

    if (values.sso_start_url) {
      // Formato legacy: sso_start_url directo en el perfil
      ssoStartUrl = values.sso_start_url;
      ssoRegion = values.sso_region || null;
    } else if (values.sso_session && ssoSessions[values.sso_session]) {
      // Formato v2: referencia a sso-session
      ssoSessionName = values.sso_session;
      ssoStartUrl = ssoSessions[values.sso_session].ssoStartUrl;
      ssoRegion = ssoSessions[values.sso_session].ssoRegion || null;
    }

    if (ssoStartUrl) {
      const name = section.replace(/^profile\s+/, '');
      profiles.push({
        name,
        ssoStartUrl,
        ssoRegion,
        ssoSessionName,
        ssoAccountId: values.sso_account_id || null,
        ssoRoleName: values.sso_role_name || null,
        region: values.region || null
      });
    }
  }

  return profiles;
}

// ── Configurar perfil SSO en ~/.aws/config ──
// Soporta ambos formatos:
//   ssoSessionName → usa formato v2 (sso_session = nombre)
//   sin ssoSessionName → usa formato legacy (sso_start_url directo)
function configureSsoProfile(profileName, ssoStartUrl, ssoRegion, ssoAccountId, ssoRoleName, region, ssoSessionName) {
  // 1. Crear directorio ~/.aws/ si no existe
  if (!fs.existsSync(AWS_DIR)) {
    fs.mkdirSync(AWS_DIR, { recursive: true, mode: 0o700 });
  }

  // 2. Leer o crear archivo config
  let configData = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      configData = parseIni(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) { /* empezar fresco */ }
  }

  // 3. Escribir perfil SSO
  const configKey = profileName === 'default' ? 'default' : `profile ${profileName}`;

  if (ssoSessionName) {
    // Formato v2: referencia a sso-session existente
    configData[configKey] = {
      sso_session: ssoSessionName,
      sso_account_id: ssoAccountId,
      sso_role_name: ssoRoleName,
      region: region || 'us-east-1'
    };
  } else {
    // Formato legacy: sso_start_url directo en perfil
    configData[configKey] = {
      sso_start_url: ssoStartUrl,
      sso_region: ssoRegion || region || 'us-east-1',
      sso_account_id: ssoAccountId,
      sso_role_name: ssoRoleName,
      region: region || 'us-east-1'
    };
  }

  fs.writeFileSync(CONFIG_FILE, stringifyIni(configData), { mode: 0o600 });

  return { success: true, profile: profileName };
}

// ════════════════════════════════════════════════════════════
//  SSO OIDC Device Authorization Flow (sin depender de AWS CLI)
//  Permite descubrir cuentas y roles automaticamente
// ════════════════════════════════════════════════════════════

// ── Paso 1: Registrar cliente OIDC + iniciar device authorization ──
async function startSsoAuth(ssoStartUrl, ssoRegion) {
  const { SSOOIDCClient, RegisterClientCommand, StartDeviceAuthorizationCommand } = require('@aws-sdk/client-sso-oidc');

  const region = ssoRegion || 'us-east-1';
  const oidc = new SSOOIDCClient({ region });

  // Registrar cliente publico
  const reg = await oidc.send(new RegisterClientCommand({
    clientName: 'sap-alwaysops-setup',
    clientType: 'public',
    scopes: ['sso:account:access']
  }));

  // Iniciar device authorization
  const auth = await oidc.send(new StartDeviceAuthorizationCommand({
    clientId: reg.clientId,
    clientSecret: reg.clientSecret,
    startUrl: ssoStartUrl
  }));

  return {
    clientId: reg.clientId,
    clientSecret: reg.clientSecret,
    deviceCode: auth.deviceCode,
    userCode: auth.userCode,
    verificationUri: auth.verificationUri,
    verificationUriComplete: auth.verificationUriComplete,
    expiresIn: auth.expiresIn,
    interval: auth.interval || 5
  };
}

// ── Paso 2: Poll para verificar si el usuario completo la auth ──
async function pollSsoToken(ssoRegion, clientId, clientSecret, deviceCode) {
  const { SSOOIDCClient, CreateTokenCommand } = require('@aws-sdk/client-sso-oidc');

  const oidc = new SSOOIDCClient({ region: ssoRegion || 'us-east-1' });

  try {
    const result = await oidc.send(new CreateTokenCommand({
      clientId,
      clientSecret,
      grantType: 'urn:ietf:params:oauth:grant-type:device_code',
      deviceCode
    }));
    return { success: true, accessToken: result.accessToken, expiresIn: result.expiresIn };
  } catch (err) {
    if (err.name === 'AuthorizationPendingException') {
      return { success: false, pending: true };
    }
    if (err.name === 'SlowDownException') {
      return { success: false, pending: true, slowDown: true };
    }
    return { success: false, error: err.message };
  }
}

// ── Paso 3: Listar cuentas AWS disponibles para el usuario ──
async function listSsoAccounts(ssoRegion, accessToken) {
  const { SSOClient, ListAccountsCommand } = require('@aws-sdk/client-sso');

  const sso = new SSOClient({ region: ssoRegion || 'us-east-1' });
  const result = await sso.send(new ListAccountsCommand({ accessToken }));
  return result.accountList || [];
}

// ── Paso 4: Listar roles disponibles para una cuenta ──
async function listSsoAccountRoles(ssoRegion, accessToken, accountId) {
  const { SSOClient, ListAccountRolesCommand } = require('@aws-sdk/client-sso');

  const sso = new SSOClient({ region: ssoRegion || 'us-east-1' });
  const result = await sso.send(new ListAccountRolesCommand({ accessToken, accountId }));
  return result.roleList || [];
}

// ── Guardar token SSO en cache para que fromSSO() lo encuentre ──
function cacheSsoToken(ssoStartUrl, ssoRegion, accessToken, expiresIn) {
  const crypto = require('crypto');
  const cacheDir = path.join(AWS_DIR, 'sso', 'cache');

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  }

  // AWS SDK usa SHA1 del startUrl como nombre del archivo cache
  const hash = crypto.createHash('sha1').update(ssoStartUrl).digest('hex');
  const cachePath = path.join(cacheDir, `${hash}.json`);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  fs.writeFileSync(cachePath, JSON.stringify({
    startUrl: ssoStartUrl,
    region: ssoRegion,
    accessToken,
    expiresAt
  }, null, 2), { mode: 0o600 });

  return { success: true };
}

// ── Legacy: Iniciar login SSO via AWS CLI (fallback) ──
// v1.4 — Seguridad: Usar execFileSync con array de argumentos para evitar inyeccion de comandos
function startSsoLogin(profileName) {
  const { execFileSync } = require('child_process');

  // Validar el nombre de perfil antes de usarlo en exec
  const safeName = sanitizeProfileName(profileName);

  try {
    execFileSync('aws', ['sso', 'login', '--profile', safeName], {
      encoding: 'utf-8',
      timeout: 120000,
      stdio: 'pipe'
    });
    return { success: true, message: 'SSO login completado' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Validar perfil SSO (verificar que el login fue exitoso) ──
async function validateSsoProfile(profileName) {
  const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
  const { fromSSO } = require('@aws-sdk/credential-provider-sso');

  // Leer region del perfil
  let configData = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try { configData = parseIni(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch (e) {}
  }
  const configKey = profileName === 'default' ? 'default' : `profile ${profileName}`;
  const region = configData[configKey]?.region || 'us-east-1';

  try {
    const client = new STSClient({
      region,
      credentials: fromSSO({ profile: profileName })
    });
    const identity = await client.send(new GetCallerIdentityCommand({}));

    // Configurar entorno para el proceso
    process.env.AWS_PROFILE = profileName;
    process.env.AWS_REGION = region;
    // Limpiar credenciales estaticas para que SDK use SSO
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SESSION_TOKEN;

    return {
      success: true,
      account: identity.Account,
      arn: identity.Arn,
      userId: identity.UserId,
      region,
      profile: profileName,
      method: 'sso'
    };
  } catch (err) {
    let errorType = 'sso_not_authenticated';
    if (err.message.includes('expired') || err.message.includes('refresh')) {
      errorType = 'sso_expired';
    } else if (err.code === 'ENOTFOUND' || err.code === 'ENETUNREACH') {
      errorType = 'network';
    }
    return {
      success: false,
      errorType,
      error: err.message,
      help: getCredentialErrorHelp(errorType)
    };
  }
}

// ── Validar SSO usando access token directamente (sin cache/fromSSO) ──
// Obtiene credenciales temporales via GetRoleCredentials y valida con STS
async function validateSsoWithToken(ssoRegion, accessToken, accountId, roleName, deployRegion) {
  const { SSOClient, GetRoleCredentialsCommand } = require('@aws-sdk/client-sso');
  const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

  const region = ssoRegion || 'us-east-1';

  // 1. Obtener credenciales temporales del SSO
  const sso = new SSOClient({ region });
  const roleResult = await sso.send(new GetRoleCredentialsCommand({
    accessToken,
    accountId,
    roleName
  }));

  const creds = roleResult.roleCredentials;

  // 2. Validar con STS
  const sts = new STSClient({
    region: deployRegion || region,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken
    }
  });

  const identity = await sts.send(new GetCallerIdentityCommand({}));

  // 3. Configurar entorno para el proceso de deploy
  process.env.AWS_ACCESS_KEY_ID = creds.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = creds.secretAccessKey;
  process.env.AWS_SESSION_TOKEN = creds.sessionToken;
  process.env.AWS_REGION = deployRegion || region;
  delete process.env.AWS_PROFILE;

  return {
    success: true,
    account: identity.Account,
    arn: identity.Arn,
    userId: identity.UserId,
    region: deployRegion || region,
    method: 'sso-token'
  };
}

// ── Activar perfil SSO (sin login, solo env vars) ──
// Soporta perfiles con sso_start_url directo o sso_session referencia
function activateSsoProfile(profileName) {
  let configData = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try { configData = parseIni(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch (e) {}
  }
  const configKey = profileName === 'default' ? 'default' : `profile ${profileName}`;
  const config = configData[configKey];

  // Aceptar perfiles con sso_start_url directo O sso_session referencia
  if (!config?.sso_start_url && !config?.sso_session) {
    return { success: false, error: `Perfil '${profileName}' no es un perfil SSO` };
  }

  // Configurar para que SDK use SSO provider
  process.env.AWS_PROFILE = profileName;
  process.env.AWS_REGION = config.region || 'us-east-1';
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.AWS_SESSION_TOKEN;

  return { success: true, profile: profileName, region: config.region || null, method: 'sso' };
}

// ── Mensajes de ayuda por tipo de error ──
function getCredentialErrorHelp(errorType) {
  const help = {
    invalid_key: 'El Access Key ID no es valido. Verifica que copiaste correctamente la clave desde la consola IAM de AWS.',
    invalid_secret: 'El Secret Access Key no coincide con el Access Key ID. Verifica ambos valores.',
    expired_token: 'El Session Token ha expirado. Genera nuevas credenciales temporales.',
    network: 'No se puede conectar a AWS. Verifica tu conexion a internet.',
    sso_not_authenticated: 'No has iniciado sesion SSO. Haz clic en "Iniciar SSO Login" para autenticarte en el navegador.',
    sso_expired: 'La sesion SSO ha expirado. Inicia sesion nuevamente con "Iniciar SSO Login".',
    unknown: 'Error inesperado al validar credenciales. Verifica que los valores sean correctos.'
  };
  return help[errorType] || help.unknown;
}

module.exports = {
  listProfiles,
  listSsoProfiles,
  saveCredentials,
  validateCredentials,
  activateProfile,
  configureSsoProfile,
  startSsoLogin,
  validateSsoProfile,
  activateSsoProfile,
  // OIDC Device Flow (descubrimiento de cuentas/roles)
  startSsoAuth,
  pollSsoToken,
  listSsoAccounts,
  listSsoAccountRoles,
  cacheSsoToken,
  validateSsoWithToken
};
