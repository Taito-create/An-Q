// app/sound.tsx - 修正版

import { safeParseObject } from './utils/storageUtils';

export type SoundType = 'select' | 'decide' | 'complete' | 'question' | 'correct' | 'wrong' | 'delete';
export type BGMType = 'BGM1' | 'BGM2' | 'BGM3' | 'BGM4';
export type SEType = 'effect1' | 'effect2' | 'effect3' | 'effect4';

const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent);

class SoundManager {
  private static sounds: { [key: string]: HTMLAudioElement | null } = {};
  private static bgm: HTMLAudioElement | null = null;
  private static initialized = false;
  private static bgmEnabled = true;
  private static currentBGM: BGMType = 'BGM1';
  private static currentSESet: SEType = 'effect1';
  private static bgmRate = 1.0;
  private static seEnabled = true;

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
          console.log(`✅ Loaded: ${path}`);
        });

        // 読み込みエラーのハンドリング
        audio.addEventListener('error', (e) => {
          console.error(`❌ Failed: ${path}`, e);
        });

        this.sounds[`${set}_${type}`] = audio;
      }
    }

    // 効果音のON/OFF設定を読み込み
    const savedSE = localStorage.getItem('se_enabled');
    this.seEnabled = savedSE !== 'false';
    console.log('🔊 SE enabled:', this.seEnabled);

    this.initialized = true;
    console.log('SoundManager initialized with 4 effect sets');
  }

  static async play(type: SoundType) {
    // ★ 毎回 localStorage から直接読み込む（最も確実な方法）
    const seEnabled = localStorage.getItem('se_enabled') !== 'false';
    
    console.log(`🔊 Play called: ${type}, SE Enabled: ${seEnabled}`); // デバッグ用
    
    if (!seEnabled) {
      console.log(`🔇 SE is OFF, skipping: ${type}`);
      return;
    }
    
    const key = `${this.currentSESet}_${type}`;
    const sound = this.sounds[key];
    if (sound) {
      sound.currentTime = 0;
      // スマホの場合は音量を小さく
      const volume = isMobile ? 0.4 : 0.7;
      sound.volume = volume;
      try {
        await sound.play();
        console.log(`✅ Played: ${type}`);
      } catch (e) {
        console.warn(`❌ Failed: ${type}`, e);
      }
    } else {
      console.warn(`❌ Sound not found: ${key}`);
    }
  }

  static async setSEEnabled(enabled: boolean) {
    this.seEnabled = enabled;
    localStorage.setItem('se_enabled', enabled.toString());
    console.log('🔊 SE enabled set to:', enabled);
  }

  static async setSESet(set: SEType) {
    this.currentSESet = set;
    console.log(`🎵 SE set changed to: ${set}`);
    // 設定変更後にそのセットの決定音を鳴らす
    await this.play('decide');
  }

  static async initializeBGM() {
    const settings = await this.getBGMSettings();
    this.bgmEnabled = settings.enabled;
    this.currentBGM = settings.currentBGM as BGMType;
    
    if (this.bgmEnabled) {
      await this.loadBGM(this.currentBGM);
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
    
    this.bgm = audio;
    this.currentBGM = bgmType;
    
    if (this.bgmEnabled) {
      await this.playBGM();
    }
    
    await this.saveBGMSettings();
  }

  static async playBGM() {
    if (this.bgm && this.bgmEnabled) {
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
      await this.loadBGM(bgmType);
    } else if (enabled) {
      await this.playBGM();
    } else {
      await this.pauseBGM();
    }
    await this.saveBGMSettings();
  }

  static async setBGMRate(rate: number) {
    this.bgmRate = rate;
    if (this.bgm) {
      this.bgm.playbackRate = rate;
    }
  }

  static async getBGMSettings() {
    const defaultSettings = { enabled: true, currentBGM: 'BGM1' };
    const saved = localStorage.getItem('bgm_settings');
    return safeParseObject(saved, defaultSettings);
  }

  private static async saveBGMSettings() {
    const settings = {
      enabled: this.bgmEnabled,
      currentBGM: this.currentBGM
    };
    localStorage.setItem('bgm_settings', JSON.stringify(settings));
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
