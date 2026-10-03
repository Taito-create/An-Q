import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { useAuth } from '../auth/AuthContext';
import { BATTLE_ROOMS_COLLECTION } from '../types/battle';
import type { BattleJudgement, BattleQuestion, BattleRoom } from '../types/battle';

// ─────────────────────────────────────────────
// RoomsContext: リアルタイム対戦ルームの操作 + 購読
// 既存パターン踏襲 (AuthContext / QuestionsContext と同様の Context API)。
// コレクション: `battleRooms/{roomId}`
// リアルタイム同期は onSnapshot のみ使用 (useRoom)。
// ─────────────────────────────────────────────

interface RoomsContextType {
  createRoom: () => Promise<string>;
  joinRoom: (roomId: string) => Promise<void>;
  submitQuestion: (roomId: string, question: string, answer: string) => Promise<void>;
  submitTimeout: (
    roomId: string,
    pickedQuestion?: { text: string; answer: string },
  ) => Promise<void>;
  submitAnswer: (roomId: string, answer: string) => Promise<void>;
  submitJudgement: (roomId: string, judgement: BattleJudgement) => Promise<void>;
  leaveRoom: (roomId: string) => Promise<void>;
  requestRematch: (roomId: string) => Promise<void>;
  cancelRematch: (roomId: string) => Promise<void>;
}

const RoomsContext = createContext<RoomsContextType | undefined>(undefined);

/** 自分がホスト側かゲスト側かを判定する。参加者でなければエラーを投げる */
function resolveRole(room: BattleRoom, uid: string): 'host' | 'guest' {
  if (room.hostId === uid) return 'host';
  if (room.guestId === uid) return 'guest';
  throw new Error('このルームの参加者ではありません');
}

