import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, ActivityIndicator, Alert, Modal, StyleSheet,
} from 'react-native';
import { useNavigate, useParams } from 'react-router-dom';
import { useTheme } from './theme';
import { useRoom, useRooms } from './context/RoomsContext';
import { useAuth } from './auth/AuthContext';
import OpponentCard from './components/OpponentCard';
import { awardQuizCompletion, recordBattleResult } from '../src/utils/userProgress';
import PressableButton from './components/PressableButton';
import BackButton from './components/BackButton';
import { SoundManager } from './sound';
import type { BattleRoom } from './types/battle';

// ─────────────────────────────────────────────
// 対戦画面 (Phase 2 UI)
// ルート: /battle/:roomId (ProtectedRoute 配下)
// useRoom(roomId) の room.status でフェーズ分岐する
// ─────────────────────────────────────────────

const CREATING_LIMIT_SEC = 60;
/** 1回の変更でこの文字数以上増えたらペーストとみなす (手入力の閾値) */
const PASTE_JUMP_THRESHOLD = 4;
const CHEAT_WARNING = '不正行為は禁止です: ペーストは使用できません';

/** Web の onPaste を無効化するための props (RNW は DOM に透過する) */
function usePasteBlocker(onBlocked: () => void) {
  return useMemo(
    () => ({
      onPaste: (e: { preventDefault: () => void }) => {
        e?.preventDefault?.();
        onBlocked();
      },
    }),
    [onBlocked],
  );
}

/** 手入力に見えない急増をペーストとみなして警告するガード付き変更ハンドラ */
function guardedChange(prev: string, next: string, onBlocked: () => void): string | null {
  if (next.length - prev.length >= PASTE_JUMP_THRESHOLD) {
    onBlocked();
    return null;
  }
  return next;
}

// ─────────────────────────────────────────────
// 共通ヘルパー: 相手UIDの解決
// 自分がホストならゲストを、自分がゲストならホストを返す。
// 未ログイン・第三者(観戦)は null。guestId 未参加時も null。
// ─────────────────────────────────────────────
export function getOpponentUid(
  room: { hostId: string; guestId: string | null },
  myUid: string | null | undefined,
): string | null {
  if (!myUid) return null;
  if (room.hostId === myUid) return room.guestId;
  if (room.guestId === myUid) return room.hostId;
  return null;
}

function notifyPaste() {
  SoundManager.play('wrong');
  Alert.alert('警告', CHEAT_WARNING);
}

// ── waiting フェーズ ──
function WaitingView({ room }: { room: BattleRoom }) {
  const { colors, onPrimary } = useTheme();
  const { user } = useAuth();
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const copyRoomId = async () => {
    try {
      SoundManager.play('select');
      await navigator.clipboard.writeText(room.id);
      setToast(true);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(false), 2000);
    } catch {
      Alert.alert('コピー失敗', 'ルームIDを手動で共有してください');
    }
  };

  const isHost = room.hostId === user?.uid;
  const opponentUid = getOpponentUid(room, user?.uid);

  return (
    <View style={styles.phaseBox}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>ルームID</Text>
      <Text style={[styles.roomId, { color: colors.primary }]}>{room.id}</Text>
      <PressableButton
        onPress={copyRoomId}
        style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.primaryBtnText, { color: onPrimary }]}>
          {toast ? 'コピーしました' : 'ルームIDをコピー'}
        </Text>
      </PressableButton>
      {toast ? (
        <Text style={[styles.toast, { color: colors.primary }]}>コピーしました</Text>
      ) : null}
      <OpponentCard uid={opponentUid} label={isHost ? 'ゲスト' : 'ホスト'} />
      <View style={styles.waitRow}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          相手の参加を待っています...
        </Text>
      </View>
    </View>
  );
}

