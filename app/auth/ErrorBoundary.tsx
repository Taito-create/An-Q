import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string;
}

/**
 * レンダリング中のエラーを捕捉する ErrorBoundary。
 * - 白画面（何も表示されない）を防ぎ、代わりにエラー内容＋再試行ボタンを表示する。
 * - componentDidCatch で componentStack（実際に描画に失敗したコンポーネント）を console に出力する。
 * これにより「The above error occurred in the <ProtectedRoute> component」と表示されるような、
 * 原因の帰属があいまいなレンダリングエラーの実態を特定できる。
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error.message);
    console.error('[ErrorBoundary] Component stack:\n' + info.componentStack);
    this.setState({ componentStack: info.componentStack || '' });
  }

  handleReset = () => {
    this.setState({ error: null, componentStack: '' });
  };

  render() {
    if (this.state.error) {
      return <Fallback message={this.state.error.message} onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}

function Fallback({ message, onReset }: { message: string; onReset: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>画面の表示中にエラーが発生しました</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]} numberOfLines={6}>
        {message}
      </Text>
      <TouchableOpacity onPress={onReset} style={[styles.button, { backgroundColor: colors.primary }]}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>再試行</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  message: {
    marginTop: 12,
    fontSize: 12,
    textAlign: 'center',
  },
  button: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
});