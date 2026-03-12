import {
  UserRole,
  ROLE_HIERARCHY,
  MonitoringCapabilityProfile,
  SapStackType,
  DeploymentModel,
  HAStrategy,
} from './index';

describe('Domain Enums', () => {
  describe('ROLE_HIERARCHY', () => {
    it('admin has highest privilege level', () => {
      expect(ROLE_HIERARCHY[UserRole.ADMIN]).toBeGreaterThan(
        ROLE_HIERARCHY[UserRole.ESCALATION],
      );
      expect(ROLE_HIERARCHY[UserRole.ADMIN]).toBeGreaterThan(
        ROLE_HIERARCHY[UserRole.OPERATOR],
      );
      expect(ROLE_HIERARCHY[UserRole.ADMIN]).toBeGreaterThan(
        ROLE_HIERARCHY[UserRole.VIEWER],
      );
    });

    it('escalation > operator > viewer', () => {
      expect(ROLE_HIERARCHY[UserRole.ESCALATION]).toBeGreaterThan(
        ROLE_HIERARCHY[UserRole.OPERATOR],
      );
      expect(ROLE_HIERARCHY[UserRole.OPERATOR]).toBeGreaterThan(
        ROLE_HIERARCHY[UserRole.VIEWER],
      );
    });

    it('covers all UserRole values', () => {
      for (const role of Object.values(UserRole)) {
        expect(ROLE_HIERARCHY[role]).toBeDefined();
        expect(typeof ROLE_HIERARCHY[role]).toBe('number');
      }
    });
  });

  describe('MonitoringCapabilityProfile', () => {
    it('includes RISE_RESTRICTED for managed cloud systems', () => {
      expect(MonitoringCapabilityProfile.RISE_RESTRICTED).toBe(
        'RISE_RESTRICTED',
      );
    });

    it('includes FULL_STACK_AGENT for full monitoring', () => {
      expect(MonitoringCapabilityProfile.FULL_STACK_AGENT).toBe(
        'FULL_STACK_AGENT',
      );
    });
  });

  describe('SapStackType', () => {
    it('includes MANAGED_CLOUD_RESTRICTED for RISE systems', () => {
      expect(SapStackType.MANAGED_CLOUD_RESTRICTED).toBe(
        'MANAGED_CLOUD_RESTRICTED',
      );
    });

    it('covers standard SAP stacks', () => {
      expect(SapStackType.ABAP).toBe('ABAP');
      expect(SapStackType.JAVA).toBe('JAVA');
      expect(SapStackType.DUAL_STACK).toBe('DUAL_STACK');
    });
  });

  describe('DeploymentModel', () => {
    it('distinguishes RISE_MANAGED from self-hosted', () => {
      const managed = [
        DeploymentModel.RISE_MANAGED,
        DeploymentModel.PCE_MANAGED,
      ];
      const selfHosted = [
        DeploymentModel.ON_PREMISE,
        DeploymentModel.AWS_HOSTED,
      ];
      managed.forEach((m) => expect(selfHosted).not.toContain(m));
    });
  });

  describe('HAStrategy', () => {
    it('has 5 disaster recovery strategies', () => {
      expect(Object.values(HAStrategy)).toHaveLength(5);
    });

    it('includes all expected strategies', () => {
      expect(HAStrategy.HOT_STANDBY).toBeDefined();
      expect(HAStrategy.WARM_STANDBY).toBeDefined();
      expect(HAStrategy.PILOT_LIGHT).toBeDefined();
      expect(HAStrategy.CROSS_REGION_DR).toBeDefined();
      expect(HAStrategy.BACKUP_RESTORE).toBeDefined();
    });
  });
});
