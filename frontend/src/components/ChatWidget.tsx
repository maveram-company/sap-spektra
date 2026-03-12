import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Bot, User, Sparkles } from 'lucide-react';
import { usePlan } from '../hooks/usePlan';

const mockResponses = [
  { trigger: 'hola', response: 'Hola! Soy el asistente IA de SAP Spektra. ¿En qué puedo ayudarte hoy con tus sistemas SAP?' },
  { trigger: 'cpu', response: 'El sistema SM1 (SolMan) tiene CPU al 95% — CRÍTICO.\n\nDiagnóstico (SM50): 2 work processes en PRIV mode consumiendo CPU excesiva. ST22 muestra 0 short dumps.\n\nRecomendación: Ejecutar RB-ABAP-001 (Clean sessions + restart WPs). Prerequisitos verificados: sapcontrol accesible, 7 WPs free.\n\nTCode referencia: SM50, ST02, ST06.' },
  { trigger: 'breach', response: 'Actualmente hay 11 breaches activos:\n- SM1: 5 breaches (CPU 95%, memory, swap 78%, failed_jobs 15, queue)\n- ED1: 3 breaches (response_time 5200ms, CPU, memory 87%)\n- PO1: 2 breaches (disk 91%, queue_depth 450)\n- EW1: 1 breach (response_time 4100ms)\n\nTCodes: SM21 (system log), ST22 (dumps), SM12 (locks).' },
  { trigger: 'backup', response: 'Estado de backups por BD:\n- EP1 (HANA): Último hace 6.2h — OK (DB13/DBACOCKPIT)\n- EQ1 (HANA): Último hace 8.5h — OK\n- BP1 (ASE): Último hace 5.5h — OK (sp_helpdb)\n- SM1 (MaxDB): Último hace 3.1h — OK (dbmcli)\n- CR1 (Oracle): Último hace 7.2h — OK (RMAN)\n\nPróximo backup: EP1 a las 22:00 (OP-001).' },
  { trigger: 'health', response: 'Resumen de salud del landscape SAP:\n- Saludables (>=90): EP1 (94), BP1 (91), GR1 (96) — 3 sistemas\n- Warning: EQ1 (87), CR1 (88), EW1 (82) — 3 sistemas\n- Degradados: ED1 (72), PO1 (63) — 2 sistemas\n- Críticos: SM1 (45) — 1 sistema\n\nSM12: 12 old locks en EP1. SM37: 2 jobs fallidos en EQ1. HSR Lag EP1: 0.8s (OK).' },
  { trigger: 'runbook', response: 'Top 5 runbooks por ejecuciones:\n1. RB-BACKUP-001 (Verify backup) — 198 runs, 99.5% éxito\n2. RB-HANA-001 (Reclaim memory) — 156 runs, 98.1% — TCode: DBACOCKPIT\n3. RB-ABAP-001 (Clean WPs) — 134 runs, 96.3% — TCode: SM50\n4. RB-ASE-001 (Dump tran log) — 112 runs, 97.3%\n5. RB-WP-001 (Clean PRIV WPs) — 98 runs, 96.9% — TCode: SM50\n\n2 runbooks pendientes aprobación (APR-001, APR-002).' },
  { trigger: 'sistema', response: 'Landscape SAP — 9 sistemas, 25+ instancias:\n- ERP Line: EP1 (PRD/S/4HANA), EQ1 (QAS), ED1 (DEV)\n- BW: BP1 (PRD/BW4HANA) — ASE 16.0\n- SOL: SM1 (PRD/SolMan 7.2) — MaxDB\n- CRM: CR1 (PRD/CRM 7.0) — Oracle 19c + ASCS/ERS HA\n- GRC: GR1 (QAS/GRC 12.0) — MSSQL\n- PO: PO1 (PRD/PO 7.5) — DB2 11.5\n- EWM: EW1 (PRD/S/4HANA EWM) — HANA\n\n¿Sobre cuál SID necesitas detalle?' },
  { trigger: 'lock', response: 'SM12 — Estado de Enqueue Locks:\n- EP1: 45 total, 12 antiguos (max 4.2h) — Tablas: VBAK, EKKO, MARA\n- CR1: 35 total, 8 antiguos (max 3.1h) — Tablas: CRMD_ORDERADM_H\n- BP1: 22 total, 3 antiguos — Normal para BW con cargas\n\nRecomendación: Ejecutar RB-LOCK-001 en EP1 para limpiar locks >2h.' },
  { trigger: 'transport', response: 'STMS — Cola de transportes:\n- 2 transportes pendientes de import a QAS (EP1K900001, EQ1K200001)\n- 1 transporte con error RC=8 en EQ1 (EP1K900003) — Objeto TADIR bloqueado\n- Último import exitoso: EP1K900002 (RC=0)\n\nAcción: Revisar EP1K900003 en SE09/SE10, resolver conflicto de objeto.' },
  { trigger: 'job', response: 'SM37 — Background Jobs activos:\n- EP1: 5 running, 18 scheduled, 2 failed/24h\n  - RSUSR002 ejecutando hace 45min (Clase A)\n- BP1: 8 running (BW loads), BI_PROCESS_TRIGGER hace 2h15min\n- PO1: RSXMB_REORG hace 35min\n\n1 job fallido: CRM_BILLING_RUN en CR1 — DBIF_RSQL_SQL_ERROR.' },
];

function getAIResponse(message) {
  const lower = message.toLowerCase();
  const match = mockResponses.find(r => lower.includes(r.trigger));
  if (match) return match.response;
  return 'Entiendo tu consulta. En este momento estoy analizando tu landscape SAP. Para preguntas más específicas, intenta preguntarme sobre: health del landscape, breaches activos, estado de backups, runbooks ejecutados, o métricas de CPU/memoria de un sistema específico.';
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '¡Hola! Soy el asistente IA de SAP Spektra. Puedo ayudarte con información sobre tus sistemas SAP, breaches, runbooks y más. ¿En qué te puedo ayudar?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const mountedRef = useRef(true);
  const { hasFeature } = usePlan();

  const canUseChat = hasFeature('chat');

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsTyping(true);

    // Simulate AI response delay
    await new Promise(r => setTimeout(r, 800 + Math.sin(userMessage.length) * 500));

    if (!mountedRef.current) return;

    const aiResponse = getAIResponse(userMessage);
    setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    setIsTyping(false);
  }, [input]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Don't render if feature not available
  if (!canUseChat) return null;

  return (
    <>
      {/* FAB Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-primary-600 to-accent-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center z-50 hover:scale-105"
        >
          <MessageSquare size={24} />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 h-[520px] bg-surface rounded-2xl border border-border shadow-2xl flex flex-col z-50 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-900/30 dark:to-accent-900/30 rounded-t-2xl">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                <Sparkles size={16} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Spektra IA</h3>
                <p className="text-[10px] text-text-secondary">Asistente inteligente SAP</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg hover:bg-surface-tertiary text-text-tertiary hover:text-text-primary transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot size={12} className="text-white" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary-600 text-white rounded-br-sm'
                    : 'bg-surface-tertiary text-text-primary rounded-bl-sm'
                }`}>
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-surface-tertiary flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User size={12} className="text-text-secondary" />
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                  <Bot size={12} className="text-white" />
                </div>
                <div className="bg-surface-tertiary rounded-xl px-3 py-2 text-sm text-text-tertiary rounded-bl-sm">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pregunta sobre tus sistemas SAP..."
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="p-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="text-[10px] text-text-tertiary mt-1.5 text-center">IA powered by Amazon Bedrock</p>
          </div>
        </div>
      )}
    </>
  );
}