export const RoomsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const requireUid = (): string => {
    if (!user?.uid) throw new Error('ログインが必要です');
    return user.uid;
  };

  // ── 新しいルームを作成し、ルームIDを返す ──
  const createRoom = useCallback(async (): Promise<string> => {
    const uid = requireUid();
    const ref = await addDoc(collection(db, BATTLE_ROOMS_COLLECTION), {
      hostId: uid,
      guestId: null,
      status: 'waiting',
      createdAt: serverTimestamp(),
      timerStartAt: null,
      hostQuestion: null,
      guestQuestion: null,
      hostAnswer: null,
      guestAnswer: null,
      hostJudgement: null,
      guestJudgement: null,
      hostTimedOut: false,
      guestTimedOut: false,
    });
    return ref.id;
  }, [user]);

  // ── 既存ルームに参加する (満員・二重参加は transaction で防止) ──
  const joinRoom = useCallback(
    async (roomId: string): Promise<void> => {
      const uid = requireUid();
      const roomRef = doc(db, BATTLE_ROOMS_COLLECTION, roomId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef);
        if (!snap.exists()) throw new Error('ルームが存在しません');
        const room = snap.data() as Omit<BattleRoom, 'id'>;
        // 作成者・既参加者の再入室は成功扱い (冪等)
        if (room.hostId === uid || room.guestId === uid) return;
        if (room.guestId !== null) throw new Error('ルームは満員です');
        tx.update(roomRef, { guestId: uid, status: 'creating' });
      });
    },
    [user],
  );

  // ── 自分の問題と正解を登録する ──
  // 双方の問題が揃ったら answering へ進め、timerStartAt をサーバ時刻で打刻する
  const submitQuestion = useCallback(
    async (roomId: string, question: string, answer: string): Promise<void> => {
      const uid = requireUid();
      if (!question.trim() || !answer.trim()) {
        throw new Error('問題文と正解を入力してください');
      }
      const roomRef = doc(db, BATTLE_ROOMS_COLLECTION, roomId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef);
        if (!snap.exists()) throw new Error('ルームが存在しません');
        const room = { id: snap.id, ...(snap.data() as Omit<BattleRoom, 'id'>) };
        const role = resolveRole(room, uid);
        const field = role === 'host' ? 'hostQuestion' : 'guestQuestion';
        const other = role === 'host' ? room.guestQuestion : room.hostQuestion;
        tx.update(roomRef, { [field]: { text: question, answer } });
        if (other !== null && room.status === 'creating') {
          // 両者 ready。どちらかが空（時間切れの白紙）なら answering をスキップして finished へ
          const bothReal = question.trim().length > 0 && other.text.trim().length > 0;
          if (bothReal) {
            tx.update(roomRef, { status: 'answering', timerStartAt: serverTimestamp() });
          } else {
            tx.update(roomRef, { status: 'finished' });
          }
        }
      });
    },
    [user],
  );

  // ── 時間切れ時の送信 ──
  // pickedQuestion があればライブラリからの自動選出として登録し、
  // 無ければ白紙送信として扱う。どちらの場合も hostTimedOut / guestTimedOut を立てる。
  // 相手も登録済みなら。両者とも問題のときだけ answering へ進む。
  // うち一方でも白紙なら answering をスキップして finished へ直行する。
  const submitTimeout = useCallback(
    async (
      roomId: string,
      pickedQuestion?: { text: string; answer: string },
    ): Promise<void> => {
      const uid = requireUid();
      const roomRef = doc(db, BATTLE_ROOMS_COLLECTION, roomId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef);
        if (!snap.exists()) throw new Error('ルームが存在しません');
        const room = { id: snap.id, ...(snap.data() as Omit<BattleRoom, 'id'>) };
        const role = resolveRole(room, uid);
        const questionField = role === 'host' ? 'hostQuestion' : 'guestQuestion';
        const timeoutField = role === 'host' ? 'hostTimedOut' : 'guestTimedOut';
        const otherQuestion = role === 'host' ? room.guestQuestion : room.hostQuestion;

        const questionObj: BattleQuestion = pickedQuestion
          ? { text: pickedQuestion.text, answer: pickedQuestion.answer, isTimeout: true }
          : { text: '', answer: '', isTimeout: true };

        tx.update(roomRef, {
          [timeoutField]: true,
          [questionField]: questionObj,
        });

        if (otherQuestion !== null && room.status === 'creating') {
          const bothReal =
            questionObj.text.trim().length > 0 && otherQuestion.text.trim().length > 0;
          if (bothReal) {
            tx.update(roomRef, { status: 'answering', timerStartAt: serverTimestamp() });
          } else {
            tx.update(roomRef, { status: 'finished' });
          }
        }
      });
    },
    [user],
  );

  // ── 相手の問題に対する自分の回答を送信する (submittedAt は serverTimestamp) ──
  // 双方の回答が揃ったら judging へ進める
  const submitAnswer = useCallback(
    async (roomId: string, answer: string): Promise<void> => {
      const uid = requireUid();
      if (!answer.trim()) throw new Error('回答を入力してください');
      const roomRef = doc(db, BATTLE_ROOMS_COLLECTION, roomId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef);
        if (!snap.exists()) throw new Error('ルームが存在しません');
        const room = { id: snap.id, ...(snap.data() as Omit<BattleRoom, 'id'>) };
        const role = resolveRole(room, uid);
        const field = role === 'host' ? 'hostAnswer' : 'guestAnswer';
        const other = role === 'host' ? room.guestAnswer : room.hostAnswer;
        tx.update(roomRef, { [field]: { text: answer, submittedAt: serverTimestamp() } });
        if (other !== null && room.status === 'answering') {
          tx.update(roomRef, { status: 'judging' });
        }
      });
    },
    [user],
  );

  // ── 相手の回答に対する正誤判定を送信する ──
  // 約束: hostJudgement = guestAnswer への判定 / guestJudgement = hostAnswer への判定
  // 双方の判定が揃ったら finished へ進める
  const submitJudgement = useCallback(
    async (roomId: string, judgement: BattleJudgement): Promise<void> => {
      const uid = requireUid();
      const roomRef = doc(db, BATTLE_ROOMS_COLLECTION, roomId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef);
        if (!snap.exists()) throw new Error('ルームが存在しません');
        const room = { id: snap.id, ...(snap.data() as Omit<BattleRoom, 'id'>) };
        const role = resolveRole(room, uid);
        const field = role === 'host' ? 'hostJudgement' : 'guestJudgement';
        const other = role === 'host' ? room.guestJudgement : room.hostJudgement;
        tx.update(roomRef, { [field]: judgement });
        if (other !== null && room.status === 'judging') {
          tx.update(roomRef, { status: 'finished' });
        }
      });
    },
    [user],
  );
  // ── ルームから退出する ──
  // ホスト: status を 'abandoned' にして対戦を破棄する
  // ゲスト: guestId を null に戻し、status を 'waiting' に戻す (ホスト再待機用)
  // finished 済みは何もしない。観戦者(非参加者)も何もしない
  const leaveRoom = useCallback(
    async (roomId: string): Promise<void> => {
      const uid = requireUid();
      const roomRef = doc(db, BATTLE_ROOMS_COLLECTION, roomId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef);
        if (!snap.exists()) return;
        const room = snap.data() as Omit<BattleRoom, 'id'>;
        if (room.status === 'finished' || room.status === 'abandoned') return;
        if (room.hostId === uid) {
          tx.update(roomRef, { status: 'abandoned' });
          return;
        }
        if (room.guestId === uid) {
          tx.update(roomRef, { guestId: null, status: 'waiting' });
        }
      });
    },
    [user],
  );
  // ── 再戦を申し込む (両者同意制) ──
  // 自分のフラグを true にし、相手も true なら新ルームを作成して rematchRoomId に書込む
  // finished 以外では例外を投げる。既存ドキュメント互換のため undefined は false 扱い
  const requestRematch = useCallback(
    async (roomId: string): Promise<void> => {
      const uid = requireUid();
      const roomRef = doc(db, BATTLE_ROOMS_COLLECTION, roomId);
      // 第1トランザクション: 自分のフラグを立てる
      const snapshot = await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef);
        if (!snap.exists()) throw new Error('ルームが存在しません');
        const room = { id: snap.id, ...(snap.data() as Omit<BattleRoom, 'id'>) };
        if (room.status !== 'finished') throw new Error('対戦終了後のみ再戦できます');
        const role = resolveRole(room, uid);
        const field = role === 'host' ? 'hostRematch' : 'guestRematch';
        if (room.rematchRoomId) return room;
        tx.update(roomRef, { [field]: true });
        return {
          ...room,
          [field]: true,
        } as BattleRoom;
      });
      // 両者同意かつ新ルーム未作成なら、新ルームを作成して紐付ける
      const hostWant = snapshot.hostRematch ?? false;
      const guestWant = snapshot.guestRematch ?? false;
      if (hostWant && guestWant && !snapshot.rematchRoomId) {
        const newRef = await addDoc(collection(db, BATTLE_ROOMS_COLLECTION), {
          hostId: snapshot.hostId,
          guestId: snapshot.guestId,
          status: 'creating',
          createdAt: serverTimestamp(),
          timerStartAt: null,
          hostQuestion: null,
          guestQuestion: null,
          hostAnswer: null,
          guestAnswer: null,
          hostJudgement: null,
          guestJudgement: null,
          hostTimedOut: false,
          guestTimedOut: false,
          hostRematch: false,
          guestRematch: false,
          rematchRoomId: null,
        });
        // 先勝ちのみ有効 (同時作成時は最初の1件だけ残すため条件付き更新)
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(roomRef);
          if (!snap.exists()) return;
          const current = snap.data() as Omit<BattleRoom, 'id'>;
          if (!current.rematchRoomId) {
            tx.update(roomRef, { rematchRoomId: newRef.id });
          }
        });
      }
    },
    [user],
  );

  // ── 再戦申込をキャンセルする (自分のフラグを false に戻す) ──
  const cancelRematch = useCallback(
    async (roomId: string): Promise<void> => {
      const uid = requireUid();
      const roomRef = doc(db, BATTLE_ROOMS_COLLECTION, roomId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(roomRef);
        if (!snap.exists()) return;
        const room = { id: snap.id, ...(snap.data() as Omit<BattleRoom, 'id'>) };
        if (room.rematchRoomId) return;
        const role = resolveRole(room, uid);
        tx.update(roomRef, { [role === 'host' ? 'hostRematch' : 'guestRematch']: false });
      });
    },
    [user],
  );
  const value: RoomsContextType = {
    createRoom,
    joinRoom,
    submitQuestion,
    submitTimeout,
    submitAnswer,
    submitJudgement,
    leaveRoom,
    requestRematch,
    cancelRematch,
  };

  return <RoomsContext.Provider value={value}>{children}</RoomsContext.Provider>;
};

