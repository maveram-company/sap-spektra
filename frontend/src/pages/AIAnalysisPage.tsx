import { useState, useRef, useEffect, useCallback } from 'react';
import { Brain, Send, Sparkles, Bot } from 'lucide-react';
import Header from '../components/layout/Header';
import PageLoading from '../components/ui/PageLoading';
import { dataService } from '../services/dataService';
import { createLogger } from '../lib/logger';

const log = createLogger('AIAnalysisPage');
import { UpgradeBanner } from '../components/ui/FeatureGate';
import { usePlan } from '../hooks/usePlan';
import type { ApiRecord } from '../types';

// Mapa de palabras clave para seleccionar la respuesta IA apropiada
const KEYWORD_MAP = [
  { keys: ['incidente', 'cpu'], response: 'incidente' },
  { keys: ['disco', 'predic'], response: 'disco' },
  { keys: ['safety', 'segur', 'gate'], response: 'safety' },
  { keys: ['digest', 'ejecutivo'], response: 'digest' },
  { keys: ['adapta', 'ajust'], response: 'adapta' },
  { keys: ['estado', 'general', 'todos'], response: 'estado' },
  { keys: ['riesgo', 'restart'], response: 'riesgo' },
];

// Determina qué respuesta mock usar basado en el contenido del mensaje
function matchResponse(text: any, aiResponses: any) {
  const lower = text.toLowerCase();
  for (const entry of KEYWORD_MAP) {
    if (entry.keys.some((k: any) => lower.includes(k))) {
      return aiResponses[entry.response];
    }
  }
  return aiResponses.estado;
}

// Mapa de colores para el borde izquierdo de las tarjetas UC
const COLOR_BORDER = {
  danger: 'border-l-danger-500',
  warning: 'border-l-warning-500',
  primary: 'border-l-primary-500',
  accent: 'border-l-accent-500',
  success: 'border-l-success-500',
};

const COLOR_TEXT = {
  danger: 'text-danger-600 dark:text-danger-400',
  warning: 'text-warning-600 dark:text-warning-400',
  primary: 'text-primary-600 dark:text-primary-400',
  accent: 'text-accent-600 dark:text-accent-400',
  success: 'text-success-600 dark:text-success-400',
};

// Renderiza markdown básico: **bold** y saltos de línea
function renderMarkdown(text: any) {
  const lines = text.split('\n');
  return lines.map((line: any, i: any) => {
    const parts = [];
    let lastIndex = 0;
    const regex = /\*\*(.+?)\*\*/g;
    let match = regex.exec(line);
    while (match !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      parts.push(
        <strong key={`${i}-${match.index}`} className="font-semibold">
          {match[1]}
        </strong>
      );
      lastIndex = match.index + match[0].length;
      match = regex.exec(line);
    }
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }
    return (
      <span key={i}>
        {parts.length > 0 ? parts : line}
        {i < lines.length - 1 && <br />}
      </span>
    );
  });
}

