// テキスト読み上げユーティリティ (Web Speech API)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';

// 現在再生中の <audio>（VOICEVOX / サーバー音声で生成した音声）を保持する。
// stopSpeech() は Web Speech しか止められなかったため、
// モジュールスコープで audio 要素も管理して両方を停止できるようにする。
let currentAudio: HTMLAudioElement | null = null;

/** 再生中の <audio> を停止して破棄する（blob URL も解放する） */
const stopCurrentAudio = () => {
  if (!currentAudio) return;
  const audio = currentAudio;
  currentAudio = null;
  try {
    audio.pause();
    audio.currentTime = 0;
    if (audio.src && audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
  } catch {
    // audio 要素が既に破棄されている場合は何もしない
  }
};

/**
 * ボイスサーバー（voice-server）の生存確認結果を保持するキャッシュ。
 * 連打しても /health を過度に叩かないよう30秒だけキャッシュする。
 */
let voiceServerAliveCache: { value: boolean; at: number } | null = null;

/**
 * ボイスサーバー（/health）の生存確認。
 * プロキシ URL の origin から /health を導出するため、本番デプロイ時にも追従する。
 * @param force true ならキャッシュを無視して再確認する
 */
export async function isVoiceServerAlive(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && voiceServerAliveCache && now - voiceServerAliveCache.at < 30_000) {
    return voiceServerAliveCache.value;
  }
  const base = (() => {
    try {
      const u = new URL(import.meta.env.VITE_VOICE_PROXY_URL || 'http://localhost:3001/speak');
      return `${u.protocol}//${u.host}`;
    } catch {
      return 'http://localhost:3001';
    }
  })();
  try {
    const res = await fetch(`${base}/health`, { method: 'GET' });
    const alive = res.ok;
    voiceServerAliveCache = { value: alive, at: now };
    return alive;
  } catch {
    voiceServerAliveCache = { value: false, at: now };
    return false;
  }
}

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
  console.log(' Available voices:');
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

  //  ゆっくりボイス風 - 極限まで近づける
  // 特徴: 非常に遅く、低めのピッチ、語尾が伸びる感じ
  yukkuri: {
    rate: 0.55,   // 非常に遅く (標準の半分以下)
    pitch: 0.85,  // 低め
  },

  //  さらにゆっくり (極限)
  slow: {
    rate: 0.4,    // 極端に遅い
    pitch: 0.9,
  },

  //  元気な声
  energetic: {
    rate: 1.1,
    pitch: 1.3,   // 高め
  },

  //  落ち着いた声
  calm: {
    rate: 0.75,
    pitch: 0.9,
  },

  //  深い声
  deep: {
    rate: 0.8,
    pitch: 0.6,   // 非常に低い
  },
};

// プリセットの表示名（日本語）
export const voicePresetLabels: Record<VoicePreset, string> = {
  standard: 'スタンダード',
  slow: ' 極限ゆっくり',
  yukkuri: ' ゆっくりボイス風',
  energetic: ' 元気な声',
  calm: ' 落ち着いた声',
  deep: ' 深い声',
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

// ============================================================
// サーバー経由での音声生成・再生（VOICEVOX Engine）
// ============================================================
const VOICE_SERVER_URL = import.meta.env.VITE_VOICE_SERVER_URL || 'http://localhost:3001/speak';

/**
 * サーバー経由で音声を生成・再生する
 * サーバーに到達できない場合は Web Speech API にフォールバックする
 * @param text 読み上げるテキスト
 * @returns Promise<void>
 */
export const speakWithServer = async (text: string): Promise<void> => {
  try {
    console.log(' speakWithServer called with:', text);
    console.log('🔊 VOICE_SERVER_URL:', VOICE_SERVER_URL);
    const response = await fetch(VOICE_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    console.log(' Server response status:', response.status);
    console.log(' Server response headers:', response.headers);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(' Server error response:', errorText);
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    const audioBlob = await response.blob();
    console.log(' Audio blob size:', audioBlob.size, 'bytes');
    console.log(' Audio blob type:', audioBlob.type);

    if (audioBlob.size === 0) {
      throw new Error('Received empty audio data');
    }

    const audioUrl = URL.createObjectURL(audioBlob);
    // 既存の再生があれば停止してから差し替える（stopSpeech で止められるように登録する）
    stopCurrentAudio();
    const audio = new Audio(audioUrl);
    currentAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      if (currentAudio === audio) currentAudio = null;
    };
    audio.onerror = (e) => {
      console.error(' Audio playback error:', e);
    };
    await audio.play();
    console.log(' Audio playback started');

  } catch (error) {
    console.error(' サーバー音声に失敗:', error);
    await speakTextWithStoredPreset(text);
  }
};

// ============================================================
// 設定に基づく音声再生の統合エントリポイント
// ============================================================
/**
 * ユーザー設定（USE_SERVER_VOICE）に基づいて音声を再生する
 * - サーバー音声が有効: speakWithServer を使用（失敗時は自動フォールバック）
 * - サーバー音声が無効: Web Speech API（保存済みプリセット）を使用
 * @param text 読み上げるテキスト
 * @returns Promise<void>
 */
export const speak = async (text: string): Promise<void> => {
  try {
    const useServer = await AsyncStorage.getItem(STORAGE_KEYS.USE_SERVER_VOICE);
    console.log(' speak() called, useServer:', useServer);
    // デフォルトはサーバー音声を有効とする（未設定時は true 扱い）
    if (useServer !== 'false') {
      console.log(' Using server voice (VOICEVOX Engine)');
      await speakWithServer(text);
    } else {
      console.log(' Using Web Speech API');
      await speakTextWithStoredPreset(text);
    }
  } catch (error) {
    console.error('音声設定読み込みエラー、Web Speech APIにフォールバック:', error);
    await speakTextWithStoredPreset(text);
  }
};

export const stopSpeech = (): void => {
  // Web Speech API
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // speechSynthesis が使えない環境では何もしない
  }
  // VOICEVOX / サーバー音声（<audio>）
  stopCurrentAudio();
};

