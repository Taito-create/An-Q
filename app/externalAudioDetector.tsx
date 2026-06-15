import { useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';

// 外部音楽再生状態の型定義
interface ExternalAudioState {
  isPlaying: boolean;
  detectedApp?: string;
  lastDetected: number;
}

export function useExternalAudioDetector() {
  const [externalAudio, setExternalAudio] = useState<ExternalAudioState>({
    isPlaying: false,
    lastDetected: Date.now(),
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const detectionIntervalRef = useRef<number | null>(null);

  // 外部音楽アプリの検出
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const initializeAudioDetection = () => {
      try {
        // Web Audio APIの初期化
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        audioContextRef.current = new AudioContextClass();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;

        // マイクアクセス（ユーザー許可が必要）
        navigator.mediaDevices?.getUserMedia({ audio: true })
          .then(stream => {
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            source.connect(analyserRef.current!);
            startDetection();
          })
          .catch(() => {
            // マイクアクセス拒否時は代替手段を使用
            startAlternativeDetection();
          });
      } catch (error) {
        console.warn('Audio detection initialization failed:', error);
        startAlternativeDetection();
      }
    };

    // 音声レベル検出
    const startDetection = () => {
      if (detectionIntervalRef.current) return;

      detectionIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        // 平均音量レベルの計算
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        const isAudioPlaying = average > 10; // しきい値

        setExternalAudio(prev => {
          const wasPlaying = prev.isPlaying;
          const nowPlaying = isAudioPlaying;

          // 状態変化を検出
          if (wasPlaying !== nowPlaying) {
            return {
              isPlaying: nowPlaying,
              detectedApp: detectMusicApp(),
              lastDetected: Date.now(),
            };
          }

          return { ...prev, lastDetected: Date.now() };
        });
      }, 1000); // 1秒ごとにチェック
    };

    // 代替検出方法（Media Session API）
    const startAlternativeDetection = () => {
      if ('mediaSession' in navigator) {
        const mediaSession = (navigator as any).mediaSession;
        
        const updateMediaState = () => {
          setExternalAudio({
            isPlaying: mediaSession.playbackState === 'playing',
            detectedApp: 'External Music App',
            lastDetected: Date.now(),
          });
        };

        // Media Session APIの状態変化を監視
        if (mediaSession.metadata) {
          updateMediaState();
        }

        // 定期的に状態をチェック
        detectionIntervalRef.current = setInterval(updateMediaState, 2000);
      }
    };

    // 音楽アプリの検出（ヒューリスティック）
    const detectMusicApp = (): string | undefined => {
      const userAgent = navigator.userAgent;
      
      // Spotify
      if (userAgent.includes('Spotify')) return 'Spotify';
      
      // YouTube Music
      if (userAgent.includes('YouTube') && userAgent.includes('Music')) return 'YouTube Music';
      
      // Apple Music
      if (userAgent.includes('Apple') && userAgent.includes('Music')) return 'Apple Music';
      
      // Amazon Music
      if (userAgent.includes('Amazon') && userAgent.includes('Music')) return 'Amazon Music';
      
      // その他
      return 'External Music App';
    };

    // 初期化
    initializeAudioDetection();

    // クリーンアップ
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return externalAudio;
}

// 効果音音量の動的調整用フック
export function useAdaptiveSoundVolume(externalAudioPlaying: boolean, detectedApp?: string) {
  const [soundMultiplier, setSoundMultiplier] = useState(1.0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    // アプリごとに異なる音量調整
    let targetVolume = 1.0;
    if (externalAudioPlaying) {
      switch (detectedApp) {
        case 'Spotify':
          targetVolume = 0.25;
          break;
        case 'YouTube Music':
          targetVolume = 0.35;
          break;
        case 'Apple Music':
          targetVolume = 0.3;
          break;
        case 'Amazon Music':
          targetVolume = 0.4;
          break;
        default:
          targetVolume = 0.3;
      }
    }

    // ゆっくりと音量を変化させる
    const steps = 20;
    const stepDelay = 30;
    const volumeStep = (targetVolume - soundMultiplier) / steps;
    
    setIsTransitioning(true);
    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep++;
      setSoundMultiplier(prev => Math.max(0, Math.min(1, prev + volumeStep)));
      
      if (currentStep >= steps) {
        clearInterval(interval);
        setIsTransitioning(false);
      }
    }, stepDelay);

    return () => clearInterval(interval);
  }, [externalAudioPlaying, detectedApp, soundMultiplier]);

  return { soundMultiplier, isTransitioning };
}