// ── creating フェーズ: 60秒カウントダウン + 問題/正解登録 + 自動送信 ──
function CreatingView({ room, roomId }: { room: BattleRoom; roomId: string }) {
  const { colors, onPrimary } = useTheme();
  const { user } = useAuth();
  const { submitQuestion } = useRooms();
  const isHost = room.hostId === user?.uid;
  const opponentUid = getOpponentUid(room, user?.uid);
  const myQuestion = isHost ? room.hostQuestion : room.guestQuestion;
  const peerReady = isHost ? room.guestQuestion !== null : room.hostQuestion !== null;

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(CREATING_LIMIT_SEC);
  const sentRef = useRef(false);
  const pasteBlocker = usePasteBlocker(notifyPaste);

  const ready = question.trim().length > 0 && answer.trim().length > 0;

  const doSubmit = async (q: string, a: string) => {
    if (sentRef.current || sending) return;
    if (!q.trim() || !a.trim()) return;
    sentRef.current = true;
    setSending(true);
    setError(null);
    try {
      SoundManager.play('decide');
      await submitQuestion(roomId, q, a);
    } catch (e: any) {
      sentRef.current = false;
      const msg = e?.message ?? '送信に失敗しました';
      setError(msg);
      Alert.alert('エラー', msg);
    } finally {
      setSending(false);
    }
  };

  // 60秒カウントダウン。0秒で自動送信 (未入力ならエラー表示)
  useEffect(() => {
    if (myQuestion) return;
    const t = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          if (!sentRef.current) {
            if (question.trim() && answer.trim()) {
              void doSubmit(question, answer);
            } else {
              setError('時間切れです。問題文と正解を入力してください');
            }
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myQuestion]);

  if (myQuestion) {
    return (
      <View style={styles.phaseBox}>
        {/* 相手 = 自分がホストならゲスト / 自分がゲストならホスト (自分自身は絶対に渡さない) */}
        <OpponentCard uid={opponentUid} label={isHost ? 'ゲスト' : 'ホスト'} compact />
        <Text style={[styles.message, { color: colors.text }]}>準備完了しました</Text>
        <Text style={[styles.subMessage, { color: colors.textSecondary }]}>
          {peerReady ? '相手の準備も完了しました。まもなく回答フェーズへ進みます'
            : '相手の準備を待っています...'}
        </Text>
        {!peerReady && <ActivityIndicator size="small" color={colors.primary} />}
      </View>
    );
  }

  return (
    <View style={styles.phaseBox}>
      <OpponentCard uid={opponentUid} label={isHost ? 'ゲスト' : 'ホスト'} compact />
      <Text style={[styles.timer, { color: remaining <= 10 ? colors.error : colors.primary }]}>
        残り {remaining} 秒
      </Text>
      <Text style={[styles.label, { color: colors.text }]}>問題文</Text>
      <TextInput
        value={question}
        onChangeText={(next) => {
          const ok = guardedChange(question, next, notifyPaste);
          if (ok !== null) setQuestion(ok);
        }}
        placeholder="相手に出題する問題を入力"
        multiline
        autoCorrect={false}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, styles.multilineInput, {
          borderColor: colors.border, color: colors.text, backgroundColor: colors.card,
        }]}
        {...(pasteBlocker as object)}
      />
      <Text style={[styles.label, { color: colors.text }]}>正解</Text>
      <TextInput
        value={answer}
        onChangeText={(next) => {
          const ok = guardedChange(answer, next, notifyPaste);
          if (ok !== null) setAnswer(ok);
        }}
        placeholder="正解を入力"
        autoCorrect={false}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, {
          borderColor: colors.border, color: colors.text, backgroundColor: colors.card,
        }]}
        {...(pasteBlocker as object)}
      />
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
      <PressableButton
        onPress={() => void doSubmit(question, answer)}
        disabled={!ready || sending}
        style={[styles.primaryBtn, { backgroundColor: ready && !sending ? colors.primary : colors.border }]}
      >
        {sending
          ? <ActivityIndicator size="small" color={colors.textSecondary} />
          : <Text style={[styles.primaryBtnText, { color: onPrimary }]}>準備完了</Text>}
      </PressableButton>
    </View>
  );
}

