import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, Platform, Image } from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db } from '../src/config/firebase';
import { useTheme } from './theme';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { SoundManager } from './sound';
import { loadStats } from './missions';
import { useAuth } from './auth/AuthContext';
import ImageCropper from '../src/components/ImageCropper';
import { normalizeUserProfileDocument } from '../src/utils/userProgress';

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
  totalQuestionsAnswered: number;
  correctRate: number;
  streakDays: number;
  joinDate: number;
  lastLoginDate: number;
  achievements: string[];
}

export default function ProfileScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary, isCyberpunk } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const { user, logout } = useAuth();

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
    totalQuestionsAnswered: 0,
    correctRate: 0,
    streakDays: 0,
    joinDate: Date.now(),
    lastLoginDate: Date.now(),
    achievements: [],
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editProfileImage, setEditProfileImage] = useState<string | null>(null);

  // --- 🎥 トリミングモーダル用State群 ---
  const [showCropModal, setShowCropModal] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    try {
      const storedUsername = await AsyncStorage.getItem('user_username') || 'An-Q Learner';
      const storedBio = await AsyncStorage.getItem('user_bio') || '';
      const storedProfileImage = await AsyncStorage.getItem('user_profile_image') || null;
      const storedLevel = parseInt(await AsyncStorage.getItem('user_level') || '1', 10);
      const storedXP = parseInt(await AsyncStorage.getItem('user_xp') || '0', 10);
      const storedCoins = parseInt(await AsyncStorage.getItem('user_coins') || '0', 10);
      const storedStreak = parseInt(await AsyncStorage.getItem('streakCount') || '1', 10);
      const storedJoinDate = parseInt(await AsyncStorage.getItem('join_date') || Date.now().toString(), 10);
      const storedLastLoginDate = parseInt(await AsyncStorage.getItem('lastLoginDate') || Date.now().toString(), 10);

      let profileImage = storedProfileImage;
      let username = storedUsername;
      let bio = storedBio;
      let level = storedLevel;
      let xp = storedXP;
      let coins = storedCoins;
      let streakCount = storedStreak;
      let joinDate = storedJoinDate;
      let lastLoginDate = storedLastLoginDate;
      let totalQuestionsCreated = 0;
      let totalQuizzesPlayed = 0;
      let totalCorrectAnswers = 0;
      let totalQuestionsAnswered = 0;
      let correctRate = 0;

      const questionsRaw = await AsyncStorage.getItem('quiz_questions') || '[]';
      const questions = JSON.parse(questionsRaw);
      const stats = await loadStats();
      const resultsRaw = await AsyncStorage.getItem('quizResults') || '[]';
      let results = [];
      try { results = JSON.parse(resultsRaw); } catch(e) {}
      const resultsArr = Array.isArray(results) ? results : results.results || [];
      const localCorrectCount = resultsArr.filter((r: any) => r.isCorrect).length;
      const localAnsweredCount = resultsArr.length;
      totalCorrectAnswers = localCorrectCount;
      totalQuestionsAnswered = localAnsweredCount;
      correctRate = localAnsweredCount > 0 ? Math.round((localCorrectCount / localAnsweredCount) * 100) : 0;
      totalQuestionsCreated = questions.length;
      totalQuizzesPlayed = stats?.quizPlayed || 0;

      // ★ Firestoreからクラウド上の最新プロファイルを最優先で同期
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const mergedProfile = normalizeUserProfileDocument({
            username: data.username || username,
            bio: data.bio || bio,
            profileImage: data.profileImage ?? profileImage,
            level: Math.max(data.level ?? 0, level),
            currentXP: Math.max(data.currentXP ?? 0, xp),
            nextLevelXP: Math.max(data.nextLevelXP ?? 0, level * 100),
            totalCoins: Math.max(data.totalCoins ?? 0, coins),
            totalQuestionsCreated: Math.max(data.totalQuestionsCreated ?? 0, totalQuestionsCreated),
            totalQuizzesPlayed: Math.max(data.totalQuizzesPlayed ?? 0, totalQuizzesPlayed),
            totalCorrectAnswers: Math.max(data.totalCorrectAnswers ?? 0, totalCorrectAnswers),
            totalQuestionsAnswered: Math.max(data.totalQuestionsAnswered ?? 0, totalQuestionsAnswered),
            correctRate: 0,
            streakDays: Math.max(data.streakDays ?? 0, streakCount),
            joinDate: Math.min(data.joinDate ?? joinDate, joinDate),
            lastLoginDate: Math.max(data.lastLoginDate ?? 0, lastLoginDate),
            achievements: data.achievements ?? [],
          });

          mergedProfile.correctRate = mergedProfile.totalQuestionsAnswered > 0
            ? Math.round((mergedProfile.totalCorrectAnswers / mergedProfile.totalQuestionsAnswered) * 100)
            : correctRate;

          username = mergedProfile.username;
          bio = mergedProfile.bio;
          profileImage = mergedProfile.profileImage;
          level = mergedProfile.level;
          xp = mergedProfile.currentXP;
          coins = mergedProfile.totalCoins;
          streakCount = mergedProfile.streakDays;
          joinDate = mergedProfile.joinDate;
          lastLoginDate = mergedProfile.lastLoginDate;
          totalQuestionsCreated = mergedProfile.totalQuestionsCreated;
          totalQuizzesPlayed = mergedProfile.totalQuizzesPlayed;
          totalCorrectAnswers = mergedProfile.totalCorrectAnswers;
          totalQuestionsAnswered = mergedProfile.totalQuestionsAnswered;
          correctRate = mergedProfile.correctRate;

          // キャッシュ更新
          await AsyncStorage.setItem('user_username', username);
          await AsyncStorage.setItem('user_profile_image', profileImage || '');
          await AsyncStorage.setItem('user_bio', bio);
          await AsyncStorage.setItem('user_level', level.toString());
          await AsyncStorage.setItem('user_xp', xp.toString());
          await AsyncStorage.setItem('user_coins', coins.toString());
          await AsyncStorage.setItem('streakCount', streakCount.toString());
          await AsyncStorage.setItem('join_date', joinDate.toString());
          await AsyncStorage.setItem('lastLoginDate', lastLoginDate.toString());
        }
      }

      setProfile({
        username,
        bio,
        profileImage,
        level,
        currentXP: xp,
        nextLevelXP: level * 100,
        totalCoins: coins,
        totalQuestionsCreated,
        totalQuizzesPlayed,
        totalCorrectAnswers,
        totalQuestionsAnswered,
        correctRate,
        streakDays: streakCount,
        joinDate,
        lastLoginDate,
        achievements: JSON.parse(await AsyncStorage.getItem('achievements') || '[]'),
      });

      setEditUsername(username);
      setEditBio(bio);
      setEditProfileImage(profileImage);
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  };

  // 画像ファイル選択時：トリミング用モーダルを起動
  const handleProfileImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setRawImageSrc(e.target?.result as string);
        setZoom(1.0);
        setDragPos({ x: 0, y: 0 });
        setShowCropModal(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const saveProfile = async () => {
    try {
      // 1. ローカルストレージに保存
      await AsyncStorage.setItem('user_username', editUsername);
      await AsyncStorage.setItem('user_bio', editBio);
      if (editProfileImage) {
        await AsyncStorage.setItem('user_profile_image', editProfileImage);
      }

      // 2. ★ Firestoreに保存（容量制限を受けないため確実に同期します）
      if (user) {
        await setDoc(doc(db, 'users', user.uid), {
          username: editUsername,
          bio: editBio,
          profileImage: editProfileImage,
        }, { merge: true });
        await updateProfile(user, { displayName: editUsername });
      }

      setProfile(prev => ({
        ...prev,
        username: editUsername,
        bio: editBio,
        profileImage: editProfileImage,
      }));

      setIsEditing(false);
      SoundManager.play('complete');
      Alert.alert('成功', 'プロフィールをクラウドに保存しました！');
    } catch (error) {
      console.error('Failed to save profile:', error);
      Alert.alert('エラー', '保存に失敗しました。');
    }
  };

  const xpProgress = Math.min((profile.currentXP / profile.nextLevelXP) * 100, 100);

  const handleLogout = async () => {
    SoundManager.play('decide');
    try {
      // 1. Firebaseの認証から完全にログアウトする（最重要！）
      await logout();

      // 2. アプリ内のローカルデータを削除する
      await AsyncStorage.multiRemove([
        'user_stats',
        'quiz_history',
        'daily_streak',
        'last_played_date'
      ]);

      // ※上の「await logout()」によりログイン状態が消えるため、
      // 自動的に監視機能（useEffect）が働いてログイン画面に切り替わります！
      
    } catch (error) {
      console.error('Error during logout:', error);
      Alert.alert(
        locale === 'ja' ? 'エラー' : 'Error',
        locale === 'ja' ? 'ログアウトに失敗しました' : 'Failed to log out'
      );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <Text style={[styles.title, { color: colors.text }]}>👤 {t.profile || 'Profile'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => {
            if (isEditing) { saveProfile(); } else { setIsEditing(true); }
          }}>
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>
              {isEditing ? (locale === 'ja' ? '保存' : 'Save') : (locale === 'ja' ? '編集' : 'Edit')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.primary, borderRadius: isCyberpunk ? 0 : 10 }}
            onPress={() => { SoundManager.play('decide'); navigate('/'); }}
          >
            <Text style={{ color: onPrimary, fontWeight: '700', fontSize: 14 }}>
              {locale === 'ja' ? '戻る' : 'Back'}
            </Text>
          </TouchableOpacity>
          {user && (
            <TouchableOpacity
              style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.error || '#DC2626', borderRadius: isCyberpunk ? 0 : 10 }}
              onPress={() => {
                SoundManager.play('decide');

                if (Platform.OS === 'web') {
                  // 🌐 Web環境（Vercel）ではブラウザ標準の確実なダイアログを使用
                  const confirmed = window.confirm(
                    locale === 'ja' ? '本当にログアウトしますか？' : 'Are you sure you want to log out?'
                  );
                  if (confirmed) {
                    handleLogout(); // OKが押されたら確実にログアウト関数を実行！
                  }
                } else {
                  // 📱 スマホ環境（iOS/Android）では既存のAlertを使用
                  Alert.alert(
                    locale === 'ja' ? 'ログアウト' : 'Log Out',
                    locale === 'ja' ? '本当にログアウトしますか？' : 'Are you sure you want to log out?',
                    [
                      { text: locale === 'ja' ? 'キャンセル' : 'Cancel', style: 'cancel' },
                      { text: locale === 'ja' ? 'ログアウト' : 'Log Out', onPress: handleLogout }
                    ]
                  );
                }
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                {locale === 'ja' ? 'ログアウト' : 'Logout'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.content} scrollEnabled={!showCropModal}>
        {/* プロフィール画像表示 */}
        <View style={{ alignItems: 'center', marginBottom: 24, marginTop: 16 }}>
          {isEditing ? (
            <TouchableOpacity
              style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
              onPress={() => document.getElementById('profile-image-input')?.click()}
            >
              {editProfileImage ? (
                <Image source={{ uri: editProfileImage }} style={{ width: 120, height: 120, borderRadius: 60 }} alt="" />
              ) : (
                <Text style={{ fontSize: 40 }}>📸</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {profile.profileImage ? (
                <Image source={{ uri: profile.profileImage }} style={{ width: 120, height: 120, borderRadius: 60 }} alt="" />
              ) : (
                <View style={{ width: 120, height: 120, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#ffffff', fontSize: 44 }}>👤</Text>
                </View>
              )}
            </View>
          )}
          {isEditing && (
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 6 }}>
              {locale === 'ja' ? 'タップして画像を変更' : 'Tap to change image'}
            </Text>
          )}
        </View>

        {/* ユーザー名 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}>
            {locale === 'ja' ? 'ユーザー名' : 'Username'}
          </Text>
          {isEditing ? (
            <TextInput
              style={{ borderBottomWidth: 1, borderBottomColor: colors.border, padding: 8, color: colors.text, fontSize: 16 }}
              value={editUsername}
              onChangeText={setEditUsername}
            />
          ) : (
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{profile.username}</Text>
          )}
        </View>

        {/* 自己紹介 */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}>
            {locale === 'ja' ? '自己紹介' : 'Bio'}
          </Text>
          {isEditing ? (
            <TextInput
              style={{ borderBottomWidth: 1, borderBottomColor: colors.border, padding: 8, color: colors.text, fontSize: 14, minHeight: 60 }}
              value={editBio}
              onChangeText={setEditBio}
              multiline
            />
          ) : (
            <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20 }}>
              {profile.bio || (locale === 'ja' ? '未設定' : 'Not set')}
            </Text>
          )}
        </View>

        {/* レベル・統計・その他UI */}
        <View style={[styles.card, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: colors.primary }}>Lv. {profile.level}</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>{profile.currentXP} / {profile.nextLevelXP} XP</Text>
          </View>
          <View style={{ backgroundColor: colors.primary + '40', borderRadius: 8, height: 12, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${xpProgress}%`, backgroundColor: colors.primary, borderRadius: 8 }} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <View style={[styles.card, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>✨ Qコイン</Text>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.primary, marginTop: 4 }}>{profile.totalCoins}</Text>
          </View>
          <View style={[styles.card, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>⚡ XP</Text>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.success || '#4CAF50', marginTop: 4 }}>{profile.currentXP}</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 12 }}>📊 {locale === 'ja' ? '統計' : 'Stats'}</Text>
          <View style={styles.statRow}><Text style={{ color: colors.text }}>{locale === 'ja' ? '作成した問題' : 'Problems Created'}</Text><Text style={{ color: colors.primary, fontWeight: '700' }}>{profile.totalQuestionsCreated}</Text></View>
          <View style={styles.statRow}><Text style={{ color: colors.text }}>{locale === 'ja' ? 'クイズ実施' : 'Quizzes Played'}</Text><Text style={{ color: colors.primary, fontWeight: '700' }}>{profile.totalQuizzesPlayed}</Text></View>
          <View style={styles.statRow}><Text style={{ color: colors.text }}>{locale === 'ja' ? '正答率' : 'Correct Rate'}</Text><Text style={{ color: colors.success || '#4CAF50', fontWeight: '700' }}>{profile.correctRate}%</Text></View>
          <View style={styles.statRow}><Text style={{ color: colors.text }}>{locale === 'ja' ? 'ストリーク' : 'Streak'}</Text><Text style={{ color: colors.primary, fontWeight: '700' }}>🔥 {profile.streakDays}</Text></View>
        </View>

        {profile.achievements.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 12 }}>🏆 {locale === 'ja' ? '称号' : 'Achievements'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {profile.achievements.map((achievement, i) => (
                <View key={i} style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>{achievement}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      <input id="profile-image-input" type="file" accept="image/*" onChange={handleProfileImageSelect} className="hidden-file-input" aria-label="アップロード" />

      <ImageCropper
        visible={showCropModal && !!rawImageSrc && Platform.OS === 'web'}
        imageUri={rawImageSrc}
        title="画像をトリミング"
        confirmLabel="切り抜き"
        cancelLabel="キャンセル"
        confirmButtonColor={colors.primary}
        confirmTextColor={onPrimary}
        cancelButtonColor="#e0e0e0"
        cancelTextColor="#333333"
        onCancel={() => setShowCropModal(false)}
        onConfirm={(croppedImage) => {
          setEditProfileImage(croppedImage);
          setShowCropModal(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700', flex: 1 },
  content: { padding: 16, flex: 1 },
  card: { borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }
});