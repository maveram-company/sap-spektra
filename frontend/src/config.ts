const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  agentReleasesBaseUrl: import.meta.env.VITE_AGENT_RELEASES_URL || 'https://releases.spektra.maveram.com/agent/latest',
  appName: 'SAP Spektra',
  appVersion: '1.5.0',
  company: 'Maveram',
  refreshInterval: 60000,
  cognito: {
    region: import.meta.env.VITE_COGNITO_REGION || '',
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
  },
  features: {
    // demoMode is superseded by the operational mode system (see src/mode/).
    // Retained for backward compatibility — set via VITE_OPERATIONAL_MODE=MOCK instead.
    demoMode: false,
    chatWidget: true,
    darkMode: true,
  },
};

export default config;
