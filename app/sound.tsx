import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useExternalAudioDetector } from './externalAudioDetector';

// 音の種類を定義
export type SoundType = 'select' | 'decide' | 'complete' | 'question' | 'correct' | 'wrong';
export type BGMType = 'bgm' | 'bgm1' | 'bgm2' | 'bgm3' | 'bgm4';
export type SEType = 'effect1' | 'effect2' | 'effect3' | 'effect4';

export class SoundManager {
  private static sounds: { [key: string]: Audio.Sound | null } = {};
  private static bgm: Audio.Sound | null = null;
  private static isInitialized = false;
  private static bgmEnabled = false;
  private static currentBGM: string = 'bgm';
  private static currentSESet: SEType = 'effect1';

  // 全て音声を事前に読み込む
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
        this.sounds[key] = sound;
      }
      this.isInitialized = true;
    } catch (error) {
      console.error('Sound load failed:', error);
    }
  }

  // Initialize BGM
  static async initializeBGM() {
    try {
      // Load BGM settings from AsyncStorage
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

  // Load BGM file
  static async loadBGM(bgmType: BGMType) {
    try {
      
      // Unload current BGM if exists
      if (this.bgm) {
        await this.bgm.unloadAsync();
        this.bgm = null;
      }

      // Load new BGM based on type
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

      // Save settings
      await this.saveBGMSettings();
    } catch (error) {
      console.error(`Failed to load BGM ${bgmType}:`, error);
      // Continue without BGM if file doesn't exist
      this.bgm = null;
    }
  }

  // Play BGM
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

  // Pause BGM
  static async pauseBGM() {
    try {
      if (this.bgm) {
        await this.bgm.pauseAsync();
      }
    } catch (error) {
      console.error('Failed to pause BGM:', error);
    }
  }

  // Stop BGM
  static async stopBGM() {
    try {
      if (this.bgm) {
        await this.bgm.stopAsync();
      }
    } catch (error) {
      console.error('Failed to stop BGM:', error);
    }
  }

  // Toggle BGM on/off
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

  // Set BGM volume
  static async setBGMVolume(volume: number) {
    try {
      if (this.bgm) {
        await this.bgm.setVolumeAsync(Math.max(0, Math.min(1, volume)));
      }
    } catch (error) {
      console.error('Failed to set BGM volume:', error);
    }
  }

  // Set BGM playback rate (speed)
  static async setBGMRate(rate: number) {
    try {
      if (this.bgm) {
        await this.bgm.setRateAsync(Math.max(0.25, Math.min(4.0, rate)), true);
      }
    } catch (error) {
      console.error('Failed to set BGM rate:', error);
    }
  }

  // Get BGM settings
  static async getBGMSettings() {
    try {
      const settings = await AsyncStorage.getItem('bgm_settings');
      if (settings) {
        return JSON.parse(settings);
      }
      return { enabled: true, currentBGM: 'bgm' };
    } catch (error) {
      console.error('Failed to get BGM settings:', error);
      return { enabled: true, currentBGM: 'bgm' };
    }
  }

  // Save BGM settings
  static async saveBGMSettings() {
    try {
      const settings = {
        enabled: this.bgmEnabled,
        currentBGM: this.currentBGM
      };
      await AsyncStorage.setItem('bgm_settings', JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save BGM settings:', error);
    }
  }

  // Get current BGM status
  static getBGMStatus() {
    return {
      enabled: this.bgmEnabled,
      currentBGM: this.currentBGM,
      isPlaying: this.bgm !== null
    };
  }

  // Update BGM setting and apply immediately
  static async updateBGMSetting(enabled: boolean, bgmType?: BGMType) {
    try {
      
      // Update internal state
      this.bgmEnabled = enabled;
      if (bgmType) {
        this.currentBGM = bgmType;
      }

      // Apply changes immediately
      if (enabled) {
        // Unload current BGM if exists
        if (this.bgm) {
          await this.bgm.unloadAsync();
          this.bgm = null;
        }
        
        // Load and play new BGM
        await this.loadBGM(this.currentBGM as BGMType);
        await this.playBGM();
      } else {
        // Stop and unload BGM
        await this.pauseBGM();
        if (this.bgm) {
          await this.bgm.unloadAsync();
          this.bgm = null;
        }
      }

      // Save settings to AsyncStorage
      await this.saveBGMSettings();
    } catch (error) {
      console.error('Failed to update BGM setting:', error);
    }
  }

  // Set SE set and reload sounds
  static async setSESet(seType: SEType) {
    try {
      
      // Update current SE set
      this.currentSESet = seType;
      
      // Unload all existing sounds
      for (const soundType in this.sounds) {
        if (this.sounds[soundType]) {
          await this.sounds[soundType]?.unloadAsync();
          this.sounds[soundType] = null;
        }
      }
      
      // Load new sound files based on SE set
      const soundFiles = this.getSoundFiles(seType);
      
      for (const [soundType, soundFile] of Object.entries(soundFiles)) {
        try {
          const { sound } = await Audio.Sound.createAsync(soundFile);
          this.sounds[soundType] = sound;
        } catch (error) {
          console.error(`Failed to load ${soundType} sound:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to set SE set:', error);
    }
  }

  // Get sound files based on SE set
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
      case 'effect1':
      default:
        return effect1;
    }
  }

  // Get current SE set
  static getCurrentSESet(): SEType {
    return this.currentSESet;
  }

  // Cleanup all sounds
  static async cleanup() {
    try {
      // Unload all sound effects
      for (const soundType in this.sounds) {
        if (this.sounds[soundType]) {
          await this.sounds[soundType]?.unloadAsync();
          this.sounds[soundType] = null;
        }
      }
      
      // Unload BGM
      if (this.bgm) {
        await this.bgm.unloadAsync();
        this.bgm = null;
      }
      
      this.isInitialized = false;
    } catch (error) {
      console.error('Failed to cleanup sounds:', error);
    }
  }

  // 外部音楽検出のインスタンス
  private static externalAudioDetector: any = null;

  // 外部音楽検出を設定
  static setExternalAudioDetector(detector: any) {
    this.externalAudioDetector = detector;
  }

  // 指定した種類の音を再生する
  static async play(type: SoundType) {
    try {
      if (!this.isInitialized) await this.initialize();
      
      // 外部音楽再生中はBGMを停止
      if (this.externalAudioDetector?.isPlaying && this.bgm) {
        await this.pauseBGM();
      }
      
      const sound = this.sounds[type];
      if (sound) {
        // 再生前に停止してから再生（タイミングずれ防止）
        await sound.stopAsync();
        await sound.setPositionAsync(0);
        
        // 外部音楽再生中は効果音音量を調整
        const volume = this.externalAudioDetector?.isPlaying ? 0.3 : 1.0;
        await sound.setVolumeAsync(volume);
        
        await sound.playAsync();
      }
    } catch (error) {
      console.error(`Failed to play ${type} sound:`, error);
    }
  }
}