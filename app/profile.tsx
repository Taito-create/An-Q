import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './theme';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { SoundManager } from './sound';
import { loadStats } from './missions';

interface UserProfile {
  username: string;
  level: number;
  currentXP: number;
  nextLevelXP: number;
  totalCoins: number;
  totalQuestionsCreated: number;
  totalQuizzesPlayed: number;
  totalCorrectAnswers: number;
  correctRate: number;
  streakDays: number;
  joinDate: number;
  achievements: string[];
}

export default function ProfileScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary } = useTheme();
  const locale = useLocale();
  const t = translations[locale];

  const [profile, setProfile] = useState<UserProfile>({
    username: 'An-Q Learner',
    level: 1,
    currentXP: 0,
    nextLevelXP: 100,
    totalCoins: 0,
    totalQuestionsCreated: 0,
    totalQuizzesPlayed: 0,
    totalCorrectAnswers: 0,
    correctRate: 0,
    streakDays: 0,
    joinDate: Date.now(),
    achievements: [],
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const level = parseInt(await AsyncStorage.getItem('user_level') || '1', 10);
      const xp = parseInt(await AsyncStorage.getItem('user_xp') || '0', 10);
      const coins = parseInt(await AsyncStorage.getItem('user_coins') || '0', 10);
      const questionsRaw = await AsyncStorage.getItem('quiz_questions') || '[]';
      const questions = JSON.parse(questionsRaw);
      const username = await AsyncStorage.getItem('user_username') || 'An-Q Learner';

      const stats = await loadStats();
      const resultsRaw = await AsyncStorage.getItem('quizResults') || '[]';
      let results = [];
      try { results = JSON.parse(resultsRaw); } catch(e) {}
      const resultsArr = Array.isArray(results) ? results : results.results || [];
      const correctCount = resultsArr.filter((r: any) => r.isCorrect).length;
      const correctRate = resultsArr.length > 0 ? Math.round((correctCount / resultsArr.length) * 100) : 0;
      const streakCount = parseInt(await AsyncStorage.getItem('streakCount') || '0', 10);

      setProfile({
        username,
        level,
        currentXP: xp,
        nextLevelXP: level * 100,
        totalCoins: coins,
        totalQuestionsCreated: questions.length,
      totalQuizzesPlayed: stats?.quizPlayed || 0,
        totalCorrectAnswers: correctCount,
        correctRate,
        streakDays: streakCount,
        joinDate: parseInt(await AsyncStorage.getItem('join_date') || Date.now().toString(), 10),
        achievements: JSON.parse(await AsyncStorage.getItem('achievements') || '[]'),
      });
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  };

  const xpProgress = Math.min((profile.currentXP / profile.nextLevelXP) * 100, 100);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => { SoundManager.play('decide'); navigate('/'); }}>
          <Text style={[styles.backBtn, { color: colors.primary }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>👤 {t.profile || 'Profile'}</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* ユーザー名 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.username, { color: colors.text }]}>{profile.username}</Text>
          <Text style={[{ color: colors.textSecondary, fontSize: 12 }]}>
            {locale === 'ja' ? '参加日' : 'Joined'}: {new Date(profile.joinDate).toLocaleDateString()}
          </Text>
        </View>

        {/* レベル */}
        <View style={[styles.card, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={[{ fontSize: 24, fontWeight: '700', color: colors.primary }]}>
              Lv. {profile.level}
            </Text>
            <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>
              {profile.currentXP} / {profile.nextLevelXP} XP
            </Text>
          </View>
          <View style={{ backgroundColor: colors.primary + '40', borderRadius: 8, height: 12, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${xpProgress}%`, backgroundColor: colors.primary, borderRadius: 8 }} />
          </View>
        </View>

        {/* 通貨 */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <View style={[styles.card, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>✨ Qコイン</Text>
            <Text style={[{ fontSize: 28, fontWeight: '700', color: colors.primary, marginTop: 4 }]}>
              {profile.totalCoins}
            </Text>
          </View>
          <View style={[styles.card, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>⚡ XP</Text>
            <Text style={[{ fontSize: 28, fontWeight: '700', color: colors.success || '#4CAF50', marginTop: 4 }]}>
              {profile.currentXP}
            </Text>
          </View>
        </View>

        {/* 統計 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 12 }]}>
            📊 {locale === 'ja' ? '統計' : 'Stats'}
          </Text>
          <View style={styles.statRow}>
            <Text style={[{ color: colors.text }]}>{locale === 'ja' ? '作成した問題' : 'Problems Created'}</Text>
            <Text style={[{ color: colors.primary, fontWeight: '700' }]}>{profile.totalQuestionsCreated}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={[{ color: colors.text }]}>{locale === 'ja' ? 'クイズ実施' : 'Quizzes Played'}</Text>
            <Text style={[{ color: colors.primary, fontWeight: '700' }]}>{profile.totalQuizzesPlayed}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={[{ color: colors.text }]}>{locale === 'ja' ? '正答率' : 'Correct Rate'}</Text>
            <Text style={[{ color: colors.success || '#4CAF50', fontWeight: '700' }]}>{profile.correctRate}%</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={[{ color: colors.text }]}>{locale === 'ja' ? 'ストリーク' : 'Streak'}</Text>
            <Text style={[{ color: colors.primary, fontWeight: '700' }]}>🔥 {profile.streakDays}</Text>
          </View>
        </View>

        {/* 称号 */}
        {profile.achievements.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 12 }]}>
              🏆 {locale === 'ja' ? '称号' : 'Achievements'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {profile.achievements.map((achievement, i) => (
                <View key={i} style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                  <Text style={[{ color: colors.primary, fontSize: 12, fontWeight: '600' }]}>{achievement}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ショップ */}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={() => { SoundManager.play('decide'); navigate('/shop'); }}
        >
          <Text style={[styles.buttonText, { color: onPrimary }]}>
            🛍️ {locale === 'ja' ? 'ショップ' : 'Shop'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1 },
  backBtn: { fontSize: 20, fontWeight: 'bold' },
  title: { fontSize: 18, fontWeight: '700', flex: 1 },
  content: { padding: 16, flex: 1 },
  card: { borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1 },
  username: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  button: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  buttonText: { fontWeight: '700', fontSize: 16 },
});