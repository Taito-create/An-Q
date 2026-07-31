// テキスト読み上げユーティリティ (Web Speech API)

// カスタム読み辞書（必要に応じて拡張）
const readingDictionary: Record<string, string> = {
  '森鷗外': 'もりおうがい',
  '舞姫': 'まいひめ',
  '津和野': 'つわの',
  '鴎外': 'おうがい',
  // ユーザーが追加できるようにする場合は別途管理
};

// テキストにカスタム辞書を適用
const applyCustomReadings = (text: string): string => {
  let result = text;
  for (const [key, value] of Object.entries(readingDictionary)) {
    result = result.replace(new RegExp(key, 'g'), value);
  }
  return result;
};

export const speakText = (text: string, lang: string = 'ja-JP', useReading: boolean = true): void => {
  if (!window.speechSynthesis) {
    console.warn('Speech synthesis not supported in this browser');
    return;
  }

  // 既存の音声をキャンセル
  window.speechSynthesis.cancel();

  // カスタム読みを適用
  const textToSpeak = useReading ? applyCustomReadings(text) : text;

  const utterance = new SpeechSynthesisUtterance(textToSpeak);
  utterance.lang = lang;
  utterance.rate = 0.9;  // 少しゆっくり
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // 日本語の音声を優先
  const voices = window.speechSynthesis.getVoices();
  const jaVoice = voices.find(v => v.lang.startsWith('ja'));
  if (jaVoice) {
    utterance.voice = jaVoice;
  }

  window.speechSynthesis.speak(utterance);
};

export const stopSpeech = (): void => {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
};

export const isSpeechSupported = (): boolean => {
  return typeof window !== 'undefined' && !!window.speechSynthesis;
};