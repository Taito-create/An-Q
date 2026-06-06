import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './theme';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { SoundManager } from './sound';
import { loadStats } from './missions';

interface UserProfile {
  username: string;
  bio: string;
  profileImage: string | null;
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
    bio: '',
    profileImage: null,
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

  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editProfileImage, setEditProfileImage] = useState<string | null>(null);

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
      const bio = await AsyncStorage.getItem('user_bio') || '';
      const profileImage = await AsyncStorage.getItem('user_profile_image') || null;

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
        bio,
        profileImage,
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

      setEditUsername(username);
      setEditBio(bio);
      setEditProfileImage(profileImage);
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  };

  const handleProfileImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setEditProfileImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const saveProfile = async () => {
    try {
      await AsyncStorage.setItem('user_username', editUsername);
      await AsyncStorage.setItem('user_bio', editBio);
      if (editProfileImage) {
        await AsyncStorage.setItem('user_profile_image', editProfileImage);
      }

      setProfile(prev => ({
        ...prev,
        username: editUsername,
        bio: editBio,
        profileImage: editProfileImage,
      }));

      setIsEditing(false);
      SoundManager.play('complete');
    } catch (error) {
      console.error('Failed to save profile:', error);
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
        <TouchableOpacity onPress={() => {
          if (isEditing) {
            saveProfile();
          } else {
            setIsEditing(true);
          }
        }}>
          <Text style={[{ color: colors.primary, fontSize: 14, fontWeight: '700' }]}>
            {isEditing ? (locale === 'ja' ? '保存' : 'Save') : (locale === 'ja' ? '編集' : 'Edit')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* プロフィール画像 */}
        <View style={[{ alignItems: 'center', marginBottom: 24, marginTop: 16 }]}>
          {isEditing ? (
            <TouchableOpacity
              style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}
              onPress={() => document.getElementById('profile-image-input')?.click()}
            >
              {editProfileImage ? (
                <img src={editProfileImage} style={{ width: 120, height: 120, borderRadius: 60, objectFit: 'cover' }} alt="" />
              ) : (
                <Text style={[{ fontSize: 40 }]}>📸</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              {profile.profileImage ? (
                <img src={profile.profileImage} style={{ width: 120, height: 120, borderRadius: 60, objectFit: 'cover' }} alt="" />
              ) : (
                <Text style={[{ fontSize: 40 }]}>👤</Text>
              )}
            </View>
          )}
          {isEditing && (
            <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>
              {locale === 'ja' ? 'タップして画像を変更' : 'Tap to change image'}
            </Text>
          )}
        </View>

        {/* ユーザー名 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[{ fontSize: 12, color: colors.textSecondary, marginBottom: 6 }]}>
            {locale === 'ja' ? 'ユーザー名' : 'Username'}
          </Text>
          {isEditing ? (
            <TextInput
              style={[{ borderBottomWidth: 1, borderBottomColor: colors.border, padding: 8, color: colors.text, fontSize: 16 }]}
              value={editUsername}
              onChangeText={setEditUsername}
              placeholder={locale === 'ja' ? 'ユーザー名' : 'Username'}
              placeholderTextColor={colors.textSecondary}
            />
          ) : (
            <Text style={[{ fontSize: 18, fontWeight: '700', color: colors.text }]}>{profile.username}</Text>
          )}
        </View>

        {/* 自己紹介 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[{ fontSize: 12, color: colors.textSecondary, marginBottom: 6 }]}>
            {locale === 'ja' ? '自己紹介' : 'Bio'}
          </Text>
          {isEditing ? (
            <TextInput
              style={[{ borderBottomWidth: 1, borderBottomColor: colors.border, padding: 8, color: colors.text, fontSize: 14, minHeight: 60 }]}
              value={editBio}
              onChangeText={setEditBio}
              placeholder={locale === 'ja' ? '自己紹介を入力' : 'Enter bio'}
              placeholderTextColor={colors.textSecondary}
              multiline
            />
          ) : (
            <Text style={[{ fontSize: 14, color: colors.text, lineHeight: 20 }]}>
              {profile.bio || (locale === 'ja' ? '未設定' : 'Not set')}
            </Text>
          )}
        </View>

        {/* レベル */}
        <View style={[styles.card, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={[{ fontSize: 24, fontWeight: '700', color: colors.primary }]}>Lv. {profile.level}</Text>
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
            <Text style={[{ fontSize: 28, fontWeight: '700', color: colors.primary, marginTop: 4 }]}>{profile.totalCoins}</Text>
          </View>
          <View style={[styles.card, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>⚡ XP</Text>
            <Text style={[{ fontSize: 28, fontWeight: '700', color: colors.success || '#4CAF50', marginTop: 4 }]}>{profile.currentXP}</Text>
          </View>
        </View>

        {/* 統計 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 12 }]}>
            📊 {locale === 'ja' ? '統計' : 'Stats'}
          </Text>
          <View style={styles.statRow}><Text style={[{ color: colors.text }]}>{locale === 'ja' ? '作成した問題' : 'Problems Created'}</Text><Text style={[{ color: colors.primary, fontWeight: '700' }]}>{profile.totalQuestionsCreated}</Text></View>
          <View style={styles.statRow}><Text style={[{ color: colors.text }]}>{locale === 'ja' ? 'クイズ実施' : 'Quizzes Played'}</Text><Text style={[{ color: colors.primary, fontWeight: '700' }]}>{profile.totalQuizzesPlayed}</Text></View>
          <View style={styles.statRow}><Text style={[{ color: colors.text }]}>{locale === 'ja' ? '正答率' : 'Correct Rate'}</Text><Text style={[{ color: colors.success || '#4CAF50', fontWeight: '700' }]}>{profile.correctRate}%</Text></View>
          <View style={styles.statRow}><Text style={[{ color: colors.text }]}>{locale === 'ja' ? 'ストリーク' : 'Streak'}</Text><Text style={[{ color: colors.primary, fontWeight: '700' }]}>🔥 {profile.streakDays}</Text></View>
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

        <View style={{ height: 20 }} />
      </ScrollView>

      <input id="profile-image-input" type="file" accept="image/*" onChange={handleProfileImageSelect} style={{ display: 'none' }} />
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
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  button: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  buttonText: { fontWeight: '700', fontSize: 16 },
});