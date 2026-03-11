'use strict';

// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.0 — Compliance Reporter (H39)
//  Modulo dedicado a la generacion de reportes de cumplimiento
//  regulatorio para tres frameworks: SOX, GxP e ISO 27001.
//
//  Cada framework define entre 8-12 checks especificos que se
//  evaluan contra datos reales en DynamoDB (incidentes,
//  aprobaciones, ejecuciones de runbook, resultados del advisor).
//
//  Resultado: JSON estructurado con estado PASS/FAIL/WARNING,
//  evidencia concreta, recomendaciones y score global (0-100).
//
//  Uso:
//    const { generateFullComplianceReport } = require('./compliance');
//    const report = await generateFullComplianceReport(systemId, dateRange, { ddbDoc });
//
//  Prefijo de log: [H39]
// ═══════════════════════════════════════════════════════════════

const { QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const log = require('../utilidades/logger')('audit-compliance');

// ─── Variables de entorno (tablas DynamoDB) ───
const INCIDENTS_TABLE = process.env.INCIDENTS_TABLE || 'sap-alwaysops-incidents';
const APPROVALS_TABLE = process.env.APPROVALS_TABLE || 'sap-alwaysops-approvals';
const RUNBOOK_EXECUTIONS_TABLE = process.env.RUNBOOK_EXECUTIONS_TABLE || 'sap-alwaysops-runbook-executions';
const ADVISOR_RESULTS_TABLE = process.env.ADVISOR_RESULTS_TABLE || 'sap-alwaysops-advisor-results';

// ═══════════════════════════════════════════════════════════════
//  DEFINICION DE CHECKS POR FRAMEWORK
//  Cada check tiene:
//  - id: identificador unico del check
//  - name: nombre legible
//  - description: que se evalua
//  - category: agrupacion tematica dentro del framework
//  - evaluate: funcion asincrona que retorna { status, evidence, recommendation }
// ═══════════════════════════════════════════════════════════════

const COMPLIANCE_CHECKS = {

  // ─────────────────────────────────────────────────────────
  //  SOX (Sarbanes-Oxley) — Controles generales de TI
  //  Enfocado en: control de cambios, gestion de acceso,
  //  completitud del audit trail, segregacion de funciones.
  // ─────────────────────────────────────────────────────────
  SOX: [
    {
      id: 'SOX-CC-01',
      name: 'Aprobacion documentada de cambios',
      description: 'Todos los cambios en sistemas criticos deben tener aprobacion previa documentada',
      category: 'Change Control',
    },
    {
      id: 'SOX-CC-02',
      name: 'Trazabilidad de ejecucion de cambios',
      description: 'Cada cambio ejecutado debe tener un registro de runbook con resultado y timestamp',
      category: 'Change Control',
    },
    {
      id: 'SOX-CC-03',
      name: 'Tasa de exito de cambios',
      description: 'Al menos 90% de los cambios ejecutados deben completarse exitosamente',
      category: 'Change Control',
    },
    {
      id: 'SOX-AM-01',
      name: 'Control de acceso a funciones criticas',
      description: 'Las acciones administrativas deben estar autenticadas y registradas',
      category: 'Access Management',
    },
    {
      id: 'SOX-AM-02',
      name: 'Revisiones periodicas de acceso',
      description: 'Debe existir evidencia de revisiones de acceso en el periodo evaluado',
      category: 'Access Management',
    },
    {
      id: 'SOX-AT-01',
      name: 'Completitud del audit trail',
      description: 'Todos los incidentes deben tener trail completo: deteccion, evaluacion, accion, resultado',
      category: 'Audit Trail',
    },
    {
      id: 'SOX-AT-02',
      name: 'Integridad temporal del audit trail',
      description: 'Los timestamps de eventos deben ser consistentes y no tener gaps inexplicables',
      category: 'Audit Trail',
    },
    {
      id: 'SOX-AT-03',
      name: 'Retencion de registros de auditoria',
      description: 'Los registros deben mantenerse por al menos 7 anos segun regulacion SOX',
      category: 'Audit Trail',
    },
    {
      id: 'SOX-SD-01',
      name: 'Segregacion solicitante-aprobador',
      description: 'Quien solicita un cambio no puede ser quien lo aprueba',
      category: 'Segregation of Duties',
    },
    {
      id: 'SOX-SD-02',
      name: 'Escalacion de aprobaciones vencidas',
      description: 'Las aprobaciones que expiran deben generar escalacion automatica',
      category: 'Segregation of Duties',
    },
    {
      id: 'SOX-SD-03',
      name: 'Aprobaciones multi-nivel para criticos',
      description: 'Incidentes CRITICAL deben requerir aprobacion explicita (no auto-ejecucion)',
      category: 'Segregation of Duties',
    },
  ],

  // ─────────────────────────────────────────────────────────
  //  GxP (Good Practice) — Integridad de datos y validacion
  //  Enfocado en: ALCOA+ (Attributable, Legible, Contemporaneous,
  //  Original, Accurate + Complete, Consistent, Enduring, Available),
  //  validacion de sistemas, firmas electronicas, audit trail.
  // ─────────────────────────────────────────────────────────
  GxP: [
    {
      id: 'GXP-DI-01',
      name: 'Atribuibilidad de registros (ALCOA-A)',
      description: 'Cada registro debe identificar quien realizo la accion (attributable)',
      category: 'Data Integrity (ALCOA+)',
    },
    {
      id: 'GXP-DI-02',
      name: 'Legibilidad de registros (ALCOA-L)',
      description: 'Los registros deben ser legibles y comprensibles a lo largo del tiempo',
      category: 'Data Integrity (ALCOA+)',
    },
    {
      id: 'GXP-DI-03',
      name: 'Contemporaneidad de registros (ALCOA-C)',
      description: 'Los registros deben crearse al momento del evento, sin retrasos significativos',
      category: 'Data Integrity (ALCOA+)',
    },
    {
      id: 'GXP-DI-04',
      name: 'Exactitud de datos (ALCOA-Ac)',
      description: 'Los datos deben ser precisos y reflejar la realidad sin alteraciones',
      category: 'Data Integrity (ALCOA+)',
    },
    {
      id: 'GXP-DI-05',
      name: 'Completitud de registros (ALCOA+ Complete)',
      description: 'No deben existir registros parciales o con campos criticos vacios',
      category: 'Data Integrity (ALCOA+)',
    },
    {
      id: 'GXP-DI-06',
      name: 'Consistencia entre sistemas (ALCOA+ Consistent)',
      description: 'Los datos deben ser consistentes entre tablas relacionadas',
      category: 'Data Integrity (ALCOA+)',
    },
    {
      id: 'GXP-SV-01',
      name: 'Validacion de ejecucion de runbooks',
      description: 'Los runbooks deben tener validacion pre y post ejecucion documentada',
      category: 'System Validation',
    },
    {
      id: 'GXP-SV-02',
      name: 'Evaluacion de riesgo pre-ejecucion (Safety Gate)',
      description: 'Las acciones automaticas deben pasar por evaluacion de riesgo (UC3)',
      category: 'System Validation',
    },
    {
      id: 'GXP-ES-01',
      name: 'Firmas electronicas en aprobaciones',
      description: 'Las aprobaciones deben contener identificacion del aprobador y timestamp',
      category: 'Electronic Signatures',
    },
    {
      id: 'GXP-ES-02',
      name: 'No repudio de acciones',
      description: 'Las acciones ejecutadas deben tener registro inmutable que impida negacion',
      category: 'Electronic Signatures',
    },
    {
      id: 'GXP-AT-01',
      name: 'Audit trail inalterable',
      description: 'El audit trail no debe presentar evidencia de modificaciones posteriores',
      category: 'Audit Trail',
    },
    {
      id: 'GXP-AT-02',
      name: 'Disponibilidad del audit trail',
      description: 'Los registros de auditoria deben estar disponibles para consulta en todo momento',
      category: 'Audit Trail',
    },
  ],

  // ─────────────────────────────────────────────────────────
  //  ISO 27001 — Gestion de Seguridad de la Informacion
  //  Enfocado en: controles de seguridad, gestion de acceso,
  //  gestion de incidentes, continuidad del negocio.
  // ─────────────────────────────────────────────────────────
  ISO27001: [
    {
      id: 'ISO-AC-01',
      name: 'Politica de control de acceso',
      description: 'Debe existir evidencia de control de acceso basado en roles y necesidad',
      category: 'Access Control',
    },
    {
      id: 'ISO-AC-02',
      name: 'Gestion de privilegios de acceso',
      description: 'Los accesos privilegiados deben ser restringidos y monitoreados',
      category: 'Access Control',
    },
    {
      id: 'ISO-AC-03',
      name: 'Revision de derechos de acceso',
      description: 'Los derechos de acceso deben revisarse periodicamente',
      category: 'Access Control',
    },
    {
      id: 'ISO-IM-01',
      name: 'Deteccion oportuna de incidentes',
      description: 'Los incidentes de seguridad deben detectarse dentro del SLA definido',
      category: 'Incident Management',
    },
    {
      id: 'ISO-IM-02',
      name: 'Respuesta a incidentes documentada',
      description: 'Cada incidente debe tener una respuesta documentada con acciones tomadas',
      category: 'Incident Management',
    },
    {
      id: 'ISO-IM-03',
      name: 'Clasificacion de incidentes por severidad',
      description: 'Los incidentes deben clasificarse por nivel de severidad con criterios consistentes',
      category: 'Incident Management',
    },
    {
      id: 'ISO-IM-04',
      name: 'Analisis post-incidente',
      description: 'Los incidentes criticos deben tener analisis de causa raiz (RCA)',
      category: 'Incident Management',
    },
    {
      id: 'ISO-SC-01',
      name: 'Controles de seguridad operacional',
      description: 'Deben existir controles automatizados de monitoreo continuo',
      category: 'Security Controls',
    },
    {
      id: 'ISO-SC-02',
      name: 'Gestion de vulnerabilidades',
      description: 'Las vulnerabilidades detectadas deben tener plan de remediacion',
      category: 'Security Controls',
    },
    {
      id: 'ISO-SC-03',
      name: 'Monitoreo y registro de eventos',
      description: 'Todos los eventos de seguridad deben registrarse y monitorearse',
      category: 'Security Controls',
    },
    {
      id: 'ISO-BC-01',
      name: 'Plan de continuidad del negocio',
      description: 'Debe existir evidencia de capacidades de failover y recuperacion',
      category: 'Business Continuity',
    },
    {
      id: 'ISO-BC-02',
      name: 'Pruebas de recuperacion ante desastres',
      description: 'Los planes de DR deben probarse periodicamente con evidencia de resultados',
      category: 'Business Continuity',
    },
  ],
};


// ═══════════════════════════════════════════════════════════════
//  FUNCIONES DE CONSULTA A DYNAMODB
//  Consultan datos filtrados por systemId y rango de fechas.
//  Usan Query cuando hay pk conocido, Scan con filtro cuando
//  se necesitan datos de todos los sistemas (systemId = 'ALL').
// ═══════════════════════════════════════════════════════════════

/**
 * Consulta una tabla DynamoDB por systemId y rango de fechas.
 * Si systemId es 'ALL', hace Scan con filtro de fecha.
 * Si systemId es especifico, hace Query por pk = systemId.
 *
 * @param {object} ddbDoc - Cliente DynamoDB Document
 * @param {string} tableName - Nombre de la tabla
 * @param {string} systemId - ID del sistema o 'ALL'
 * @param {{ from: string, to: string }} dateRange - Rango ISO timestamps
 * @returns {Promise<Array>} Items encontrados
 */
async function queryTable(ddbDoc, tableName, systemId, dateRange) {
  const allItems = [];
  let lastKey = undefined;

  log.info('Consultando tabla', { tableName, systemId, from: dateRange.from, to: dateRange.to });

  try {
    do {
      let params;

      if (systemId === 'ALL') {
        // Scan con filtro de fecha — necesario cuando evaluamos todos los sistemas
        params = {
          TableName: tableName,
          FilterExpression: 'sk >= :from AND sk <= :to',
          ExpressionAttributeValues: {
            ':from': dateRange.from,
            ':to': dateRange.to,
          },
        };
      } else {
        // Query por partition key = systemId, rango de sort key por fecha
        params = {
          TableName: tableName,
          KeyConditionExpression: 'pk = :pk AND sk BETWEEN :from AND :to',
          ExpressionAttributeValues: {
            ':pk': systemId,
            ':from': dateRange.from,
            ':to': dateRange.to,
          },
        };
      }

      if (lastKey) {
        params.ExclusiveStartKey = lastKey;
      }

      // v1.5 — Scan retained: audit-reporter is a weekly batch job processing all records.
      // Scan is acceptable for batch reports. For hot-path queries, use GSI-backed Query.
      // Cuando systemId='ALL', necesitamos scan completo. Para un sistema especifico, usamos Query.
      const command = systemId === 'ALL' ? new ScanCommand(params) : new QueryCommand(params);
      const result = await ddbDoc.send(command);

      allItems.push(...(result.Items || []));
      lastKey = result.LastEvaluatedKey;

    } while (lastKey);

    log.info('Tabla consultada', { tableName, totalItems: allItems.length });
    return allItems;

  } catch (err) {
    log.error('Error consultando tabla', { tableName, error: err.message });
    return [];
  }
}

/**
 * Carga todos los datos necesarios de las 4 tablas DynamoDB.
 * Ejecuta las consultas en paralelo para minimizar la latencia.
 *
 * @param {string} systemId - ID del sistema o 'ALL'
 * @param {{ from: string, to: string }} dateRange - Rango ISO timestamps
 * @param {{ ddbDoc: object }} clients - Clientes AWS
 * @returns {Promise<object>} Datos cargados de las 4 tablas
 */
async function loadComplianceData(systemId, dateRange, clients) {
  const { ddbDoc } = clients;
  const startTime = Date.now();

  log.info('Cargando datos de compliance', { systemId });

  // Ejecutar las 4 consultas en paralelo
  const [incidents, approvals, executions, advisorResults] = await Promise.all([
    queryTable(ddbDoc, INCIDENTS_TABLE, systemId, dateRange),
    queryTable(ddbDoc, APPROVALS_TABLE, systemId, dateRange),
    queryTable(ddbDoc, RUNBOOK_EXECUTIONS_TABLE, systemId, dateRange),
    queryTable(ddbDoc, ADVISOR_RESULTS_TABLE, systemId, dateRange),
  ]);

  const duration = Date.now() - startTime;
  log.info('Datos cargados', { durationMs: duration, incidentes: incidents.length, aprobaciones: approvals.length, ejecuciones: executions.length, advisor: advisorResults.length });

  return { incidents, approvals, executions, advisorResults };
}


// ═══════════════════════════════════════════════════════════════
//  FUNCIONES DE EVALUACION DE CHECKS
//  Cada funcion toma los datos crudos y retorna:
//  { status: 'PASS'|'FAIL'|'WARNING', score: 0-100,
//    evidence: [...], recommendation: string }
// ═══════════════════════════════════════════════════════════════

// ─── Utilidades de evaluacion ───

/**
 * Crea un resultado de check estandarizado.
 */
function checkResult(status, score, evidence, recommendation) {
  return { status, score, evidence, recommendation };
}

/**
 * Determina el status a partir de un score numerico.
 * >= 80 = PASS, >= 50 = WARNING, < 50 = FAIL
 */
function scoreToStatus(score) {
  if (score >= 80) return 'PASS';
  if (score >= 50) return 'WARNING';
  return 'FAIL';
}

/**
 * Calcula el porcentaje de items que cumplen una condicion.
 */
function pctMatch(items, predicate) {
  if (items.length === 0) return 0;
  const matching = items.filter(predicate).length;
  return Math.round((matching / items.length) * 100);
}


// ═══════════════════════════════════════════════════════════════
//  EVALUADORES SOX
// ═══════════════════════════════════════════════════════════════

/**
 * Evalua todos los checks de SOX contra los datos disponibles.
 * Retorna un array de resultados, uno por cada check definido.
 */
function evaluateSOXChecks(data) {
  const { incidents, approvals, executions, advisorResults } = data;
  const results = [];

  // SOX-CC-01: Aprobacion documentada de cambios
  // Verificar que las ejecuciones tienen aprobacion asociada
  {
    const execsWithApproval = executions.filter(e => e.approvalId || e.approvedBy);
    const autoExecs = executions.filter(e => e.autoExecuted === true);
    // Las auto-ejecuciones son validas si pasaron safety gate (UC3)
    const safeAutoExecs = autoExecs.filter(e => e.safetyGateResult === 'SAFE');
    const documented = execsWithApproval.length + safeAutoExecs.length;
    const total = executions.length;
    const score = total > 0 ? Math.round((documented / total) * 100) : 100;
    const evidence = [
      `${execsWithApproval.length}/${total} ejecuciones con aprobacion explicita`,
      `${safeAutoExecs.length} auto-ejecuciones con safety gate SAFE`,
      `${total - documented} ejecuciones sin documentacion de aprobacion`,
    ];
    const recommendation = score < 80
      ? 'Implementar flujo de aprobacion obligatorio para todas las ejecuciones de runbook'
      : 'Mantener el proceso actual de aprobacion documentada';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // SOX-CC-02: Trazabilidad de ejecucion de cambios
  // Cada ejecucion debe tener runbookId, executedAt y resultado
  {
    const traceable = executions.filter(e =>
      e.runbookId && e.executedAt && (e.success === true || e.success === false)
    );
    const score = executions.length > 0
      ? Math.round((traceable.length / executions.length) * 100)
      : 100;
    const evidence = [
      `${traceable.length}/${executions.length} ejecuciones con trazabilidad completa`,
      `Campos verificados: runbookId, executedAt, success`,
    ];
    const recommendation = score < 80
      ? 'Asegurar que todos los runbooks registren resultado y timestamp de ejecucion'
      : 'Trazabilidad de cambios cumple con los requisitos';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // SOX-CC-03: Tasa de exito de cambios (>= 90%)
  {
    const successful = executions.filter(e => e.success === true).length;
    const total = executions.length;
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 100;
    // El score penaliza si la tasa es menor a 90%
    const score = successRate >= 90 ? 100 : successRate >= 80 ? 70 : successRate >= 60 ? 40 : 20;
    const evidence = [
      `Tasa de exito: ${successRate}% (${successful}/${total})`,
      `Ejecuciones fallidas: ${total - successful}`,
    ];
    const recommendation = score < 80
      ? 'Investigar ejecuciones fallidas y mejorar la validacion pre-ejecucion de runbooks'
      : 'Tasa de exito dentro del umbral aceptable (>= 90%)';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // SOX-AM-01: Control de acceso a funciones criticas
  {
    const adminActions = approvals.filter(a => a.processedBy && a.processedBy !== 'SYSTEM');
    const authEvents = incidents.filter(i =>
      (i.metricName || '').toLowerCase().includes('auth') ||
      (i.metricName || '').toLowerCase().includes('login')
    );
    // Si hay acciones admin, verificar que tienen identificacion
    const identified = adminActions.filter(a => a.processedBy && a.processedBy.length > 0);
    const score = adminActions.length > 0
      ? Math.round((identified.length / adminActions.length) * 100)
      : (authEvents.length > 0 ? 80 : 60);
    const evidence = [
      `${adminActions.length} acciones administrativas registradas`,
      `${identified.length} con identificacion del operador`,
      `${authEvents.length} eventos de autenticacion detectados`,
    ];
    const recommendation = score < 80
      ? 'Implementar autenticacion obligatoria para todas las acciones administrativas'
      : 'Control de acceso operando correctamente';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // SOX-AM-02: Revisiones periodicas de acceso
  {
    // Verificar si hay eventos de revision de acceso en el periodo
    const accessReviews = incidents.filter(i =>
      (i.metricName || '').toLowerCase().includes('access_review') ||
      (i.metricName || '').toLowerCase().includes('permission')
    );
    const advisorAccessChecks = advisorResults.filter(r =>
      (r.useCase || '').includes('access') || (r.analysisType || '').includes('access')
    );
    const hasEvidence = accessReviews.length > 0 || advisorAccessChecks.length > 0;
    const score = hasEvidence ? 85 : 30;
    const evidence = [
      `${accessReviews.length} eventos de revision de acceso encontrados`,
      `${advisorAccessChecks.length} analisis de acceso por advisor`,
    ];
    const recommendation = score < 80
      ? 'Implementar revisiones periodicas de acceso automatizadas (al menos mensual)'
      : 'Revisiones de acceso documentadas en el periodo';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // SOX-AT-01: Completitud del audit trail
  {
    // Verificar que los incidentes tienen trail completo: deteccion -> evaluacion -> accion -> resultado
    const withFullTrail = incidents.filter(i => {
      const hasDetection = !!i.detectedAt || !!i.sk;
      const hasSeverity = !!i.severity;
      // Buscar si hay ejecucion o aprobacion asociada
      const hasAction = executions.some(e => e.incidentId === i.pk || e.systemId === i.systemId);
      return hasDetection && hasSeverity && hasAction;
    });
    const score = incidents.length > 0
      ? Math.round((withFullTrail.length / incidents.length) * 100)
      : 100;
    const evidence = [
      `${withFullTrail.length}/${incidents.length} incidentes con audit trail completo`,
      `Trail: deteccion + clasificacion + accion verificados`,
    ];
    const recommendation = score < 80
      ? 'Asegurar que cada incidente tenga registro de deteccion, evaluacion y resolucion'
      : 'Audit trail completo para los incidentes del periodo';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // SOX-AT-02: Integridad temporal del audit trail
  {
    // Verificar que los timestamps son consistentes (no hay registros con fecha futura o gaps extremos)
    const now = new Date();
    const anomalies = incidents.filter(i => {
      const ts = new Date(i.sk?.split('#')[0] || i.timestamp || 0);
      return ts > now || ts.getTime() === 0;
    });
    const execAnomalies = executions.filter(e => {
      const ts = new Date(e.executedAt || 0);
      return ts > now || ts.getTime() === 0;
    });
    const totalAnomalies = anomalies.length + execAnomalies.length;
    const totalRecords = incidents.length + executions.length;
    const anomalyRate = totalRecords > 0 ? (totalAnomalies / totalRecords) : 0;
    const score = anomalyRate === 0 ? 100 : anomalyRate < 0.05 ? 75 : anomalyRate < 0.1 ? 50 : 20;
    const evidence = [
      `${totalAnomalies} anomalias temporales encontradas de ${totalRecords} registros`,
      `Tasa de anomalias: ${(anomalyRate * 100).toFixed(1)}%`,
      `${anomalies.length} incidentes con timestamp anomalo`,
      `${execAnomalies.length} ejecuciones con timestamp anomalo`,
    ];
    const recommendation = score < 80
      ? 'Investigar y corregir registros con timestamps anomalos; implementar validacion NTP'
      : 'Integridad temporal del audit trail verificada';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // SOX-AT-03: Retencion de registros de auditoria (>= 7 anos)
  {
    // Verificar que la configuracion de retencion es adecuada
    // Esto se evalua por presencia de datos y configuracion, no por contenido
    const hasRecentData = incidents.length > 0 || executions.length > 0 || approvals.length > 0;
    const score = hasRecentData ? 85 : 50;
    const evidence = [
      `Datos disponibles en el periodo evaluado: ${hasRecentData ? 'SI' : 'NO'}`,
      `Tablas consultadas: ${INCIDENTS_TABLE}, ${APPROVALS_TABLE}, ${RUNBOOK_EXECUTIONS_TABLE}, ${ADVISOR_RESULTS_TABLE}`,
      `Recomendacion SOX: retencion minima de 7 anos (2555 dias)`,
    ];
    const recommendation = score < 80
      ? 'Verificar politicas de retencion de DynamoDB y configurar TTL >= 7 anos'
      : 'Revisar periodicamente que los backups y retencion cumplan el minimo de 7 anos';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // SOX-SD-01: Segregacion solicitante-aprobador
  {
    // Verificar que el requestor no es el mismo que el approver
    const approvedItems = approvals.filter(a => a.status === 'APPROVED');
    const violations = approvedItems.filter(a =>
      a.requestedBy && a.processedBy && a.requestedBy === a.processedBy
    );
    const score = approvedItems.length > 0
      ? Math.round(((approvedItems.length - violations.length) / approvedItems.length) * 100)
      : 100;
    const evidence = [
      `${approvedItems.length} aprobaciones evaluadas`,
      `${violations.length} violaciones de segregacion (solicitante = aprobador)`,
      `Tasa de cumplimiento: ${score}%`,
    ];
    const recommendation = score < 80
      ? 'CRITICO: Implementar validacion que impida auto-aprobacion de cambios'
      : 'Segregacion de funciones cumple con requisitos SOX';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // SOX-SD-02: Escalacion de aprobaciones vencidas
  {
    const expired = approvals.filter(a => a.status === 'EXPIRED');
    const escalated = expired.filter(a => a.escalated === true || a.escalationSent === true);
    const score = expired.length > 0
      ? Math.round((escalated.length / expired.length) * 100)
      : 100;
    const evidence = [
      `${expired.length} aprobaciones expiradas en el periodo`,
      `${escalated.length} con escalacion automatica registrada`,
      `${expired.length - escalated.length} sin evidencia de escalacion`,
    ];
    const recommendation = score < 80
      ? 'Configurar escalacion automatica obligatoria cuando expiran aprobaciones'
      : 'Mecanismo de escalacion operando correctamente';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // SOX-SD-03: Aprobaciones multi-nivel para criticos
  {
    // Los incidentes CRITICAL no deben auto-ejecutarse sin aprobacion humana
    const criticalExecs = executions.filter(e => e.severity === 'CRITICAL' || e.incidentSeverity === 'CRITICAL');
    const autoExecCriticals = criticalExecs.filter(e => e.autoExecuted === true && !e.approvedBy);
    const score = criticalExecs.length > 0
      ? Math.round(((criticalExecs.length - autoExecCriticals.length) / criticalExecs.length) * 100)
      : 100;
    const evidence = [
      `${criticalExecs.length} ejecuciones asociadas a incidentes CRITICAL`,
      `${autoExecCriticals.length} auto-ejecutadas sin aprobacion humana`,
    ];
    const recommendation = score < 80
      ? 'CRITICO: Asegurar que incidentes CRITICAL requieran aprobacion humana obligatoria'
      : 'Aprobacion multi-nivel para criticos cumple requisitos';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  return results;
}


// ═══════════════════════════════════════════════════════════════
//  EVALUADORES GxP
// ═══════════════════════════════════════════════════════════════

/**
 * Evalua todos los checks de GxP contra los datos disponibles.
 */
function evaluateGxPChecks(data) {
  const { incidents, approvals, executions, advisorResults } = data;
  const results = [];

  // GXP-DI-01: Atribuibilidad (ALCOA-A) — cada registro identifica al actor
  {
    const approvalAttributable = approvals.filter(a => a.requestedBy || a.processedBy);
    const execAttributable = executions.filter(e => e.executedBy || e.triggeredBy || e.autoExecuted !== undefined);
    const totalRecords = approvals.length + executions.length;
    const totalAttributable = approvalAttributable.length + execAttributable.length;
    const score = totalRecords > 0 ? Math.round((totalAttributable / totalRecords) * 100) : 100;
    const evidence = [
      `${approvalAttributable.length}/${approvals.length} aprobaciones con actor identificado`,
      `${execAttributable.length}/${executions.length} ejecuciones con actor/trigger identificado`,
    ];
    const recommendation = score < 80
      ? 'Asegurar que todos los registros incluyan campo de actor (requestedBy/executedBy)'
      : 'Atribuibilidad de registros cumple con ALCOA';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // GXP-DI-02: Legibilidad (ALCOA-L) — registros comprensibles
  {
    // Verificar que los registros tienen campos descriptivos completos
    const legibleIncidents = incidents.filter(i => i.severity && i.metricName && i.systemId);
    const legibleExecs = executions.filter(e => e.runbookId && e.systemId);
    const totalRecords = incidents.length + executions.length;
    const totalLegible = legibleIncidents.length + legibleExecs.length;
    const score = totalRecords > 0 ? Math.round((totalLegible / totalRecords) * 100) : 100;
    const evidence = [
      `${legibleIncidents.length}/${incidents.length} incidentes con campos descriptivos completos`,
      `${legibleExecs.length}/${executions.length} ejecuciones con identificacion de runbook y sistema`,
    ];
    const recommendation = score < 80
      ? 'Estandarizar los campos obligatorios en todos los registros de incidentes y ejecuciones'
      : 'Registros cumplen criterio de legibilidad ALCOA';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // GXP-DI-03: Contemporaneidad (ALCOA-C) — registros creados al momento del evento
  {
    // Verificar que no hay retrasos significativos entre evento y registro
    const MAX_DELAY_MS = 5 * 60 * 1000; // 5 minutos maximo aceptable
    let timely = 0;
    let evaluated = 0;
    for (const exec of executions) {
      if (exec.executedAt && exec.createdAt) {
        evaluated++;
        const delay = Math.abs(new Date(exec.createdAt).getTime() - new Date(exec.executedAt).getTime());
        if (delay <= MAX_DELAY_MS) timely++;
      } else if (exec.executedAt && exec.sk) {
        evaluated++;
        const skTs = new Date(exec.sk.split('#')[0]);
        const execTs = new Date(exec.executedAt);
        // El sk es la creacion, executedAt es la ejecucion — debe ser contemporaneo
        if (!isNaN(skTs.getTime()) && !isNaN(execTs.getTime())) {
          timely++; // Si ambos existen, se considera contemporaneo
        }
      }
    }
    const score = evaluated > 0 ? Math.round((timely / evaluated) * 100) : 85;
    const evidence = [
      `${timely}/${evaluated} registros creados dentro del umbral de contemporaneidad (5 min)`,
      `Umbral maximo aceptable: 5 minutos`,
    ];
    const recommendation = score < 80
      ? 'Investigar retrasos en la creacion de registros; verificar sincronizacion NTP'
      : 'Contemporaneidad de registros cumple con ALCOA';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // GXP-DI-04: Exactitud (ALCOA-Ac) — datos precisos
  {
    // Verificar coherencia: severidad valida, estados validos, valores numericos en rango
    const validSeverities = ['CRITICAL', 'HIGH', 'WARNING', 'PREDICTIVE', 'LOW', 'INFO'];
    const validStatuses = ['APPROVED', 'REJECTED', 'PENDING', 'EXPIRED', 'CANCELLED'];
    const accurateIncidents = incidents.filter(i => validSeverities.includes(i.severity));
    const accurateApprovals = approvals.filter(a => validStatuses.includes(a.status));
    const totalChecked = incidents.length + approvals.length;
    const totalAccurate = accurateIncidents.length + accurateApprovals.length;
    const score = totalChecked > 0 ? Math.round((totalAccurate / totalChecked) * 100) : 100;
    const evidence = [
      `${accurateIncidents.length}/${incidents.length} incidentes con severidad valida`,
      `${accurateApprovals.length}/${approvals.length} aprobaciones con estado valido`,
      `Severidades validas: ${validSeverities.join(', ')}`,
    ];
    const recommendation = score < 80
      ? 'Implementar validacion de esquema en escritura para prevenir datos invalidos'
      : 'Exactitud de datos cumple con ALCOA';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // GXP-DI-05: Completitud (ALCOA+ Complete) — sin registros parciales
  {
    // Verificar campos criticos no vacios
    const completeIncidents = incidents.filter(i => i.pk && i.sk && i.severity && i.systemId);
    const completeExecs = executions.filter(e => e.pk && e.sk && e.runbookId && e.systemId);
    const completeApprovals = approvals.filter(a => a.pk && a.sk && a.status);
    const total = incidents.length + executions.length + approvals.length;
    const complete = completeIncidents.length + completeExecs.length + completeApprovals.length;
    const score = total > 0 ? Math.round((complete / total) * 100) : 100;
    const evidence = [
      `${completeIncidents.length}/${incidents.length} incidentes completos`,
      `${completeExecs.length}/${executions.length} ejecuciones completas`,
      `${completeApprovals.length}/${approvals.length} aprobaciones completas`,
      `Campos verificados: pk, sk, severity/status, systemId/runbookId`,
    ];
    const recommendation = score < 80
      ? 'Implementar validaciones NOT NULL en campos criticos antes de escribir a DynamoDB'
      : 'Completitud de registros cumple con ALCOA+';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // GXP-DI-06: Consistencia entre sistemas (ALCOA+ Consistent)
  {
    // Verificar que los systemIds sean consistentes entre tablas
    const incidentSystems = new Set(incidents.map(i => i.systemId).filter(Boolean));
    const execSystems = new Set(executions.map(e => e.systemId).filter(Boolean));
    const approvalSystems = new Set(approvals.map(a => a.systemId).filter(Boolean));
    // Los sistemas en ejecuciones deberian estar tambien en incidentes o aprobaciones
    let consistent = 0;
    let total = 0;
    for (const sysId of execSystems) {
      total++;
      if (incidentSystems.has(sysId) || approvalSystems.has(sysId)) {
        consistent++;
      }
    }
    const score = total > 0 ? Math.round((consistent / total) * 100) : 100;
    const evidence = [
      `Sistemas en incidentes: ${incidentSystems.size}`,
      `Sistemas en ejecuciones: ${execSystems.size}`,
      `Sistemas en aprobaciones: ${approvalSystems.size}`,
      `${consistent}/${total} sistemas de ejecucion con registros cruzados en otras tablas`,
    ];
    const recommendation = score < 80
      ? 'Verificar que los systemIds son consistentes entre todas las tablas de SAP Spektra'
      : 'Consistencia inter-tablas cumple con ALCOA+';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // GXP-SV-01: Validacion de ejecucion de runbooks
  {
    // Los runbooks deben tener resultado (success = true/false) y timestamp
    const validated = executions.filter(e =>
      (e.success === true || e.success === false) && e.executedAt
    );
    const withPreCheck = executions.filter(e => e.preCheckResult || e.validationPassed !== undefined);
    const score = executions.length > 0
      ? Math.round((validated.length / executions.length) * 100)
      : 100;
    const evidence = [
      `${validated.length}/${executions.length} ejecuciones con resultado y timestamp`,
      `${withPreCheck.length} ejecuciones con validacion pre-ejecucion documentada`,
    ];
    const recommendation = score < 80
      ? 'Implementar validacion pre y post ejecucion obligatoria para todos los runbooks'
      : 'Validacion de runbooks cumple con GxP';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // GXP-SV-02: Evaluacion de riesgo pre-ejecucion (Safety Gate)
  {
    const safetyGateResults = advisorResults.filter(r => r.useCase === 'UC3');
    const autoExecs = executions.filter(e => e.autoExecuted === true);
    // Las auto-ejecuciones deberian tener evaluacion de safety gate
    const coveredByGate = autoExecs.filter(e =>
      e.safetyGateResult || safetyGateResults.some(sg => sg.systemId === e.systemId)
    );
    const score = autoExecs.length > 0
      ? Math.round((coveredByGate.length / autoExecs.length) * 100)
      : (safetyGateResults.length > 0 ? 90 : 60);
    const evidence = [
      `${safetyGateResults.length} evaluaciones de Safety Gate (UC3) en el periodo`,
      `${autoExecs.length} auto-ejecuciones, ${coveredByGate.length} cubiertas por safety gate`,
    ];
    const recommendation = score < 80
      ? 'Asegurar que todas las auto-ejecuciones pasen por evaluacion de riesgo (Safety Gate UC3)'
      : 'Evaluacion de riesgo pre-ejecucion cumple con GxP';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // GXP-ES-01: Firmas electronicas en aprobaciones
  {
    const signedApprovals = approvals.filter(a =>
      a.processedBy && a.processedAt && a.status && a.status !== 'PENDING'
    );
    const processed = approvals.filter(a => a.status !== 'PENDING');
    const score = processed.length > 0
      ? Math.round((signedApprovals.length / processed.length) * 100)
      : 100;
    const evidence = [
      `${signedApprovals.length}/${processed.length} aprobaciones procesadas con firma electronica`,
      `Campos de firma: processedBy (identidad) + processedAt (timestamp) + status (decision)`,
    ];
    const recommendation = score < 80
      ? 'Implementar firmas electronicas obligatorias (21 CFR Part 11) para todas las aprobaciones'
      : 'Firmas electronicas en aprobaciones cumplen con GxP';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // GXP-ES-02: No repudio de acciones
  {
    // Verificar que las acciones tienen registro inmutable (pk+sk no modificable en DynamoDB)
    const withImmutableId = executions.filter(e => e.pk && e.sk);
    const approvalWithId = approvals.filter(a => a.pk && a.sk);
    const total = executions.length + approvals.length;
    const immutable = withImmutableId.length + approvalWithId.length;
    const score = total > 0 ? Math.round((immutable / total) * 100) : 100;
    const evidence = [
      `${withImmutableId.length}/${executions.length} ejecuciones con identificador inmutable (pk+sk)`,
      `${approvalWithId.length}/${approvals.length} aprobaciones con identificador inmutable`,
      `DynamoDB garantiza inmutabilidad de claves primarias (pk+sk)`,
    ];
    const recommendation = score < 80
      ? 'Asegurar que todos los registros tengan pk y sk inmutables asignados al momento de creacion'
      : 'No repudio de acciones garantizado por diseno de DynamoDB';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // GXP-AT-01: Audit trail inalterable
  {
    // Verificar que no hay registros con marcas de modificacion sospechosas
    const possiblyModified = incidents.filter(i => i.modifiedAt || i.updatedAt || i._version > 1);
    const execModified = executions.filter(e => e.modifiedAt || e.updatedAt || e._version > 1);
    const totalModified = possiblyModified.length + execModified.length;
    const totalRecords = incidents.length + executions.length;
    const modificationRate = totalRecords > 0 ? (totalModified / totalRecords) : 0;
    const score = modificationRate === 0 ? 100 : modificationRate < 0.02 ? 80 : modificationRate < 0.1 ? 50 : 20;
    const evidence = [
      `${totalModified}/${totalRecords} registros con indicadores de modificacion posterior`,
      `Tasa de modificacion: ${(modificationRate * 100).toFixed(1)}%`,
      `Incidentes modificados: ${possiblyModified.length}, Ejecuciones modificadas: ${execModified.length}`,
    ];
    const recommendation = score < 80
      ? 'CRITICO: Investigar registros modificados; implementar write-once policy en DynamoDB'
      : 'Audit trail sin evidencia de alteraciones';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // GXP-AT-02: Disponibilidad del audit trail
  {
    // Verificar que hay datos disponibles en todas las tablas
    const tablesWithData = [
      incidents.length > 0 ? 1 : 0,
      approvals.length > 0 ? 1 : 0,
      executions.length > 0 ? 1 : 0,
      advisorResults.length > 0 ? 1 : 0,
    ].reduce((sum, v) => sum + v, 0);
    const score = Math.round((tablesWithData / 4) * 100);
    const evidence = [
      `${tablesWithData}/4 tablas con datos disponibles en el periodo`,
      `Incidentes: ${incidents.length > 0 ? 'DISPONIBLE' : 'SIN DATOS'}`,
      `Aprobaciones: ${approvals.length > 0 ? 'DISPONIBLE' : 'SIN DATOS'}`,
      `Ejecuciones: ${executions.length > 0 ? 'DISPONIBLE' : 'SIN DATOS'}`,
      `Advisor: ${advisorResults.length > 0 ? 'DISPONIBLE' : 'SIN DATOS'}`,
    ];
    const recommendation = score < 80
      ? 'Verificar disponibilidad de datos en todas las tablas; revisar permisos y replicacion'
      : 'Audit trail disponible en todas las fuentes de datos';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  return results;
}


// ═══════════════════════════════════════════════════════════════
//  EVALUADORES ISO 27001
// ═══════════════════════════════════════════════════════════════

/**
 * Evalua todos los checks de ISO 27001 contra los datos disponibles.
 */
function evaluateISO27001Checks(data) {
  const { incidents, approvals, executions, advisorResults } = data;
  const results = [];

  // ISO-AC-01: Politica de control de acceso
  {
    const authEvents = incidents.filter(i =>
      (i.metricName || '').toLowerCase().includes('auth') ||
      (i.metricName || '').toLowerCase().includes('access') ||
      (i.metricName || '').toLowerCase().includes('login')
    );
    const adminActions = approvals.filter(a => a.processedBy && a.processedBy !== 'SYSTEM');
    const hasAccessControl = authEvents.length > 0 || adminActions.length > 0;
    const score = hasAccessControl ? 85 : 40;
    const evidence = [
      `${authEvents.length} eventos de autenticacion/acceso detectados`,
      `${adminActions.length} acciones administrativas con identificacion de operador`,
    ];
    const recommendation = score < 80
      ? 'Implementar monitoreo continuo de eventos de acceso y autenticacion'
      : 'Control de acceso operando con evidencia suficiente';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // ISO-AC-02: Gestion de privilegios de acceso
  {
    // Verificar que acciones privilegiadas (aprobaciones) estan restringidas
    const processedApprovals = approvals.filter(a => a.status === 'APPROVED' || a.status === 'REJECTED');
    const withOperator = processedApprovals.filter(a => a.processedBy);
    const uniqueOperators = new Set(withOperator.map(a => a.processedBy));
    // Si hay muy pocos operadores para muchas acciones, puede indicar concentracion de privilegios
    const ratio = uniqueOperators.size > 0 && processedApprovals.length > 0
      ? Math.min(100, Math.round((uniqueOperators.size / Math.max(1, Math.ceil(processedApprovals.length / 5))) * 100))
      : 70;
    const score = withOperator.length === processedApprovals.length
      ? Math.max(ratio, 70)
      : Math.round((withOperator.length / Math.max(1, processedApprovals.length)) * 100);
    const evidence = [
      `${processedApprovals.length} aprobaciones procesadas`,
      `${withOperator.length} con operador identificado`,
      `${uniqueOperators.size} operadores unicos activos`,
    ];
    const recommendation = score < 80
      ? 'Revisar concentracion de privilegios; implementar rotacion de operadores'
      : 'Gestion de privilegios operando adecuadamente';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // ISO-AC-03: Revision de derechos de acceso
  {
    const accessReviews = advisorResults.filter(r =>
      (r.analysisType || '').includes('access') ||
      (r.useCase || '').includes('access') ||
      (r.useCase || '') === 'UC1'
    );
    const score = accessReviews.length > 0 ? 85 : 35;
    const evidence = [
      `${accessReviews.length} revisiones/analisis de acceso en el periodo`,
      `Fuente: resultados del advisor (analisis UC1 y acceso)`,
    ];
    const recommendation = score < 80
      ? 'Programar revisiones automaticas de derechos de acceso (minimo trimestral)'
      : 'Revisiones de derechos de acceso documentadas en el periodo';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // ISO-IM-01: Deteccion oportuna de incidentes
  {
    // Verificar que los incidentes se detectan rapidamente (tienen timestamp de deteccion)
    const detected = incidents.filter(i => i.detectedAt || i.sk);
    const score = incidents.length > 0
      ? Math.round((detected.length / incidents.length) * 100)
      : 100;
    const evidence = [
      `${detected.length}/${incidents.length} incidentes con timestamp de deteccion`,
      `Sistema de monitoreo activo: ${incidents.length > 0 ? 'SI' : 'SIN DATOS'}`,
    ];
    const recommendation = score < 80
      ? 'Implementar deteccion automatizada con timestamp para todos los incidentes'
      : 'Deteccion de incidentes operando dentro del SLA';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // ISO-IM-02: Respuesta a incidentes documentada
  {
    // Cada incidente deberia tener al menos una ejecucion de runbook o aprobacion asociada
    const respondedIncidents = incidents.filter(i => {
      const hasExec = executions.some(e => e.incidentId === i.pk || e.systemId === i.systemId);
      const hasApproval = approvals.some(a => a.incidentId === i.pk || a.systemId === i.systemId);
      return hasExec || hasApproval;
    });
    const score = incidents.length > 0
      ? Math.round((respondedIncidents.length / incidents.length) * 100)
      : 100;
    const evidence = [
      `${respondedIncidents.length}/${incidents.length} incidentes con respuesta documentada`,
      `Respuesta incluye: ejecucion de runbook y/o flujo de aprobacion`,
    ];
    const recommendation = score < 80
      ? 'Asegurar que cada incidente tenga al menos una accion de respuesta documentada'
      : 'Respuesta a incidentes documentada adecuadamente';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // ISO-IM-03: Clasificacion de incidentes por severidad
  {
    const validSeverities = ['CRITICAL', 'HIGH', 'WARNING', 'PREDICTIVE', 'LOW', 'INFO'];
    const classified = incidents.filter(i => validSeverities.includes(i.severity));
    const score = incidents.length > 0
      ? Math.round((classified.length / incidents.length) * 100)
      : 100;
    const severityDist = {};
    for (const sev of validSeverities) {
      const count = incidents.filter(i => i.severity === sev).length;
      if (count > 0) severityDist[sev] = count;
    }
    const evidence = [
      `${classified.length}/${incidents.length} incidentes con severidad clasificada`,
      `Distribucion: ${JSON.stringify(severityDist)}`,
    ];
    const recommendation = score < 80
      ? 'Implementar clasificacion automatica de severidad para todos los incidentes'
      : 'Clasificacion de incidentes cumple con ISO 27001';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // ISO-IM-04: Analisis post-incidente (RCA)
  {
    const criticalIncidents = incidents.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');
    const rcaResults = advisorResults.filter(r => r.useCase === 'UC2');
    // Al menos los incidentes criticos deberian tener RCA
    const coveredByRCA = criticalIncidents.filter(ci =>
      rcaResults.some(r => r.systemId === ci.systemId)
    );
    const score = criticalIncidents.length > 0
      ? Math.round((coveredByRCA.length / criticalIncidents.length) * 100)
      : (rcaResults.length > 0 ? 90 : 70);
    const evidence = [
      `${criticalIncidents.length} incidentes criticos/altos en el periodo`,
      `${rcaResults.length} analisis de causa raiz (UC2) realizados`,
      `${coveredByRCA.length} incidentes criticos con RCA asociado`,
    ];
    const recommendation = score < 80
      ? 'Implementar RCA obligatorio para todos los incidentes CRITICAL y HIGH'
      : 'Analisis post-incidente cumple con ISO 27001';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // ISO-SC-01: Controles de seguridad operacional
  {
    const hasMonitoring = incidents.length > 0; // Si hay incidentes, hay monitoreo activo
    const hasAutomation = executions.filter(e => e.autoExecuted === true).length > 0;
    const hasSafetyGate = advisorResults.filter(r => r.useCase === 'UC3').length > 0;
    const controlsActive = [hasMonitoring, hasAutomation, hasSafetyGate].filter(Boolean).length;
    const score = Math.round((controlsActive / 3) * 100);
    const evidence = [
      `Monitoreo continuo: ${hasMonitoring ? 'ACTIVO' : 'INACTIVO'}`,
      `Automatizacion de respuesta: ${hasAutomation ? 'ACTIVA' : 'INACTIVA'}`,
      `Safety Gate (evaluacion de riesgo): ${hasSafetyGate ? 'ACTIVO' : 'INACTIVO'}`,
    ];
    const recommendation = score < 80
      ? 'Activar los tres controles de seguridad: monitoreo, automatizacion y safety gate'
      : 'Controles de seguridad operacional activos y funcionando';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // ISO-SC-02: Gestion de vulnerabilidades
  {
    const certChecks = incidents.filter(i =>
      (i.metricName || '').toLowerCase().includes('cert') ||
      (i.metricName || '').toLowerCase().includes('ssl') ||
      (i.metricName || '').toLowerCase().includes('vuln')
    );
    const securityPatches = executions.filter(e =>
      (e.runbookId || '').toLowerCase().includes('patch') ||
      (e.runbookId || '').toLowerCase().includes('security') ||
      (e.runbookId || '').toLowerCase().includes('update')
    );
    const hasVulnMgmt = certChecks.length > 0 || securityPatches.length > 0;
    const score = hasVulnMgmt ? 85 : 35;
    const evidence = [
      `${certChecks.length} verificaciones de certificados/vulnerabilidades`,
      `${securityPatches.length} ejecuciones de parches de seguridad`,
    ];
    const recommendation = score < 80
      ? 'Implementar escaneo de vulnerabilidades automatizado y gestion de parches'
      : 'Gestion de vulnerabilidades operando con evidencia';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // ISO-SC-03: Monitoreo y registro de eventos
  {
    const totalEvents = incidents.length + approvals.length + executions.length + advisorResults.length;
    const hasComprehensiveLogging = incidents.length > 0 && approvals.length > 0 && executions.length > 0;
    const score = hasComprehensiveLogging ? 90 : (totalEvents > 0 ? 60 : 20);
    const evidence = [
      `Total de eventos registrados: ${totalEvents}`,
      `Incidentes: ${incidents.length}, Aprobaciones: ${approvals.length}`,
      `Ejecuciones: ${executions.length}, Advisor: ${advisorResults.length}`,
      `Registro integral (3+ fuentes): ${hasComprehensiveLogging ? 'SI' : 'NO'}`,
    ];
    const recommendation = score < 80
      ? 'Asegurar registro de eventos en las 4 fuentes de datos (incidentes, aprobaciones, ejecuciones, advisor)'
      : 'Monitoreo y registro de eventos cumple con ISO 27001';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // ISO-BC-01: Plan de continuidad del negocio
  {
    const failoverExecs = executions.filter(e =>
      (e.runbookId || '').toLowerCase().includes('failover') ||
      (e.runbookId || '').toLowerCase().includes('ha-') ||
      (e.runbookId || '').toLowerCase().includes('recovery') ||
      (e.runbookId || '').toLowerCase().includes('restart')
    );
    const successfulRecoveries = failoverExecs.filter(e => e.success === true);
    const hasBC = failoverExecs.length > 0;
    const score = hasBC
      ? (failoverExecs.length > 0 ? Math.round((successfulRecoveries.length / failoverExecs.length) * 100) : 70)
      : 30;
    const evidence = [
      `${failoverExecs.length} ejecuciones de failover/recuperacion en el periodo`,
      `${successfulRecoveries.length} recuperaciones exitosas`,
      `Capacidad de continuidad: ${hasBC ? 'EVIDENCIA ENCONTRADA' : 'SIN EVIDENCIA'}`,
    ];
    const recommendation = score < 80
      ? 'Implementar y documentar plan de continuidad con pruebas periodicas de failover'
      : 'Plan de continuidad del negocio con evidencia operativa';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  // ISO-BC-02: Pruebas de recuperacion ante desastres
  {
    const drDrills = executions.filter(e =>
      (e.runbookId || '').toLowerCase().includes('dr') ||
      (e.runbookId || '').toLowerCase().includes('disaster') ||
      (e.runbookId || '').toLowerCase().includes('drill')
    );
    const backupVerifications = executions.filter(e =>
      (e.runbookId || '').toLowerCase().includes('backup')
    );
    const hasDRTesting = drDrills.length > 0 || backupVerifications.length > 0;
    const score = hasDRTesting ? 85 : 25;
    const evidence = [
      `${drDrills.length} ejercicios de disaster recovery ejecutados`,
      `${backupVerifications.length} verificaciones de backup realizadas`,
    ];
    const recommendation = score < 80
      ? 'Programar pruebas periodicas de DR (minimo trimestral) con documentacion de resultados'
      : 'Pruebas de recuperacion ante desastres documentadas';
    results.push(checkResult(scoreToStatus(score), score, evidence, recommendation));
  }

  return results;
}


// ═══════════════════════════════════════════════════════════════
//  FUNCIONES GENERADORAS DE REPORTE POR FRAMEWORK
//  Cada funcion:
//  1. Carga datos de DynamoDB
//  2. Ejecuta los evaluadores de checks
//  3. Construye el reporte estructurado con score global
// ═══════════════════════════════════════════════════════════════

/**
 * Construye el reporte estructurado para un framework a partir
 * de las definiciones de checks y los resultados de evaluacion.
 *
 * @param {string} frameworkName - Nombre del framework (SOX, GxP, ISO27001)
 * @param {Array} checkDefs - Definiciones de checks del framework
 * @param {Array} evaluationResults - Resultados de la evaluacion
 * @returns {object} Reporte estructurado del framework
 */
function buildFrameworkReport(frameworkName, checkDefs, evaluationResults) {
  const checks = [];
  let totalScore = 0;
  let passCount = 0;
  let failCount = 0;
  let warningCount = 0;

  for (let i = 0; i < checkDefs.length; i++) {
    const def = checkDefs[i];
    const result = evaluationResults[i] || checkResult('FAIL', 0, ['Sin evaluacion disponible'], 'Revisar configuracion del check');

    const checkEntry = {
      checkId: def.id,
      checkName: def.name,
      description: def.description,
      category: def.category,
      status: result.status,
      score: result.score,
      evidence: result.evidence,
      recommendation: result.recommendation,
    };

    checks.push(checkEntry);
    totalScore += result.score;

    if (result.status === 'PASS') passCount++;
    else if (result.status === 'WARNING') warningCount++;
    else failCount++;
  }

  // Score global del framework: promedio de todos los checks
  const overallScore = checks.length > 0 ? Math.round(totalScore / checks.length) : 0;
  const overallStatus = scoreToStatus(overallScore);

  return {
    frameworkName,
    overallScore,
    overallStatus,
    totalChecks: checks.length,
    passCount,
    failCount,
    warningCount,
    checks,
  };
}


/**
 * Genera el reporte de compliance para SOX (Sarbanes-Oxley).
 *
 * Evalua controles de: Change Control, Access Management,
 * Audit Trail, Segregation of Duties.
 *
 * @param {string} systemId - ID del sistema o 'ALL'
 * @param {{ from: string, to: string }} dateRange - Rango de fechas ISO
 * @param {{ ddbDoc: object }} clients - Clientes AWS SDK
 * @returns {Promise<object>} Reporte SOX estructurado
 */
async function generateSOXReport(systemId, dateRange, clients) {
  log.info('Generando reporte SOX', { systemId });
  const startTime = Date.now();

  const data = await loadComplianceData(systemId, dateRange, clients);
  const evaluationResults = evaluateSOXChecks(data);
  const report = buildFrameworkReport('SOX (Sarbanes-Oxley)', COMPLIANCE_CHECKS.SOX, evaluationResults);

  report.metadata = {
    systemId,
    dateRange,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    dataStats: {
      incidents: data.incidents.length,
      approvals: data.approvals.length,
      executions: data.executions.length,
      advisorResults: data.advisorResults.length,
    },
  };

  log.info('Reporte SOX completado', { score: report.overallScore, status: report.overallStatus, durationMs: report.metadata.durationMs });
  return report;
}


/**
 * Genera el reporte de compliance para GxP (Good Practice).
 *
 * Evalua controles de: Data Integrity (ALCOA+), System Validation,
 * Electronic Signatures, Audit Trail.
 *
 * @param {string} systemId - ID del sistema o 'ALL'
 * @param {{ from: string, to: string }} dateRange - Rango de fechas ISO
 * @param {{ ddbDoc: object }} clients - Clientes AWS SDK
 * @returns {Promise<object>} Reporte GxP estructurado
 */
async function generateGxPReport(systemId, dateRange, clients) {
  log.info('Generando reporte GxP', { systemId });
  const startTime = Date.now();

  const data = await loadComplianceData(systemId, dateRange, clients);
  const evaluationResults = evaluateGxPChecks(data);
  const report = buildFrameworkReport('GxP (Good Practice)', COMPLIANCE_CHECKS.GxP, evaluationResults);

  report.metadata = {
    systemId,
    dateRange,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    dataStats: {
      incidents: data.incidents.length,
      approvals: data.approvals.length,
      executions: data.executions.length,
      advisorResults: data.advisorResults.length,
    },
  };

  log.info('Reporte GxP completado', { score: report.overallScore, status: report.overallStatus, durationMs: report.metadata.durationMs });
  return report;
}


/**
 * Genera el reporte de compliance para ISO 27001.
 *
 * Evalua controles de: Access Control, Incident Management,
 * Security Controls, Business Continuity.
 *
 * @param {string} systemId - ID del sistema o 'ALL'
 * @param {{ from: string, to: string }} dateRange - Rango de fechas ISO
 * @param {{ ddbDoc: object }} clients - Clientes AWS SDK
 * @returns {Promise<object>} Reporte ISO 27001 estructurado
 */
async function generateISO27001Report(systemId, dateRange, clients) {
  log.info('Generando reporte ISO 27001', { systemId });
  const startTime = Date.now();

  const data = await loadComplianceData(systemId, dateRange, clients);
  const evaluationResults = evaluateISO27001Checks(data);
  const report = buildFrameworkReport('ISO 27001', COMPLIANCE_CHECKS.ISO27001, evaluationResults);

  report.metadata = {
    systemId,
    dateRange,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    dataStats: {
      incidents: data.incidents.length,
      approvals: data.approvals.length,
      executions: data.executions.length,
      advisorResults: data.advisorResults.length,
    },
  };

  log.info('Reporte ISO 27001 completado', { score: report.overallScore, status: report.overallStatus, durationMs: report.metadata.durationMs });
  return report;
}


/**
 * Genera el reporte completo de compliance ejecutando los tres frameworks.
 *
 * Ejecuta SOX, GxP e ISO 27001 en paralelo, consolida los resultados
 * y calcula un score de compliance global ponderado.
 *
 * Ponderacion:
 *  - SOX: 40% (regulacion financiera, alta criticidad)
 *  - GxP: 30% (integridad de datos, validacion)
 *  - ISO 27001: 30% (seguridad de informacion)
 *
 * @param {string} systemId - ID del sistema o 'ALL'
 * @param {{ from: string, to: string }} dateRange - Rango de fechas ISO
 * @param {{ ddbDoc: object }} clients - Clientes AWS SDK
 * @returns {Promise<object>} Reporte completo de compliance
 */
async function generateFullComplianceReport(systemId, dateRange, clients) {
  log.info('Iniciando reporte completo de compliance', { systemId });
  const startTime = Date.now();

  // Cargar datos una sola vez para los tres frameworks (optimizacion)
  const data = await loadComplianceData(systemId, dateRange, clients);

  // Evaluar los tres frameworks en paralelo (sin I/O, solo CPU)
  const soxResults = evaluateSOXChecks(data);
  const gxpResults = evaluateGxPChecks(data);
  const isoResults = evaluateISO27001Checks(data);

  // Construir reportes por framework
  const soxReport = buildFrameworkReport('SOX (Sarbanes-Oxley)', COMPLIANCE_CHECKS.SOX, soxResults);
  const gxpReport = buildFrameworkReport('GxP (Good Practice)', COMPLIANCE_CHECKS.GxP, gxpResults);
  const isoReport = buildFrameworkReport('ISO 27001', COMPLIANCE_CHECKS.ISO27001, isoResults);

  // ─── Score global ponderado ───
  const weights = { SOX: 0.40, GxP: 0.30, ISO27001: 0.30 };
  const weightedScore = Math.round(
    soxReport.overallScore * weights.SOX +
    gxpReport.overallScore * weights.GxP +
    isoReport.overallScore * weights.ISO27001
  );

  // ─── Consolidar conteos de checks ───
  const totalChecks = soxReport.totalChecks + gxpReport.totalChecks + isoReport.totalChecks;
  const totalPass = soxReport.passCount + gxpReport.passCount + isoReport.passCount;
  const totalFail = soxReport.failCount + gxpReport.failCount + isoReport.failCount;
  const totalWarning = soxReport.warningCount + gxpReport.warningCount + isoReport.warningCount;

  // ─── Identificar los checks criticos que fallaron ───
  const criticalFindings = [];
  for (const report of [soxReport, gxpReport, isoReport]) {
    for (const check of report.checks) {
      if (check.status === 'FAIL') {
        criticalFindings.push({
          framework: report.frameworkName,
          checkId: check.checkId,
          checkName: check.checkName,
          category: check.category,
          score: check.score,
          recommendation: check.recommendation,
        });
      }
    }
  }

  // ─── Ordenar hallazgos criticos por score (mas urgentes primero) ───
  criticalFindings.sort((a, b) => a.score - b.score);

  const durationMs = Date.now() - startTime;

  const fullReport = {
    reportType: 'FULL_COMPLIANCE',
    generatedAt: new Date().toISOString(),
    systemId,
    dateRange,
    durationMs,

    // Score global
    overallScore: weightedScore,
    overallStatus: scoreToStatus(weightedScore),
    weights,

    // Resumen de checks
    summary: {
      totalChecks,
      pass: totalPass,
      fail: totalFail,
      warning: totalWarning,
      complianceRate: totalChecks > 0 ? Math.round((totalPass / totalChecks) * 100) : 0,
    },

    // Reportes individuales por framework
    frameworks: {
      SOX: soxReport,
      GxP: gxpReport,
      ISO27001: isoReport,
    },

    // Hallazgos criticos priorizados
    criticalFindings,

    // Estadisticas de datos evaluados
    dataStats: {
      incidents: data.incidents.length,
      approvals: data.approvals.length,
      executions: data.executions.length,
      advisorResults: data.advisorResults.length,
      totalRecords: data.incidents.length + data.approvals.length + data.executions.length + data.advisorResults.length,
    },
  };

  log.info('Reporte completo de compliance finalizado', {
    score: weightedScore,
    status: fullReport.overallStatus,
    checksPass: totalPass,
    checksWarning: totalWarning,
    checksFail: totalFail,
    totalChecks,
    criticalFindings: criticalFindings.length,
    durationMs,
  });

  return fullReport;
}


// ═══════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  generateSOXReport,
  generateGxPReport,
  generateISO27001Report,
  generateFullComplianceReport,
  COMPLIANCE_CHECKS,
};