// ── answering フェーズ: 相手の問題に回答 ──
function AnsweringView({ room, roomId }: { room: BattleRoom; roomId: string }) {
  const { colors, onPrimary } = useTheme();
  const { user } = useAuth();
  const { submitAnswer } = useRooms();
  const isHost = room.hostId === user?.uid;
  const opponentUid = getOpponentUid(room, user?.uid);
  // 自分が解くべき問題 = 相手が出題した問題
  const target = isHost ? room.guestQuestion : room.hostQuestion;
  const myAnswer = isHost ? room.hostAnswer : room.guestAnswer;
  // NOTE: 相手が回答済みかどうかは回答フェーズ中は一切表示しない
  //       (競争心を煽るため。判明するのは judging へ遷移した時点)

  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pasteBlocker = usePasteBlocker(notifyPaste);

  const handleSubmit = async () => {
    if (!answer.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      SoundManager.play('decide');
      await submitAnswer(roomId, answer);
    } catch (e: any) {
      const msg = e?.message ?? '回答の送信に失敗しました';
      setError(msg);
      Alert.alert('エラー', msg);
    } finally {
      setSending(false);
    }
  };

  if (myAnswer) {
    return (
      <View style={styles.phaseBox}>
        {/* 相手 = 自分がホストならゲスト / 自分がゲストならホスト */}
        <OpponentCard uid={opponentUid} label={isHost ? 'ゲスト' : 'ホスト'} compact />
        <Text style={[styles.message, { color: colors.text }]}>回答を送信しました</Text>
        <Text style={[styles.subMessage, { color: colors.textSecondary }]}>
          判定フェーズへ進むのを待っています...
        </Text>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.phaseBox}>
      {/* 相手 = 自分がホストならゲスト / 自分がゲストならホスト */}
      <OpponentCard uid={opponentUid} label={isHost ? 'ゲスト' : 'ホスト'} compact />
      <Text style={[styles.label, { color: colors.textSecondary }]}>相手の問題</Text>
      <View style={[styles.quoteBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.quoteText, { color: colors.text }]}>
          {target?.text ?? '問題を読み込み中...'}
        </Text>
      </View>
      <Text style={[styles.label, { color: colors.text }]}>あなたの回答</Text>
      <TextInput
        value={answer}
        onChangeText={(next) => {
          const ok = guardedChange(answer, next, notifyPaste);
          if (ok !== null) setAnswer(ok);
        }}
        placeholder="回答を入力"
        autoCorrect={false}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, {
          borderColor: colors.border, color: colors.text, backgroundColor: colors.card,
        }]}
        {...(pasteBlocker as object)}
      />
      {/* 相手の回答状況は表示しない (競争心を煽るため、judging 遷移まで不明にする) */}
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
      <PressableButton
        onPress={handleSubmit}
        disabled={!answer.trim() || sending}
        style={[styles.primaryBtn, {
          backgroundColor: answer.trim() && !sending ? colors.primary : colors.border,
        }]}
      >
        {sending
          ? <ActivityIndicator size="small" color={colors.textSecondary} />
          : <Text style={[styles.primaryBtnText, { color: onPrimary }]}>回答する</Text>}
      </PressableButton>
    </View>
  );
}

