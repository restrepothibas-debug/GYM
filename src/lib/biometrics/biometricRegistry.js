import { BIOMETRIC_PROVIDERS, BIOMETRIC_PROVIDER_IDS, getBiometricProvider } from './biometricTypes';
import { mockBiometricAdapter } from './adapters/mockAdapter';
import { secugenBiometricAdapter } from './adapters/secugenAdapter';
import { digitalPersonaBiometricAdapter } from './adapters/digitalPersonaAdapter';
import { zktecoBiometricAdapter } from './adapters/zktecoAdapter';
import { supremaBiometricAdapter } from './adapters/supremaAdapter';

const BIOMETRIC_ADAPTERS = {
  [BIOMETRIC_PROVIDER_IDS.mock]: mockBiometricAdapter,
  [BIOMETRIC_PROVIDER_IDS.secugen]: secugenBiometricAdapter,
  [BIOMETRIC_PROVIDER_IDS.digitalPersona]: digitalPersonaBiometricAdapter,
  [BIOMETRIC_PROVIDER_IDS.zkteco]: zktecoBiometricAdapter,
  [BIOMETRIC_PROVIDER_IDS.suprema]: supremaBiometricAdapter,
};

export function getBiometricAdapter(providerId) {
  return BIOMETRIC_ADAPTERS[providerId] || mockBiometricAdapter;
}

export function getBiometricProviders() {
  return BIOMETRIC_PROVIDERS;
}

export async function getBiometricDeviceStatus(providerId) {
  const adapter = getBiometricAdapter(providerId);
  const provider = getBiometricProvider(providerId);

  try {
    const status = await adapter.detectDevice();
    return {
      provider,
      ...status,
    };
  } catch (error) {
    return {
      provider,
      available: false,
      deviceModel: provider.hardware,
      message: error?.message || 'No se pudo validar el lector biométrico.',
    };
  }
}