export const isSpeechSupported = (): boolean => {
  return typeof window !== 'undefined' && !!window.speechSynthesis;
};

// ============================================================
// VOICEVOX 統合
// ============================================================

/** VOICEVOX 話者リスト */
export const VOICEVOX_SPEAKERS: { id: number; name: string; nameJa: string }[] = [
  { id: 3, name: 'Zundamon', nameJa: 'ずんだもん' },
  { id: 10, name: 'Shikoku Metan', nameJa: '四国めたん' },
  { id: 8, name: 'Kasugabe Tsumugi', nameJa: '春日部つむぎ' },
  { id: 9, name: 'Amahare Hau', nameJa: '雨晴はう' },
  { id: 2, name: 'Nanami Ritsu', nameJa: '波音リツ' },
  { id: 1, name: 'Kiritan', nameJa: 'きりたん' },
];

/**
 * VOICEVOX で音声を再生する（直接接続版）
 * @param text 読み上げるテキスト
 * @param speakerId VOICEVOX 話者 ID
 *
 * VOICEVOX Engine の正しい呼び出し方（voice-server/server.js で動作実績あり）:
 * - `/audio_query` は POST、text/speaker はクエリパラメータで送る（ボディは空）。
 *   GET で叩くと `405 Method Not Allowed` になる。
 * - `/synthesis` は POST、query(JSON) をボディ、speaker はクエリパラメータ。
 * CORS: Engine 起動時に --cors-policy=* が必要（localhost:50021 のデフォルトは別オリジンを拒否）。
 */
export async function speakWithVoicevox(text: string, speakerId: number): Promise<void> {
  const baseUrl = 'http://localhost:50021';
  try {
    // 1. audio_query で音声クエリを作成（POST + クエリパラメータ、ボディ空）
    const queryParams = new URLSearchParams({ text, speaker: String(speakerId) });
    const queryRes = await fetch(`${baseUrl}/audio_query?${queryParams.toString()}`, {
      method: 'POST',
    });
    if (!queryRes.ok) {
      const errText = await queryRes.text();
      throw new Error(`audio_query failed (${queryRes.status}): ${errText}`);
    }
    const query = await queryRes.json();

    // 2. synthesis で音声を生成（POST、ボディ=query JSON、speaker=クエリ）
    const synthParams = new URLSearchParams({ speaker: String(speakerId) });
    const synthRes = await fetch(`${baseUrl}/synthesis?${synthParams.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });
    if (!synthRes.ok) {
      const errText = await synthRes.text();
      throw new Error(`synthesis failed (${synthRes.status}): ${errText}`);
    }
    const audioBlob = await synthRes.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    stopCurrentAudio();
    const audio = new Audio(audioUrl);
    currentAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      if (currentAudio === audio) currentAudio = null;
    };
    await audio.play();
  } catch (error) {
    console.error('VOICEVOX direct error:', error);
    if (error instanceof TypeError && String(error.message).includes('fetch')) {
      // CORS / Engine 未起動の可能性が高い
      console.warn(
        '接続できませんでした。以下を確認してください:\n' +
        '1) VOICEVOX Engine が http://localhost:50021 で起動しているか\n' +
        '2) Engine 起動時に --cors-policy=* を付けているか（ブラウザからの直接接続には必須）\n' +
        '3) 駄目な場合は設定画面の接続モードを Proxy に切り替え（voice-server 経由に）'
      );
    }
    // フォールバック：Web Speech API
    console.warn('VOICEVOX failed, falling back to Web Speech API');
    speakText(text, 'ja-JP');
  }
}

/**
 * VOICEVOX で音声を再生する（プロキシ経由版）
 * voice-server (Express) をデプロイして使用する
 * @param text 読み上げるテキスト
 * @param speakerId VOICEVOX 話者 ID
 */
export async function speakWithVoicevoxProxy(text: string, speakerId: number): Promise<void> {
  const proxyUrl = import.meta.env.VITE_VOICE_PROXY_URL || 'http://localhost:3001/speak';
  try {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speaker: speakerId }),
    });
    if (!response.ok) {
      throw new Error(`Proxy error: ${response.status}`);
    }
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    stopCurrentAudio();
    const audio = new Audio(audioUrl);
    currentAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      if (currentAudio === audio) currentAudio = null;
    };
    await audio.play();
  } catch (error) {
    console.error('VOICEVOX proxy error:', error);
    console.warn('Falling back to Web Speech API');
    speakText(text, 'ja-JP');
  }
}