// ── judging フェーズ: 相手の回答を正誤判定 ──
function JudgingView({ room, roomId }: { room: BattleRoom; roomId: string }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { submitJudgement } = useRooms();
  const isHost = room.hostId === user?.uid;
  const opponentUid = getOpponentUid(room, user?.uid);
  // 自分が判定すべき回答 = 相手の回答
  const targetAnswer = isHost ? room.guestAnswer : room.hostAnswer;
  // 自分が出題した問題 = 判定の根拠 (正解表示に使用)
  const myQuestion = isHost ? room.hostQuestion : room.guestQuestion;
  const myJudgement = isHost ? room.hostJudgement : room.guestJudgement;
  const peerJudgement = isHost ? room.guestJudgement : room.hostJudgement;

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJudge = async (judgement: 'correct' | 'incorrect') => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      SoundManager.play(judgement === 'correct' ? 'correct' : 'wrong');
      await submitJudgement(roomId, judgement);
    } catch (e: any) {
      const msg = e?.message ?? '判定の送信に失敗しました';
      setError(msg);
      Alert.alert('エラー', msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.phaseBox}>
      {/* 相手 = 自分がホストならゲスト / 自分がゲストならホスト */}
      <OpponentCard uid={opponentUid} label={isHost ? 'ゲスト' : 'ホスト'} compact />
      <Text style={[styles.label, { color: colors.textSecondary }]}>相手の回答</Text>
      <View style={[styles.quoteBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.quoteText, { color: colors.text }]}>
          {targetAnswer?.text ?? '回答を読み込み中...'}
        </Text>
      </View>
      {/* 出題者向け: 自分の問題と正解 (不正判定防止・学習用。回答者には見えない) */}
      {myQuestion ? (
        <View style={[styles.answerBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.answerLabel, { color: colors.textSecondary }]}>【出題した問題】</Text>
          <Text style={[styles.quoteText, { color: colors.text }]}>{myQuestion.text}</Text>
          <Text style={[styles.correctAnswer, { color: colors.success }]}>正解: {myQuestion.answer}</Text>
        </View>
      ) : null}
      <Text style={[styles.subMessage, { color: colors.textSecondary }]}>
        あなたの判定: {myJudgement === 'correct' ? '正解と判定済み'
          : myJudgement === 'incorrect' ? '不正解と判定済み' : '未判定'}
        {' / '}相手の判定: {peerJudgement ? '判定済み' : '未判定'}
      </Text>
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
      <View style={styles.judgeRow}>
        <PressableButton
          onPress={() => void handleJudge('correct')}
          disabled={myJudgement !== null || sending}
          style={[styles.judgeBtn, { backgroundColor: colors.success, opacity: myJudgement !== null || sending ? 0.5 : 1 }]}
        >
          <Text style={[styles.primaryBtnText, { color: '#FFFFFF' }]}>正解</Text>
        </PressableButton>
        <PressableButton
          onPress={() => void handleJudge('incorrect')}
          disabled={myJudgement !== null || sending}
          style={[styles.judgeBtn, { backgroundColor: colors.error, opacity: myJudgement !== null || sending ? 0.5 : 1 }]}
        >
          <Text style={[styles.primaryBtnText, { color: '#FFFFFF' }]}>不正解</Text>
        </PressableButton>
      </View>
      {myJudgement !== null && !peerJudgement && (
        <Text style={[styles.subMessage, { color: colors.textSecondary }]}>
          相手の判定を待っています...
        </Text>
      )}
    </View>
  );
}

function toMillis(t: { toMillis?: () => number } | null | undefined): number | null {
  if (!t || typeof t.toMillis !== 'function') return null;
  try {
    return t.toMillis();
  } catch {
    return null;
  }
}

