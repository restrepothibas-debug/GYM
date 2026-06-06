export const BIOMETRIC_PROVIDER_IDS = {
  mock: 'mock',
  secugen: 'secugen',
  digitalPersona: 'digitalpersona',
  zkteco: 'zkteco',
  suprema: 'suprema',
};

export const BIOMETRIC_ENROLLMENT_STATUS = {
  active: 'active',
  revoked: 'revoked',
};

export const BIOMETRIC_PROVIDERS = [
  {
    id: BIOMETRIC_PROVIDER_IDS.mock,
    name: 'Modo prueba',
    hardware: 'Simulador local',
    platform: 'Web / Desktop',
    mode: 'mock',
  },
  {
    id: BIOMETRIC_PROVIDER_IDS.secugen,
    name: 'SecuGen WebAPI',
    hardware: 'Hamster Air, IV, Plus, Pro',
    platform: 'Windows + cliente WebAPI',
    mode: 'webapi',
  },
  {
    id: BIOMETRIC_PROVIDER_IDS.digitalPersona,
    name: 'HID DigitalPersona',
    hardware: 'DigitalPersona 4500 / 5300',
    platform: 'Windows + DigitalPersona client',
    mode: 'web-client',
  },
  {
    id: BIOMETRIC_PROVIDER_IDS.zkteco,
    name: 'ZKTeco SDK',
    hardware: 'ZK4500 / ZK9500',
    platform: 'Desktop bridge / SDK',
    mode: 'desktop-sdk',
  },
  {
    id: BIOMETRIC_PROVIDER_IDS.suprema,
    name: 'Suprema BioMini',
    hardware: 'BioMini / BioMini Plus',
    platform: 'Desktop bridge / SDK',
    mode: 'desktop-sdk',
  },
];

export function getBiometricProvider(providerId) {
  return BIOMETRIC_PROVIDERS.find(provider => provider.id === providerId) || BIOMETRIC_PROVIDERS[0];
}
