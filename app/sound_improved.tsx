import { Audio } from 'expo-av';
import { STORAGE_KEYS, StorageHelper } from './constants/storageKeys';

// 音の種類を定義
export type SoundType = 'select' | 'decide' | 'complete' | 'question' | 'correct' | 'wrong';
export type BGMType = 'bgm' | 'bgm1' | 'bgm2' | 'bgm3' | 'bgm4';
export type SEType = 'effect1' | 'effect2' | 'effect3' | 'effect4';

/**
 * 改善版サウンドマネージャー
 * Map を使用してメモリリークを防止
 * StorageHelper を使用して一元管理
 */
export class SoundManager {
  private static sounds: Map<SoundType, Audio.Sound | null> = new Map();
  private static bgm: Audio.Sound | null = null;
  private static isInitialized = false;
  private static bgmEnabled = false;
  private static currentBGM: string = 'bgm';
  private static currentSESet: SEType = 'effect1';

  /**
   * すべての音声を事前に読み込む
   * Map を使用して効率的な管理
   */
  static async initialize() {
    if (this.isInitialized) return;
    
    // デフォルトはeffect1
    const soundFiles = {
      select:   require('../assets/sounds/effect1/select1.mp3'),
      decide:   require('../assets/sounds/effect1/decide1.mp3'),
      complete: require('../assets/sounds/effect1/complete1.mp3'),
      question: require('../assets/sounds/effect1/question1.mp3'),
      correct:  require('../assets/sounds/effect1/correct1.mp3'),
      wrong:    require('../assets/sounds/effect1/wrong1.mp3'),
    };

    try {
      for (const [key, file] of Object.entries(soundFiles)) {
        const { sound } = await Audio.Sound.createAsync(file);
        this.sounds.set(key as SoundType, sound);
      }
      this.isInitialized = true;
      console.log('SoundManager initialized successfully');
    } catch (error) {
      console.error('Sound initialization failed:', error);
    }
  }

  /**
   * BGM設定を読み込む
   */
  static async initializeBGM() {
    try {
      // StorageHelper を使用して設定を読み込み
      const bgmSettings = await this.getBGMSettings();
      this.bgmEnabled = bgmSettings.enabled;
      this.currentBGM = bgmSettings.currentBGM;
      
      if (this.bgmEnabled) {
        await this.loadBGM(this.currentBGM as BGMType);
      }
    } catch (error) {
      console.error('BGM initialization failed:', error);
      this.bgmEnabled = false;
    }
  }

  /**
   * BGMファイルを読み込む
   */
  static async loadBGM(bgmType: BGMType) {
    try {
      // 現在のBGMをアンロード
      if (this.bgm) {
        await this.bgm.unloadAsync();
        this.bgm = null;
      }

      // 新しいBGMを読み込み
      let bgmFile;
      try {
        switch (bgmType) {
          case 'bgm1':
            bgmFile = require('../assets/sounds/bgm/bgm1.mp3');
            break;
          case 'bgm2':
            bgmFile = require('../assets/sounds/bgm/bgm2.mp3');
            break;
          case 'bgm3':
            bgmFile = require('../assets/sounds/bgm/bgm3.mp3');
            break;
          case 'bgm4':
            bgmFile = require('../assets/sounds/bgm/bgm4.mp3');
            break;
          default:
            bgmFile = require('../assets/sounds/bgm/bgm1.mp3');
        }
      } catch (fileError) {
        bgmFile = require('../assets/sounds/bgm/bgm1.mp3');
      }
      
      const { sound } = await Audio.Sound.createAsync(
        bgmFile,
        { shouldPlay: false, isLooping: true }
      );
      
      this.bgm = sound;
      this.currentBGM = bgmType;

      // StorageHelper を使用して設定を保存
      await this.saveBGMSettings();
    } catch (error) {
      console.error(`Failed to load BGM ${bgmType}:`, error);
      this.bgm = null;
    }
  }

  /**
   * BGMを再生
   */
  static async playBGM() {
    try {
      if (!this.bgm) {
        await this.loadBGM(this.currentBGM as BGMType);
      }
      
      if (this.bgm && this.bgmEnabled) {
        await this.bgm.playAsync();
      }
    } catch (error) {
      console.error('Failed to play BGM:', error);
    }
  }