function formatSubmitTime(t: { toMillis?: () => number } | null | undefined): string {
  const ms = toMillis(t);
  if (ms === null) return '-';
  return new Date(ms).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** 勝敗: 両正解→早い方 / 片方のみ正解→その人 / 両不正解→引分 */
function decideOutcome(room: BattleRoom, isHost: boolean): 'win' | 'lose' | 'draw' {
  // hostJudgement = guestAnswer への判定 / guestJudgement = hostAnswer への判定
  const hostCorrect = room.guestJudgement === 'correct';
  const guestCorrect = room.hostJudgement === 'correct';
  if (hostCorrect && guestCorrect) {
    const hostMs = toMillis(room.hostAnswer?.submittedAt);
    const guestMs = toMillis(room.guestAnswer?.submittedAt);
    if (hostMs === null || guestMs === null || hostMs === guestMs) return 'draw';
    const hostFaster = hostMs < guestMs;
    if (hostFaster) return isHost ? 'win' : 'lose';
    return isHost ? 'lose' : 'win';
  }
  if (hostCorrect && !guestCorrect) return isHost ? 'win' : 'lose';
  if (!hostCorrect && guestCorrect) return isHost ? 'lose' : 'win';
  return 'draw';
}

// ── finished フェーズ: 結果表示 + 勝敗 + 報酬 + 両者同意再戦 ──
function FinishedView({ room, roomId }: { room: BattleRoom; roomId: string }) {
  const navigate = useNavigate();
  const { colors, onPrimary } = useTheme();
  const { user } = useAuth();
  const { requestRematch, cancelRematch } = useRooms();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewardText, setRewardText] = useState<string | null>(null);
  const [statsText, setStatsText] = useState<string | null>(null);
  const isHost = room.hostId === user?.uid;
  const opponentUid = getOpponentUid(room, user?.uid);
  const outcome = decideOutcome(room, isHost);

  const myCorrect = isHost ? room.guestJudgement === 'correct' : room.hostJudgement === 'correct';
  const peerCorrect = isHost ? room.hostJudgement === 'correct' : room.guestJudgement === 'correct';

  // 自分が解いた問題 (相手が出題した問題) と自分の回答 → 不正解時の正解表示に使用
  const myQuestion = isHost ? room.guestQuestion : room.hostQuestion;
  const myAnswerText = ((isHost ? room.hostAnswer : room.guestAnswer)?.text) ?? '(未回答)';

  const headline = outcome === 'win' ? '勝利' : outcome === 'lose' ? '敗北' : '引き分け';
  const headlineColor = outcome === 'win' ? colors.success
    : outcome === 'lose' ? colors.error : colors.warning;

  // 両者同意で新ルームへ自動遷移
  useEffect(() => {
    if (room.rematchRoomId) {
      SoundManager.play('decide');
      navigate(`/battle/${room.rematchRoomId}`);
    }
  }, [room.rematchRoomId, navigate]);

  // 報酬付与 (マウント時1度だけ・sessionStorageで重複防止)
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;
    const key = `battle_reward_${roomId}`;
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) return;
    } catch {
      // sessionStorage unavailable -> still proceed once per mount
    }
    // 重複付与防止: 処理開始前に必ずマークする (報酬と戦績の二重加算を防止)
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, '1');
    } catch {
      // noop
    }
    const correctCount = myCorrect ? 1 : 0;
    const bonusXP = outcome === 'win' ? 50 : outcome === 'draw' ? 20 : 10;
    const bonusCoins = outcome === 'win' ? 30 : outcome === 'draw' ? 10 : 5;
    void awardQuizCompletion(uid, {
      correctCount,
      questionCount: 1,
      bonusXP,
      bonusCoins,
    })
      .then((result) => {
        const levelText = result.leveledUp > 0 ? ` / Lv.UP! Lv.${result.document.level}` : '';
        setRewardText(`報酬: +${bonusCoins}コイン / +${bonusXP}XP${levelText}`);
      })
      .catch((e) => console.warn('battle reward failed:', e));

    // 対戦戦績 (対戦数/勝敗/引分) をインクリメント (重複加算防止は上記キーで担保)
    void recordBattleResult(uid, outcome)
      .then((stats) => {
        if (stats) {
          setStatsText(`戦績: ${stats.totalBattles}戦 ${stats.wins}勝 ${stats.losses}敗 ${stats.draws}分`);
        }
      })
      .catch((e) => console.warn('battle stats update failed:', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const handleRequest = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      SoundManager.play('decide');
      await requestRematch(roomId);
    } catch (e: any) {
      setError(e?.message ?? '再戦の申込に失敗しました');
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async () => {
    try {
      SoundManager.play('select');
      await cancelRematch(roomId);
    } catch {
      // best-effort
    } finally {
      navigate('/multi');
    }
  };

  const myWant = isHost ? (room.hostRematch ?? false) : (room.guestRematch ?? false);
  const peerWant = isHost ? (room.guestRematch ?? false) : (room.hostRematch ?? false);

  return (
    <View style={styles.phaseBox}>
      <Text style={[styles.resultHeadline, { color: headlineColor }]}>{headline}</Text>
      <OpponentCard uid={opponentUid} label={isHost ? 'ゲスト' : 'ホスト'} />
      {rewardText ? (
        <Text style={[styles.toast, { color: colors.success }]}>{rewardText}</Text>
      ) : null}
      {statsText ? (
        <Text style={[styles.toast, { color: colors.textSecondary }]}>{statsText}</Text>
      ) : null}
      <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.resultRow, { color: colors.text }]}>
          あなた: {myCorrect ? '正解' : '不正解'}
          {' / '}回答 {formatSubmitTime(isHost ? room.hostAnswer?.submittedAt : room.guestAnswer?.submittedAt)}
        </Text>
        <Text style={[styles.resultRow, { color: colors.text }]}>
          相手: {peerCorrect ? '正解' : '不正解'}
          {' / '}回答 {formatSubmitTime(isHost ? room.guestAnswer?.submittedAt : room.hostAnswer?.submittedAt)}
        </Text>
        <Text style={[styles.subMessage, { color: colors.textSecondary }]}>
          両者正解なら回答が早い方が勝ちです
        </Text>
      </View>
      {/* 出題された問題と正解 (不正解時は赤枠+正解を強調して学習に繋げる) */}
      <View style={[styles.answerBox, {
        backgroundColor: colors.card,
        borderColor: myCorrect ? colors.border : colors.error,
      }]}>
        <Text style={[styles.answerLabel, { color: colors.textSecondary }]}>【出題された問題】</Text>
        <Text style={[styles.quoteText, { color: colors.text }]}>
          {myQuestion?.text ?? '(問題データがありません)'}
        </Text>
        <Text style={[styles.answerLabel, { color: colors.textSecondary }]}>
          あなたの回答: {myAnswerText}
        </Text>
        <Text style={[styles.answerLabel, { color: myCorrect ? colors.success : colors.error }]}>
          判定: {myCorrect ? '正解' : '不正解'}
        </Text>
        <Text style={[styles.correctAnswer, { color: colors.success }]}>
          正解: {myQuestion?.answer ?? '-'}
        </Text>
      </View>
      <PressableButton
        onPress={() => { SoundManager.play('decide'); navigate('/'); }}
        style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.primaryBtnText, { color: onPrimary }]}>ホームに戻る</Text>
      </PressableButton>
      {peerWant && !myWant ? (
        <Text style={[styles.message, { color: colors.warning }]}>相手が再戦を希望しています</Text>
      ) : null}
      {myWant && !room.rematchRoomId ? (
        <Text style={[styles.message, { color: colors.textSecondary }]}>相手の応答を待っています...</Text>
      ) : null}
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
      <PressableButton
        onPress={() => void handleRequest()}
        disabled={myWant || sending}
        style={[styles.secondaryBtn, { borderColor: colors.border, opacity: myWant || sending ? 0.5 : 1 }]}
      >
        {sending
          ? <ActivityIndicator size="small" color={colors.textSecondary} />
          : <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
              {peerWant ? '再戦する' : myWant ? '申込中...' : '再戦を申し込む'}
            </Text>}
      </PressableButton>
      <PressableButton
        onPress={() => void handleCancel()}
        style={[styles.secondaryBtn, { borderColor: colors.border }]}
      >
        <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>キャンセル</Text>
      </PressableButton>
    </View>
  );
}

