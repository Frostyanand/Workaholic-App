import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function TodayScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Today</Text>
        <Text style={styles.subtitle}>Daily Cockpit & Focus Work</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardHeader}>ACTIVE FOCUS</Text>
        <Text style={styles.cardTitle}>Complete Phase 1 Application Skeleton</Text>
        <Text style={styles.cardMeta}>Workaholic Core • High Priority</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardHeader}>SCHEDULE</Text>
        <Text style={styles.cardTitle}>Day Order: Ready</Text>
        <Text style={styles.cardMeta}>No overlapping calendar commitments</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
  },
  card: {
    backgroundColor: '#111827',
    borderColor: '#1f293d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38bdf8',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 13,
    color: '#64748b',
  },
});
