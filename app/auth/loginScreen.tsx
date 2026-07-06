import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ActivityIndicator, Image, Platform } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../src/config/firebase';
import { SoundManager } from '../sound';
import { useTheme } from '../theme';
import { useAuth } from './AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ImageCropper from '../../src/components/ImageCropper';
import { buildInitialUserProfile, syncLoginStreak } from '../../src/utils/userProgress';

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
  const [errorMessage, setErrorMessage] = useState(''); // 🌐 画面表示用エラー
  const [selectedImage, setSelectedImage] = useState<string | null>(null); // ✂️ 切り抜き前の画像
  const [showCropModal, setShowCropModal] = useState(false); // 📦 クロップモーダルの表示フラグ

  // 既にログイン済みの場合はホームへリダイレクト
  React.useEffect(() => {
    if (user && mode === 'login') {
      navigate('/');
    }
  }, [user, navigate, mode]);

  const isRegisterMode = mode === 'register';
  const title = isRegisterMode ? '新規登録' : 'ログイン';

  // 📸 画像ファイルが選択された時の処理 (Web用)
  const handleProfileImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result as string);
        setShowCropModal(true); // トリミングモーダルを開く
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
      setErrorMessage(''); // 🌟 新しい試みの前に古いエラーを消す

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
          ...buildInitialUserProfile(username.trim(), profileImage),
        });

        // 4. ローカルストレージにもキャッシュ
        await AsyncStorage.setItem('user_username', username.trim());
        await AsyncStorage.setItem('user_profile_image', profileImage || '');
        await AsyncStorage.setItem('user_bio', '');
        await AsyncStorage.setItem('join_date', Date.now().toString());
        await AsyncStorage.setItem('lastLoginDate', Date.now().toString());

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

        await syncLoginStreak(uid);

        Alert.alert('ログイン成功', 'ようこそ。学習を始めましょう。');
        navigate('/');
      }
    } catch (error: any) {
      console.error('Auth error:', error);

      // 🔍 Firebaseのエラーコードに応じて親切な日本語に変換
      if (error.code === 'auth/email-already-in-use') {
        setErrorMessage('そのメールアドレスはすでに使用されています。');
      } else if (error.code === 'auth/weak-password') {
        setErrorMessage('パスワードは6文字以上で入力してください。');
      } else if (error.code === 'auth/invalid-email') {
        setErrorMessage('正しいメールアドレスの形式で入力してください。');
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setErrorMessage('メールアドレスまたはパスワードが間違っています。');
      } else {
        setErrorMessage('認証エラーが発生しました。もう一度お試しください。');
      }
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
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <TouchableOpacity 
                onPress={() => {
                  if (Platform.OS === 'web') {
                    window.document.getElementById('register-image-input')?.click();
                  }
                }}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: '#f0f0f0',
                  justifyContent: 'center',
                  alignItems: 'center',
                  overflow: 'hidden',
                  borderWidth: 2,
                  borderColor: colors.primary,
                }}
              >
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Text style={{ fontSize: 11, color: '#666', textAlign: 'center', padding: 4 }}>
                    画像を追加
                  </Text>
                )}
              </TouchableOpacity>

              <input
                id="register-image-input"
                type="file"
                accept="image/*"
                onChange={handleProfileImageSelect}
                className="hidden-file-input"
                aria-label="プロフィール画像をアップロード"
                title="プロフィール画像"
              />
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

        {errorMessage ? (
          <Text style={{ color: '#ff4d4f', fontSize: 13, fontWeight: '600', marginBottom: 12, textAlign: 'center' }}>
            ⚠️ {errorMessage}
          </Text>
        ) : null}

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
          onPress={() => {
            setMode((m) => (m === 'login' ? 'register' : 'login'));
            setErrorMessage(''); // モードを切り替えたらエラーを綺麗に消す
          }}
          style={styles.toggleButton}
        >
          <Text style={[styles.toggleText, { color: colors.primary }]}>
            {isRegisterMode ? 'すでにアカウントをお持ちの方はこちら' : 'アカウントを作成する'}
          </Text>
        </TouchableOpacity>
      </View>

      <ImageCropper
        visible={showCropModal && !!selectedImage && Platform.OS === 'web'}
        imageUri={selectedImage}
        title="画像をトリミング"
        confirmLabel="切り抜き"
        cancelLabel="キャンセル"
        confirmButtonColor={colors.primary}
        confirmTextColor={onPrimary}
        cancelButtonColor="#e0e0e0"
        cancelTextColor="#333333"
        onCancel={() => {
          setShowCropModal(false);
          setSelectedImage(null);
        }}
        onConfirm={(croppedImage) => {
          setProfileImage(croppedImage);
          setShowCropModal(false);
          setSelectedImage(null);
        }}
      />
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
  // モーダル用スタイル
  modalOverlay: { 
    position: 'absolute', 
    top: 0, 
    left: 0, 
    right: 0, 
    bottom: 0, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    zIndex: 9999 
  },
  cropPreview: { width: 200, height: 200, borderRadius: 100, overflow: 'hidden', backgroundColor: '#000', position: 'relative', marginVertical: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 0, elevation: 0 },
  modalContent: { backgroundColor: '#ffffff', borderRadius: 20, padding: 24, width: '90%', maxWidth: 320, alignItems: 'center', overflow: 'hidden' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});