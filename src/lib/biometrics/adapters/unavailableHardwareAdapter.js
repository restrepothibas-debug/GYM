export function createUnavailableHardwareAdapter(provider) {
  const message = `${provider.name} requiere driver/SDK local antes de capturar huellas.`;

  return {
    id: provider.id,

    async detectDevice() {
      /*
       * Real readers must be enabled through a vendor adapter that talks to the
       * installed local service/SDK. Returning unavailable here prevents future
       * agents from silently faking support for hardware that is not wired yet.
       */
      return {
        available: false,
        provider: provider.id,
        deviceModel: provider.hardware,
        message,
      };
    },

    async captureSample() {
      throw new Error(message);
    },

    async verify() {
      throw new Error(message);
    },

    async identify() {
      throw new Error(message);
    },
  };
}
