/**
 * SAP Spektra v1.4 — UI Renderer (SSOT)
 * Libreria vanilla JS para renderizar formularios, tablas y widgets
 * a partir del esquema compartido (ui-schema.json).
 *
 * Uso:
 *   <script src="/shared/ui-renderer.js"></script>
 *   const renderer = new SpektraRenderer(schema);
 *   renderer.renderStep(container, stepId, values);
 */

/* global document */

class SpektraRenderer {
  constructor(schema) {
    this.schema = schema;
    this.values = {};
    this.listeners = {};
  }

  // ═══════════════════════════════════════════════════════════════
  //  WIZARD: Renderizar un paso
  // ═══════════════════════════════════════════════════════════════

  renderStep(container, stepId, currentValues) {
    const step = this._findStep(stepId);
    if (!step) {
      container.innerHTML = `<p class="error">Paso ${stepId} no encontrado en schema</p>`;
      return;
    }

    this.values = { ...this.values, ...currentValues };

    let html = `<div class="ssot-step" data-step="${step.id}">`;
    html += `<h3 class="ssot-step-title">${step.label}</h3>`;
    if (step.description) {
      html += `<p class="ssot-step-desc">${step.description}</p>`;
    }

    html += `<div class="ssot-fields">`;
    for (const field of (step.fields || [])) {
      html += this._renderField(field);
    }
    html += `</div></div>`;

    container.innerHTML = html;
    this._bindFieldEvents(container);
  }

  // ═══════════════════════════════════════════════════════════════
  //  CAMPO: Renderizar un campo individual
  // ═══════════════════════════════════════════════════════════════

  _renderField(field) {
    const value = this.values[field.id] || field.default || '';
    const required = field.required ? 'required' : '';
    const readonly = field.readonly ? 'disabled' : '';

    let html = `<div class="ssot-field" data-field="${field.id}">`;
    html += `<label class="ssot-label" for="ssot-${field.id}">${field.label}`;
    if (field.required) html += ' <span class="ssot-required">*</span>';
    html += `</label>`;

    switch (field.type) {
      case 'text':
      case 'email':
      case 'url':
        html += `<input type="${field.type}" id="ssot-${field.id}" name="${field.id}" value="${value}" placeholder="${field.placeholder || ''}" ${required} ${readonly} class="ssot-input" />`;
        break;

      case 'select':
        html += `<select id="ssot-${field.id}" name="${field.id}" ${required} ${readonly} class="ssot-select">`;
        for (const opt of (field.options || [])) {
          const optVal = typeof opt === 'string' ? opt : opt.value;
          const optLabel = typeof opt === 'string' ? opt : opt.label;
          const selected = optVal === value ? 'selected' : '';
          html += `<option value="${optVal}" ${selected}>${optLabel}</option>`;
        }
        html += `</select>`;
        break;

      case 'check':
        html += `<span class="ssot-check ${value ? 'ssot-check-pass' : 'ssot-check-pending'}" id="ssot-${field.id}">`;
        html += value ? '&#10004; OK' : '&#8943; Pendiente';
        html += `</span>`;
        break;

      case 'discovery-table':
        html += this._renderDiscoveryTable(value);
        break;

      case 'landscape-view':
        html += this._renderLandscapeView(value, field.format);
        break;

      case 'summary':
        html += this._renderSummary();
        break;

      case 'instance-selector':
        html += `<div id="ssot-${field.id}" class="ssot-instance-selector">`;
        html += `<p class="ssot-hint">Cargando instancias...</p>`;
        html += `</div>`;
        break;

      case 'health-results':
        html += `<div id="ssot-${field.id}" class="ssot-health-results">`;
        html += `<p class="ssot-hint">Ejecutando health checks...</p>`;
        html += `</div>`;
        break;

      case 'capabilities-matrix':
        html += this._renderCapabilitiesMatrix(value);
        break;

      case 'dry-run-results':
        html += `<div id="ssot-${field.id}" class="ssot-dry-run-results">`;
        html += `<p class="ssot-hint">Ejecutando dry-run de conectividad...</p>`;
        html += `</div>`;
        break;

      case 'policy-check-results':
        html += `<div id="ssot-${field.id}" class="ssot-policy-check">`;
        html += `<p class="ssot-hint">Validando politicas...</p>`;
        html += `</div>`;
        break;

      case 'evidence-pack-summary':
        html += `<div id="ssot-${field.id}" class="ssot-evidence-pack">`;
        html += `<p class="ssot-hint">Evidence pack se genera despues del deploy</p>`;
        html += `</div>`;
        break;

      default:
        html += `<input type="text" id="ssot-${field.id}" name="${field.id}" value="${value}" ${required} ${readonly} class="ssot-input" />`;
    }

    html += `</div>`;
    return html;
  }

  // ═══════════════════════════════════════════════════════════════
  //  TABLA: Discovery
  // ═══════════════════════════════════════════════════════════════