// ── 相手退出の検知 ──
// - abandoned: ホストが退出して対戦破棄
// - ゲスト退出: 対戦開始後 (creating以降) に guestId が null へ戻った場合
//   (waiting は参加前なので除外する)
function getOpponentLeft(room: BattleRoom): boolean {
  if (room.status === 'abandoned') return true;
  if (room.status !== 'waiting' && room.guestId === null) return true;
  return false;
}

// ── 相手退出表示 ──
function OpponentLeftView() {
  const navigate = useNavigate();
  const { colors, onPrimary } = useTheme();
  return (
    <View style={styles.center}>
      <Text style={[styles.resultHeadline, { color: colors.warning }]}>相手が退出しました</Text>
      <Text style={[styles.subMessage, { color: colors.textSecondary }]}>
        対戦は終了です。新しいルームで再戦できます
      </Text>
      <PressableButton
        onPress={() => { SoundManager.play('decide'); navigate('/'); }}
        style={[styles.primaryBtn, { backgroundColor: colors.primary, minWidth: 220 }]}
      >
        <Text style={[styles.primaryBtnText, { color: onPrimary }]}>ホームに戻る</Text>
      </PressableButton>
    </View>
  );
}

// __MAIN__
// ── メイン: status で分岐 + 退出/切断ハンドリング ──
export default function BattleScreen() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { room, loading, error } = useRoom(roomId);
  const { leaveRoom } = useRooms();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const roomRef = useRef<BattleRoom | null>(null);
  const uidRef = useRef<string | null>(null);
  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { uidRef.current = user?.uid ?? null; }, [user]);

  // unmount時の自動退出 (finished / abandoned は除外、best-effort)
  useEffect(() => {
    return () => {
      const snapshot = roomRef.current;
      const uid = uidRef.current;
      if (!roomId || !snapshot || !uid) return;
      if (snapshot.status === 'finished' || snapshot.status === 'abandoned') return;
      if (snapshot.hostId !== uid && snapshot.guestId !== uid) return;
      void leaveRoom(roomId).catch((e) => console.warn('auto leaveRoom failed:', e));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const confirmAndLeave = async () => {
    if (!roomId || leaving) return;
    setLeaving(true);
    try {
      SoundManager.play('decide');
      await leaveRoom(roomId);
      setConfirmLeave(false);
      navigate('/multi');
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '退出に失敗しました');
    } finally {
      setLeaving(false);
    }
  };

  let body: React.ReactNode;
  if (loading) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.message, { color: colors.textSecondary }]}>ルームを読み込み中...</Text>
      </View>
    );
  } else if (error || !room || !roomId) {
    body = (
      <View style={styles.center}>
        <Text style={[styles.message, { color: colors.error }]}>
          {error?.message ?? 'ルームが見つかりません'}
        </Text>
      </View>
    );
  } else if (room.status === 'finished') {
    body = <FinishedView room={room} roomId={roomId} />;
  } else if (getOpponentLeft(room)) {
    body = <OpponentLeftView />;
  } else if (room.status === 'waiting') {
    body = <WaitingView room={room} />;
  } else if (room.status === 'creating') {
    body = <CreatingView room={room} roomId={roomId} />;
  } else if (room.status === 'answering') {
    body = <AnsweringView room={room} roomId={roomId} />;
  } else if (room.status === 'judging') {
    body = <JudgingView room={room} roomId={roomId} />;
  } else {
    body = <FinishedView room={room} roomId={roomId} />;
  }

  const showLeave = !!room && !loading && !error
    && room.status !== 'finished' && !getOpponentLeft(room);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <BackButton to="/battle" />
        <Text style={[styles.headerTitle, { color: colors.text }]}>対戦</Text>
        {showLeave ? (
          <PressableButton
            onPress={() => setConfirmLeave(true)}
            style={[styles.leaveBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.leaveBtnText, { color: colors.error }]}>退出</Text>
          </PressableButton>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>
      {body}
      <Modal
        visible={confirmLeave}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmLeave(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>対戦から退出しますか?</Text>
            <Text style={[styles.subMessage, { color: colors.textSecondary }]}>
              退出すると相手に「相手が退出しました」と表示されます
            </Text>
            <View style={styles.modalRow}>
              <PressableButton
                onPress={() => setConfirmLeave(false)}
                style={[styles.modalBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.text }]}>キャンセル</Text>
              </PressableButton>
              <PressableButton
                onPress={() => void confirmAndLeave()}
                disabled={leaving}
                style={[styles.modalBtn, { backgroundColor: colors.error, opacity: leaving ? 0.6 : 1 }]}
              >
                {leaving
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={[styles.secondaryBtnText, { color: '#FFFFFF' }]}>退出する</Text>}
              </PressableButton>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  phaseBox: { flex: 1, padding: 20, gap: 12, paddingBottom: 100 },
  label: { fontSize: 14, fontWeight: '600' },
  message: { fontSize: 15, textAlign: 'center' },
  subMessage: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  roomId: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', letterSpacing: 1 },
  timer: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  waitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  multilineInput: { minHeight: 90, textAlignVertical: 'top' },
  quoteBox: { borderWidth: 1, borderRadius: 12, padding: 16 },
  quoteText: { fontSize: 15, lineHeight: 22 },
  answerBox: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 4 },
  answerLabel: { fontSize: 12, fontWeight: 'bold' },
  correctAnswer: { fontSize: 16, fontWeight: 'bold', lineHeight: 22 },
  primaryBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { fontSize: 16, fontWeight: 'bold' },
  secondaryBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  secondaryBtnText: { fontSize: 16, fontWeight: '600' },
  judgeRow: { flexDirection: 'row', gap: 12 },
  judgeBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  resultHeadline: { fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  resultCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
  resultRow: { fontSize: 14, lineHeight: 20 },
  error: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  toast: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  leaveBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, minWidth: 44, alignItems: 'center' },
  leaveBtnText: { fontSize: 13, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 380, borderWidth: 1, borderRadius: 16, padding: 20, gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', textAlign: 'center' },
  modalRow: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
});
