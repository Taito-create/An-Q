import { useEffect, useState } from 'react';
import { normalizeUserProfileDocument } from '../../src/utils/userProgress';
import type { UserProgressDocument } from '../../src/utils/userProgress';

// ─────────────────────────────────────────────
// 対戦相手のプロフィール取得ユーティリティ
// userProgress/{uid} を単発取得する (onSnapshot不要・負荷軽減)
//
// ※ 読み取り失敗（403 / ネットワーク障害 / タイムアウト）の場合は
//   必ず null（＝既定画像）へフォールバックし、
//   ローディング表示が永久に続かないことを保証する。
// ─────────────────────────────────────────────

/**
 * 相手の userProgress ドキュメントを Firestore から直接取得する。
 * @returns 取得できたドキュメント、できなければ null（例外は投げない）
 */
export async function fetchUserProgress(uid: string): Promise<UserProgressDocument | null> {
  // ※ readUserProfileDocument は permission-denied 時に
  //   「自分の」ローカルプロフィールを opponent として返してくるため、
  //   対戦相手の取得にはそのまま使えない。
  //   ここでは Firestore から直接読み、失敗したら null（＝既定画像）として扱う。
  try {
    const { doc: fsDoc, getDoc } = await import('firebase/firestore');
    const { db: firestoreDb } = await import('../../src/config/firebase');
    const snapshot = await getDoc(fsDoc(firestoreDb, 'userProgress', uid));
    if (!snapshot.exists()) return null;
    return normalizeUserProfileDocument(
      snapshot.data() as Partial<UserProgressDocument> & Record<string, any>,
    );
  } catch (e: any) {
    console.warn('fetchUserProgress failed:', e?.code ?? e);
    // 403 でもネットワークエラーでも例外を投げず null を返して
    // 呼び出し側（フック）でプレースホルダーを確実に解除させる
    return null;
  }
}

/**
 * プロフィール取得のタイムアウト(ms)。
 * Firestore の getDoc はネットワーク保留時に Promise が解決も拒否もせず
 * 永久に pending になることがあり、そのままだと
 * then/catch/finally のどれも実行されず loading が解除されない。
 * 一定時間経過したら「取得失敗」として確定させ、プレースホルダー解除を保証する。
 */
const PROFILE_FETCH_TIMEOUT_MS = 8_000;

/** Promise にタイムアウトを付与する（元の Promise は破棄できないため race で代替する） */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** uid 変更時に1度だけ取得するフック。null/undefined なら null を返す */
export function useOpponentProfile(uid: string | null | undefined): {
  profile: UserProgressDocument | null;
  loading: boolean;
} {
  const [profile, setProfile] = useState<UserProgressDocument | null>(null);
  // 取得完了した uid（どの相手のデータまで済んだかの目印）
  // これを使うことで、相手が変わった直後（useEffect 実行前の1フレーム）も
  // loading=true を保ち、デフォルト画像が一瞬見えるフリッカーを防ぐ。
  const [loadedUid, setLoadedUid] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      setLoadedUid(null);
      return;
    }
    let cancelled = false;
    // 相手のプロフィールを取得し直す前に一旦クリアする
    setProfile(null);

    // タイムアウトを付けて取得する。
    // 保留のまま解決しない場合でも、一定時間後に「失敗」として確定させ、
    // ローディング（プレースホルダー）が永久に続かないことを保証する。
    withTimeout(fetchUserProgress(uid), PROFILE_FETCH_TIMEOUT_MS, 'fetchUserProgress')
      .then((doc) => {
        if (cancelled) return;
        setProfile(doc);
        // ※ Image.prefetch は使用しない。
        //   事前キャッシュすると RNW の <Image> が onLoad を発火しないケースがあり、
        //   OpponentCard 側で完了を判定できなくなるため（副作用が大きい）。
      })
      .catch((e) => {
        console.warn('useOpponentProfile fetch failed:', e);
        // 取得できなかった場合は「プロフィールなし」として既定画像へ落とす
        if (!cancelled) setProfile(null);
        // 403 などの権限エラーでもここで loadedUid を確定させ、
        // プレースホルダーが永久に続くのを防ぐ
        if (!cancelled) setLoadedUid(uid);
      })
      .finally(() => {
        // 成功・失敗・タイムアウトのいずれでも必ず解除する
        if (!cancelled) setLoadedUid(uid);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // まだ現在の uid のデータを取得し終えていなければ loading=true
  const loading = !!uid && loadedUid !== uid;
  // 読み込み中は古い相手のプロフィールを見せない
  return { profile: loading ? null : profile, loading };
}