  _renderDiscoveryTable(instances) {
    if (!instances || !Array.isArray(instances) || instances.length === 0) {
      return '<p class="ssot-hint">Ejecuta el descubrimiento para ver resultados</p>';
    }

    const columns = this.schema.discovery?.instanceTable?.columns || [];
    let html = '<table class="ssot-table"><thead><tr>';
    for (const col of columns) {
      html += `<th style="width:${col.width || 'auto'}">${col.label}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (const inst of instances) {
      html += '<tr>';
      for (const col of columns) {
        let val = inst[col.key];
        if (col.key === 'sids' && Array.isArray(val)) val = val.join(', ');
        if (col.key === 'kernelVersion' && val && col.format) {
          val = `${val.release || '?'}.${val.patchNumber || '?'}`;
        }
        if (col.key === 'haStatus') {
          val = inst.haCluster ? (inst.haCluster.localRole || 'cluster') : '-';
        }
        html += `<td>${val || '-'}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  // ═══════════════════════════════════════════════════════════════
  //  VISTA: Landscape
  // ═══════════════════════════════════════════════════════════════

  _renderLandscapeView(landscapes, format) {
    if (!landscapes || typeof landscapes !== 'object') {
      return '<p class="ssot-hint">Ejecuta el descubrimiento primero</p>';
    }

    const entries = Object.values(landscapes);
    if (entries.length === 0) return '<p class="ssot-hint">Sin landscapes detectados</p>';

    const groupFormat = format || this.schema.discovery?.landscapeGrouping?.format || '{SID} ({nodeCount} nodos)';

    let html = '<div class="ssot-landscape">';
    for (const landscape of entries) {
      const sid = landscape.sid || '?';
      const instances = landscape.instances || [];
      const products = [...new Set(instances.map(i => i.product))].join(' + ');
      const haLabel = instances.some(i => i.primarySecondary) ? 'HA' : 'Standalone';
      const nodeCount = instances.length;

      const title = groupFormat
        .replace('{SID}', sid)
        .replace('{product}', products)
        .replace('{haLabel}', haLabel)
        .replace('{nodeCount}', nodeCount);

      html += `<div class="ssot-landscape-group">`;
      html += `<h4 class="ssot-landscape-title">${title}</h4>`;
      html += `<ul class="ssot-landscape-nodes">`;
      for (const inst of instances) {
        const icon = inst.role.includes('Primary') ? '&#9733;' : (inst.role.includes('Secondary') ? '&#9734;' : '&#8226;');
        html += `<li>${icon} <strong>${inst.role}</strong> — ${inst.instanceId}</li>`;
      }
      html += `</ul></div>`;
    }
    html += '</div>';
    return html;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CAPABILITIES MATRIX
  // ═══════════════════════════════════════════════════════════════

  _renderCapabilitiesMatrix(capabilities) {
    if (!capabilities || typeof capabilities !== 'object') {
      return '<p class="ssot-hint">Ejecuta el discovery para generar la capabilities matrix</p>';
    }

    const capKeys = ['canRunSSM', 'canCollectDBMetrics', 'canExecuteRunbooks', 'canMonitorHA'];
    const labels = { canRunSSM: 'SSM Connectivity', canCollectDBMetrics: 'DB Metrics', canExecuteRunbooks: 'Runbook Execution', canMonitorHA: 'HA Monitoring' };

    let html = '<table class="ssot-table"><thead><tr><th>Capability</th><th>Status</th><th>Detalle</th></tr></thead><tbody>';
    for (const key of capKeys) {
      const cap = capabilities[key];
      if (!cap) continue;
      const icon = cap.enabled ? '&#10004;' : '&#10008;';
      const cls = cap.enabled ? 'ssot-check-pass' : 'ssot-check-fail';
      html += `<tr><td>${labels[key] || key}</td><td><span class="${cls}">${icon} ${cap.reasonCode || ''}</span></td><td>${cap.howToFix || '-'}</td></tr>`;
    }
    html += '</tbody></table>';
    if (capabilities.dbType) html += `<p class="ssot-hint">DB: ${capabilities.dbType} | OS: ${capabilities.osType || '?'} | Product: ${capabilities.product || '?'} | HA: ${capabilities.haEnabled ? 'Si' : 'No'}</p>`;
    return html;
  }

  // ═══════════════════════════════════════════════════════════════
  //  RESUMEN
  // ═══════════════════════════════════════════════════════════════

  _renderSummary() {
    let html = '<div class="ssot-summary">';
    const entries = Object.entries(this.values).filter(([k, v]) => v && !k.startsWith('_'));
    for (const [key, value] of entries) {
      const display = typeof value === 'object' ? JSON.stringify(value).substring(0, 100) : String(value);
      html += `<div class="ssot-summary-row"><span class="ssot-summary-key">${key}</span><span class="ssot-summary-val">${display}</span></div>`;
    }
    html += '</div>';
    return html;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DASHBOARD: Renderizar paginas y widgets
  // ═══════════════════════════════════════════════════════════════

  getDashboardPages() {
    return this.schema.dashboard?.pages || [];
  }

  getPolicies() {
    return this.schema.policies || [];
  }

  getStatuses(type) {
    return this.schema.statuses?.[type] || [];
  }

  // ═══════════════════════════════════════════════════════════════
  //  VALIDACION
  // ═══════════════════════════════════════════════════════════════

  validateStep(stepId) {
    const step = this._findStep(stepId);
    if (!step) return { valid: false, errors: ['Paso no encontrado'] };

    const errors = [];
    for (const field of (step.fields || [])) {
      if (field.required && !this.values[field.id]) {
        errors.push(`${field.label} es obligatorio`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ═══════════════════════════════════════════════════════════════
  //  UTILIDADES
  // ═══════════════════════════════════════════════════════════════

  _findStep(stepId) {
    for (const phase of (this.schema.wizard?.phases || [])) {
      for (const step of (phase.steps || [])) {
        if (step.id === stepId) return step;
      }
    }
    return null;
  }

  _bindFieldEvents(container) {
    const inputs = container.querySelectorAll('.ssot-input, .ssot-select');
    inputs.forEach(input => {
      input.addEventListener('change', (e) => {
        this.values[e.target.name] = e.target.value;
        this._emit('change', { field: e.target.name, value: e.target.value });
      });
    });
  }

  setValue(fieldId, value) {
    this.values[fieldId] = value;
  }

  getValues() {
    return { ...this.values };
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  _emit(event, data) {
    for (const cb of (this.listeners[event] || [])) {
      cb(data);
    }
  }
}

// Export para Node.js y browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpektraRenderer;
}
