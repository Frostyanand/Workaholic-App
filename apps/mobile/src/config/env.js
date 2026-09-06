import { Platform } from 'react-native';

const DEFAULT_LOCAL_API_URL = Platform.select({
  android: 'http://10.0.2.2:3001/api/v1',
  ios: 'http://localhost:3001/api/v1',
  default: 'http://localhost:3001/api/v1',
});

/**
 * Mobile runtime environment configuration conforming to docs/18.DEPLOYMENT.md
 */
export const ENV = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL || DEFAULT_LOCAL_API_URL,
  isProduction: process.env.NODE_ENV === 'production',
};
