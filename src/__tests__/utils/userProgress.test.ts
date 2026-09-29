/// <reference types="jest" />
/**
 * プロフィール画像の保存方針（AsyncStorage が唯一の保存先）の回帰テスト。
 *
 * 背景:
 *  - Base64 画像を Firestore に書き込むと 1MB 制限を超えて 400 Bad Request になる
 *  - 画像の保存先を AsyncStorage に限定した結果、Firestore 側は空文字になるため、
 *    Firestore の値をそのままローカルへ書き戻すと画像が消えてしまう
 *
 * 検証内容:
 *  1. sanitize / ローカル読み書きヘルパーの挙動
 *  2. updateProgressDocument (syncLoginStreak) がローカル画像を消さないこと
 *  3. Base64 が Firestore のペイロードに含まれないこと（400 対策）
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../../../app/constants/storageKeys';
import {
  LOCAL_PROFILE_IMAGE_KEY,
  incrementXP,
  isCloudinaryConfigured,
  isRemoteProfileImageUrl,
  readLocalProfileImage,
  recordBattleResult,
  sanitizeProfileImageForFirestore,
  saveLocalProfileImage,
  syncLoginStreak,
  uploadProfileImageToCloudinary,
} from '../../utils/userProgress';

const BASE64_IMAGE = 'data:image/jpeg;base64,' + 'A'.repeat(200_000);
const REMOTE_IMAGE = 'https://cdn.example.com/icon.png';

// ─── AsyncStorage をインメモリ実装に差し替える ───
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => (store.has(key) ? (store.get(key) as string) : null)),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      multiGet: jest.fn(async (keys: string[]) =>
        keys.map((key) => [key, store.has(key) ? (store.get(key) as string) : null] as [string, string | null])
      ),
      multiSet: jest.fn(async (pairs: [string, string][]) => {
        pairs.forEach(([key, value]) => store.set(key, value));
      }),
      multiRemove: jest.fn(async (keys: string[]) => {
        keys.forEach((key) => store.delete(key));
      }),
      clear: jest.fn(async () => {
        store.clear();
      }),
    },
  };
});

// ─── Firestore はトランザクションの書き込み内容だけ検証できればよいのでモックする ───
const mockSet = jest.fn();
let mockServerData: Record<string, unknown> = {};

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ __ref: 'userProgress/test-uid' })),
  onSnapshot: jest.fn(),
  getDoc: jest.fn(),
  runTransaction: jest.fn(async (_db: unknown, updater: (transaction: unknown) => Promise<unknown>) =>
    updater({
      get: async () => ({ exists: () => true, data: () => mockServerData }),
      set: (...args: unknown[]) => mockSet(...args),
    })
  ),
}));

jest.mock('../../config/firebase', () => ({ db: {} }));

/** 最後の Firestore 書き込みペイロード */
function lastPayload(): Record<string, any> {
  return mockSet.mock.calls[mockSet.mock.calls.length - 1][1];
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockServerData = {};
  await AsyncStorage.clear();
});

describe('プロフィール画像のサニタイズ / ローカル保存ヘルパー', () => {
  it('Base64 (data:URL) と上限超過は Firestore に送らない値へ縮小する', () => {
    expect(sanitizeProfileImageForFirestore(BASE64_IMAGE)).toBe('');
    expect(sanitizeProfileImageForFirestore('x'.repeat(10_001))).toBe('');
    expect(sanitizeProfileImageForFirestore(REMOTE_IMAGE)).toBe(REMOTE_IMAGE);
    expect(sanitizeProfileImageForFirestore(null)).toBeNull();
    expect(sanitizeProfileImageForFirestore(undefined)).toBeNull();
  });

  it('http(s) URL のみ「Firestore から復元できる画像」とみなす', () => {
    expect(isRemoteProfileImageUrl(REMOTE_IMAGE)).toBe(true);
    expect(isRemoteProfileImageUrl(BASE64_IMAGE)).toBe(false);
    expect(isRemoteProfileImageUrl('')).toBe(false);
    expect(isRemoteProfileImageUrl(null)).toBe(false);
    expect(isRemoteProfileImageUrl(undefined)).toBe(false);
  });

  it('ローカル画像を保存・読み出しでき、空文字は null に正規化される', async () => {
    expect(await readLocalProfileImage()).toBeNull();

    await saveLocalProfileImage(BASE64_IMAGE);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.USER_PROFILE_IMAGE)).toBe(BASE64_IMAGE);
    expect(LOCAL_PROFILE_IMAGE_KEY).toBe(STORAGE_KEYS.USER_PROFILE_IMAGE);
    expect(await readLocalProfileImage()).toBe(BASE64_IMAGE);

    // 未設定・削除扱い（null / 空文字）は null として読み出される
    await saveLocalProfileImage(null);
    expect(await readLocalProfileImage()).toBeNull();
    await saveLocalProfileImage('   ');
    expect(await readLocalProfileImage()).toBeNull();
  });
});

