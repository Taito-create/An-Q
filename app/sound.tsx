// app/sound.tsx - 修正版

import { safeParseObject } from './utils/storageUtils';
import { STORAGE_KEYS } from './constants/storageKeys';

export type SoundType = 'select' | 'decide' | 'complete' | 'question' | 'correct' | 'wrong' | 'delete';
export type BGMType = 'BGM1' | 'BGM2' | 'BGM3' | 'BGM4';
export type SEType = 'effect1' | 'effect2' | 'effect3' | 'effect4';

const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent);

// ─────────────────────────────────────────────
// BGM 設定の保存先（唯一のキー）
// 旧実装は `bgm_enabled` ('true'/'false' の生文字列) と
// `bgm_settings` (JSON) の2つに分かれていたため、トグルを OFF にしても
// bgm_settings.enabled が true のまま残り、起動時に BGM が再生される不整合が起きていた。
// 以後は `bgm_settings` を正とし、`bgm_enabled` は後方互換のミラーとしてのみ書く。
// ─────────────────────────────────────────────
export const BGM_SETTINGS_KEY = STORAGE_KEYS.BGM_SETTINGS;
export const LEGACY_BGM_ENABLED_KEY = STORAGE_KEYS.BGM_ENABLED;
/** 未設定時の BGM 既定値（RootLayout が設定する既定＝OFF に合わせる） */
export const DEFAULT_BGM_ENABLED = false;
const DEFAULT_BGM_SETTINGS = { enabled: DEFAULT_BGM_ENABLED, currentBGM: 'BGM1' };

class SoundManager {
  private static sounds: { [key: string]: HTMLAudioElement | null } = {};
  private static bgm: HTMLAudioElement | null = null;
  private static initialized = false;
  private static bgmEnabled = true;
  private static currentBGM: BGMType = 'BGM1';
  private static currentSESet: SEType = 'effect1';
  private static bgmRate = 1.0;
  private static seEnabled = true;
  // 外部音楽検知時の全体音量倍率（0〜1。BGM・SE の両方に掛ける）
  private static globalVolumeMultiplier = 1.0;

  static async initialize() {
    if (this.initialized) return;

    const effectSets: SEType[] = ['effect1', 'effect2', 'effect3', 'effect4'];
    const soundTypes: SoundType[] = ['select', 'decide', 'complete', 'question', 'correct', 'wrong'];

    for (const set of effectSets) {
      // フォルダ名から数字を抽出（例: 'effect2' → '2'）
      const setNumber = set.slice(-1);

      for (const type of soundTypes) {
        // ファイル名: select2.mp3, decide2.mp3 など
        const fileName = `${type}${setNumber}.mp3`;
        const path = `/sounds/${set}/${fileName}`;
        console.log(`Loading: ${path}`);

        const audio = new Audio(path);
        audio.preload = 'auto';

        // 読み込み成功時の確認
        audio.addEventListener('canplaythrough', () => {
          console.log(` Loaded: ${path}`);
        });

        // 読み込みエラーのハンドリング
        audio.addEventListener('error', (e) => {
          console.error(` Failed: ${path}`, e);
        });

        this.sounds[`${set}_${type}`] = audio;
      }
    }

    // 効果音のON/OFF設定を読み込み
    const savedSE = localStorage.getItem('se_enabled');
    this.seEnabled = savedSE !== 'false';
    console.log(' SE enabled:', this.seEnabled);

    this.initialized = true;
    console.log('SoundManager initialized with 4 effect sets');
  }

  static async play(type: SoundType) {
    //  毎回 localStorage から直接読み込む（最も確実な方法）
    const seEnabled = localStorage.getItem('se_enabled') !== 'false';
    
    console.log(` Play called: ${type}, SE Enabled: ${seEnabled}`); // デバッグ用
    
    if (!seEnabled) {
      console.log(` SE is OFF, skipping: ${type}`);
      return;
    }
    
    const key = `${this.currentSESet}_${type}`;
    const sound = this.sounds[key];
    if (sound) {
      sound.currentTime = 0;
      // スマホの場合は音量を小さく（外部音楽検知時はさらに倍率を掛ける）
      const baseVolume = isMobile ? 0.4 : 0.7;
      sound.volume = Math.max(0, Math.min(1, baseVolume * this.globalVolumeMultiplier));
      try {
        await sound.play();
        console.log(` Played: ${type}`);
      } catch (e) {
        console.warn(` Failed: ${type}`, e);
      }
    } else {
      console.warn(` Sound not found: ${key}`);
    }
  }

  static async setSEEnabled(enabled: boolean) {
    this.seEnabled = enabled;
    localStorage.setItem('se_enabled', enabled.toString());
    console.log(' SE enabled set to:', enabled);
  }

  static async setSESet(set: SEType) {
    this.currentSESet = set;
    console.log(` SE set changed to: ${set}`);
    // 設定変更後にそのセットの決定音を鳴らす
    await this.play('decide');
  }

