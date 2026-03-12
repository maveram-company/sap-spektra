const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
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
    demoMode: false,
    chatWidget: true,
    darkMode: true,
  },
};

export default config;
