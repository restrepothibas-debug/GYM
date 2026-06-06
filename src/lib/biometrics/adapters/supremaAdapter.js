import { BIOMETRIC_PROVIDER_IDS, getBiometricProvider } from '../biometricTypes';
import { createUnavailableHardwareAdapter } from './unavailableHardwareAdapter';

// Suprema BioMini support belongs behind a desktop bridge or official SDK
// wrapper. Do not access the device directly from React components.
export const supremaBiometricAdapter = createUnavailableHardwareAdapter(
  getBiometricProvider(BIOMETRIC_PROVIDER_IDS.suprema),
);