  /**
   * 外部音楽検知による全体音量倍率（0〜1）を設定する。
   * SE（play 時）と 再生中の BGM の両方に即時反映される。
   */
  static setGlobalVolumeMultiplier(multiplier: number) {
    const clamped = Math.max(0, Math.min(1, multiplier));
    this.globalVolumeMultiplier = clamped;
    if (this.bgm) {
      this.bgm.volume = clamped;
    }
    console.log(' Global volume multiplier set to:', clamped);
  }

  static getGlobalVolumeMultiplier(): number {
    return this.globalVolumeMultiplier;
  }

  static async initializeBGM() {
    const settings = await this.getBGMSettings();
    this.bgmEnabled = settings.enabled;
    this.currentBGM = (settings.currentBGM as BGMType) || 'BGM1';

    console.log(' BGM settings:', settings);

    if (this.bgmEnabled) {
      await this.loadBGM(this.currentBGM);
    } else {
      // OFF のときは音源を読み込まない（音源があると playBGM で鳴ってしまう余地を残さない）
      if (this.bgm) {
        this.bgm.pause();
      }
      console.log(' BGM is OFF, skipping load/playback');
    }
  }

  static async loadBGM(bgmType: BGMType) {
    if (this.bgm) {
      this.bgm.pause();
      this.bgm = null;
    }
    
    const audio = new Audio();
    audio.loop = true;
    audio.playbackRate = this.bgmRate;
    audio.src = `/sounds/BGM/${bgmType}.mp3`;  // src を個別に設定
    audio.volume = this.globalVolumeMultiplier;
    
    this.bgm = audio;
    this.currentBGM = bgmType;
    
    if (this.bgmEnabled) {
      await this.playBGM();
    }
    
    await this.saveBGMSettings();
  }

  static async playBGM() {
    if (!this.bgmEnabled) {
      // 設定が OFF のときは絶対に再生しない（起動時の強制再生対策の最終ガード）
      console.log(' BGM is OFF, playBGM skipped');
      return;
    }
    if (this.bgm) {
      this.bgm.volume = this.globalVolumeMultiplier;
      try {
        await this.bgm.play();
        console.log('BGM playing');
      } catch (e) {
        console.warn('BGM play failed (user interaction needed):', e);
      }
    }
  }

  static async pauseBGM() {
    if (this.bgm) {
      this.bgm.pause();
    }
  }

  static async updateBGMSetting(enabled: boolean, bgmType?: BGMType) {
    this.bgmEnabled = enabled;

    if (bgmType) {
      // loadBGM 内で「enabled なら再生」+ 設定保存まで行う
      await this.loadBGM(bgmType);
      return;
    }

    if (enabled) {
      if (this.bgm) {
        await this.playBGM();
        await this.saveBGMSettings();
      } else {
        // OFF 起動などで音源が未ロードの場合は、現在のプリセットを読み込んで再生する
        await this.loadBGM(this.currentBGM || 'BGM1');
      }
    } else {
      await this.pauseBGM();
      await this.saveBGMSettings();
    }
  }

  static async setBGMRate(rate: number) {
    this.bgmRate = rate;
    if (this.bgm) {
      this.bgm.playbackRate = rate;
    }
  }

  /**
   * BGM 設定を読み出す（保存先は `bgm_settings` の1箇所のみ）。
   * - 未保存の場合は旧キー `bgm_enabled` から一度だけ移行する
   * - それも無い場合は既定値（OFF）を使う
   */
  static async getBGMSettings(): Promise<{ enabled: boolean; currentBGM: string }> {
    const saved = localStorage.getItem(BGM_SETTINGS_KEY);

    if (saved) {
      const parsed = safeParseObject(saved, DEFAULT_BGM_SETTINGS);
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_BGM_SETTINGS.enabled,
        currentBGM: typeof parsed.currentBGM === 'string' && parsed.currentBGM
          ? parsed.currentBGM
          : DEFAULT_BGM_SETTINGS.currentBGM,
      };
    }

    // 旧キー (`bgm_enabled`) からの移行：'true' のときだけ ON として引き継ぐ
    const legacy = localStorage.getItem(LEGACY_BGM_ENABLED_KEY);
    const migrated = {
      enabled: legacy === null ? DEFAULT_BGM_ENABLED : legacy === 'true',
      currentBGM: DEFAULT_BGM_SETTINGS.currentBGM,
    };
    try {
      localStorage.setItem(BGM_SETTINGS_KEY, JSON.stringify(migrated));
    } catch (e) {
      console.warn('Failed to migrate BGM settings:', e);
    }
    return migrated;
  }

  /** BGM 設定を保存する（`bgm_enabled` には後方互換のミラーを書く） */
  private static async saveBGMSettings() {
    const settings = {
      enabled: this.bgmEnabled,
      currentBGM: this.currentBGM
    };
    localStorage.setItem(BGM_SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(LEGACY_BGM_ENABLED_KEY, String(this.bgmEnabled));
  }

  static getBGMStatus() {
    return {
      enabled: this.bgmEnabled,
      currentBGM: this.currentBGM,
      isPlaying: this.bgm !== null && !this.bgm.paused
    };
  }
}

export { SoundManager };
