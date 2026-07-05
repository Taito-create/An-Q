import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
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
    correctRate: 0,
    streakDays: 0,
    joinDate: Date.now(),
    achievements: [],
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editProfileImage, setEditProfileImage] = useState<string | null>(null);

  // --- 🎥 トリミングモーダル用State群 ---
  const [showCropModal, setShowCropModal] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    try {
      let username = await AsyncStorage.getItem('user_username') || 'An-Q Learner';
      let bio = await AsyncStorage.getItem('user_bio') || '';
      let profileImage = await AsyncStorage.getItem('user_profile_image') || null;

      // ★ Firestoreからクラウド上の最新プロファイルを最優先で同期
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          username = data.username || username;
          profileImage = data.profileImage || profileImage;
          bio = data.bio || bio;
          
          // キャッシュ更新
          await AsyncStorage.setItem('user_username', username);
          await AsyncStorage.setItem('user_profile_image', profileImage || '');
          await AsyncStorage.setItem('user_bio', bio);
        }
      }

      const level = parseInt(await AsyncStorage.getItem('user_level') || '1', 10);
      const xp = parseInt(await AsyncStorage.getItem('user_xp') || '0', 10);
      const coins = parseInt(await AsyncStorage.getItem('user_coins') || '0', 10);
      const questionsRaw = await AsyncStorage.getItem('quiz_questions') || '[]';
      const questions = JSON.parse(questionsRaw);

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

  // --- 🐁 マウス/タッチドラッグ処理群 ---
  const handleStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    setDragStart({ x: clientX - dragPos.x, y: clientY - dragPos.y });
  };
  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    setDragPos({ x: clientX - dragStart.x, y: clientY - dragStart.y });
  };
  const handleEnd = () => setIsDragging(false);

  // --- 📐 Canvasを使用した高画質320pxトリミングロジック ---
  const executeCrop = () => {
    if (!rawImageSrc) return;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      const img = new Image();
      img.src = rawImageSrc;
      img.onload = () => {
        ctx.clearRect(0, 0, 320, 320);
        const baseWidth = 200; // UI上のプレビュー幅基準値
        const finalScale = 320 / baseWidth; // 最終サイズ(320px)へのスケール比

        ctx.save();
        ctx.translate(160, 160); // 中心点をキャンバス中央へ
        ctx.translate(dragPos.x * finalScale, dragPos.y * finalScale);
        ctx.scale(zoom * finalScale, zoom * finalScale);

        const displayWidth = baseWidth;
        const displayHeight = (img.height / img.width) * displayWidth;

        ctx.drawImage(img, -displayWidth / 2, -displayHeight / 2, displayWidth, displayHeight);
        ctx.restore();

        // JPEGかつ画質0.85で高画質を維持
        const base64Result = canvas.toDataURL('image/jpeg', 0.85);
        setEditProfileImage(base64Result);
        setShowCropModal(false);
      };
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
      // 1. Firebaseの認証から完全にログアウトする
      await logout();

      // 2. ローカルストレージのデータを削除する（既存の処理）
      await AsyncStorage.multiRemove([
        'user_stats',
        'quiz_history',
        'daily_streak',
        'last_played_date'
      ]);

      // 3. ログアウト完了後、強制的にログイン画面（/login）へ切り替える！
      navigate('/login');

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
                Alert.alert(
                  locale === 'ja' ? 'ログアウト' : 'Logout',
                  locale === 'ja' ? 'ログアウトしますか？' : 'Are you sure you want to logout?',
                  [
                    { text: locale === 'ja' ? 'キャンセル' : 'Cancel', style: 'cancel' },
                    {
                      text: locale === 'ja' ? 'ログアウト' : 'Logout',
                      style: 'destructive',
                      onPress: handleLogout
                    }
                  ]
                );
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                {locale === 'ja' ? 'ログアウト' : 'Logout'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* プロフィール画像表示 */}
        <View style={{ alignItems: 'center', marginBottom: 24, marginTop: 16 }}>
          {isEditing ? (
            <TouchableOpacity
              style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
              onPress={() => document.getElementById('profile-image-input')?.click()}
            >
              {editProfileImage ? (
                <img src={editProfileImage} style={{ width: 120, height: 120, borderRadius: 60, objectFit: 'cover' }} alt="" />
              ) : (
                <Text style={{ fontSize: 40 }}>📸</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {profile.profileImage ? (
                <img src={profile.profileImage} style={{ width: 120, height: 120, borderRadius: 60, objectFit: 'cover' }} alt="" />
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

      <input id="profile-image-input" type="file" accept="image/*" onChange={handleProfileImageSelect} style={{ display: 'none' }} aria-label="アップロード" />

      {/* 🎬 ==================== YouTube風トリミングモーダル UI ==================== */}
      {showCropModal && rawImageSrc && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>画像をトリミング</Text>
            
            {/* ドラッグ操作可能な円形プレビュー枠 */}
            <div 
              style={{ width: 200, height: 200, borderRadius: 100, overflow: 'hidden', backgroundColor: '#000', position: 'relative', cursor: 'move', margin: '20px auto', boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }}
              onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
              onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
              onMouseUp={handleEnd}
              onMouseLeave={handleEnd}
              onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
              onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
              onTouchEnd={handleEnd}
            >
              <img 
                src={rawImageSrc} 
                style={{
                  position: 'absolute', left: '50%', top: '50%', width: 200, height: 'auto',
                  transform: `translate(-50%, -50%) translate(${dragPos.x}px, ${dragPos.y}px) scale(${zoom})`,
                  userSelect: 'none', pointerEvents: 'none'
                }} 
                alt="" 
              />
            </div>

            {/* ズームスライダー */}
            <View style={{ width: '100%', paddingHorizontal: 20, marginBottom: 20 }}>
              <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>ズーム: {zoom.toFixed(1)}x</Text>
              <input 
                type="range" min="1.0" max="3.0" step="0.1" value={zoom} 
                onChange={(e) => setZoom(parseFloat(e.target.value))} 
                style={{ width: '100%', cursor: 'pointer' }}
                aria-label={locale === 'ja' ? 'ズームレベル' : 'Zoom level'}
                title={locale === 'ja' ? 'ズーム' : 'Zoom'}
              />
            </View>

            {/* ボタンコンテナ */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', gap: 12 }}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#e0e0e0' }]} onPress={() => setShowCropModal(false)}>
                <Text style={{ color: '#333', fontWeight: '700' }}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.primary }]} onPress={executeCrop}>
                <Text style={{ color: onPrimary, fontWeight: '700' }}>切り抜き</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
  // モーダル用スタイル
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 9999 },
  modalContent: { backgroundColor: '#ffffff', borderRadius: 20, padding: 24, width: '90%', maxWidth: 320, alignItems: 'center', overflow: 'hidden' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }
});