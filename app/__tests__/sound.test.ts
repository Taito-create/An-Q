/// <reference types="jest" />
/**
 * BGM 設定が無視されて強制再生される不具合の回帰テスト。
 *
 * 背景:
 *  - 保存先が `bgm_enabled` (生文字列) と `bgm_settings` (JSON) に分裂していたため、
 *    トグルを OFF にしても `bgm_settings.enabled` が true のまま残り、
 *    起動時 (RootLayout) に BGM が再生されてしまっていた
 *  - さらに RootLayout が設定を見ずに playBGM() を無条件で呼んでいた
 *
 * 検証内容:
 *  1. 保存先が `bgm_settings` に統一され、旧キーからは一度だけ移行されること
 *  2. OFF 設定では初期化しても再生されないこと / ON なら再生されること
 *  3. OFF の状態で playBGM() を呼ばれても再生されないこと
 */

// ─── node 環境用スタブ（localStorage / Audio）───
const memoryStore = new Map<string, string>();

const localStorageStub = {
  getItem: (key: string) => (memoryStore.has(key) ? (memoryStore.get(key) as string) : null),
  setItem: (key: string, value: string) => {
    memoryStore.set(key, String(value));
  },
  removeItem: (key: string) => {
    memoryStore.delete(key);
  },
  clear: () => {
    memoryStore.clear();
  },
  key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
  get length() {
    return memoryStore.size;
  },
};

const audioPlayMock = jest.fn(async () => {});

class MockAudio {
  src = '';
  loop = false;
  volume = 1;
  playbackRate = 1;
  currentTime = 0;
  preload = 'auto';
  paused = true;
  constructor(_src?: string) {}
  play = async () => {
    await audioPlayMock();
    this.paused = false;
  };
  pause = () => {
    this.paused = true;
  };
  addEventListener = () => {};
}

(globalThis as any).localStorage = localStorageStub;
(globalThis as any).Audio = MockAudio;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
    multiGet: jest.fn(async () => []),
    multiSet: jest.fn(async () => undefined),
    multiRemove: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
  },
}));

/** テストごとに SoundManager を初期状態で読み込み直す */
async function loadSoundManager() {
  jest.resetModules();
  return await import('../sound');
}

/** bgm_settings の中身を読む */
function readSavedSettings(key: string): any {
  return JSON.parse(localStorageStub.getItem(key) as string);
}

beforeEach(() => {
  memoryStore.clear();
  audioPlayMock.mockClear();
});


describe('BGM設定の保存先（bgm_settings への統一）', () => {
  it('未設定時は既定値が OFF（bgm_enabled を書かない状態でも鳴らない）', async () => {
    const { SoundManager, DEFAULT_BGM_ENABLED } = await loadSoundManager();

    const settings = await SoundManager.getBGMSettings();

    expect(DEFAULT_BGM_ENABLED).toBe(false);
    expect(settings.enabled).toBe(false);
    expect(settings.currentBGM).toBe('BGM1');
  });

  it('旧キー bgm_enabled しか無い場合は bgm_settings へ移行する', async () => {
    const { SoundManager, BGM_SETTINGS_KEY } = await loadSoundManager();
    localStorageStub.setItem('bgm_enabled', 'false');

    const settings = await SoundManager.getBGMSettings();

    expect(settings.enabled).toBe(false);
    expect(readSavedSettings(BGM_SETTINGS_KEY)).toEqual({ enabled: false, currentBGM: 'BGM1' });
  });

  it('旧キー bgm_enabled が true なら ON を引き継ぐ', async () => {
    const { SoundManager, BGM_SETTINGS_KEY } = await loadSoundManager();
    localStorageStub.setItem('bgm_enabled', 'true');

    const settings = await SoundManager.getBGMSettings();

    expect(settings.enabled).toBe(true);
    expect(readSavedSettings(BGM_SETTINGS_KEY).enabled).toBe(true);
  });

  it('bgm_settings の enabled が真偽値以外なら既定値 (OFF) にする', async () => {
    const { SoundManager, BGM_SETTINGS_KEY } = await loadSoundManager();
    localStorageStub.setItem(BGM_SETTINGS_KEY, JSON.stringify({ enabled: 'false', currentBGM: 'BGM2' }));

    const settings = await SoundManager.getBGMSettings();

    expect(settings.enabled).toBe(false);
    expect(settings.currentBGM).toBe('BGM2');
  });

  it('保存時に後方互換キー bgm_enabled にも同じ値を書き込む', async () => {
    const { SoundManager, BGM_SETTINGS_KEY, LEGACY_BGM_ENABLED_KEY } = await loadSoundManager();
    localStorageStub.setItem(BGM_SETTINGS_KEY, JSON.stringify({ enabled: true, currentBGM: 'BGM1' }));

    await SoundManager.initializeBGM();
    await SoundManager.updateBGMSetting(false);

    expect(readSavedSettings(BGM_SETTINGS_KEY)).toEqual({ enabled: false, currentBGM: 'BGM1' });
    expect(localStorageStub.getItem(LEGACY_BGM_ENABLED_KEY)).toBe('false');
  });
});

