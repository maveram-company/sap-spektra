// ============================================================================
//  Avvale SAP AlwaysOps v1.0 — Setup Portal — Deteccion de prerequisitos
// ============================================================================

'use strict';

const os = require('os');
const { execSync, spawn } = require('child_process');
const { execSafe, getInstallState, setInstallState, addInstallLog, resetInstallState } = require('./utils');

// ── Detectar informacion del sistema ──
function getSystemInfo() {
  const platform = process.platform; // darwin, linux, win32
  const osNames = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' };

  // Detectar si tiene homebrew (macOS)
  let hasBrew = false;
  if (platform === 'darwin') {
    hasBrew = execSafe('which brew').success;
  }

  // Detectar package manager (Linux)
  let packageManager = null;
  if (platform === 'linux') {
    if (execSafe('which apt-get').success) packageManager = 'apt';
    else if (execSafe('which yum').success) packageManager = 'yum';
    else if (execSafe('which dnf').success) packageManager = 'dnf';
  }

  return {
    os: osNames[platform] || platform,
    platform,
    arch: process.arch,
    nodeVersion: process.version,
    homeDir: os.homedir(),
    shell: process.env.SHELL || process.env.COMSPEC || 'unknown',
    hasBrew,
    packageManager,
    cpus: os.cpus().length,
    totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + ' GB'
  };
}

// ── Verificar todos los prerequisitos ──
function checkPrereqs() {
  const checks = {};

  // Node.js (siempre presente ya que estamos corriendo en Node)
  checks.node = {
    installed: true,
    version: process.version,
    ok: true
  };

  // Git
  const gitResult = execSafe('git --version');
  checks.git = {
    installed: gitResult.success,
    version: gitResult.success ? gitResult.output.replace('git version ', '') : null,
    ok: gitResult.success
  };

  // AWS CLI v2
  const whichCmd = process.platform === 'win32' ? 'where aws' : 'which aws';
  const awsWhich = execSafe(whichCmd);
  let awsVersion = null;
  let awsInstalled = false;

  if (awsWhich.success) {
    const versionResult = execSafe('aws --version');
    if (versionResult.success) {
      awsInstalled = true;
      // Output: "aws-cli/2.x.x Python/3.x.x ..."
      const match = versionResult.output.match(/aws-cli\/([\d.]+)/);
      awsVersion = match ? match[1] : versionResult.output.split(' ')[0];
    }
  }

  checks.awscli = {
    installed: awsInstalled,
    version: awsVersion,
    ok: awsInstalled
  };

  // Verificar si AWS tiene credenciales configuradas
  let awsConfigured = false;
  if (awsInstalled) {
    const configCheck = execSafe('aws sts get-caller-identity --output json');
    awsConfigured = configCheck.success;
  }
  // Tambien verificar archivo de credenciales
  const fs = require('fs');
  const path = require('path');
  const credFile = path.join(os.homedir(), '.aws', 'credentials');
  const hasCredFile = fs.existsSync(credFile);

  checks.awsConfigured = {
    configured: awsConfigured || hasCredFile,
    hasCredentialsFile: hasCredFile,
    canCallSTS: awsConfigured,
    ok: awsConfigured
  };

  // Resumen
  checks.allOk = checks.node.ok && checks.git.ok && checks.awscli.ok;

  return checks;
}

