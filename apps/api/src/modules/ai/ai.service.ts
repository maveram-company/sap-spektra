import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  async getUseCases() {
    return [
      {
        id: 'anomaly-detection',
        name: 'Anomaly Detection',
        description: 'ML-based anomaly detection on system metrics',
        status: 'available',
        category: 'monitoring',
      },
      {
        id: 'predictive-maintenance',
        name: 'Predictive Maintenance',
        description: 'Predict system failures before they occur',
        status: 'available',
        category: 'operations',
      },
      {
        id: 'capacity-planning',
        name: 'Capacity Planning',
        description: 'AI-driven capacity recommendations',
        status: 'coming_soon',
        category: 'planning',
      },
      {
        id: 'auto-remediation',
        name: 'Auto Remediation',
        description: 'Automated issue resolution with AI',
        status: 'coming_soon',
        category: 'operations',
      },
      {
        id: 'security-analysis',
        name: 'Security Analysis',
        description: 'AI-powered security posture analysis',
        status: 'beta',
        category: 'security',
      },
    ];
  }

  async getResponses(organizationId: string) {
    const recentAlerts = await this.prisma.alert.findMany({
      where: { organizationId, status: 'active' },
      include: { system: { select: { sid: true } } },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    return recentAlerts.map((alert) => ({
      id: `ai-${alert.id}`,
      alertId: alert.id,
      system: alert.system.sid,
      insight: `Analysis of ${alert.title}: Recommend checking ${alert.level === 'critical' ? 'immediate remediation' : 'monitoring trends'}`,
      confidence: alert.level === 'critical' ? 0.92 : 0.78,
      generatedAt: alert.createdAt,
    }));
  }
}
