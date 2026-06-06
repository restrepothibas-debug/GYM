import { BIOMETRIC_PROVIDER_IDS, getBiometricProvider } from '../biometricTypes';
import { createUnavailableHardwareAdapter } from './unavailableHardwareAdapter';

// SecuGen WebAPI will be wired here once the workstation has the WebAPI client,
// license key and supported Hamster reader installed.
export const secugenBiometricAdapter = createUnavailableHardwareAdapter(
  getBiometricProvider(BIOMETRIC_PROVIDER_IDS.secugen),
);
