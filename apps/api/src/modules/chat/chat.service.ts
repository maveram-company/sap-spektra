import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

interface OperationWithSystem {
  type: string;
  status: string;
  system: { sid: string };
}

interface ExecutionWithDetails {
  result: string;
  system: { sid: string };
  runbook: { name: string };
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly runtime: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.runtime = this.configService.get<string>(
      'RUNTIME_MODE',
      'LOCAL_SIMULATED',
    );
  }

  async processMessage(
    organizationId: string,
    message: string,
    context?: Record<string, unknown>,
  ) {
    if (this.runtime === 'LOCAL_SIMULATED') {
      return this.simulateResponse(organizationId, message);
    }

    // AWS_REAL: call Claude API with SAP context
    return this.callClaudeAPI(organizationId, message, context);
  }

  /**
   * Calls Claude API with system context from the database.
   * Requires ANTHROPIC_API_KEY environment variable.
   */
  private async callClaudeAPI(
    organizationId: string,
    message: string,
    context?: Record<string, unknown>,
  ) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'ANTHROPIC_API_KEY not set, falling back to simulated response',
      );
      return this.simulateResponse(organizationId, message);
    }

    // Build SAP context from database
    const sapContext = await this.buildSAPContext(organizationId);

    const systemPrompt = [
      'Eres el asistente AI de SAP Spektra, una plataforma de monitoreo y automatización de sistemas SAP.',
      'Responde en español. Sé conciso y directo.',
      'Tienes acceso al contexto actual de los sistemas SAP del usuario.',
      '',
      '## Contexto actual:',
      sapContext,
      '',
      'Cuando el usuario pregunte sobre sistemas, alertas, operaciones o runbooks, usa este contexto para dar respuestas precisas.',
      'Si no tienes suficiente información, indica qué datos adicionales necesitas.',
    ].join('\n');

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.configService.get<string>(
            'CLAUDE_MODEL',
            'claude-sonnet-4-20250514',
          ),
          max_tokens: 1024,
          system: systemPrompt,
          messages: [
            ...(context?.history
              ? (context.history as Array<{ role: string; content: string }>)
              : []),
            { role: 'user', content: message },
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Claude API error ${response.status}: ${error}`);
        return this.simulateResponse(organizationId, message);
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>;
        usage: { input_tokens: number; output_tokens: number };
      };

      const aiMessage = data.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      return {
        type: 'ai_response',
        message: aiMessage,
        model: this.configService.get<string>(
          'CLAUDE_MODEL',
          'claude-sonnet-4-20250514',
        ),
        usage: data.usage,
        suggestions: this.extractSuggestions(aiMessage, message),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Claude API call failed: ${msg}`);
      return this.simulateResponse(organizationId, message);
    }
  }

  /**
   * Builds a text summary of the current SAP landscape for the AI context.
   */
  private async buildSAPContext(organizationId: string): Promise<string> {
    const [systems, activeAlerts, recentOps, recentExecutions] =
      await Promise.all([
        this.prisma.system.findMany({
          where: { organizationId },
          select: {
            sid: true,
            status: true,
            healthScore: true,
            environment: true,
            dbType: true,
            sapProduct: true,
          },
        }),
        this.prisma.alert.findMany({
          where: { organizationId, status: 'active' },
          include: { system: { select: { sid: true } } },
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.operationRecord.findMany({
          where: { organizationId },
          include: { system: { select: { sid: true } } },
          take: 5,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.runbookExecution.findMany({
          where: { runbook: { organizationId } },
          include: {
            runbook: { select: { name: true } },
            system: { select: { sid: true } },
          },
          take: 5,
          orderBy: { startedAt: 'desc' },
        }),
      ]);

    const lines: string[] = [];

    lines.push(`### Sistemas SAP (${systems.length}):`);
    for (const s of systems) {
      lines.push(
        `- ${s.sid}: ${s.status} (health: ${s.healthScore}%, env: ${s.environment}, db: ${s.dbType}, product: ${s.sapProduct})`,
      );
    }

    lines.push(`\n### Alertas activas (${activeAlerts.length}):`);
    for (const a of activeAlerts) {
      lines.push(`- [${a.level}] ${a.system.sid}: ${a.title}`);
    }

    if (recentOps.length > 0) {
      lines.push(`\n### Operaciones recientes:`);
      for (const op of recentOps as OperationWithSystem[]) {
        lines.push(`- ${op.system?.sid}: ${op.type} — ${op.status}`);
      }
    }

    if (recentExecutions.length > 0) {
      lines.push(`\n### Ejecuciones de runbooks recientes:`);
      for (const ex of recentExecutions as ExecutionWithDetails[]) {
        lines.push(`- ${ex.system?.sid}: ${ex.runbook?.name} — ${ex.result}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Extracts suggested follow-up actions based on the conversation.
   */
  private extractSuggestions(aiMessage: string, userMessage: string): string[] {
    const suggestions: string[] = [];
    const lower = (aiMessage + ' ' + userMessage).toLowerCase();

    if (lower.includes('alerta') || lower.includes('alert')) {
      suggestions.push('Ver alertas críticas', 'Reconocer alertas');
    }
    if (lower.includes('sistema') || lower.includes('system')) {
      suggestions.push('Health summary', 'Ver detalle del sistema');
    }
    if (lower.includes('runbook') || lower.includes('ejecu')) {
      suggestions.push('Ver runbooks disponibles', 'Últimas ejecuciones');
    }
    if (lower.includes('backup') || lower.includes('respaldo')) {
      suggestions.push('Estado de backups', 'Programar backup');
    }

    if (suggestions.length === 0) {
      suggestions.push('Estado general', 'Alertas activas', 'Listar sistemas');
    }

    return suggestions.slice(0, 4);
  }

  private async simulateResponse(organizationId: string, message: string) {
    const lower = message.toLowerCase();

    // Gather real context from DB
    const [systemCount, activeAlerts, criticalCount] = await Promise.all([
      this.prisma.system.count({ where: { organizationId } }),
      this.prisma.alert.count({ where: { organizationId, status: 'active' } }),
      this.prisma.alert.count({
        where: { organizationId, level: 'critical', status: 'active' },
      }),
    ]);

    if (
      lower.includes('estado') ||
      lower.includes('status') ||
      lower.includes('resumen')
    ) {
      return {
        type: 'status_summary',
        message: `Tienes ${systemCount} sistemas registrados. Hay ${activeAlerts} alertas activas, de las cuales ${criticalCount} son críticas.`,
        data: { systemCount, activeAlerts, criticalCount },
        suggestions: [
          'Ver alertas críticas',
          'Mostrar dashboard',
          'Analizar sistema PI1',
        ],
      };
    }

    if (lower.includes('alerta') || lower.includes('alert')) {
      const alerts = await this.prisma.alert.findMany({
        where: { organizationId, status: 'active' },
        include: { system: { select: { sid: true } } },
        take: 5,
        orderBy: { createdAt: 'desc' },
      });

      return {
        type: 'alert_list',
        message: `Hay ${activeAlerts} alertas activas:`,
        data: alerts.map((a) => ({
          id: a.id,
          system: a.system.sid,
          title: a.title,
          level: a.level,
        })),
        suggestions: ['Reconocer alerta', 'Ver detalle', 'Escalar'],
      };
    }

    if (lower.includes('sistema') || lower.includes('system')) {
      const systems = await this.prisma.system.findMany({
        where: { organizationId },
        select: {
          sid: true,
          status: true,
          healthScore: true,
          environment: true,
        },
      });

      return {
        type: 'system_list',
        message: `Tus ${systemCount} sistemas SAP:`,
        data: systems,
        suggestions: ['Ver sistema EP1', 'Comparar sistemas', 'Health summary'],
      };
    }

    return {
      type: 'general',
      message: `Entiendo tu consulta sobre "${message}". Como asistente de SAP Spektra, puedo ayudarte con: estado de sistemas, alertas, operaciones, runbooks, y análisis. ¿Qué necesitas?`,
      suggestions: [
        'Estado general',
        'Alertas activas',
        'Listar sistemas',
        'Operaciones pendientes',
      ],
    };
  }
}