export default function AIAnalysisPage() {
  const { hasFeature } = usePlan();
  const msgIdRef = useRef(0);
  const nextMsgId = (prefix: string) => {
    msgIdRef.current += 1;
    return `${prefix}-${msgIdRef.current}`;
  };
  const [aiUseCases, setAiUseCases] = useState<ApiRecord[]>([]);
  const [aiResponses, setAiResponses] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'ai',
      text: '**Bienvenido al Análisis IA de SAP Spektra.**\n\nSoy tu asistente potenciado por Amazon Bedrock (Claude). Puedo ayudarte con 7 casos de uso especializados para monitoreo SAP.\n\nSelecciona un caso de uso arriba o escribe tu consulta directamente.\n\n*Respuestas de demostración -- no conectado a Bedrock.*',
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    Promise.all([dataService.getAIUseCases(), dataService.getAIResponses()]).then(([uc, resp]) => {
      setAiUseCases(uc as any[]);
      setAiResponses(resp as any);
      setLoading(false);
    }).catch((err: any) => {
      log.warn('Fetch failed', { error: err.message });
      setError('Error al cargar datos. Intenta de nuevo.');
      setLoading(false);
    });
    return () => { clearTimeout(typingTimerRef.current); };
  }, []);

  // Auto-scroll al final cuando llegan nuevos mensajes
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Genera una respuesta IA con delay simulado
  const generateResponse = useCallback((userText: any) => {
    setIsTyping(true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      const responseText = matchResponse(userText, aiResponses);
      setMessages((prev) => [
        ...prev,
        {
          id: nextMsgId('ai'),
          role: 'ai',
          text: responseText,
        },
      ]);
      setIsTyping(false);
    }, 1200);
  }, [aiResponses]);

  // Envía un mensaje del usuario
  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    const userMsg = { id: nextMsgId('user'), role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    generateResponse(text);
  };

  // Click en una tarjeta de caso de uso
  const handleUseCaseClick = (uc: any) => {
    const userMsg = { id: nextMsgId('user'), role: 'user', text: uc.query };
    setMessages((prev) => [...prev, userMsg]);
    generateResponse(uc.query);
    inputRef.current?.focus();
  };

  // Enter para enviar
  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Si el plan no tiene acceso a IA, mostrar banner de upgrade
  if (!hasFeature('ai_analysis')) {
    return (
      <div className="flex flex-col h-full">
        <Header
          title="Analisis IA"
          subtitle="Amazon Bedrock (Claude) — 7 casos de uso — Respuestas de demostración"
        />
        <div className="flex-1 p-6 flex items-center justify-center">
          <UpgradeBanner feature="Analisis IA con Bedrock" />
        </div>
      </div>
    );
  }

  if (loading) return <PageLoading message="Cargando análisis IA..." />;

  if (error) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors">
          Reintentar
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Analisis IA"
        subtitle="Amazon Bedrock (Claude) — 7 casos de uso — Respuestas de demostración"
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Grid de casos de uso */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {aiUseCases.map((uc: any) => (
            <button
              key={uc.id}
              type="button"
              onClick={() => handleUseCaseClick(uc)}
              className={`bg-surface rounded-xl border border-border border-l-4 ${(COLOR_BORDER as Record<string, string>)[uc.color]} p-4 cursor-pointer hover:border-primary-300 dark:hover:border-primary-600 transition text-left`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-xs font-bold ${(COLOR_TEXT as Record<string, string>)[uc.color]}`}
                >
                  {uc.id}
                </span>
                <span className="text-sm font-semibold text-text-primary">
                  {uc.name}
                </span>
              </div>
              <p className="text-xs text-text-secondary">{uc.description}</p>
            </button>
          ))}
        </div>

        {/* Chat interface */}
        <div className="bg-surface rounded-xl border border-border flex flex-col" style={{ minHeight: '400px' }}>
          {/* Header del chat */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Brain size={18} className="text-primary-600 dark:text-primary-400" />
            <span className="text-sm font-semibold text-text-primary">
              Chat IA
            </span>
            <Sparkles size={14} className="text-accent-500" />
          </div>

          {/* Area de mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg: any) =>
              msg.role === 'user' ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[75%] bg-primary-600 text-white rounded-xl rounded-br-sm px-4 py-2.5 text-sm">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="flex justify-start gap-2">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center mt-0.5">
                    <Bot size={14} className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="max-w-[80%] bg-surface border border-border rounded-xl rounded-bl-sm px-4 py-2.5 text-sm text-text-primary leading-relaxed">
                    {renderMarkdown(msg.text)}
                  </div>
                </div>
              )
            )}

            {/* Indicador de escritura */}
            {isTyping && (
              <div className="flex justify-start gap-2">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center mt-0.5">
                  <Bot size={14} className="text-primary-600 dark:text-primary-400" />
                </div>
                <div className="bg-surface border border-border rounded-xl rounded-bl-sm px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input de mensaje */}
          <div className="border-t border-border p-3 flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu consulta SAP..."
              className="flex-1 bg-surface-secondary dark:bg-surface-tertiary text-text-primary text-sm rounded-lg px-4 py-2.5 border border-border focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder:text-text-tertiary"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className="flex-shrink-0 p-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
