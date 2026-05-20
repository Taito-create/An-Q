// app/sound.tsx - 修正版

export type SoundType = 'select' | 'decide' | 'complete' | 'question' | 'correct' | 'wrong';
export type BGMType = 'BGM1' | 'BGM2' | 'BGM3' | 'BGM4';
export type SEType = 'effect1' | 'effect2' | 'effect3' | 'effect4';

class SoundManager {
  private static sounds: { [key: string]: HTMLAudioElement | null } = {};
  private static bgm: HTMLAudioElement | null = null;
  private static initialized = false;
  private static bgmEnabled = true;
  private static currentBGM: BGMType = 'BGM1';
  private static currentSESet: SEType = 'effect1';
  private static bgmRate = 1.0;

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

    this.initialized = true;
    console.log('SoundManager initialized with 4 effect sets');
  }

  static async play(type: SoundType) {
    const key = `${this.currentSESet}_${type}`;
    const sound = this.sounds[key];
    if (sound) {
      sound.currentTime = 0;
      try {
        await sound.play();
        console.log(`🔊 Playing: ${type} (${this.currentSESet})`);
      } catch (e) {
        console.warn(`Failed to play ${type}:`, e);
      }
    } else {
      console.warn(`Sound not found: ${key}`);
    }
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
    try {
      const saved = localStorage.getItem('bgm_settings');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {}
    return { enabled: true, currentBGM: 'BGM1' };
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