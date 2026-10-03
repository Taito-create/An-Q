import { doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import { BATTLE_ROOMS_COLLECTION } from '../types/battle';
import type { BattleRoom, BattleJudgement } from '../types/battle';
import { STORAGE_KEYS } from '../constants/storageKeys';

/** Dev Bot としてゲストに設定する仮のUID */
export const DEV_BOT_UID = 'dev-bot';

/** Bot モードが有効か（localhost のみ） */
export function isDevBotModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.hostname !== 'localhost') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEYS.DEV_BATTLE_BOT) === 'true';
  } catch {
    return false;
  }
}

/** CREATING_LIMIT_SEC の上書き値（localhost のみ、0以下なら defaultSec） */
export function getDevCreatingLimitSec(defaultSec: number): number {
  if (typeof window === 'undefined') return defaultSec;
  if (window.location.hostname !== 'localhost') return defaultSec;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.DEV_CREATING_LIMIT_SEC);
    if (!raw) return defaultSec;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultSec;
  } catch {
    return defaultSec;
  }
}

/** Bot をゲストとしてルームに参加させる（ホスト権限で実行） */
export async function attachDevBotToRoom(roomId: string): Promise<void> {
  if (!isDevBotModeEnabled()) return;
  const ref = doc(db, BATTLE_ROOMS_COLLECTION, roomId);
  await updateDoc(ref, {
    guestId: DEV_BOT_UID,
    status: 'creating',
  });
}

/** Bot として問題を提出する */
export async function devBotSubmitQuestion(
  roomId: string,
  question: string,
  answer: string,
): Promise<void> {
  const ref = doc(db, BATTLE_ROOMS_COLLECTION, roomId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const room = snap.data() as Omit<BattleRoom, 'id'>;
    if (room.guestQuestion !== null) return;
    tx.update(ref, { guestQuestion: { text: question, answer } });
    if (room.hostQuestion !== null && room.status === 'creating') {
      tx.update(ref, { status: 'answering', timerStartAt: serverTimestamp() });
    }
  });
}

/** Bot として回答を提出する */
export async function devBotSubmitAnswer(roomId: string, answer: string): Promise<void> {
  const ref = doc(db, BATTLE_ROOMS_COLLECTION, roomId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const room = snap.data() as Omit<BattleRoom, 'id'>;
    if (room.guestAnswer !== null) return;
    tx.update(ref, { guestAnswer: { text: answer, submittedAt: serverTimestamp() } });
    if (room.hostAnswer !== null && room.status === 'answering') {
      tx.update(ref, { status: 'judging' });
    }
  });
}

/** Bot として判定を提出する */
export async function devBotSubmitJudgement(
  roomId: string,
  judgement: BattleJudgement,
): Promise<void> {
  const ref = doc(db, BATTLE_ROOMS_COLLECTION, roomId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const room = snap.data() as Omit<BattleRoom, 'id'>;
    if (room.guestJudgement !== null) return;
    tx.update(ref, { guestJudgement: judgement });
    if (room.hostJudgement !== null && room.status === 'judging') {
      tx.update(ref, { status: 'finished' });
    }
  });
}

/** Bot が提出するデフォルトコンテンツ */
export const DEV_BOT_DEFAULT_QUESTION = 'これはボットからのテスト問題です。1+1は？';
export const DEV_BOT_DEFAULT_ANSWER = '2';
export const DEV_BOT_DEFAULT_RESPONSE = 'ボットからの回答';