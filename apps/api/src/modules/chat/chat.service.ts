import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async processMessage(
    organizationId: string,
    message: string,
    _context?: Record<string, unknown>,
  ) {
    const runtime = this.configService.get<string>('runtime');

    if (runtime === 'LOCAL_SIMULATED') {
      return this.simulateResponse(organizationId, message);
    }

    // AWS_REAL: would call Bedrock/Claude API here
    return this.simulateResponse(organizationId, message);
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
