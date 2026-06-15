import { useEffect, useState } from 'react';
import { Platform, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigate } from 'react-router-dom';

/**
 * Debug component for diagnosing GitHub Pages routing issues.
 * 
 * This component displays routing information to help diagnose
 * issues between redirects and router initialization.
 * 
 * Usage: Add to _layout.tsx temporarily for debugging
 */
export function DebugRouter() {
  const navigate = useNavigate();
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const updateDebugInfo = () => {
      const info = {
        // Window location info
        windowLocation: {
          href: window.location.href,
          pathname: window.location.pathname,
          search: window.location.search,
          hash: window.location.hash,
          origin: window.location.origin,
        },
        // URL search params
        searchParams: Object.fromEntries(new URLSearchParams(window.location.search)),
        // Expo Router info
        expoRouter: {
          // Note: expo-router's router doesn't expose pathname directly
          // We'll use window.location.pathname instead
        },
        // Timestamp
        timestamp: new Date().toISOString(),
      };

      setDebugInfo(info);
      console.log('🔍 Debug Router Info:', info);
    };

    // Initial log
    updateDebugInfo();

    // Update on URL changes
    const handlePopState = () => {
      console.log('🔍 URL changed via popstate');
      updateDebugInfo();
    };

    window.addEventListener('popstate', handlePopState);

    // Update periodically to catch any changes
    const interval = setInterval(updateDebugInfo, 2000);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      clearInterval(interval);
    };
  }, []);

  // Only show on web
  if (Platform.OS !== 'web' || !isVisible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🔍 Router Debug</Text>
        <TouchableOpacity onPress={() => setIsVisible(false)}>
          <Text style={styles.closeButton}>✕</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Window Location</Text>
        <Text style={styles.label}>href:</Text>
        <Text style={styles.value}>{debugInfo.windowLocation?.href || 'N/A'}</Text>
        <Text style={styles.label}>pathname:</Text>
        <Text style={styles.value}>{debugInfo.windowLocation?.pathname || 'N/A'}</Text>
        <Text style={styles.label}>search:</Text>
        <Text style={styles.value}>{debugInfo.windowLocation?.search || 'N/A'}</Text>
        <Text style={styles.label}>hash:</Text>
        <Text style={styles.value}>{debugInfo.windowLocation?.hash || 'N/A'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Search Params</Text>
        {Object.keys(debugInfo.searchParams || {}).length > 0 ? (
          Object.entries(debugInfo.searchParams).map(([key, value]) => (
            <Text key={key} style={styles.value}>
              {key}: {String(value)}
            </Text>
          ))
        ) : (
          <Text style={styles.value}>None</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Timestamp</Text>
        <Text style={styles.value}>{debugInfo.timestamp || 'N/A'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 300,
    maxHeight: 600,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 8,
    padding: 12,
    zIndex: 9999,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  closeButton: {
    color: '#fff',
    fontSize: 18,
  },
  section: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 8,
  },
  sectionTitle: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  label: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4,
  },
  value: {
    color: '#e2e8f0',
    fontSize: 11,
    fontFamily: 'monospace',
  },
});