describe('syncLoginStreak (updateProgressDocument) とプロフィール画像', () => {
  it('ローカルに保存した画像を Firestore 由来の空文字で消さない', async () => {
    await saveLocalProfileImage(BASE64_IMAGE);
    // sanitize 後の Firestore ドキュメント（画像は '' で保存されている）
    mockServerData = { username: 'Tester', profileImage: '' };

    await syncLoginStreak('test-uid', Date.now());

    expect(await readLocalProfileImage()).toBe(BASE64_IMAGE);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.USER_PROFILE_IMAGE)).toBe(BASE64_IMAGE);
    // 他のフィールドは Firestore の値で同期されている
    expect(await AsyncStorage.getItem(STORAGE_KEYS.USER_USERNAME)).toBe('Tester');
  });

  it('Firestore へは画像 (Base64) を送らない（400 Bad Request 対策）', async () => {
    await saveLocalProfileImage(BASE64_IMAGE);
    // 旧ドキュメントには Base64 が残っている状態
    mockServerData = { username: 'Tester', profileImage: BASE64_IMAGE };

    await syncLoginStreak('test-uid', Date.now());

    const payload = lastPayload();
    // profileImage はキーごと payload に含まれない（既存値は上書きされない）
    expect(payload.profileImage).toBeUndefined();
    expect('profileImage' in payload).toBe(false);
    expect(JSON.stringify(payload)).not.toContain('data:image');
    expect(JSON.stringify(payload).length).toBeLessThan(10_000);
    // ローカルの画像は失われない
    expect(await readLocalProfileImage()).toBe(BASE64_IMAGE);
  });

  it('画像を含まないドキュメントでは画像フィールドを書き戻さない', async () => {
    mockServerData = { username: 'Tester', profileImage: '' };

    await syncLoginStreak('test-uid', Date.now());

    expect('profileImage' in lastPayload()).toBe(false);
  });

  it('旧ドキュメントに残った巨大 Base64 を書き戻さず、フィールドごと除外する', async () => {
    mockServerData = { username: 'Legacy', profileImage: BASE64_IMAGE };

    await syncLoginStreak('test-uid', Date.now());

    const payload = lastPayload();
    expect('profileImage' in payload).toBe(false);
    expect(JSON.stringify(payload)).not.toContain('data:image');
  });

  it('Cloudinary の URL が Firestore にありても上書きしない（本次バグの回帰テスト）', async () => {
    // profile.tsx の saveProfile が書き込んだ URL が残っている状態
    mockServerData = { username: 'Tester', profileImage: REMOTE_IMAGE };

    // syncLoginStreak / incrementXP などが transaction.set を発行する
    await syncLoginStreak('test-uid', Date.now());
    await incrementXP('test-uid', 10);

    // 2回とも profileImage は payload に含まれない = Firestore の URL が保持される
    expect('profileImage' in lastPayload()).toBe(false);
    for (const call of mockSet.mock.calls) {
      expect('profileImage' in (call[1] as Record<string, unknown>)).toBe(false);
    }
  });

  it('戦績更新 (recordBattleResult) でも Cloudinary URL を上書きしない', async () => {
    mockServerData = { username: 'Tester', profileImage: REMOTE_IMAGE };

    await recordBattleResult('test-uid', 'win');

    expect('profileImage' in lastPayload()).toBe(false);
  });

  it('ローカルに画像が無い場合のみ Firestore の http(s) URL を復元する', async () => {
    mockServerData = { username: 'Tester', profileImage: REMOTE_IMAGE };

    await syncLoginStreak('test-uid', Date.now());

    expect(await readLocalProfileImage()).toBe(REMOTE_IMAGE);
  });

  it('ローカルに画像がある場合は http(s) URL でも上書きしない', async () => {
    await saveLocalProfileImage(BASE64_IMAGE);
    mockServerData = { username: 'Tester', profileImage: REMOTE_IMAGE };

    await syncLoginStreak('test-uid', Date.now());

    expect(await readLocalProfileImage()).toBe(BASE64_IMAGE);
  });

  it('ローカルキャッシュ (user_profile_cache) には画像を含めない', async () => {
    mockServerData = { username: 'Tester', profileImage: BASE64_IMAGE };

    await syncLoginStreak('test-uid', Date.now());

    const cached = await AsyncStorage.getItem('user_profile_cache');
    expect(cached).not.toBeNull();
    expect(cached).not.toContain('data:image');
    // profileImage キーごと除外されている（null で埋めない）
    expect('profileImage' in JSON.parse(cached as string)).toBe(false);
    // 画像以外の情報はキャッシュされる
    expect(JSON.parse(cached as string).username).toBe('Tester');
  });
});

