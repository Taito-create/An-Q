import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './theme';
import { useLocale } from './hooks/useLocale';
import { translations } from './translations';
import { SoundManager } from './sound';
import { loadStats, saveStats, loadProgress, saveProgress, DEFAULT_STATS, MISSIONS } from './missions';
import { useRooms } from './context/RoomsContext';
import { attachDevBotToRoom, isDevBotModeEnabled } from './utils/devBot';
import { STORAGE_KEYS } from './constants/storageKeys';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BookOpen, CheckCircle, Music, Pencil, Lock, BarChart3, Trash2, ClipboardList, Wrench, Bot } from 'lucide-react';

export default function DevModeScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary, isCyberpunk } = useTheme();
  const locale = useLocale();
  const t = translations[locale];

  // 開発者モードは localhost 限定。本番/プレビューに URL 直打ちで到達できないようにする
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hostname !== 'localhost') {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  const [log, setLog] = useState<string[]>([]);

  const { createRoom } = useRooms();
  const [botMode, setBotMode] = useState(false);
  const [creatingLimitSec, setCreatingLimitSec] = useState<number>(60);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setBotMode(window.localStorage.getItem(STORAGE_KEYS.DEV_BATTLE_BOT) === 'true');
      const limitRaw = window.localStorage.getItem(STORAGE_KEYS.DEV_CREATING_LIMIT_SEC);
      const parsed = limitRaw ? parseInt(limitRaw, 10) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) setCreatingLimitSec(parsed);
    } catch {}
  }, []);

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
    addLog(`本を${amount}冊付与 → 合計${stats.totalBooks}冊`);
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
    addLog('全ミッション達成済みに設定');
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
    addLog('カスタムBGM解放');
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
    addLog('全機能・全称号・全統計を最大値に設定');
    SoundManager.play('complete');
  };

  // 問題スロットを最大に
  const maxQuestionSlots = async () => {
    const stats = await loadStats();
    stats.questionSlots = 999;
    await saveStats(stats);
    addLog('問題スロットを999に設定');
    SoundManager.play('complete');
  };

  // 統計をリセット
  const resetAll = async () => {
    confirm('全データをリセットしますか？', async () => {
      await saveStats({ ...DEFAULT_STATS });
      await saveProgress([]);
    addLog('全データをリセット');
      SoundManager.play('decide');
    });
  };

  // 現在の統計を表示
  const showStats = async () => {
    const stats = await loadStats();
    addLog(`本:${stats.totalBooks} クイズ:${stats.quizPlayed} 正解:${stats.correctAnswers} 作成:${stats.questionsCreated} スロット:${stats.questionSlots ?? 20} 機能:${(stats.unlockedFeatures ?? []).join(',') || 'なし'}`);
  };

  const toggleBotMode = async (val: boolean) => {
    setBotMode(val);
    try {
      if (val) {
        window.localStorage.setItem(STORAGE_KEYS.DEV_BATTLE_BOT, 'true');
      } else {
        window.localStorage.removeItem(STORAGE_KEYS.DEV_BATTLE_BOT);
      }
    } catch {}
    SoundManager.play('decide');
    addLog(val ? 'Bot 対戦モードを ON' : 'Bot 対戦モードを OFF');
  };

  const changeCreatingLimit = async (sec: number) => {
    const clamped = Math.max(3, Math.min(300, Math.floor(sec)));
    setCreatingLimitSec(clamped);
    try {
      if (clamped === 60) {
        window.localStorage.removeItem(STORAGE_KEYS.DEV_CREATING_LIMIT_SEC);
      } else {
        window.localStorage.setItem(STORAGE_KEYS.DEV_CREATING_LIMIT_SEC, String(clamped));
      }
    } catch {}
    SoundManager.play('decide');
    addLog(`制限時間を ${clamped}秒 に設定`);
  };

  const startBotBattle = async () => {
    if (starting) return;
    setStarting(true);
    try {
      SoundManager.play('decide');
      const roomId = await createRoom();
      await attachDevBotToRoom(roomId);
      addLog(`Bot 対戦を開始: ルーム ${roomId.slice(0, 8)}...`);
      navigate(`/battle/${roomId}`);
    } catch (e: any) {
      console.error('startBotBattle failed:', e);
      addLog(`エラー: ${e?.message ?? 'Bot 対戦の開始に失敗'}`);
      Alert.alert('エラー', e?.message ?? 'Bot 対戦の開始に失敗しました');
    } finally {
      setStarting(false);
    }
  };

  const buttons = [
    { label: '本を100冊付与', icon: BookOpen, action: () => giveBooks(100), color: colors.primary },
    { label: '本を1000冊付与', icon: BookOpen, action: () => giveBooks(1000), color: colors.primary },
    { label: '全ミッション達成', icon: CheckCircle, action: completeAllMissions, color: colors.success },
    { label: 'カスタムBGM解放', icon: Music, action: unlockCustomBGM, color: colors.success },
    { label: '問題スロット999', icon: Pencil, action: maxQuestionSlots, color: colors.success },
    { label: '全機能解放（最大値）', icon: Lock, action: unlockAll, color: '#9C27B0' },
    { label: '現在の統計を表示', icon: BarChart3, action: showStats, color: colors.warning },
    { label: '全データリセット', icon: Trash2, action: resetAll, color: colors.error },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: '#1A1A1A', borderBottomColor: '#333', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <View>
          <Text style={styles.headerTitle}><Wrench size={20} color="#00FF41" style={{ marginRight: 8 }} />Developer Mode</Text>
          <Text style={styles.headerSub}>開発者モード - 本番環境では使用しないこと</Text>
        </View>
        <TouchableOpacity
          style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.primary, borderRadius: isCyberpunk ? 0 : 10, alignItems: 'center', justifyContent: 'center', minWidth: 70 }}
          onPress={() => { SoundManager.play('decide'); navigate('/'); }}
        >
          <Text style={{ color: onPrimary, fontWeight: '700', fontSize: 14 }}>{locale === 'ja' ? '戻る' : 'Back'}</Text>
        </TouchableOpacity>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <btn.icon size={18} color="#fff" />
                <Text style={[styles.devButtonText, { color: onPrimary }]}>{btn.label}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Bot 対戦セクション */}
        <View style={{ marginTop: 24, marginBottom: 20 }}>
          <Text style={{ color: '#00FF41', fontWeight: 'bold', fontFamily: 'monospace', marginBottom: 12, fontSize: 14 }}>
            <Bot size={18} color="#00FF41" style={{ marginRight: 6 }} />
            Bot 対戦モード（1人で対戦テスト）
          </Text>

          {/* トグル */}
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 14,
              borderRadius: 8,
              backgroundColor: botMode ? '#00FF41' : '#1A1A1A',
              borderWidth: 1,
              borderColor: '#00FF41',
              marginBottom: 10,
            }}
            onPress={() => toggleBotMode(!botMode)}
          >
            <Text style={{ color: botMode ? '#000' : '#00FF41', fontWeight: 'bold', fontSize: 14 }}>
              Bot 対戦: {botMode ? 'ON' : 'OFF'}
            </Text>
            <Text style={{ color: botMode ? '#000' : '#00FF41', fontSize: 12 }}>
              {botMode ? '有効' : '無効'}
            </Text>
          </TouchableOpacity>

          {/* 制限時間 */}
          <View style={{
            padding: 14,
            borderRadius: 8,
            backgroundColor: '#1A1A1A',
            borderWidth: 1,
            borderColor: '#00FF41',
            marginBottom: 10,
          }}>
            <Text style={{ color: '#00FF41', fontSize: 12, marginBottom: 8 }}>
              問題作成の制限時間（現在: {creatingLimitSec}秒）
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[5, 10, 30, 60].map((sec) => (
                <TouchableOpacity
                  key={sec}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: creatingLimitSec === sec ? '#00FF41' : '#333',
                    backgroundColor: creatingLimitSec === sec ? '#00FF41' : 'transparent',
                  }}
                  onPress={() => changeCreatingLimit(sec)}
                >
                  <Text style={{ color: creatingLimitSec === sec ? '#000' : '#00FF41', fontSize: 12, fontWeight: 'bold' }}>
                    {sec}秒
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 開始ボタン */}
          <TouchableOpacity
            style={{
              padding: 16,
              borderRadius: 8,
              backgroundColor: starting ? '#333' : '#00FF41',
              alignItems: 'center',
              opacity: starting ? 0.6 : 1,
            }}
            onPress={startBotBattle}
            disabled={starting || !botMode}
          >
            <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 15 }}>
              {starting ? '起動中...' : '▶ Bot 対戦を開始'}
            </Text>
          </TouchableOpacity>
          {!botMode && (
            <Text style={{ color: '#FF4444', fontSize: 11, marginTop: 6, textAlign: 'center' }}>
              ※ Bot 対戦モードを ON にしてください
            </Text>
          )}
        </View>

        {/* Log */}
        <View style={[styles.logBox, { backgroundColor: '#0D0D0D', borderColor: '#333' }]}>
          <Text style={styles.logTitle}><ClipboardList size={16} color="#00FF41" style={{ marginRight: 6 }} />実行ログ</Text>
          {log.length === 0 ? (
            <Text style={styles.logEmpty}>ボタンを押すとここにログが表示されます</Text>
          ) : (
            log.map((entry, i) => (
              <Text key={i} style={styles.logEntry}>{entry}</Text>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  closeButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minWidth: 70 },
  closeButtonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
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
});
