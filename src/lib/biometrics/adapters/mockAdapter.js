import { BIOMETRIC_PROVIDER_IDS } from '../biometricTypes';

function createMockTemplate(memberId) {
  const entropy = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `mock-template:${memberId}:${entropy}`;
}

export const mockBiometricAdapter = {
  id: BIOMETRIC_PROVIDER_IDS.mock,

  async detectDevice() {
    /*
     * The mock adapter is intentionally always available. It exercises the same
     * UI and context contract as real readers without pretending to capture a
     * real fingerprint or storing production biometric material.
     */
    return {
      available: true,
      provider: BIOMETRIC_PROVIDER_IDS.mock,
      deviceModel: 'Simulador local',
      message: 'Modo prueba activo.',
    };
  },

  async captureSample({ memberId } = {}) {
    return {
      provider: BIOMETRIC_PROVIDER_IDS.mock,
      deviceModel: 'Simulador local',
      templateFormat: 'mock-v1',
      templateEncrypted: createMockTemplate(memberId || 'unknown'),
      capturedAt: new Date().toISOString(),
    };
  },

  async verify({ memberId, enrollments = [] } = {}) {
    const activeEnrollment = enrollments.find(enrollment => (
      enrollment.memberId === memberId && enrollment.status === 'active'
    ));

    return {
      matched: Boolean(activeEnrollment),
      memberId: activeEnrollment?.memberId || null,
      score: activeEnrollment ? 100 : 0,
    };
  },

  async identify({ enrollments = [] } = {}) {
    const activeEnrollment = enrollments.find(enrollment => enrollment.status === 'active');

    return {
      matched: Boolean(activeEnrollment),
      memberId: activeEnrollment?.memberId || null,
      score: activeEnrollment ? 100 : 0,
    };
  },
};
