import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../../src/config/firebase';
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
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);

  // 既にログイン済みの場合はホームへリダイレクト
  React.useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const isRegisterMode = mode === 'register';
  const title = isRegisterMode ? '新規登録' : 'ログイン';

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.trim().length > 0;
  }, [email, password]);

  const getAuthErrorMessage = (error: any) => {
    const code = error?.code as string | undefined;

    switch (code) {
      case 'auth/invalid-email':
        return 'メールアドレスの形式が正しくありません。';
      case 'auth/user-not-found':
        return 'このメールアドレスのアカウントは見つかりません。';
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'メールアドレスまたはパスワードが正しくありません。';
      case 'auth/email-already-in-use':
        return 'このメールアドレスは既に登録されています。';
      case 'auth/weak-password':
        return 'パスワードは6文字以上で入力してください。';
      case 'auth/missing-password':
        return 'パスワードを入力してください。';
      case 'auth/too-many-requests':
        return '試行回数が多すぎます。少し時間をおいて再試行してください。';
      default:
        return '認証に失敗しました。入力内容を確認してもう一度お試しください。';
    }
  };

  const handleSubmit = async () => {
    // 入力値の簡易チェック
    if (!email.trim() || !password.trim()) {
      Alert.alert('入力エラー', 'メールアドレスとパスワードを入力してください。');
      return;
    }

    // 新規登録モードの場合はユーザー名もチェック
    if (isRegisterMode && !username.trim()) {
      Alert.alert('入力エラー', 'ユーザー名を入力してください。');
      return;
    }

    if (loading) return;

    try {
      setLoading(true);
      SoundManager.play('decide');

      let userCredential;
      if (isRegisterMode) {
        // 新規登録
        userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        console.log('Registration successful:', userCredential.user.uid);

        // Firebase AuthにdisplayNameを保存
        await updateProfile(userCredential.user, { displayName: username.trim() });
        console.log('Firebase displayName updated:', username.trim());

        // ローカルストレージにもユーザー名を保存
        await AsyncStorage.setItem('user_username', username.trim());
        console.log('Username cached locally');

        Alert.alert('登録完了', 'アカウントを作成しました。ホームへ移動します。');
      } else {
        // ログイン
        userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
        console.log('Login successful:', userCredential.user.uid);
        Alert.alert('ログイン成功', 'ようこそ。学習を始めましょう。');
      }

      // 認証成功後、ホーム画面へ遷移
      navigate('/');
    } catch (e: any) {
      console.error('Auth error:', e);
      const errorMessage = getAuthErrorMessage(e);
      Alert.alert('認証エラー', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>学習データを安全に保存して、どこでも続きから学べます。</Text>

        {/* 新規登録モード時のみユーザー名入力欄を表示 */}
        {isRegisterMode && (
          <>
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
          style={[
            styles.primaryButton,
            { backgroundColor: loading ? colors.border : colors.primary }
          ]}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={[styles.primaryButtonText, { color: colors.textSecondary, marginLeft: 8 }]}>
                通信中...
              </Text>
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
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    fontSize: 15,
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  toggleButton: {
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 2,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

