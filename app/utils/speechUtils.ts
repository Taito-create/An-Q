// テキスト読み上げユーティリティ (Web Speech API)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';

// カスタム読み辞書（必要に応じて拡張）
const readingDictionary: Record<string, string> = {
  '森鷗外': 'もりおうがい',
  '舞姫': 'まいひめ',
  '津和野': 'つわの',
  '鴎外': 'おうがい',
};

// テキストにカスタム辞書を適用
const applyCustomReadings = (text: string): string => {
  let result = text;
  for (const [key, value] of Object.entries(readingDictionary)) {
    result = result.replace(new RegExp(key, 'g'), value);
  }
  return result;
};

// ============================================================
// デバッグ: 利用可能なボイス一覧をコンソールに出力
// ============================================================
export const logAvailableVoices = (): void => {
  if (!window.speechSynthesis) {
    console.log('Speech synthesis not supported');
    return;
  }
  const voices = window.speechSynthesis.getVoices();
  console.log('🔊 Available voices:');
  voices.forEach((voice, i) => {
    console.log(
      `  ${i + 1}. ${voice.name} (${voice.lang}) - ${voice.localService ? 'local' : 'network'}${voice.default ? ' [default]' : ''}`
    );
  });
};

// ============================================================
// ボイスプリセット
// ============================================================
export type VoicePreset = 'standard' | 'slow' | 'yukkuri' | 'energetic' | 'calm' | 'deep';

export interface VoiceConfig {
  rate: number;   // 0.1 - 10
  pitch: number;  // 0 - 2
  voiceName?: string;
}

const voicePresets: Record<VoicePreset, VoiceConfig> = {
  standard: { rate: 0.9, pitch: 1.0 },

  // 🐢 ゆっくりボイス風 - 極限まで近づける
  // 特徴: 非常に遅く、低めのピッチ、語尾が伸びる感じ
  yukkuri: {
    rate: 0.55,   // 非常に遅く (標準の半分以下)
    pitch: 0.85,  // 低め
  },

  // 🐌 さらにゆっくり (極限)
  slow: {
    rate: 0.4,    // 極端に遅い
    pitch: 0.9,
  },

  // ⚡ 元気な声
  energetic: {
    rate: 1.1,
    pitch: 1.3,   // 高め
  },

  // 😌 落ち着いた声
  calm: {
    rate: 0.75,
    pitch: 0.9,
  },

  // 🔊 深い声
  deep: {
    rate: 0.8,
    pitch: 0.6,   // 非常に低い
  },
};

// プリセットの表示名（日本語）
export const voicePresetLabels: Record<VoicePreset, string> = {
  standard: 'スタンダード',
  slow: '🐌 極限ゆっくり',
  yukkuri: '🐢 ゆっくりボイス風',
  energetic: '⚡ 元気な声',
  calm: '😌 落ち着いた声',
  deep: '🔊 深い声',
};

// プリセットの説明（日本語）
export const voicePresetDescriptions: Record<VoicePreset, string> = {
  standard: '標準的な読み上げ',
  slow: '極端に遅い読み上げ',
  yukkuri: '非常に遅く低めのピッチ',
  energetic: '速めで高めの元気な声',
  calm: 'ゆったりとした落ち着いた声',
  deep: '非常に低い声',
};

// ============================================================
// プリセットの保存・取得
// ============================================================
export const getStoredVoicePreset = async (): Promise<VoicePreset> => {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.VOICE_PRESET);
    if (value && value in voicePresets) {
      return value as VoicePreset;
    }
  } catch (e) {
    console.warn('Failed to load voice preset:', e);
  }
  return 'standard';
};

export const setStoredVoicePreset = async (preset: VoicePreset): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.VOICE_PRESET, preset);
  } catch (e) {
    console.warn('Failed to save voice preset:', e);
  }
};

// ============================================================
// 音声エンジンの初期化（voiceschanged 対応）
// ============================================================
let voicesReady = false;

export const initSpeechVoices = (): void => {
  if (!window.speechSynthesis) return;

  const tryLoad = () => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      voicesReady = true;
    }
  };

  tryLoad();

  if (!voicesReady) {
    window.speechSynthesis.addEventListener('voiceschanged', tryLoad);
  }
};

// ============================================================
// 拡張された音声読み上げ関数
// ============================================================
export const speakText = (
  text: string,
  lang: string = 'ja-JP',
  preset: VoicePreset = 'standard',
  customRate?: number,
  customPitch?: number
): Promise<void> => {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      console.warn('Speech synthesis not supported');
      resolve();
      return;
    }

    // 既存の音声をキャンセル（安全に）
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}

    // プリセット設定を取得
    const config = voicePresets[preset] || voicePresets.standard;
    const rate = customRate ?? config.rate;
    const pitch = customPitch ?? config.pitch;

    // カスタム読みを適用
    const textToSpeak = applyCustomReadings(text);

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = 1.0;

    // 日本語音声を検索
    const voices = window.speechSynthesis.getVoices();

    // 第一候補: 言語に合うボイス
    let selectedVoice = voices.find(v => v.lang.startsWith(lang.substring(0, 2)));

    // 第二候補: プリセットに固有のボイス名が指定されている場合
    if (config.voiceName) {
      const namedVoice = voices.find(v => v.name === config.voiceName);
      if (namedVoice) selectedVoice = namedVoice;
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    // 確実に完了/エラーをハンドリング
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    // 音声を再生
    window.speechSynthesis.speak(utterance);
  });
};

// ============================================================
// 保存済みプリセットを適用して読み上げ（呼び出し元で便利なラッパー）
// ============================================================
export const speakTextWithStoredPreset = async (
  text: string,
  lang: string = 'ja-JP'
): Promise<void> => {
  const preset = await getStoredVoicePreset();
  return speakText(text, lang, preset);
};

export const stopSpeech = (): void => {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
};

export const isSpeechSupported = (): boolean => {
  return typeof window !== 'undefined' && !!window.speechSynthesis;
};