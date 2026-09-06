import React from 'react';
import { StyleSheet, View, StatusBar } from 'react-native';
import { TabNavigator } from './src/navigation/TabNavigator.jsx';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0d14" />
      <TabNavigator />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0d14',
  },
});
