import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './theme';
import { SoundManager } from './sound';
import { loadStats, saveStats, loadProgress, saveProgress, DEFAULT_STATS, MISSIONS } from './missions';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DevModeScreen() {
  const router = useNavigate();
  const { colors, onPrimary } = useTheme();
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 19)]);

  const confirm = (msg: string, action: () => void) => {
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) action();
    } else {
      Alert.alert('確認', msg, [
        { text: 'キャンセル', style: 'cancel' },
        { text: '実行', onPress: action },
      ]);
    }
  };

  // 本を大量付与
  const giveBooks = async (amount: number) => {
    const stats = await loadStats();
    stats.totalBooks += amount;
    await saveStats(stats);
    addLog(`📚 本を${amount}冊付与 → 合計${stats.totalBooks}冊`);
    SoundManager.play('complete');
  };

  // 全ミッション達成
  const completeAllMissions = async () => {
    const stats = await loadStats();
    const progress = MISSIONS.map(m => ({
      missionId: m.id,
      current: m.goal,
      completed: true,
      resetAt: 'dev',
    }));
    await saveProgress(progress);
    addLog('✅ 全ミッション達成済みに設定');
    SoundManager.play('complete');
  };

  // カスタムBGM解放
  const unlockCustomBGM = async () => {
    const stats = await loadStats();
    if (!stats.unlockedFeatures) stats.unlockedFeatures = [];
    if (!stats.unlockedFeatures.includes('custom_bgm')) {
      stats.unlockedFeatures.push('custom_bgm');
    }
    await saveStats(stats);
    addLog('🎵 カスタムBGM解放');
    SoundManager.play('complete');
  };

  // 全機能解放
  const unlockAll = async () => {
    const stats = await loadStats();
    stats.unlockedFeatures = ['custom_bgm', 'gradient_theme'];
    stats.questionSlots = 999;
    stats.totalBooks = 9999;
    stats.quizPlayed = 100;
    stats.correctAnswers = 500;
    stats.questionsCreated = 50;
    stats.loginDays = 30;
    stats.maxStreak = 30;
    stats.perfectQuiz = 10;
    stats.calendarEvents = 10;
    // 全称号解放
    const { TITLE_BADGES } = require('./missions');
    stats.unlockedTitles = TITLE_BADGES.map((b: any) => b.id);
    await saveStats(stats);
    addLog('🔓 全機能・全称号・全統計を最大値に設定');
    SoundManager.play('complete');
  };

  // 問題スロットを最大に
  const maxQuestionSlots = async () => {
    const stats = await loadStats();
    stats.questionSlots = 999;
    await saveStats(stats);
    addLog('📝 問題スロットを999に設定');
    SoundManager.play('complete');
  };

  // 統計をリセット
  const resetAll = async () => {
    confirm('全データをリセットしますか？', async () => {
      await saveStats({ ...DEFAULT_STATS });
      await saveProgress([]);
      addLog('🗑️ 全データをリセット');
      SoundManager.play('decide');
    });
  };

  // 現在の統計を表示
  const showStats = async () => {
    const stats = await loadStats();
    addLog(`📊 本:${stats.totalBooks} クイズ:${stats.quizPlayed} 正解:${stats.correctAnswers} 作成:${stats.questionsCreated} スロット:${stats.questionSlots ?? 20} 機能:${(stats.unlockedFeatures ?? []).join(',') || 'なし'}`);
  };

  const buttons = [
    { label: '📚 本を100冊付与', action: () => giveBooks(100), color: colors.primary },
    { label: '📚 本を1000冊付与', action: () => giveBooks(1000), color: colors.primary },
    { label: '✅ 全ミッション達成', action: completeAllMissions, color: colors.success },
    { label: '🎵 カスタムBGM解放', action: unlockCustomBGM, color: colors.success },
    { label: '📝 問題スロット999', action: maxQuestionSlots, color: colors.success },
    { label: '🔓 全機能解放（最大値）', action: unlockAll, color: '#9C27B0' },
    { label: '📊 現在の統計を表示', action: showStats, color: colors.warning },
    { label: '🗑️ 全データリセット', action: resetAll, color: colors.error },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: '#1A1A1A', borderBottomColor: '#333' }]}>
        <Text style={styles.headerTitle}>🛠️ Developer Mode</Text>
        <Text style={styles.headerSub}>開発者モード - 本番環境では使用しないこと</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Buttons */}
        <View style={styles.buttonGrid}>
          {buttons.map((btn, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.devButton, { backgroundColor: btn.color }]}
              onPress={btn.action}
            >
              <Text style={[styles.devButtonText, { color: onPrimary }]}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Log */}
        <View style={[styles.logBox, { backgroundColor: '#0D0D0D', borderColor: '#333' }]}>
          <Text style={styles.logTitle}>📋 実行ログ</Text>
          {log.length === 0 ? (
            <Text style={styles.logEmpty}>ボタンを押すとここにログが表示されます</Text>
          ) : (
            log.map((entry, i) => (
              <Text key={i} style={styles.logEntry}>{entry}</Text>
            ))
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[styles.backButton, { backgroundColor: colors.primary }]}
        onPress={() => { SoundManager.play('decide'); router.canGoBack() ? navigate(-1) : navigate("/"); }}
      >
        <Text style={[styles.backButtonText, { color: onPrimary }]}>戻る / Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, borderBottomWidth: 1 },
  headerTitle: { color: '#00FF41', fontSize: 18, fontWeight: 'bold', fontFamily: 'monospace' },
  headerSub: { color: '#FF4444', fontSize: 11, marginTop: 2 },
  content: { flex: 1, padding: 16 },
  buttonGrid: { gap: 10, marginBottom: 20 },
  devButton: { padding: 14, borderRadius: 8, alignItems: 'center' },
  devButtonText: { fontWeight: 'bold', fontSize: 14 },
  logBox: { borderRadius: 8, borderWidth: 1, padding: 12, minHeight: 150 },
  logTitle: { color: '#00FF41', fontWeight: 'bold', marginBottom: 8, fontFamily: 'monospace' },
  logEmpty: { color: '#666', fontSize: 12, fontFamily: 'monospace' },
  logEntry: { color: '#00FF41', fontSize: 11, fontFamily: 'monospace', marginBottom: 3 },
  backButton: { margin: 16, padding: 14, borderRadius: 12, alignItems: 'center' },
  backButtonText: { fontWeight: 'bold', fontSize: 16 },
});