  /**
   * BGMを一時停止
   */
  static async pauseBGM() {
    try {
      if (this.bgm) {
        await this.bgm.pauseAsync();
      }
    } catch (error) {
      console.error('Failed to pause BGM:', error);
    }
  }

  /**
   * BGMを停止
   */
  static async stopBGM() {
    try {
      if (this.bgm) {
        await this.bgm.stopAsync();
      }
    } catch (error) {
      console.error('Failed to stop BGM:', error);
    }
  }

  /**
   * BGMのオン/オフを切り替え
   */
  static async toggleBGM() {
    this.bgmEnabled = !this.bgmEnabled;
    
    if (this.bgmEnabled) {
      await this.playBGM();
    } else {
      await this.pauseBGM();
    }
    
    await this.saveBGMSettings();
    return this.bgmEnabled;
  }

  /**
   * BGM音量を設定
   */
  static async setBGMVolume(volume: number) {
    try {
      if (this.bgm) {
        await this.bgm.setVolumeAsync(Math.max(0, Math.min(1, volume)));
      }
    } catch (error) {
      console.error('Failed to set BGM volume:', error);
    }
  }

  /**
   * BGM再生速度を設定
   */
  static async setBGMRate(rate: number) {
    try {
      if (this.bgm) {
        await this.bgm.setRateAsync(Math.max(0.25, Math.min(4.0, rate)), false);
      }
    } catch (error) {
      console.error('Failed to set BGM rate:', error);
    }
  }

  /**
   * BGM設定を取得
   */
  static async getBGMSettings() {
    try {
      const settings = await StorageHelper.getObject<{
        enabled: boolean;
        currentBGM: string;
      }>(STORAGE_KEYS.BGM_SETTINGS, {
        enabled: true,
        currentBGM: 'bgm'
      });
      return settings;
    } catch (error) {
      console.error('Failed to get BGM settings:', error);
      return { enabled: true, currentBGM: 'bgm' };
    }
  }

  /**
   * BGM設定を保存
   */
  static async saveBGMSettings() {
    try {
      const settings = {
        enabled: this.bgmEnabled,
        currentBGM: this.currentBGM
      };
      await StorageHelper.setObject(STORAGE_KEYS.BGM_SETTINGS, settings);
    } catch (error) {
      console.error('Failed to save BGM settings:', error);
    }
  }

  /**
   * 現在のBGM状態を取得
   */
  static getBGMStatus() {
    return {
      enabled: this.bgmEnabled,
      currentBGM: this.currentBGM,
      isPlaying: this.bgm !== null
    };
  }

  /**
   * BGM設定を更新して即適用
   */
  static async updateBGMSetting(enabled: boolean, bgmType?: BGMType, forceReload: boolean = false) {
    try {
      const wasEnabled = this.bgmEnabled;
      const sameBGM = !bgmType || bgmType === this.currentBGM;
      
      this.bgmEnabled = enabled;
      if (bgmType) {
        this.currentBGM = bgmType;
      }

      if (enabled) {
        // BGMが同じで強制リロードでなければ、再読み込みしない
        if (!forceReload && wasEnabled && sameBGM && this.bgm) {
          // 既に同じBGMが再生中なら何もしない
          console.log('BGM already playing, preventing reload');
        } else {
          // カスタムBGMが再生中なら停止
          if (typeof window !== 'undefined' && (window as any).__customBGMPlaying) {
            (window as any).__stopCustomBGM?.();
            (window as any).__customBGMPlaying = false;
          }
          
          if (this.bgm) {
            await this.bgm.unloadAsync();
            this.bgm = null;
          }
          await this.loadBGM(this.currentBGM as BGMType);
          await this.playBGM();
        }
      } else {
        await this.pauseBGM();
        if (this.bgm) {
          await this.bgm.unloadAsync();
          this.bgm = null;
        }
      }

      await this.saveBGMSettings();
    } catch (error) {
      console.error('Failed to update BGM setting:', error);
    }
  }

