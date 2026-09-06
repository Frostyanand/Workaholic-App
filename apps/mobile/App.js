import React from 'react';
import { StyleSheet, Text, View, StatusBar } from 'react-native';
import { TASK_STATUS } from '@workaholic/shared';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <Text style={styles.title}>Workaholic</Text>
      <Text style={styles.subtitle}>Mobile Foundation Ready</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Default Status: {TASK_STATUS.TODO}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 20,
  },
  badge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#334155',
  },
  badgeText: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: '500',
  },
});
