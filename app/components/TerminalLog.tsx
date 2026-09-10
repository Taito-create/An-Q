import React, {
  forwardRef,
  useRef,
  useState,
  useEffect,
  useImperativeHandle,
} from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

// ─────────────────────────────────────────────
// SYSTEM LOG：タイプライター表示＋動的ログ追加
// - 初回マウント時：400ms 間隔で1行ずつ順次表示
// - addLog：外部からログ追加（[HH:MM:SS] を自動付与）
// - 最大5行：超えた分は古い行から削除
// - 追加した行は10秒後にフェードアウト（先頭から削除）
// ─────────────────────────────────────────────

const MAX_LINES = 5;
const LINE_INTERVAL_MS = 350;
const FADE_OUT_MS = 10000;
const INITIAL_DELAY_MS = 400;

export interface TerminalLogHandle {
  /** タイムスタンプ付きでログを1行追加する */
  addLog: (message: string) => void;
}

export interface TerminalLogProps {
  /** ヘッダー行（先頭に表示される STATUS など） */
  statusLine: string;
  /** 初期表示行（タイプライターで順次表示） */
  initialLines: string[];
}

type LogEntry = { id: number; text: string };

const TerminalLog = forwardRef<TerminalLogHandle, TerminalLogProps>(
  ({ statusLine, initialLines }, ref) => {
    const { colors, br } = useTheme();
    const [visibleCount, setVisibleCount] = useState(0);
    const [dynLines, setDynLines] = useState<LogEntry[]>([]);
    const lineIdRef = useRef(0);

    // 初回マウント時：initialLines をタイプライターで順次表示
    useEffect(() => {
      let mounted = true;
      const timers: ReturnType<typeof setTimeout>[] = [];
      for (let i = 0; i < initialLines.length; i++) {
        timers.push(
          setTimeout(() => {
            if (mounted) setVisibleCount(i + 1);
          }, INITIAL_DELAY_MS + i * LINE_INTERVAL_MS)
        );
      }
      return () => {
        mounted = false;
        timers.forEach((t) => clearTimeout(t));
      };
    }, [initialLines]);

    // 動的ログ公開（最大5行・10秒後に削除）
    useImperativeHandle(ref, () => ({
      addLog: (message: string) => {
        const ts = new Date().toLocaleTimeString('ja-JP', { hour12: false });
        const id = ++lineIdRef.current;
        setDynLines((prev) => [...prev, { id, text: `[${ts}] ${message}` }].slice(-MAX_LINES));
        setTimeout(() => {
          setDynLines((prev) => prev.filter((l) => l.id !== id));
        }, FADE_OUT_MS);
      },
    }), []);

    const shownLines = ([
      `[${new Date().toLocaleTimeString('ja-JP', { hour12: false })}] ${statusLine}`,
      ...initialLines.slice(0, visibleCount),
      ...dynLines.map((l) => l.text),
    ]);

    return (
      <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: br }]}>
        <Text style={[styles.title, { color: colors.primary }]}>
          SYSTEM LOG
        </Text>
        {shownLines.slice(0, MAX_LINES).map((line, idx) => (
          <Text key={idx} style={[styles.line, { color: colors.textSecondary }]} numberOfLines={1}>
            $ {line}
          </Text>
        ))}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    padding: 14,
    borderWidth: 1,
    marginBottom: 16,
    fontFamily: 'monospace',
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 1,
    marginBottom: 8,
  },
  line: {
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
});

export default TerminalLog;