describe('uploadProfileImageToCloudinary (Cloudinary 経由の画像共有)', () => {
  const CLOUD_NAME = 'test-cloud';
  const UPLOAD_PRESET = 'test-preset';
  const SECURE_URL = 'https://res.cloudinary.com/test-cloud/image/upload/v123/avatar.jpg';

  /**
   * 環境変数は vite.config.ts の `define` がグローバル定数へ埋め込むため、
   * テストでは globalThis へ直接設定して差し替える。
   */
  const g = globalThis as any;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  const withEnv = (env: Record<string, string | undefined>) => {
    g.__VITE_CLOUDINARY_CLOUD_NAME__ = env.VITE_CLOUDINARY_CLOUD_NAME;
    g.__VITE_CLOUDINARY_UPLOAD_PRESET__ = env.VITE_CLOUDINARY_UPLOAD_PRESET;
  };

  beforeEach(() => {
    withEnv({});
    fetchMock = jest.fn();
    g.fetch = fetchMock;
  });

  afterEach(() => {
    g.fetch = originalFetch;
    withEnv({});
  });

  it('環境変数が未設定なら警告して null を返す（通信しない）', async () => {
    withEnv({});

    expect(isCloudinaryConfigured()).toBe(false);
    expect(await uploadProfileImageToCloudinary(BASE64_IMAGE)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cloud_name か upload_preset の片方だけが空でも null を返す', async () => {
    withEnv({ VITE_CLOUDINARY_CLOUD_NAME: CLOUD_NAME });
    expect(isCloudinaryConfigured()).toBe(false);
    expect(await uploadProfileImageToCloudinary(BASE64_IMAGE)).toBeNull();

    withEnv({ VITE_CLOUDINARY_UPLOAD_PRESET: UPLOAD_PRESET });
    expect(isCloudinaryConfigured()).toBe(false);
    expect(await uploadProfileImageToCloudinary(BASE64_IMAGE)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Base64 を送信して secure_url を返す', async () => {
    withEnv({
      VITE_CLOUDINARY_CLOUD_NAME: CLOUD_NAME,
      VITE_CLOUDINARY_UPLOAD_PRESET: UPLOAD_PRESET,
    });
    expect(isCloudinaryConfigured()).toBe(true);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ secure_url: SECURE_URL }) });

    const url = await uploadProfileImageToCloudinary(BASE64_IMAGE);

    expect(url).toBe(SECURE_URL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = fetchMock.mock.calls[0];
    expect(requestUrl).toBe(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('upload_preset')).toBe(UPLOAD_PRESET);
    // 画像データも FormData として送信されている
    expect(String((init.body as FormData).get('file'))).toContain('data:image/jpeg;base64,');
  });

  it('既に http(s) URL の場合は再アップロードしない', async () => {
    withEnv({
      VITE_CLOUDINARY_CLOUD_NAME: CLOUD_NAME,
      VITE_CLOUDINARY_UPLOAD_PRESET: UPLOAD_PRESET,
    });

    expect(await uploadProfileImageToCloudinary(SECURE_URL)).toBe(SECURE_URL);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('HTTP エラー時は null を返し、例外を投げない', async () => {
    withEnv({
      VITE_CLOUDINARY_CLOUD_NAME: CLOUD_NAME,
      VITE_CLOUDINARY_UPLOAD_PRESET: UPLOAD_PRESET,
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });

    expect(await uploadProfileImageToCloudinary(BASE64_IMAGE)).toBeNull();
  });

  it('ネットワーク例外時も null を返し、例外を投げない', async () => {
    withEnv({
      VITE_CLOUDINARY_CLOUD_NAME: CLOUD_NAME,
      VITE_CLOUDINARY_UPLOAD_PRESET: UPLOAD_PRESET,
    });
    fetchMock.mockRejectedValueOnce(new Error('Network down'));

    expect(await uploadProfileImageToCloudinary(BASE64_IMAGE)).toBeNull();
  });

  it('レスポンスに secure_url が無ければ null を返す', async () => {
    withEnv({
      VITE_CLOUDINARY_CLOUD_NAME: CLOUD_NAME,
      VITE_CLOUDINARY_UPLOAD_PRESET: UPLOAD_PRESET,
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ error: { message: 'bad preset' } }) });

    expect(await uploadProfileImageToCloudinary(BASE64_IMAGE)).toBeNull();
  });

  it('アップロードされた URL は Firestore にそのまま保存できる形式', async () => {
    withEnv({
      VITE_CLOUDINARY_CLOUD_NAME: CLOUD_NAME,
      VITE_CLOUDINARY_UPLOAD_PRESET: UPLOAD_PRESET,
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ secure_url: SECURE_URL }) });

    const url = await uploadProfileImageToCloudinary(BASE64_IMAGE);

    // 相手のカードが参照できるよう http(s) URL として検証を通る
    expect(isRemoteProfileImageUrl(url)).toBe(true);
    // sanitize を通しても URL が保存される（Base64 のように空文字化されない）
    expect(sanitizeProfileImageForFirestore(url)).toBe(SECURE_URL);
  });
});