describe('OFF 時に BGM が再生されないこと（不具合の直接検証）', () => {
  it('OFF で初期化すると音源がロードされず再生もされない', async () => {
    const { SoundManager, BGM_SETTINGS_KEY } = await loadSoundManager();
    localStorageStub.setItem(BGM_SETTINGS_KEY, JSON.stringify({ enabled: false, currentBGM: 'BGM2' }));

    await SoundManager.initializeBGM();

    const status = SoundManager.getBGMStatus();
    expect(status.enabled).toBe(false);
    expect(status.currentBGM).toBe('BGM2');
    expect(audioPlayMock).not.toHaveBeenCalled();
  });

  it('OFF の状態で playBGM() を直接呼んでも再生されない（RootLayout の強制再生対策）', async () => {
    const { SoundManager, BGM_SETTINGS_KEY } = await loadSoundManager();
    localStorageStub.setItem(BGM_SETTINGS_KEY, JSON.stringify({ enabled: false, currentBGM: 'BGM1' }));

    await SoundManager.initializeBGM();
    await SoundManager.playBGM();

    expect(audioPlayMock).not.toHaveBeenCalled();
  });

  it('ON に切り替え後は再生され、設定も保存される', async () => {
    const { SoundManager, BGM_SETTINGS_KEY } = await loadSoundManager();
    localStorageStub.setItem(BGM_SETTINGS_KEY, JSON.stringify({ enabled: false, currentBGM: 'BGM1' }));
    await SoundManager.initializeBGM();
    audioPlayMock.mockClear();

    await SoundManager.updateBGMSetting(true, 'BGM3' as any);

    expect(audioPlayMock).toHaveBeenCalledTimes(1);
    expect(SoundManager.getBGMStatus()).toMatchObject({ enabled: true, currentBGM: 'BGM3' });
    expect(readSavedSettings(BGM_SETTINGS_KEY)).toEqual({ enabled: true, currentBGM: 'BGM3' });
  });

  it('ON で初期化すると currentBGM が再生される', async () => {
    const { SoundManager, BGM_SETTINGS_KEY } = await loadSoundManager();
    localStorageStub.setItem(BGM_SETTINGS_KEY, JSON.stringify({ enabled: true, currentBGM: 'BGM3' }));

    await SoundManager.initializeBGM();

    expect(audioPlayMock).toHaveBeenCalledTimes(1);
    expect(SoundManager.getBGMStatus().enabled).toBe(true);
  });

  it('OFF への切り替え後は playBGM() を呼んでも再生されない', async () => {
    const { SoundManager, BGM_SETTINGS_KEY } = await loadSoundManager();
    localStorageStub.setItem(BGM_SETTINGS_KEY, JSON.stringify({ enabled: true, currentBGM: 'BGM1' }));
    await SoundManager.initializeBGM();
    audioPlayMock.mockClear();

    await SoundManager.updateBGMSetting(false);
    await SoundManager.playBGM();

    expect(audioPlayMock).not.toHaveBeenCalled();
    expect(SoundManager.getBGMStatus().enabled).toBe(false);
  });
});