  /**
   * SEセットを設定して再読み込み
   */
  static async setSESet(seType: SEType) {
    try {
      this.currentSESet = seType;
      
      // すべての既存音をアンロード
      for (const [soundType, sound] of this.sounds.entries()) {
        if (sound) {
          await sound.unloadAsync();
        }
      }
      this.sounds.clear();

      // 新しい音声ファイルを読み込み
      const soundFiles = this.getSoundFiles(seType);
      
      for (const [soundType, soundFile] of Object.entries(soundFiles)) {
        try {
          const { sound } = await Audio.Sound.createAsync(soundFile);
          this.sounds.set(soundType as SoundType, sound);
        } catch (error) {
          console.error(`Failed to load ${soundType} sound:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to set SE set:', error);
    }
  }

  /**
   * SEセットに基づいて音声ファイルを取得
   */
  private static getSoundFiles(seType: SEType) {
    const effect1 = {
      select:   require('../assets/sounds/effect1/select1.mp3'),
      decide:   require('../assets/sounds/effect1/decide1.mp3'),
      complete: require('../assets/sounds/effect1/complete1.mp3'),
      question: require('../assets/sounds/effect1/question1.mp3'),
      correct:  require('../assets/sounds/effect1/correct1.mp3'),
      wrong:    require('../assets/sounds/effect1/wrong1.mp3'),
    };
    const effect2 = {
      select:   require('../assets/sounds/effect2/select2.mp3'),
      decide:   require('../assets/sounds/effect2/decide2.mp3'),
      complete: require('../assets/sounds/effect2/complete2.mp3'),
      question: require('../assets/sounds/effect2/question2.mp3'),
      correct:  require('../assets/sounds/effect2/correct2.mp3'),
      wrong:    require('../assets/sounds/effect2/wrong2.mp3'),
    };
    const effect3 = {
      select:   require('../assets/sounds/effect3/select3.mp3'),
      decide:   require('../assets/sounds/effect3/decide3.mp3'),
      complete: require('../assets/sounds/effect3/complete3.mp3'),
      question: require('../assets/sounds/effect3/question3.mp3'),
      correct:  require('../assets/sounds/effect3/correct3.mp3'),
      wrong:    require('../assets/sounds/effect3/wrong3.mp3'),
    };
    const effect4 = {
      select:   require('../assets/sounds/effect4/select4.mp3'),
      decide:   require('../assets/sounds/effect4/decide4.mp3'),
      complete: require('../assets/sounds/effect4/complete4.mp3'),
      question: require('../assets/sounds/effect4/question4.mp3'),
      correct:  require('../assets/sounds/effect4/correct4.mp3'),
      wrong:    require('../assets/sounds/effect4/wrong4.mp3'),
    };

    switch (seType) {
      case 'effect2': return effect2;
      case 'effect3': return effect3;
      case 'effect4': return effect4;
      // 旧名称との互換性
      case 'effect1':
      default:
        return effect1;
    }
  }

  /**
   * 現在のSEセットを取得
   */
  static getCurrentSESet(): SEType {
    return this.currentSESet;
  }

  /**
   * すべての音声をクリーンアップ
   * メモリリークを防止
   */
  static async cleanup() {
    try {
      // すべての音声効果をアンロード
      for (const [soundType, sound] of this.sounds.entries()) {
        if (sound) {
          await sound.unloadAsync();
        }
      }
      this.sounds.clear();
      
      // BGMをアンロード
      if (this.bgm) {
        await this.bgm.unloadAsync();
        this.bgm = null;
      }
      
      this.isInitialized = false;
      console.log('SoundManager cleanup completed');
    } catch (error) {
      console.error('Failed to cleanup sounds:', error);
    }
  }

  /**
   * 指定された種類の音を再生
   */
  static async play(type: SoundType) {
    try {
      if (!this.isInitialized) await this.initialize();
      
      const sound = this.sounds.get(type);
      if (sound) {
        await sound.replayAsync();
      }
    } catch (error) {
      console.error(`Failed to play ${type} sound:`, error);
    }
  }

  /**
   * 現在の音声状態を取得
   */
  static getStatus() {
    return {
      isInitialized: this.isInitialized,
      soundsLoaded: this.sounds.size,
      bgmEnabled: this.bgmEnabled,
      currentBGM: this.currentBGM,
      currentSESet: this.currentSESet
    };
  }
}
