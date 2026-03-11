'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.0 — Email Agent
//  Agente de notificaciones por email via Amazon SES.
//
//  ¿Qué hace este Lambda?
//  Está suscrito a los SNS topics de alertas y recomendaciones.
//  Cuando recibe un evento (breach, aprobación, recomendación,
//  anomalía HA, alerta preventiva), genera un email HTML bonito
//  y lo envía al equipo via Amazon SES.
// ═══════════════════════════════════════════════════════════════

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const log = require('../utilidades/logger')('email-agent');

// Cliente de AWS SES
const ses = new SESClient({
  region: process.env.SES_REGION || 'us-east-1',
});

// Configuración
const FROM_ADDRESS = process.env.SES_FROM_ADDRESS || 'alwaysops@example.com';
const APPROVAL_API_URL = process.env.APPROVAL_API_URL || 'https://YOUR-API-GATEWAY-URL';

// ─── Routing de destinatarios por severidad ───
// L1: equipo de operaciones SAP (atienden alertas HIGH)
// L2: equipo senior/escalación (solo se les notifica para CRITICAL)
// Admin: siempre recibe todo
const ADMIN_ADDRESSES = (process.env.SES_ADMIN_ADDRESSES || process.env.SES_TO_ADDRESSES || 'admin@example.com').split(',').map(e => e.trim());
const L1_ADDRESSES = (process.env.SES_L1_ADDRESSES || process.env.SES_TO_ADDRESSES || 'admin@example.com').split(',').map(e => e.trim());
const L2_ADDRESSES = (process.env.SES_L2_ADDRESSES || '').split(',').map(e => e.trim()).filter(Boolean);