export const useRooms = (): RoomsContextType => {
  const context = useContext(RoomsContext);
  if (context === undefined) {
    throw new Error('useRooms must be used within a RoomsProvider');
  }
  return context;
};

// ─────────────────────────────────────────────
// useRoom: 特定ルームを onSnapshot でリアルタイム購読する
// 戻り値: { room: BattleRoom | null, loading, error }
// ─────────────────────────────────────────────
interface UseRoomResult {
  room: BattleRoom | null;
  loading: boolean;
  error: Error | null;
}

export function useRoom(roomId: string | undefined): UseRoomResult {
  const [room, setRoom] = useState<BattleRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const roomRef = doc(db, BATTLE_ROOMS_COLLECTION, roomId);
    const unsubscribe = onSnapshot(
      roomRef,
      (snap) => {
        if (snap.exists()) {
          setRoom({ id: snap.id, ...(snap.data() as Omit<BattleRoom, 'id'>) });
        } else {
          setRoom(null);
          setError(new Error('ルームが存在しません'));
        }
        setLoading(false);
      },
      (err) => {
        console.error('useRoom onSnapshot error:', err);
        setError(err as Error);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [roomId]);

  return { room, loading, error };
}

/** 単発取得ヘルパー (購読不要時用) */
export async function fetchRoom(roomId: string): Promise<BattleRoom | null> {
  const snap = await getDoc(doc(db, BATTLE_ROOMS_COLLECTION, roomId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<BattleRoom, 'id'>) };
}
