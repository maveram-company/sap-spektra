// ═══════════════════════════════════════════════════════════════
//  Avvale SAP AlwaysOps v1.5 — Toggle Idioma ES/EN
//  Se ejecuta antes del render para evitar flash de idioma incorrecto.
//  Persiste en localStorage. Default: español.
// ═══════════════════════════════════════════════════════════════
(function() {
  'use strict';

  var STORAGE_KEY = 'sap-docs-lang';

  function getPreferredLang() {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'es' || stored === 'en') return stored;
    return 'es';
  }

  function applyLang(lang) {
    document.documentElement.setAttribute('data-lang', lang);
    document.documentElement.setAttribute('lang', lang);
    localStorage.setItem(STORAGE_KEY, lang);
    var btn = document.getElementById('langToggleBtn');
    if (btn) btn.textContent = lang === 'es' ? 'EN' : 'ES';
  }

  // Aplicar inmediatamente
  applyLang(getPreferredLang());

  // Funcion global para el boton
  window.toggleDocsLang = function() {
    var current = document.documentElement.getAttribute('data-lang') || 'es';
    applyLang(current === 'es' ? 'en' : 'es');
  };

  // Inyectar boton cuando el DOM este listo
  function injectLangButton() {
    if (document.getElementById('langToggleBtn')) return;
    var btn = document.createElement('button');
    btn.id = 'langToggleBtn';
    btn.className = 'lang-toggle';
    btn.setAttribute('aria-label', 'Switch language / Cambiar idioma');
    btn.setAttribute('title', 'Switch language / Cambiar idioma');
    btn.onclick = window.toggleDocsLang;
    var lang = document.documentElement.getAttribute('data-lang') || 'es';
    btn.textContent = lang === 'es' ? 'EN' : 'ES';
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectLangButton);
  } else {
    injectLangButton();
  }
})();
