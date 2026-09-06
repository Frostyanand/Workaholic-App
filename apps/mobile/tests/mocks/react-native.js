/**
 * Lightweight React Native test mock for Vitest/Node environments.
 * Avoids untranspiled Flow annotations in React Native's npm package.
 */
export const Platform = {
  OS: 'android',
  select: obj => (obj.android !== undefined ? obj.android : obj.default),
};

export const StyleSheet = {
  create: styles => styles,
};

export const View = 'View';
export const Text = 'Text';
export const TouchableOpacity = 'TouchableOpacity';
export const SafeAreaView = 'SafeAreaView';
export const StatusBar = 'StatusBar';

export default {
  Platform,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
};
