import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { TodayScreen } from '../screens/TodayScreen.jsx';
import { PlaceholderScreen } from '../screens/PlaceholderScreen.jsx';
import { TABS } from './tabs.js';

export function TabNavigator() {
  const [activeTab, setActiveTab] = useState('today');

  const renderContent = () => {
    switch (activeTab) {
      case 'today':
        return <TodayScreen />;
      case 'tasks':
        return (
          <PlaceholderScreen
            title="Tasks & Boards"
            description="Hierarchical task lists and Kanban workflows will be connected in Phase 6."
          />
        );
      case 'calendar':
        return (
          <PlaceholderScreen
            title="Calendar & Day Order"
            description="Academic schedule and Google Calendar sync will be connected in Phase 9 & 13."
          />
        );
      case 'notes':
        return (
          <PlaceholderScreen
            title="Knowledge & Notes"
            description="Bi-directional linked notes and checklists will be connected in Phase 17."
          />
        );
      case 'settings':
        return (
          <PlaceholderScreen
            title="Settings"
            description="Workspace memberships, sync preferences, and accounts."
          />
        );
      default:
        return <TodayScreen />;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>{renderContent()}</View>

      <View style={styles.tabBar} accessibilityRole="tablist">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabItem, isActive && styles.activeTabItem]}
              onPress={() => setActiveTab(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
            >
              <Text style={[styles.tabLabel, isActive && styles.activeTabLabel]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0d14',
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  activeTabItem: {
    backgroundColor: '#1e293b',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
  },
  activeTabLabel: {
    color: '#38bdf8',
    fontWeight: '600',
  },
});
