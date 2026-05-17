import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { login, saveAccount } from '../utils/authStorage';
import { SoundManager } from '../sound';

export default function LoginScreen() {
  const router = useNavigate();

  // 最小構成：最初にユーザーを作成するモードも用意
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);

  const title = mode === 'login' ? 'ログイン' : 'アカウント作成';

  const canSubmit = useMemo(() => {
    return username.trim().length > 0 && password.trim().length > 0;
  }, [username, password]);

  const handleSubmit = async () => {
    if (!canSubmit || loading) return;

    try {
      setLoading(true);
      SoundManager.play('decide');

      if (mode === 'register') {
        await saveAccount(username.trim(), password);
        Alert.alert('作成完了', 'ログイン画面に戻ります');
        setMode('login');
        return;
      }

      const ok = await login(username.trim(), password);
      if (!ok) {
        Alert.alert('ログイン失敗', 'ユーザー名またはパスワードが違います');
        return;
      }

      // トップへ
      navigate('/');
    } catch (e: any) {
      console.error('LoginScreen error:', e);
      Alert.alert('エラー', e?.message || 'ログイン処理に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 24 }}>{title}</Text>

      <Text style={{ marginBottom: 6 }}>Username</Text>
      <TextInput
        value={username}
        onChangeText={setUsername}
        placeholder="username"
        autoCapitalize="none"
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 14 }}
      />

      <Text style={{ marginBottom: 6 }}>Password</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="password"
        secureTextEntry
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 18 }}
      />

      <TouchableOpacity
        onPress={handleSubmit}
        disabled={!canSubmit || loading}
        style={{
          backgroundColor: !canSubmit || loading ? '#aaa' : '#007AFF',
          borderRadius: 10,
          paddingVertical: 14,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {loading ? '処理中...' : mode === 'login' ? 'ログイン' : '作成'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}
        style={{ alignItems: 'center', paddingVertical: 6 }}
      >
        <Text style={{ color: '#007AFF', fontWeight: '600' }}>
          {mode === 'login' ? 'アカウント作成はこちら' : 'ログインはこちら'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

