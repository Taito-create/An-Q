import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../src/config/firebase';
import { SoundManager } from '../sound';
import { useTheme } from '../theme';
import { useAuth } from './AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function LoginScreen() {
  const { colors, onPrimary } = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);

  // 既にログイン済みの場合はホームへリダイレクト
  React.useEffect(() => {
    if (user && mode === 'login') {
      navigate('/');
    }
  }, [user, navigate, mode]);

  const isRegisterMode = mode === 'register';
  const title = isRegisterMode ? '新規登録' : 'ログイン';

  // 簡易画像選択（登録時は高画質320pxに圧縮）
  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 320;
          const ctx = canvas.getContext('2d');
          // 中央部分を正方形に簡易切り抜きして描画
          const size = Math.min(img.width, img.height);
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          ctx?.drawImage(img, sx, sy, size, size, 0, 0, 320, 320);
          setProfileImage(canvas.toDataURL('image/jpeg', 0.85));
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('入力エラー', 'メールアドレスとパスワードを入力してください。');
      return;
    }

    if (isRegisterMode) {
      if (!username.trim()) {
        Alert.alert('入力エラー', 'ユーザー名を設定してください。');
        return;
      }
      if (!profileImage) {
        Alert.alert('入力エラー', 'プロフィール画像（アイコン）を設定してください。');
        return;
      }
    }

    if (loading) return;

    try {
      setLoading(true);
      SoundManager.play('decide');

      if (isRegisterMode) {
        // 1. 新規登録アカウント作成
        const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const uid = userCredential.user.uid;

        // 2. Auth上の名前を更新
        await updateProfile(userCredential.user, { displayName: username.trim() });

        // 3. 無料のFirestoreデータベースにユーザー情報を直接保存（容量制限なし）
        await setDoc(doc(db, 'users', uid), {
          username: username.trim(),
          profileImage: profileImage,
          bio: '',
          joinDate: Date.now()
        });

        // 4. ローカルストレージにもキャッシュ
        await AsyncStorage.setItem('user_username', username.trim());
        await AsyncStorage.setItem('user_profile_image', profileImage || '');
        await AsyncStorage.setItem('user_bio', '');
        await AsyncStorage.setItem('join_date', Date.now().toString());

        // 5. 自動ログインを解除して、ログイン画面へ強制遷移
        await signOut(auth);
        
        Alert.alert('登録完了', 'アカウントを作成しました！ログイン画面からログインしてください。');
        
        // ログイン画面状態にリセット
        setMode('login');
        setUsername('');
        setProfileImage(null);
        setPassword('');
      } else {
        // ログイン処理
        const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
        const uid = userCredential.user.uid;

        // ログイン成功時、Firestoreから最新の名前とアイコンを取得して同期
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.username) await AsyncStorage.setItem('user_username', data.username);
          if (data.profileImage) await AsyncStorage.setItem('user_profile_image', data.profileImage);
          if (data.bio) await AsyncStorage.setItem('user_bio', data.bio);
        }

        Alert.alert('ログイン成功', 'ようこそ。学習を始めましょう。');
        navigate('/');
      }
    } catch (e: any) {
      console.error('Auth error:', e);
      Alert.alert('認証エラー', '入力内容を確認してもう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>学習データを安全に保存して、どこでも続きから学べます。</Text>

        {isRegisterMode && (
          <>
            {/* アイコン選択を新規登録画面に統合 */}
            <Text style={[styles.label, { color: colors.text, marginBottom: 8 }]}>プロフィール画像 (必須)</Text>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <TouchableOpacity
                style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: colors.background, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
                onPress={() => document.getElementById('register-image-input')?.click()}
              >
                {profileImage ? (
                  <img src={profileImage} style={{ width: 90, height: 90, borderRadius: 45, objectFit: 'cover' }} alt="" />
                ) : (
                  <Text style={{ fontSize: 28 }}>📸</Text>
                )}
              </TouchableOpacity>
              <input id="register-image-input" type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} aria-label="画像アップロード" />
            </View>

            <Text style={[styles.label, { color: colors.text }]}>ユーザー名</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="ニックネーム"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
              placeholderTextColor={colors.textSecondary}
            />
          </>
        )}

        <Text style={[styles.label, { color: colors.text }]}>メールアドレス</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="example@mail.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={[styles.label, { color: colors.text }]}>パスワード</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="6文字以上のパスワード"
          secureTextEntry
          style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
          placeholderTextColor={colors.textSecondary}
        />

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading}
          style={[styles.primaryButton, { backgroundColor: loading ? colors.border : colors.primary }]}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={[styles.primaryButtonText, { color: colors.textSecondary, marginLeft: 8 }]}>通信中...</Text>
            </View>
          ) : (
            <Text style={[styles.primaryButtonText, { color: onPrimary }]}>
              {isRegisterMode ? '新規登録する' : 'ログインする'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}
          style={styles.toggleButton}
        >
          <Text style={[styles.toggleText, { color: colors.primary }]}>
            {isRegisterMode ? 'すでにアカウントをお持ちの方はこちら' : 'アカウントを作成する'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  card: { width: '100%', maxWidth: 440, borderWidth: 1, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 22, marginBottom: 18 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, fontSize: 15 },
  primaryButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryButtonText: { fontSize: 16, fontWeight: '700' },
  toggleButton: { alignItems: 'center', paddingTop: 14, paddingBottom: 2 },
  toggleText: { fontSize: 14, fontWeight: '600' },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});