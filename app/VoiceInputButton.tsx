import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Mic, MicOff } from 'lucide-react';
import PressableButton from './components/PressableButton';

type Props = {
  locale: 'ja' | 'en';
  colors: { primary: string; textSecondary: string; error: string };
  onPrimary: string;
  br: number;
  value: string;
  onTranscript: (text: string) => void;
  multiline?: boolean;
  disabled?: boolean;
};

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

let activeRecognition: RecognitionLike | null = null;

const message = (locale: 'ja' | 'en', key: string) => {
  const ja: Record<string, string> = {
    unsupported: 'このブラウザーは端末内音声入力に未対応です。Chrome 139以降でお試しください。',
    install: '端末内の日本語音声データを準備しています…',
    installFailed: '音声データを準備できませんでした。通信状態を確認して再試行してください。',
    unavailable: 'この端末では日本語の端末内音声認識を利用できません。',
    listening: '聞き取り中… 終わったら停止してください。音声は端末内で処理します。',
    denied: 'マイクが許可されていません。ブラウザーのサイト設定でマイクを許可してください。',
    noMic: 'マイクが見つかりません。接続とブラウザーの権限を確認してください。',
    language: '日本語の音声データを利用できません。ブラウザーの言語データ設定を確認してください。',
    failed: '音声を認識できませんでした。もう一度お試しください。',
  };
  const en: Record<string, string> = {
    unsupported: 'On-device speech input is not supported here. Try Chrome 139 or later.',
    install: 'Preparing the on-device speech language pack…',
    installFailed: 'Could not prepare speech data. Check your connection and try again.',
    unavailable: 'On-device speech recognition is unavailable on this device.',
    listening: 'Listening… Press stop when finished. Audio is processed on this device.',
    denied: 'Microphone access was denied. Allow microphone access in browser site settings.',
    noMic: 'No microphone was found. Check the microphone and browser permissions.',
    language: 'Japanese speech data is unavailable. Check your browser language data settings.',
    failed: 'Speech could not be recognized. Please try again.',
  };
  return (locale === 'ja' ? ja : en)[key] || key;
};

export default function VoiceInputButton({ locale, colors, onPrimary, br, value, onTranscript, multiline = false, disabled }: Props) {
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const baseValueRef = useRef(value);
  const transcriptRef = useRef('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.stop(); } catch (_) {}
    }
  }, []);

  const start = async () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setNotice(message(locale, 'unsupported'));
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const options = { langs: [locale === 'ja' ? 'ja-JP' : 'en-US'], processLocally: true, quality: 'dictation' };
      if (typeof SpeechRecognitionCtor.available !== 'function' || typeof SpeechRecognitionCtor.install !== 'function') {
        setNotice(message(locale, 'unsupported'));
        return;
      }
      let availability = await SpeechRecognitionCtor.available(options);
      if (availability === 'downloadable' || availability === 'downloading') {
        setNotice(message(locale, 'install'));
        const installed = await SpeechRecognitionCtor.install(options);
        if (!installed) {
          setNotice(message(locale, 'installFailed'));
          return;
        }
        availability = await SpeechRecognitionCtor.available(options);
      }
      if (availability !== 'available') {
        setNotice(message(locale, 'unavailable'));
        return;
      }
      const recognition = new SpeechRecognitionCtor() as RecognitionLike;
      if (activeRecognition) {
        try { activeRecognition.stop(); } catch (_) {}
      }
      recognition.lang = locale === 'ja' ? 'ja-JP' : 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.processLocally = true;
      baseValueRef.current = value;
      transcriptRef.current = '';
      recognition.onresult = (event: any) => {
        let finalText = '';
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
        }
        transcriptRef.current = finalText.trim();
      };
      recognition.onerror = (event: any) => {
        const key = event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'denied'
          : event.error === 'audio-capture' ? 'noMic'
          : event.error === 'language-not-supported' ? 'language'
          : 'failed';
        setNotice(message(locale, key));
        setListening(false);
      };
      recognition.onend = () => {
        const transcript = transcriptRef.current;
        if (transcript) onTranscript(`${baseValueRef.current}${baseValueRef.current ? (multiline ? '\n' : ' ') : ''}${transcript}`);
        setListening(false);
        if (activeRecognition === recognition) activeRecognition = null;
        recognitionRef.current = null;
      };
      recognitionRef.current = recognition;
      activeRecognition = recognition;
      recognition.start();
      setListening(true);
      setNotice(message(locale, 'listening'));
    } catch (error: any) {
      const key = error?.name === 'NotAllowedError' || error?.name === 'NotAllowedError' ? 'denied'
        : error?.message?.includes('language') ? 'language'
        : 'failed';
      setNotice(message(locale, key));
    } finally {
      setBusy(false);
    }
  };

  return <View style={{ alignItems: 'flex-end', marginLeft: 6 }}>
    <PressableButton
      title={listening ? (locale === 'ja' ? '音声入力を停止' : 'Stop voice input') : (locale === 'ja' ? '音声入力' : 'Voice input')}
      style={{ minWidth: 40, height: 40, paddingHorizontal: 10, borderRadius: br, backgroundColor: listening ? colors.error : colors.primary, alignItems: 'center', justifyContent: 'center' }}
      onPress={start}
      disabled={disabled || busy}
    >
      {busy ? <ActivityIndicator size="small" color={onPrimary} /> : listening ? <MicOff size={18} color={onPrimary} /> : <Mic size={18} color={onPrimary} />}
    </PressableButton>
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ maxWidth: 260, marginTop: 4, color: listening ? colors.primary : colors.textSecondary, fontSize: 11, textAlign: 'right' }}>{notice}</Text>}
  </View>;
}