function getRecipientsBySeverity(severity) {
  // Empezar con Admin (siempre recibe)
  const recipients = new Set(ADMIN_ADDRESSES);

  // L1 recibe HIGH y CRITICAL
  if (severity === 'HIGH' || severity === 'CRITICAL' || severity === 'PREDICTIVE') {
    L1_ADDRESSES.forEach(a => recipients.add(a));
  }

  // L2 solo recibe CRITICAL
  if (severity === 'CRITICAL') {
    L2_ADDRESSES.forEach(a => recipients.add(a));
  }

  return [...recipients];
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: baseTemplate
//  Plantilla HTML base que usan todos los emails.
//  Proporciona un diseño consistente con encabezado de color,
//  cuerpo de contenido y pie de página.
// ═══════════════════════════════════════════════════════════════

function baseTemplate(title, headerColor, bodyContent) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;background-color:#f4f4f4;">
  <div style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <!-- Encabezado -->
    <div style="background:${headerColor};color:white;padding:24px;text-align:center;">
      <h1 style="margin:0;font-size:22px;">SAP Spektra</h1>
      <h2 style="margin:8px 0 0;font-size:16px;font-weight:normal;opacity:0.9;">${title}</h2>
    </div>
    <!-- Contenido -->
    <div style="padding:24px;">
      ${bodyContent}
    </div>
    <!-- Pie de página -->
    <div style="background:#f8f8f8;padding:16px;text-align:center;font-size:12px;color:#888;border-top:1px solid #eee;">
      SAP Spektra v1.0 &mdash; Sistema de monitoreo automatizado<br>
      Este email fue generado autom&aacute;ticamente. No responder.
    </div>
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: tableRow
//  Genera una fila de tabla HTML para mostrar datos.
// ═══════════════════════════════════════════════════════════════

function tableRow(label, value, color) {
  const style = color ? `color:${color};font-weight:bold;` : '';
  return `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:bold;color:#555;">${label}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;${style}">${value}</td>
  </tr>`;
}

// ═══════════════════════════════════════════════════════════════
//  TEMPLATES DE EMAIL
//  Cada tipo de evento tiene su propia plantilla.
// ═══════════════════════════════════════════════════════════════

const TEMPLATES = {
  // ─── Alerta de breach (métrica superó su umbral) ───
  BREACH_DETECTED: (data) => {
    const breaches = data.breaches || [];
    const severityColor = breaches.some(b => b.severity === 'CRITICAL') ? '#dc3545' : '#fd7e14';
    const severityText = breaches.some(b => b.severity === 'CRITICAL') ? 'CRITICAL' : 'HIGH';

    let breachRows = '';
    breaches.forEach(b => {
      const color = b.severity === 'CRITICAL' ? '#dc3545' : '#fd7e14';
      breachRows += `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${b.metricName}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:bold;color:${color};">${b.value}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${b.threshold}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${color};">${b.severity}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${b.runbook}</td>
      </tr>`;
    });

    const body = `
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        ${tableRow('Sistema', data.systemId)}
        ${tableRow('Tipo', `${data.systemType} / ${data.dbType} (${data.osType || 'LINUX'})`)}
        ${tableRow('SID', data.sid)}
        ${tableRow('Ambiente', data.env)}
        ${tableRow('Severidad', severityText, severityColor)}
      </table>
      <h3 style="color:#333;margin:16px 0 8px;">Breaches Detectados (${breaches.length})</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#f5f5f5;">
          <th style="padding:8px 10px;text-align:left;">M&eacute;trica</th>
          <th style="padding:8px 10px;text-align:left;">Valor</th>
          <th style="padding:8px 10px;text-align:left;">Umbral</th>
          <th style="padding:8px 10px;text-align:left;">Severidad</th>
          <th style="padding:8px 10px;text-align:left;">Runbook</th>
        </tr>
        ${breachRows}
      </table>
      <p style="color:#666;font-size:13px;margin-top:16px;">
        Los runbooks marcados como <strong>costSafe</strong> se ejecutan autom&aacute;ticamente.
        Los dem&aacute;s requieren aprobaci&oacute;n manual.
      </p>`;

    return {
      subject: `[SAP Spektra] ${severityText}: ${data.systemId} - ${breaches.length} breach(es)`,
      htmlBody: baseTemplate(`Alerta de Breach - ${severityText}`, severityColor, body),
    };
  },

  // ─── Solicitud de aprobación ───
  APPROVAL_REQUEST: (data) => {
    const body = `
      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:16px;margin-bottom:16px;">
        <strong>Se requiere aprobaci&oacute;n humana para ejecutar una acci&oacute;n correctiva.</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        ${tableRow('Sistema', data.systemId)}
        ${tableRow('Runbook', data.runbookId)}
        ${tableRow('Severidad', data.severity, data.severity === 'CRITICAL' ? '#dc3545' : '#fd7e14')}
        ${tableRow('Metrica', `${data.metricName} = ${data.metricValue}`)}
        ${data.costEstimate ? tableRow('Costo estimado', `$${data.costEstimate.costUsd}/mes — ${data.costEstimate.description}`, data.costEstimate.costUsd > 0 ? '#fd7e14' : '#28a745') : ''}
        ${data.safetyGateDecision ? tableRow('Safety Gate', `${data.safetyGateDecision}: ${data.safetyGateReason || ''}`, '#dc3545') : ''}
        ${tableRow('Expira', data.expiresAt)}
      </table>
      <h3 style="color:#333;">Comandos que se ejecutar&aacute;n:</h3>
      <div style="background:#f5f5f5;padding:12px;border-radius:4px;font-family:monospace;font-size:12px;white-space:pre-wrap;margin-bottom:16px;">${(data.commands || []).join('\n')}</div>
      <div style="text-align:center;margin:24px 0;">
        <a href="${data.approveUrl}" style="display:inline-block;background:#28a745;color:white;padding:12px 32px;text-decoration:none;border-radius:4px;font-weight:bold;margin-right:12px;">APROBAR</a>
        <a href="${data.rejectUrl}" style="display:inline-block;background:#dc3545;color:white;padding:12px 32px;text-decoration:none;border-radius:4px;font-weight:bold;">RECHAZAR</a>
      </div>`;

    return {
      subject: `[SAP Spektra] Aprobacion requerida: ${data.systemId} - ${data.runbookId}`,
      htmlBody: baseTemplate('Solicitud de Aprobacion', '#ffc107', body),
    };
  },

  // ─── Resultado de aprobación ───
  APPROVAL_RESULT: (data) => {
    const isApproved = data.status === 'APPROVED';
    const color = isApproved ? '#28a745' : '#dc3545';

    const body = `
      <table style="width:100%;border-collapse:collapse;">
        ${tableRow('Sistema', data.systemId)}
        ${tableRow('Runbook', data.runbookId)}
        ${tableRow('Estado', data.status, color)}
        ${tableRow('Procesado por', data.processedBy || 'N/A')}
      </table>`;

    return {
      subject: `[SAP Spektra] Aprobacion ${data.status}: ${data.systemId} - ${data.runbookId}`,
      htmlBody: baseTemplate(`Aprobacion ${data.status}`, color, body),
    };
  },

  // ─── Resultado de ejecución de runbook ───
  RUNBOOK_RESULT: (data) => {
    let resultRows = '';
    (data.results || []).forEach(r => {
      const color = r.success ? '#28a745' : '#dc3545';
      resultRows += `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.runbookId}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.metricName || 'N/A'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${color};font-weight:bold;">${r.success ? 'OK' : 'FALLO'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.autoExecuted ? 'Auto' : 'Aprobado'}</td>
      </tr>`;
    });

    const body = `
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        ${tableRow('Sistema', data.systemId)}
        ${tableRow('Acciones ejecutadas', (data.results || []).length)}
      </table>
      <h3 style="color:#333;">Resultados</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#f5f5f5;">
          <th style="padding:8px 10px;text-align:left;">Runbook</th>
          <th style="padding:8px 10px;text-align:left;">M&eacute;trica</th>
          <th style="padding:8px 10px;text-align:left;">Estado</th>
          <th style="padding:8px 10px;text-align:left;">Tipo</th>
        </tr>
        ${resultRows}
      </table>`;

    return {
      subject: `[SAP Spektra] Runbook ejecutado: ${data.systemId}`,
      htmlBody: baseTemplate('Resultado de Runbook', '#17a2b8', body),
    };
  },

  // ─── Recomendación del advisor (Bedrock) ───
  ADVISOR_RECOMMENDATION: (data) => {
    // Convertir saltos de línea a HTML
    const recommendationHtml = (data.recommendation || '')
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    const body = `
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        ${tableRow('Sistema', data.systemId)}
        ${tableRow('Tipo de analisis', data.originalEventType === 'BREACH_DETECTED' ? 'Analisis de Breach' : 'Snapshot Periodico')}
        ${tableRow('Motor IA', data.bedrockUsed ? 'Amazon Bedrock (Claude)' : 'Analisis automatico basico')}
      </table>
      <h3 style="color:#333;">Recomendaci&oacute;n</h3>
      <div style="background:#f0f7ff;border-left:4px solid #0d6efd;padding:16px;border-radius:0 4px 4px 0;line-height:1.6;">
        ${recommendationHtml}
      </div>`;

    return {
      subject: `[SAP Spektra] Advisor: ${data.systemId} (${data.originalEventType})`,
      htmlBody: baseTemplate('Recomendacion del Advisor', '#0d6efd', body),
    };
  },

  // ─── Anomalía de HA ───
  HA_ANOMALY: (data) => {
    let anomalyRows = '';
    (data.anomalies || []).forEach(a => {
      const color = a.severity === 'CRITICAL' ? '#dc3545' : '#fd7e14';
      anomalyRows += `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${color};">${a.severity}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${a.metric}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${a.detail}</td>
      </tr>`;
    });

    const body = `
      <div style="background:#f8d7da;border:1px solid #f5c6cb;border-radius:4px;padding:16px;margin-bottom:16px;">
        <strong>Se detectaron anomal&iacute;as de Alta Disponibilidad.</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        ${tableRow('Sistema', data.systemId)}
        ${tableRow('Severidad', data.severity, '#dc3545')}
        ${tableRow('Runbook recomendado', data.recommendedRunbook || 'RB-HA-001')}
      </table>
      <h3 style="color:#333;">Anomal&iacute;as Detectadas</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#f5f5f5;">
          <th style="padding:8px 10px;text-align:left;">Severidad</th>
          <th style="padding:8px 10px;text-align:left;">M&eacute;trica</th>
          <th style="padding:8px 10px;text-align:left;">Detalle</th>
        </tr>
        ${anomalyRows}
      </table>`;

    return {
      subject: `[SAP Spektra] HA Anomalia: ${data.systemId} (${data.severity})`,
      htmlBody: baseTemplate('Anomalia de Alta Disponibilidad', '#dc3545', body),
    };
  },

  // ─── Digest Ejecutivo Diario (UC4) ───
  DAILY_DIGEST: (data) => {
    const digestHtml = (data.digest || '')
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    let systemRows = '';
    (data.systemsSummary || []).forEach(s => {
      const statusColor = s.breachCount > 0 ? '#dc3545' : '#28a745';
      systemRows += `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${s.systemId}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${s.metricsCollected || 0}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${statusColor};font-weight:bold;">${s.breachCount || 0}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${s.runbooksExecuted || 0}</td>
      </tr>`;
    });

    const body = `
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        ${tableRow('Periodo', data.period || 'Ultimas 24h')}
        ${tableRow('Sistemas monitoreados', data.systemsCount || 0)}
        ${tableRow('Motor IA', data.bedrockUsed ? 'Amazon Bedrock (Claude)' : 'Analisis automatico')}
      </table>
      ${systemRows ? `
      <h3 style="color:#333;">Resumen por Sistema</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#f5f5f5;">
          <th style="padding:8px 10px;text-align:left;">Sistema</th>
          <th style="padding:8px 10px;text-align:left;">M&eacute;tricas</th>
          <th style="padding:8px 10px;text-align:left;">Breaches</th>
          <th style="padding:8px 10px;text-align:left;">Runbooks</th>
        </tr>
        ${systemRows}
      </table>` : ''}
      <h3 style="color:#333;">An&aacute;lisis del Advisor</h3>
      <div style="background:#f0f7ff;border-left:4px solid #0d6efd;padding:16px;border-radius:0 4px 4px 0;line-height:1.6;">
        ${digestHtml || 'Sin analisis disponible'}
      </div>`;

    return {
      subject: `[SAP Spektra] Digest Diario - ${data.systemsCount || 0} sistemas`,
      htmlBody: baseTemplate('Digest Ejecutivo Diario', '#6f42c1', body),
    };
  },

  // ─── Predicción de Disco (UC2) ───
  DISK_FORECAST: (data) => {
    let forecastRows = '';
    (data.forecasts || []).forEach(f => {
      const color = f.daysToFull <= 3 ? '#dc3545' : f.daysToFull <= 7 ? '#fd7e14' : '#28a745';
      forecastRows += `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${f.systemId}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${f.mountPoint || f.metricName}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${f.currentPct}%</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${color};font-weight:bold;">${f.daysToFull} dias</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${f.recommendation || 'N/A'}</td>
      </tr>`;
    });

    const analysisHtml = (data.analysis || '')
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    const body = `
      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:16px;margin-bottom:16px;">
        <strong>Predicci&oacute;n de espacio en disco para las pr&oacute;ximas 6 horas.</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        ${tableRow('Motor IA', data.bedrockUsed ? 'Amazon Bedrock (Claude)' : 'Regresion lineal')}
        ${tableRow('Ventana', data.forecastWindow || '6 horas')}
      </table>
      ${forecastRows ? `
      <h3 style="color:#333;">Predicciones de Disco</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#f5f5f5;">
          <th style="padding:8px 10px;text-align:left;">Sistema</th>
          <th style="padding:8px 10px;text-align:left;">Punto montaje</th>
          <th style="padding:8px 10px;text-align:left;">Actual</th>
          <th style="padding:8px 10px;text-align:left;">Dias hasta lleno</th>
          <th style="padding:8px 10px;text-align:left;">Recomendaci&oacute;n</th>
        </tr>
        ${forecastRows}
      </table>` : '<p>No hay predicciones de disco preocupantes.</p>'}
      ${analysisHtml ? `
      <h3 style="color:#333;">An&aacute;lisis Bedrock</h3>
      <div style="background:#f0f7ff;border-left:4px solid #0d6efd;padding:16px;border-radius:0 4px 4px 0;line-height:1.6;">
        ${analysisHtml}
      </div>` : ''}`;

    return {
      subject: `[SAP Spektra] Forecast Disco - ${(data.forecasts || []).length} alertas`,
      htmlBody: baseTemplate('Prediccion de Disco (UC2)', '#fd7e14', body),
    };
  },

  // ─── Alerta de Safety Gate (UC3 — cuando bloquea una auto-ejecución) ───
  SAFETY_GATE_ALERT: (data) => {
    const body = `
      <div style="background:#f8d7da;border:1px solid #f5c6cb;border-radius:4px;padding:16px;margin-bottom:16px;">
        <strong>El Safety Gate (UC3) bloque&oacute; una auto-ejecuci&oacute;n de runbook.</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        ${tableRow('Sistema', data.systemId)}
        ${tableRow('Runbook', data.runbookId)}
        ${tableRow('Decision', data.decision, data.decision === 'REQUIRES_HUMAN' ? '#dc3545' : '#fd7e14')}
        ${tableRow('Razon', data.reason)}
        ${data.condition ? tableRow('Condicion detectada', data.condition) : ''}
        ${data.alternative ? tableRow('Alternativa sugerida', data.alternative) : ''}
      </table>
      <p style="color:#666;font-size:13px;">
        El runbook fue redirigido a aprobaci&oacute;n humana. Revise la solicitud de aprobaci&oacute;n correspondiente.
      </p>`;

    return {
      subject: `[SAP Spektra] Safety Gate: ${data.systemId} - ${data.runbookId} (${data.decision})`,
      htmlBody: baseTemplate('Safety Gate Bloqueo (UC3)', '#dc3545', body),
    };
  },

  // ─── Alerta preventiva ───
  PREVENTIVE_ALERT: (data) => {
    let predRows = '';
    (data.predictions || []).forEach(p => {
      predRows += `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${p.metricName}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${p.currentValue}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#fd7e14;font-weight:bold;">${p.predictedValue}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${p.threshold}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${p.minutesToBreach ? p.minutesToBreach + ' min' : 'N/A'}</td>
      </tr>`;
    });

    const body = `
      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:16px;margin-bottom:16px;">
        <strong>El motor preventivo detect&oacute; m&eacute;tricas con tendencia a superar sus umbrales.</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        ${tableRow('Sistema', data.systemId)}
        ${tableRow('Predicciones', (data.predictions || []).length)}
      </table>
      <h3 style="color:#333;">Predicciones</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="background:#f5f5f5;">
          <th style="padding:8px 10px;text-align:left;">M&eacute;trica</th>
          <th style="padding:8px 10px;text-align:left;">Actual</th>
          <th style="padding:8px 10px;text-align:left;">Predicho</th>
          <th style="padding:8px 10px;text-align:left;">Umbral</th>
          <th style="padding:8px 10px;text-align:left;">Tiempo</th>
        </tr>
        ${predRows}
      </table>`;

    return {
      subject: `[SAP Spektra] Alerta Preventiva: ${data.systemId}`,
      htmlBody: baseTemplate('Alerta Preventiva', '#fd7e14', body),
    };
  },
};

// ═══════════════════════════════════════════════════════════════
//  FUNCIÓN: sendEmail
//  Envía un email via Amazon SES.
// ═══════════════════════════════════════════════════════════════

async function sendEmail(subject, htmlBody, recipients) {
  const toAddresses = recipients || ADMIN_ADDRESSES;
  try {
    await ses.send(new SendEmailCommand({
      Source: FROM_ADDRESS,
      Destination: {
        ToAddresses: toAddresses,
      },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: htmlBody, Charset: 'UTF-8' },
        },
      },
    }));

    log.info('Email enviado', { subject, recipients: toAddresses });
    return { success: true };
  } catch (err) {
    log.error('Error enviando email', { error: err.message });
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
//  Recibe eventos de SNS y envía emails según el tipo de evento.
// ═══════════════════════════════════════════════════════════════

exports.handler = async (event, context) => {
  log.initFromEvent(event, context);
  log.info('SAP Spektra Email Agent v1.0 invocado');
  const startTime = Date.now();

  try {
    const records = event.Records || [];

    if (records.length === 0) {
      log.info('No hay registros SNS para procesar');
      return { statusCode: 200, body: { message: 'Sin eventos' } };
    }

    const results = [];

    for (const record of records) {
      const snsMessage = record.Sns?.Message;
      if (!snsMessage) continue;

      const data = JSON.parse(snsMessage);
      const eventType = data.type;

      log.info('Procesando evento', { eventType, systemId: data.systemId || 'N/A' });

      // Buscar la plantilla correspondiente
      const templateFn = TEMPLATES[eventType];
      if (!templateFn) {
        log.warn('No hay plantilla para tipo de evento', { eventType });
        continue;
      }

      // Generar el email
      const { subject, htmlBody } = templateFn(data);

      // Determinar severidad para routing de destinatarios
      const severity = data.severity ||
        (data.breaches?.some(b => b.severity === 'CRITICAL') ? 'CRITICAL' :
         data.breaches?.some(b => b.severity === 'HIGH') ? 'HIGH' : null);
      const recipients = severity ? getRecipientsBySeverity(severity) : ADMIN_ADDRESSES;

      // Enviar
      const sendResult = await sendEmail(subject, htmlBody, recipients);

      results.push({
        eventType,
        systemId: data.systemId || 'N/A',
        emailSent: sendResult.success,
        error: sendResult.error,
      });
    }

    const duration = Date.now() - startTime;
    log.info('Completado', { duration: `${duration}ms`, results });

    return {
      statusCode: 200,
      body: {
        message: 'SAP Spektra Email Agent v1.0 completado',
        duration: `${duration}ms`,
        emailsSent: results.filter(r => r.emailSent).length,
        results,
      },
    };

  } catch (err) {
    log.error('Error fatal', { error: err.message, stack: err.stack });
    return { statusCode: 500, body: { error: err.message } };
  }
};
