import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { useAuth } from './authProvider';
import { useTheme } from '../theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const { login, register } = useAuth();
  const { colors, onPrimary, fs } = useTheme();

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert('エラー', 'メールアドレスとパスワードを入力してください');
      return;
    }

    if (!email.includes('@ga.ariake-nct.ac.jp')) {
      Alert.alert('エラー', '有明高専のアカウント（@ga.ariake-nct.ac.jp）のみ使用できます');
      return;
    }

    setLoading(true);
    try {
      if (isRegistering) {
        await register(email, password);
        Alert.alert('成功', 'アカウントが作成されました');
      } else {
        await login(email, password);
      }
    } catch (error: any) {
      Alert.alert('エラー', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text, fontSize: fs(28) }]}>
            An-Q
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fs(16) }]}>
            有明高専 専用クイズアプリ
          </Text>

          <View style={[styles.form, { backgroundColor: colors.card }]}>
            <TextInput
              style={[styles.input, { 
                color: colors.text, 
                borderColor: colors.border,
                fontSize: fs(16)
              }]}
              placeholder="メールアドレス (sxxxxx@ga.ariake-nct.ac.jp)"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TextInput
              style={[styles.input, { 
                color: colors.text, 
                borderColor: colors.border,
                fontSize: fs(16)
              }]}
              placeholder="パスワード"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={[styles.buttonText, { color: onPrimary, fontSize: fs(16) }]}>
                {loading ? '処理中...' : (isRegistering ? 'アカウント作成' : 'ログイン')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setIsRegistering(!isRegistering)}
            >
              <Text style={[styles.toggleText, { color: colors.primary, fontSize: fs(14) }]}>
                {isRegistering ? '既存アカウントでログイン' : '新規アカウントを作成'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.info}>
            <Text style={[styles.infoText, { color: colors.textSecondary, fontSize: fs(12) }]}>
              • 登録には有明高専のメールアドレスが必要です
            </Text>
            <Text style={[styles.infoText, { color: colors.textSecondary, fontSize: fs(12) }]}>
              • 形式: sxxxxx@ga.ariake-nct.ac.jp
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 40,
  },
  form: {
    padding: 30,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
  },
  button: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonText: {
    fontWeight: 'bold',
  },
  toggleText: {
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  info: {
    marginTop: 30,
    alignItems: 'center',
  },
  infoText: {
    textAlign: 'center',
    marginBottom: 4,
  },
});
