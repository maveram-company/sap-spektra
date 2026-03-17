/* ═══════════════════════════════════════════════════════════════
   Mermaid.js initialization for SAP Spektra Documentation
   Adapts to dark/light theme using CSS variables.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  var dark = document.documentElement.getAttribute('data-theme') !== 'light';

  var darkVars = {
    primaryColor:       '#164e63',
    primaryTextColor:   '#e2e8f0',
    primaryBorderColor: '#06b6d4',
    lineColor:          '#06b6d4',
    secondaryColor:     '#1e1b4b',
    tertiaryColor:      '#1a2332',
    mainBkg:            '#0f172a',
    nodeBorder:         '#06b6d4',
    clusterBkg:         'rgba(6,182,212,0.06)',
    clusterBorder:      'rgba(6,182,212,0.25)',
    titleColor:         '#e2e8f0',
    edgeLabelBackground:'#020617',
    nodeTextColor:      '#e2e8f0',
    actorTextColor:     '#e2e8f0',
    actorBkg:           '#0f172a',
    actorBorder:        '#06b6d4',
    actorLineColor:     '#334155',
    signalColor:        '#06b6d4',
    signalTextColor:    '#e2e8f0',
    noteBkgColor:       '#1e1b4b',
    noteTextColor:      '#e2e8f0',
    noteBorderColor:    '#8b5cf6',
    activationBkgColor: '#164e63',
    activationBorderColor:'#06b6d4',
    labelBoxBkgColor:   '#0f172a',
    labelBoxBorderColor:'#06b6d4',
    labelTextColor:     '#e2e8f0'
  };

  var lightVars = {
    primaryColor:       '#cffafe',
    primaryTextColor:   '#0f172a',
    primaryBorderColor: '#0891b2',
    lineColor:          '#0891b2',
    secondaryColor:     '#ede9fe',
    tertiaryColor:      '#f0fdf4',
    mainBkg:            '#f8fafc',
    nodeBorder:         '#0891b2',
    clusterBkg:         'rgba(6,182,212,0.06)',
    clusterBorder:      'rgba(8,145,178,0.25)',
    titleColor:         '#0f172a',
    edgeLabelBackground:'#f8fafc',
    nodeTextColor:      '#0f172a',
    actorTextColor:     '#0f172a',
    actorBkg:           '#f8fafc',
    actorBorder:        '#0891b2',
    actorLineColor:     '#94a3b8',
    signalColor:        '#0891b2',
    signalTextColor:    '#0f172a',
    noteBkgColor:       '#ede9fe',
    noteTextColor:      '#0f172a',
    noteBorderColor:    '#7c3aed',
    activationBkgColor: '#cffafe',
    activationBorderColor:'#0891b2',
    labelBoxBkgColor:   '#f8fafc',
    labelBoxBorderColor:'#0891b2',
    labelTextColor:     '#0f172a'
  };

  function getConfig(isDark) {
    return {
      startOnLoad: false,
      theme: 'base',
      themeVariables: isDark ? darkVars : lightVars,
      flowchart:  { curve: 'basis', padding: 20, htmlLabels: true, useMaxWidth: true },
      sequence:   { actorMargin: 80, messageMargin: 40, useMaxWidth: true, mirrorActors: false },
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif"
    };
  }

  mermaid.initialize(getConfig(dark));

  /* ── Capture sources before mermaid renders, then run ── */
  var sources = {};
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.mermaid').forEach(function (el, i) {
      sources[i] = el.textContent;
      el.setAttribute('data-idx', i);
    });
    mermaid.run();
  });

  /* ── Re-render on theme toggle ── */
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.attributeName !== 'data-theme') return;
      var nowDark = document.documentElement.getAttribute('data-theme') !== 'light';
      mermaid.initialize(getConfig(nowDark));
      document.querySelectorAll('.mermaid').forEach(function (el) {
        var idx = el.getAttribute('data-idx');
        el.removeAttribute('data-processed');
        el.innerHTML = sources[idx];
      });
      mermaid.run();
    });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
