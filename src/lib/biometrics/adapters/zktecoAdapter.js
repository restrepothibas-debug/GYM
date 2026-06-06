import { BIOMETRIC_PROVIDER_IDS, getBiometricProvider } from '../biometricTypes';
import { createUnavailableHardwareAdapter } from './unavailableHardwareAdapter';

// ZKTeco USB readers are handled through SDK/desktop bridge integration. Keep
// this adapter explicit so hardware support is added in one place.
export const zktecoBiometricAdapter = createUnavailableHardwareAdapter(
  getBiometricProvider(BIOMETRIC_PROVIDER_IDS.zkteco),
);
