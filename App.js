import { registerRootComponent } from 'expo';
import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { runMigrations } from './app/migrations/index';
import { handleFatalError } from './app/utils/errorHandler';

/**
 * アプリルートコンポーネント
 * 起動時に runMigrations() を実行し、完了後にメインコンテンツを表示する。
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
function App() {
  // マイグレーション完了フラグ（false の間はメインコンテンツを表示しない）
  const [migrationReady, setMigrationReady] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Requirement 6.1: アプリ起動時に runMigrations() を呼び出す
        await runMigrations();
        // Requirement 6.2: 正常完了後にアプリ画面を表示
        setMigrationReady(true);
      } catch (error) {
        // Requirement 6.3: エラー時は handleFatalError を呼び出す
        handleFatalError(error);
      }
    };

    initializeApp();
  }, []);

  // Requirement 6.4: マイグレーション完了前はメインコンテンツを表示しない
  if (!migrationReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6200EE" />
        <Text style={styles.loadingText}>読み込み中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text>Hello World!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666666',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

registerRootComponent(App);
