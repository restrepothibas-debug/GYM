import { BIOMETRIC_PROVIDER_IDS, getBiometricProvider } from '../biometricTypes';
import { createUnavailableHardwareAdapter } from './unavailableHardwareAdapter';

// HID DigitalPersona requires the local DigitalPersona client component before
// the browser can access 4500/5300 fingerprint readers.
export const digitalPersonaBiometricAdapter = createUnavailableHardwareAdapter(
  getBiometricProvider(BIOMETRIC_PROVIDER_IDS.digitalPersona),
);
