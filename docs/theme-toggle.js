// ═══════════════════════════════════════════════════════════════
//  SAP Spektra v1.4 — Toggle Tema Claro/Oscuro
//  Se ejecuta antes del render para evitar flash de tema incorrecto.
//  Persiste en localStorage con fallback a prefers-color-scheme.
// ═══════════════════════════════════════════════════════════════
(function() {
  'use strict';

  var STORAGE_KEY = 'sap-docs-theme';

  // Aplicar tema lo antes posible (antes del render)
  function getPreferredTheme() {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    // Fallback: preferencia del sistema
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    // Actualizar icono del boton toggle si existe
    var btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
  }

  // Aplicar inmediatamente
  applyTheme(getPreferredTheme());

  // Funcion global para el boton
  window.toggleDocsTheme = function() {
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  };

  // Inyectar boton toggle cuando el DOM este listo
  function injectToggleButton() {
    if (document.getElementById('themeToggleBtn')) return;
    var btn = document.createElement('button');
    btn.id = 'themeToggleBtn';
    btn.className = 'theme-toggle';
    btn.setAttribute('aria-label', 'Cambiar tema claro/oscuro');
    btn.setAttribute('title', 'Cambiar tema claro/oscuro');
    btn.onclick = window.toggleDocsTheme;
    var theme = document.documentElement.getAttribute('data-theme') || 'dark';
    btn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectToggleButton);
  } else {
    injectToggleButton();
  }

  // Escuchar cambios en preferencia del sistema
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function(e) {
      if (!localStorage.getItem(STORAGE_KEY)) {
        applyTheme(e.matches ? 'light' : 'dark');
      }
    });
  }
})();
