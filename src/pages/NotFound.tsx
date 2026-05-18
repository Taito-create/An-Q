import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../app/theme';
import { translations } from '../../app/translations';
import { useLocale } from '../../app/hooks/useLocale';

export default function NotFound() {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const locale = useLocale();
  const t = translations[locale];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.code, { color: colors.primary }]}>404</Text>
      <Text style={[styles.title, { color: colors.text }]}>
        {locale === 'ja' ? 'ページが見つかりません' : 'Page Not Found'}
      </Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>
        {locale === 'ja'
          ? 'お探しのページは存在しないか、移動された可能性があります。'
          : 'The page you are looking for does not exist or may have been moved.'}
      </Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }]}
        onPress={() => navigate('/')}
      >
        <Text style={[styles.buttonText, { color: '#FFF' }]}>
          {locale === 'ja' ? 'ホームに戻る' : 'Back to Home'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  code: {
    fontSize: 72,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  button: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});