// ── Obtener metodo de instalacion recomendado para AWS CLI ──
function getInstallMethod() {
  const platform = process.platform;
  const sysInfo = getSystemInfo();

  if (platform === 'darwin') {
    if (sysInfo.hasBrew) {
      return {
        method: 'brew',
        command: 'brew install awscli',
        requiresSudo: false,
        description: 'Instalar via Homebrew (recomendado para macOS)',
        autoInstallable: true
      };
    }
    return {
      method: 'pkg',
      command: 'curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "/tmp/AWSCLIV2.pkg" && sudo installer -pkg /tmp/AWSCLIV2.pkg -target /',
      requiresSudo: true,
      description: 'Instalar via paquete oficial de AWS (requiere sudo)',
      autoInstallable: false,
      downloadUrl: 'https://awscli.amazonaws.com/AWSCLIV2.pkg'
    };
  }

  if (platform === 'linux') {
    return {
      method: 'bundled',
      command: 'curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip" && cd /tmp && unzip -o awscliv2.zip && sudo ./aws/install',
      requiresSudo: true,
      description: 'Instalar via instalador oficial de AWS para Linux',
      autoInstallable: false,
      downloadUrl: 'https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip'
    };
  }

  if (platform === 'win32') {
    // Detectar winget
    const hasWinget = execSafe('winget --version').success;
    if (hasWinget) {
      return {
        method: 'winget',
        command: 'winget install Amazon.AWSCLI',
        requiresSudo: false,
        description: 'Instalar via Windows Package Manager (winget)',
        autoInstallable: true
      };
    }
    return {
      method: 'msi',
      command: 'Descargar e instalar el MSI de AWS',
      requiresSudo: false,
      description: 'Descargar el instalador MSI de AWS CLI',
      autoInstallable: false,
      downloadUrl: 'https://awscli.amazonaws.com/AWSCLIV2.msi'
    };
  }

  return {
    method: 'manual',
    command: 'Consulta https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html',
    requiresSudo: false,
    description: 'Instalacion manual',
    autoInstallable: false
  };
}

// ── Instalar AWS CLI (para metodos que no requieren sudo) ──
async function installAwsCli() {
  const method = getInstallMethod();
  resetInstallState();

  const state = getInstallState();
  state.status = 'installing';
  setInstallState(state);

  if (!method.autoInstallable) {
    const s = getInstallState();
    s.status = 'requires_manual';
    s.method = method;
    setInstallState(s);
    return { success: false, requiresManual: true, method };
  }

  return new Promise((resolve) => {
    addInstallLog(`Iniciando instalacion: ${method.command}`);

    let cmd, args;
    if (method.method === 'brew') {
      cmd = 'brew';
      args = ['install', 'awscli'];
    } else if (method.method === 'winget') {
      cmd = 'winget';
      args = ['install', 'Amazon.AWSCLI', '--accept-package-agreements', '--accept-source-agreements'];
    } else {
      const s = getInstallState();
      s.status = 'error';
      s.error = 'Metodo de instalacion no soportado para auto-install';
      setInstallState(s);
      resolve({ success: false, error: 'Metodo no soportado' });
      return;
    }

    const child = spawn(cmd, args, { shell: true });

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      lines.forEach(line => addInstallLog(line));
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      lines.forEach(line => addInstallLog(line, 'warn'));
    });

    child.on('close', (code) => {
      if (code === 0) {
        // Verificar que se instalo correctamente
        const versionCheck = execSafe('aws --version');
        if (versionCheck.success) {
          addInstallLog(`AWS CLI instalado: ${versionCheck.output}`, 'success');
          const s = getInstallState();
          s.status = 'success';
          setInstallState(s);
          resolve({ success: true, version: versionCheck.output });
        } else {
          addInstallLog('AWS CLI instalado pero no encontrado en PATH. Reinicia el terminal.', 'warn');
          const s = getInstallState();
          s.status = 'success_needs_restart';
          setInstallState(s);
          resolve({ success: true, needsRestart: true });
        }
      } else {
        addInstallLog(`Instalacion fallo con codigo: ${code}`, 'error');
        const s = getInstallState();
        s.status = 'error';
        s.error = `Proceso termino con codigo ${code}`;
        setInstallState(s);
        resolve({ success: false, error: `Exit code: ${code}` });
      }
    });

    child.on('error', (err) => {
      addInstallLog(`Error: ${err.message}`, 'error');
      const s = getInstallState();
      s.status = 'error';
      s.error = err.message;
      setInstallState(s);
      resolve({ success: false, error: err.message });
    });
  });
}

module.exports = {
  getSystemInfo,
  checkPrereqs,
  getInstallMethod,
  installAwsCli
};
