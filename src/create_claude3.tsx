import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  ScrollView,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { useNavigate } from 'react-router-dom';
import { SoundManager } from './sound';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { useTheme } from './theme';
import { loadStats, incrementStat } from './missions';
import { useQuestionsContext } from './context/QuestionsContext';
import { Question, ImageAnnotation } from './types/question';
import { useAuth } from './auth/AuthContext';
import { awardQuestionCreation } from '../src/utils/userProgress';
import Tesseract from 'tesseract.js';
import './create.css';

export default function CreateQuestionScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary, isCyberpunk, currentTheme } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const { questions, saveQuestions } = useQuestionsContext();
  const { user } = useAuth();
  const cpR: number | undefined = isCyberpunk ? 0 : undefined;
  const cpB: number | undefined = isCyberpunk ? 2 : undefined;

  useEffect(() => {
    SoundManager.initialize();
  }, []);
  
  const [question, setQuestion] = useState('');
  const [answerType, setAnswerType] = useState<'descriptive' | 'truefalse' | 'multiple'>('descriptive');
  const [descriptiveAnswers, setDescriptiveAnswers] = useState<string[]>(['']);
  const [trueFalseAnswer, setTrueFalseAnswer] = useState(true);
  const [explanation, setExplanation] = useState('');
  const [multipleChoice, setMultipleChoice] = useState({
    options: ['', '', '', ''],
    correctAnswers: [0] as number[]
  });
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [matchMode, setMatchMode] = useState<'any' | 'all'>('any');  // 両解モード

  // OCR関連のstate
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  
  // クロップ機能用のstate
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showCropUI, setShowCropUI] = useState(false);
  const [cropArea, setCropArea] = useState({ x: 0, y: 0, width: 0, height: 0 });
  // 🟢 ドラッグ状態はuseRefで管理（React Stateの非同期更新によるスマホでの遅延を防止）
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 両解モード切り替えハンドラ（useEffectではなく、トグル押下時に直接配列操作）
  const toggleMatchMode = () => {
    SoundManager.play('decide');
    if (matchMode === 'all') {
      // OFFにする: 配列を正解1のみ（要素数1）に縮小
      setMatchMode('any');
      setDescriptiveAnswers([descriptiveAnswers[0]]);
    } else {
      // ONにする: 2つ未満なら2つに増やす
      setMatchMode('all');
      if (descriptiveAnswers.length < 2) {
        setDescriptiveAnswers(['', '']);
      }
    }
  };

  // 🟢 画像添付UIを削除（OCR機能のみ使用）

  // クロップ範囲のリセット
  const resetCropArea = () => {
    setCropArea({ x: 0, y: 0, width: 0, height: 0 });
  };

  // 🟢 デバッグログ関数
  const logDebug = (label: string, data: Record<string, any>) => {
    console.log(`[OCR Debug] ${label}:`, JSON.stringify(data, null, 2));
  };

  // 🟢 現在ドラッグ中のpointerIdを保持（マルチタッチの誤爆防止）
  const activePointerIdRef = useRef<number | null>(null);
  // 🟢 コンテナの矩形はpointerdown時に1回だけ取得してキャッシュ
  //    （move中に毎回getBoundingClientRectを呼ぶとスクロール直後などにズレる原因になる）
  const containerRectRef = useRef({ width: 0, height: 0 });

  // 座標(x, y)をコンテナの範囲内 [0, max] に収めるヘルパー
  const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));

  // ポインターイベントハンドラ（マウス・タッチ両対応）
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || !imageRef.current) return;

    // Pointer Capture: ドラッグ中はこの要素がポインターを独占
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;

    // 🟢 コンテナ基準で座標を取得（Overlayもコンテナ基準で配置される）
    const rect = containerRef.current.getBoundingClientRect();
    containerRectRef.current = { width: rect.width, height: rect.height };

    const x = clamp(e.clientX - rect.left, rect.width);
    const y = clamp(e.clientY - rect.top, rect.height);

    // 🟢 useRefに即座に保存（React Stateの非同期更新による遅延を防止）
    dragStartRef.current = { x, y };
    isDraggingRef.current = true;

    logDebug("PointerDown", {
      clientX: e.clientX,
      clientY: e.clientY,
      rectLeft: rect.left,
      rectTop: rect.top,
      rectWidth: rect.width,
      rectHeight: rect.height,
      displayX: x,
      displayY: y,
      naturalWidth: imageRef.current.naturalWidth,
      naturalHeight: imageRef.current.naturalHeight,
      clientWidth: imageRef.current.clientWidth,
      clientHeight: imageRef.current.clientHeight,
      devicePixelRatio: window.devicePixelRatio,
      visualViewportScale: window.visualViewport?.scale,
    });

    setCropArea({ x, y, width: 0, height: 0 });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // 🟢 useRefで即座に判定（React Stateの非同期更新に依存しない）
    // 🟢 ドラッグ中のpointerId以外は無視（マルチタッチ対策）
    if (!isDraggingRef.current || !containerRef.current) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

    // 🟢 pointerdown時にキャッシュした矩形サイズを使い、現在座標をコンテナ範囲内にクランプする。
    //    クランプしないと、指が画像の外（コンテナの外）まで速く動いたときに
    //    x/yがマイナスや画像幅を超えた値になり、overflow:hiddenで見た目上「消えた」ようになる。
    const rect = containerRef.current.getBoundingClientRect();
    const maxW = rect.width || containerRectRef.current.width;
    const maxH = rect.height || containerRectRef.current.height;

    const currentX = clamp(e.clientX - rect.left, maxW);
    const currentY = clamp(e.clientY - rect.top, maxH);

    const startX = dragStartRef.current.x;
    const startY = dragStartRef.current.y;

    // 🟢 Math.min/Math.maxで「左上座標」と「サイズ」を同時に求める。
    //    指を上下左右どちらに動かしても、start/currentのどちらが小さいかだけで
    //    left/top/width/heightが一意に決まるため、符号(マイナス)の分岐ミスが起きない。
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    setCropArea({ x: left, y: top, width, height });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

    // 🟢 useRefで即座にfalse設定
    isDraggingRef.current = false;
    activePointerIdRef.current = null;

    // Pointer Capture 解放
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  /** グレースケール値の配列に対し、パーセンタイルベースのコントラスト伸長を行う
   *  （数値だけを見た軽量な適応的補正。極端な最暗部/最明部の外れ値を除いて
   *    0〜255の全レンジに引き伸ばすことで、文字の輪郭のかすれ・潰れを防ぐ） */
  const enhanceContrast = (grayValues: number[]): number[] => {
    const histogram = new Array(256).fill(0);
    for (const gray of grayValues) {
      histogram[Math.min(255, Math.max(0, Math.round(gray)))]++;
    }

    const total = grayValues.length;
    const lowCut = total * 0.02;
    const highCutFromTop = total * 0.02;

    let low = 0;
    let cum = 0;
    for (let i = 0; i < 256; i++) {
      cum += histogram[i];
      if (cum >= lowCut) { low = i; break; }
    }

    let high = 255;
    cum = 0;
    for (let i = 255; i >= 0; i--) {
      cum += histogram[i];
      if (cum >= highCutFromTop) { high = i; break; }
    }

    const range = Math.max(1, high - low);
    return grayValues.map((g) => Math.min(255, Math.max(0, ((g - low) / range) * 255)));
  };

  /** キャンバス上の画像にグレースケール化＋コントラスト伸長＋大津の二値化を適用（OCR精度を底上げ） */
  const binarizeCanvas = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const grayValues: number[] = new Array(data.length / 4);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      grayValues[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    // 🟢 二値化の前にコントラストを軽く伸長し、文字の線が薄すぎ/濃すぎで
    //    大津の閾値が誤った位置に決まるのを防ぐ
    const contrasted = enhanceContrast(grayValues);

    const threshold = computeOtsuThreshold(contrasted);

    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const binary = contrasted[j] > threshold ? 255 : 0;
      data[i] = binary;
      data[i + 1] = binary;
      data[i + 2] = binary;
    }

    ctx.putImageData(imageData, 0, 0);
  };

  // 画像をクロップ（natural座標に変換してCanvasに描画）
  const cropImage = (): string | null => {
    const img = imageRef.current;
    if (!img) {
      console.error("OCR Error: imageRef.current is null");
      Alert.alert("エラー", "画像要素が見つかりません。");
      return null;
    }

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (nw === 0 || nh === 0) {
      console.error("OCR Error: Image natural dimensions are 0", { nw, nh });
      Alert.alert("エラー", "画像のサイズを取得できませんでした。");
      return null;
    }

    try {
      // 🟢 表示座標（cropArea）→ natural座標（img.naturalWidth/Height基準）への倍率
      //    imgはコンテナ幅いっぱいに描画された唯一の子要素なので、
      //    imgのgetBoundingClientRect()はcropAreaを計算したコンテナのrectと一致する。
      const imgRect = img.getBoundingClientRect();
      const scaleX = nw / imgRect.width;
      const scaleY = nh / imgRect.height;

      // 🟢 cropArea（表示座標）を natural座標（＝写真の実ピクセル座標）に変換。
      //    Math.roundで端数を丸め、切り抜き境界のにじみ（アンチエイリアスのボケ）を防ぐ。
      const nx = Math.round(Math.max(0, Math.min(cropArea.x, cropArea.x + cropArea.width)) * scaleX);
      const ny = Math.round(Math.max(0, Math.min(cropArea.y, cropArea.y + cropArea.height)) * scaleY);
      const cropW = Math.round(Math.max(1, Math.abs(cropArea.width)) * scaleX);
      const cropH = Math.round(Math.max(1, Math.abs(cropArea.height)) * scaleY);

      // 🟢 Tesseractは文字の高さがおおよそ30px以上ないと誤認識しやすい。
      //    選択範囲のnatural解像度が低い（＝遠くから撮った写真を小さく囲んだ等）場合は
      //    出力キャンバス側で拡大してから渡すことで認識率を底上げする。
      const MIN_OUTPUT_HEIGHT = 900;
      const upscale = cropH < MIN_OUTPUT_HEIGHT ? Math.min(4, MIN_OUTPUT_HEIGHT / cropH) : 1;
      const outW = Math.round(cropW * upscale);
      const outH = Math.round(cropH * upscale);

      logDebug("CropImage", {
        displayCrop: { x: cropArea.x, y: cropArea.y, w: cropArea.width, h: cropArea.height },
        naturalCrop: { x: nx, y: ny, w: cropW, h: cropH },
        scaleX,
        scaleY,
        upscale,
        outputSize: { w: outW, h: outH },
        naturalWidth: nw,
        naturalHeight: nh,
        imgRectWidth: imgRect.width,
        imgRectHeight: imgRect.height,
      });

      // 🟢 natural座標でCanvasに直接描画（表示サイズCanvasは経由しない＝画質劣化なし）
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvas context is null");

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // 🟢 img要素から直接、natural解像度の実ピクセルを正確な座標で切り抜き、
      //    必要なら同時に拡大（第5・第6引数がoutW/outHなのでdrawImageが拡大も担う）
      ctx.drawImage(img, nx, ny, cropW, cropH, 0, 0, outW, outH);

      // 🟢 グレースケール化＋大津の二値化で文字と背景のコントラストを最大化
      //    （紙の質感・影・ノイズを消し、Tesseractの誤認識を大幅に減らす）
      binarizeCanvas(ctx, outW, outH);

      // 🟢 JPEG圧縮はエッジにモスキートノイズを乗せてOCRを悪化させるため、
      //    ロスレスなPNGで書き出す
      return canvas.toDataURL('image/png');
    } catch (err) {
      console.error("OCR Crop Canvas Error:", err);
      Alert.alert("エラー", "画像の切り抜き処理中にエラーが発生しました。");
      return null;
    }
  };

  /** 大津の二値化による最適な閾値を計算 */
  const computeOtsuThreshold = (grayValues: number[]): number => {
    const histogram = new Array(256).fill(0);
    for (const gray of grayValues) {
      histogram[Math.min(255, Math.max(0, Math.round(gray)))]++;
    }

    const total = grayValues.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += i * histogram[i];
    }

    let sumB = 0;
    let wB = 0;
    let maxVariance = 0;
    let threshold = 127;

    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;

      const wF = total - wB;
      if (wF === 0) break;

      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const variance = wB * wF * (mB - mF) * (mB - mF);

      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = t;
      }
    }

    return threshold;
  };

  /** 画像を白黒二値化・コントラスト強調する前処理 */
  const preprocessImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      console.log('Preprocessing image, file size:', file.size);
      
      img.onload = () => {
        try {
          console.log('Image loaded for preprocessing:', { 
            width: img.width, 
            height: img.height 
          });

          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { 
            console.error('Failed to get canvas 2d context for preprocessing');
            URL.revokeObjectURL(url);
            reject(new Error('Canvas context not available')); 
            return; 
          }

          ctx.drawImage(img, 0, 0);
          console.log('Image drawn to canvas');

          let imageData;
          try {
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            console.log('Image data retrieved:', { 
              dataLength: imageData.data.length,
              width: imageData.width,
              height: imageData.height 
            });
          } catch (err) {
            console.error('Failed to get image data:', err);
            URL.revokeObjectURL(url);
            reject(new Error('Failed to get image data from canvas'));
            return;
          }

          const data = imageData.data;

          // グレースケール値を収集
          const grayValues: number[] = [];
          for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            grayValues.push(gray);
          }
          console.log('Gray values collected:', grayValues.length);

          // 大津の二値化で最適な閾値を計算
          const threshold = computeOtsuThreshold(grayValues);
          console.log('Otsu threshold calculated:', threshold);

          // 計算した閾値で二値化
          for (let i = 0; i < data.length; i += 4) {
            const gray = grayValues[i / 4];
            const binary = gray > threshold ? 255 : 0;
            data[i] = binary;
            data[i + 1] = binary;
            data[i + 2] = binary;
          }

          ctx.putImageData(imageData, 0, 0);
          console.log('Image data put back to canvas');

          const processedDataUrl = canvas.toDataURL('image/png');
          console.log('Processed image data URL created, length:', processedDataUrl.length);
          
          URL.revokeObjectURL(url);
          resolve(processedDataUrl);
        } catch (err) {
          console.error('Preprocessing error:', err);
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      
      img.onerror = (err) => {
        console.error('Failed to load image for preprocessing:', err);
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image for preprocessing'));
      };
      
      console.log('Loading image for preprocessing from URL:', url);
      img.src = url;
    });
  };

  // OCR: 画像からテキストを抽出
  const handleOcrExtract = async () => {
    // クロップUIが表示されていない場合は、ファイル選択を開く
    if (!showCropUI) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        
        // 🟢 ファイル選択後に即座にinputをリセット（再選択可能にする）
        if (target) target.value = '';

        if (!file) {
          return;
        }

        if (file.size > 10 * 1024 * 1024) {
          Alert.alert('エラー', locale === 'ja' ? '画像は10MB以下にしてください' : 'Image must be less than 10MB');
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = e.target?.result as string;
          setSelectedImage(base64);
          setShowCropUI(true);
          SoundManager.play('decide');
        };
        reader.onerror = () => {
          Alert.alert('エラー', locale === 'ja' ? '画像の読み込みに失敗しました' : 'Failed to load image');
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }

    // クロップUI表示中は、選択範囲でOCR実行
    const deltaX = Math.abs(cropArea.width);
    const deltaY = Math.abs(cropArea.height);
    console.log("OCR Triggered - Crop Dimensions:", { deltaX, deltaY });

    // 1. 画像切り抜き
    const croppedDataUrl = cropImage();
    if (!croppedDataUrl) {
      console.error("OCR Error: cropImage returned null");
      return;
    }

    console.log("OCR: Redirecting to verified processOcrFromDataUrl flow...");
    // 2. 正常動作が確認されている統合関数へデータを渡す
    await processOcrFromDataUrl(croppedDataUrl);
  };

  /** OCR結果の先頭・末尾に残りやすい孤立した記号ノイズ（/ @ _ | ^ ` 等）と
   *  余分な空白を、行単位でトリミングする簡易クレンジング */
  const stripNoiseSymbols = (text: string): string => {
    // 行頭・行末で「単独の記号＋空白」として浮いているノイズだけを対象にする
    // （文中の記号や、意味のある記号の並びは残す）
    const edgeNoise = '[\\s/@_|^~`\'"・･*#＃]+';
    const leading = new RegExp('^' + edgeNoise);
    const trailing = new RegExp(edgeNoise + '$');

    return text
      .split('\n')
      .map((line) => line.replace(leading, '').replace(trailing, '').trim())
      .filter((line) => line.length > 0)
      .join('\n');
  };

  // DataURLからOCR処理を実行
  const processOcrFromDataUrl = async (dataUrl: string) => {
    setOcrLoading(true);
    setOcrProgress(0);

    // 🟢 PSM/文字ブラックリストなどの詳細パラメータは Tesseract.recognize() の
    //    オプション経由では設定できないため、createWorkerを使い明示的に指定する
    let worker: any = null;

    try {
      console.log("OCR: Creating Tesseract worker (jpn)...");

      worker = await (Tesseract as any).createWorker('jpn', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
          } else {
            // ロード中もフリーズしていないことを示すため、わずかに進捗を出す
            setOcrProgress(5);
          }
        },
      });

      await worker.setParameters({
        // 🟢 横書きの単一ブロック（切り抜いた1問分のテキスト）を想定した
        //    ページ分割モード。PSM 6 = "Assume a single uniform block of text"
        tessedit_pageseg_mode: '6',
        // 🟢 単語間・行間のスペース構造を維持（日本語の読点/句点の直後などで
        //    不要な半角スペースが増えるのは後段のクレンジングで除去する）
        preserve_interword_spaces: '1',
        // 🟢 問題文には基本的に現れない記号を除外し、
        //    「/」「@」「_」「|」等のノイズ誤認識を根本から抑制する
        tessedit_char_blacklist: '|_^~｀`«»‹›¤¦',
      });

      console.log("OCR: Starting text recognition...");
      const { data: { text } } = await worker.recognize(dataUrl);

      console.log("OCR Result (raw):", text);
      setOcrProgress(100);

      if (text && text.trim().length > 0) {
        // 🟢 1. 行頭・行末の孤立した記号ノイズ（/ @ _ | 等）を除去
        const denoised = stripNoiseSymbols(text.trim());

        // 🟢 2. 日本語や句読点に挟まれた不要な半角スペースだけを自動削除する（英単語間のスペースは維持）
        const cleanedText = denoised.replace(/([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF。、？！])\s+(?=[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF。、？！])/g, '$1');

        console.log("OCR Result (cleaned):", cleanedText);

        // 🟢 確実にテキストを反映（コールバック形式で最新のstateを参照）
        setQuestion(prev => prev ? `${prev}\n${cleanedText}` : cleanedText);
        console.log("Question updated with OCR text");
        
        // 少し遅延させてからUIを閉じる
        setTimeout(() => {
          setShowCropUI(false);
          setSelectedImage(null);
        }, 100);
        
        Alert.alert(t.success || 'Success', '文字の抽出が完了しました！');
      } else {
        Alert.alert(t.error || 'Error', '画像から文字を検出できませんでした。範囲を少し広げてお試しください。');
      }

    } catch (err) {
      console.error("OCR Critical Catch:", err);
      Alert.alert("OCRエラー", "文字認識中にエラーが発生しました。お使いのブラウザの制限やネットワーク環境をご確認ください。");
    } finally {
      // 🟢 workerを確実に破棄（放置するとOCRを繰り返すたびにメモリを消費し続ける）
      if (worker) {
        try {
          await worker.terminate();
        } catch (_) {}
      }
      setOcrLoading(false);
      setOcrProgress(0);
    }
  };

  // OCR処理の共通ロジック（旧バージョン - 削除）
  // この関数は未使用です。processOcrFromDataUrlに統合されました。

  // クロップUIをキャンセル
  const cancelCrop = () => {
    setShowCropUI(false);
    setSelectedImage(null);
    resetCropArea();
  };

  const saveQuestion = async (newQuestionData: Partial<Question>): Promise<boolean> => {
    try {
      const stats = await loadStats();
      const limit = stats.questionSlots ?? 20;
      if (questions.length >= limit) {
        Alert.alert(t.limitReached, `${t.limitReachedMsg} (${limit})`);
        return false;
      }
      if (selectedImage && !selectedImage.startsWith('data:image')) {
        Alert.alert('エラー', locale === 'ja' ? '画像データが正しくありません' : 'Invalid image data');
        return false;
      }
      const newQuestion: Question = {
        id: Date.now(),
        enabled: true,
        answerType: answerType,
        tags: tags,
        mistakeCount: 0,
        createdAt: Date.now(),
        isShared: false,
        ...newQuestionData,
        question: newQuestionData.question || '',
        image: selectedImage || newQuestionData.image || null,
        imageAnnotations: [],
      };
      await saveQuestions([...questions, newQuestion]);
      await incrementStat('questionsCreated', 1);
      if (user?.uid) {
        await awardQuestionCreation(user.uid);
      }
      return true;
    } catch (error) {
      console.error('Save question error:', error);
      Alert.alert(t.error, t.failedToSave);
      return false;
    }
  };

  const handleManualCreate = async () => {
    if (!question.trim()) {
      SoundManager.play('select');
      Alert.alert(t.error, t.enterQuestion);
      return;
    }
    let dataToSave: any = { question: question.trim() || '', answerType: answerType };
    if (answerType === 'descriptive') {
      const answers = descriptiveAnswers.map(a => a.trim()).filter(Boolean);
      if (answers.length === 0) { SoundManager.play('select'); Alert.alert(t.error, t.enterAnswer); return; }
      
      dataToSave.descriptiveAnswer = answers;
      dataToSave.matchMode = matchMode;
    } else if (answerType === 'truefalse') {
      dataToSave.trueFalseAnswer = trueFalseAnswer;
      dataToSave.explanation = trueFalseAnswer ? '' : explanation.trim();
    } else if (answerType === 'multiple') {
      if (multipleChoice.options.some(opt => !opt.trim())) { SoundManager.play('select'); Alert.alert(t.error, t.fillAllOptions); return; }
      if (multipleChoice.correctAnswers.length === 0) { SoundManager.play('select'); Alert.alert(t.error, locale === 'ja' ? '正解を選択してください' : 'Please select at least one correct answer'); return; }
      dataToSave.multipleChoice = { options: multipleChoice.options, correctAnswers: multipleChoice.correctAnswers };
      dataToSave.explanation = explanation.trim();
    }
    const success = await saveQuestion(dataToSave);
    if (success) {
      SoundManager.play('complete');
      Alert.alert(t.success, t.questionSaved);
      setQuestion(''); setDescriptiveAnswers(['']); setTags([]); setTagInput(''); setAnswerType('descriptive');
      setTrueFalseAnswer(true); setExplanation(''); setMultipleChoice({ options: ['', '', '', ''], correctAnswers: [0] });
      setSelectedImage(null); setShowTagInput(false); setMatchMode('any');
    }
  };

  const addTag = () => { 
    if (tagInput.trim() && !tags.includes(tagInput.trim())) { 
      setTags([...tags, tagInput.trim()]); 
      setTagInput(''); 
    } 
  };
  const removeTag = (tagToRemove: string) => setTags(tags.filter(tag => tag !== tagToRemove));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* 🟢 ローディングを最前面に表示 */}
      {ocrLoading && (
        <View style={styles.ocrLoadingOverlay}>
          <View style={[styles.ocrLoadingContent, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.ocrLoadingText, { color: colors.text }]}>
              {locale === 'ja' ? `解析中 (${ocrProgress}%)...` : `Processing (${ocrProgress}%)...`}
            </Text>
          </View>
        </View>
      )}

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>

      <View style={[styles.header, { borderBottomColor: colors.border, marginBottom: 16, paddingHorizontal: 0 }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          ✏️ {locale === 'ja' ? '問題作成' : 'Create Question'}
        </Text>
        <TouchableOpacity style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.primary, borderRadius: isCyberpunk ? 0 : 10, alignItems: 'center', justifyContent: 'center', minWidth: 70 }} onPress={() => { SoundManager.play('decide'); navigate('/'); }}>
          <Text style={{ color: isCyberpunk ? '#000000' : onPrimary, fontWeight: '700', fontSize: 14 }}>{locale === 'ja' ? '戻る' : 'Back'}</Text>
        </TouchableOpacity>
      </View>

      {/* タグ入力エリア（ヘッダー下） */}
      {showTagInput && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: cpR ?? 15, marginBottom: 16 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.tags}</Text>
          <View style={styles.tagInputContainer}>
            <TextInput style={[styles.tagInput, { backgroundColor: colors.background, borderColor: colors.border, color: isCyberpunk ? '#E0E0E0' : colors.text, borderRadius: cpR ?? 5 }]} value={tagInput} onChangeText={setTagInput} placeholder={t.enterTag} placeholderTextColor={colors.textSecondary} onSubmitEditing={() => { SoundManager.play('decide'); addTag(); }} />
            <TouchableOpacity style={[styles.addTagButton, { backgroundColor: colors.primary, borderRadius: cpR ?? 20 }]} onPress={() => { SoundManager.play('decide'); addTag(); }}><Text style={[styles.addTagText, { color: isCyberpunk ? '#ffffff' : '#000000' }]}>+</Text></TouchableOpacity>
          </View>
          {tags.length > 0 && (<View style={styles.tagContainer}>{tags.map((tag, index) => (<TouchableOpacity key={index} style={[styles.tag, { backgroundColor: colors.primary + '20', borderRadius: cpR ?? 16 }]} onPress={() => { SoundManager.play('select'); removeTag(tag); }}><Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text><Text style={[styles.removeTagText, { color: colors.primary }]}>×</Text></TouchableOpacity>))}</View>)}
        </View>
      )}

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: cpR ?? 15 }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{locale === 'ja' ? '回答形式' : 'Answer Type'}</Text>
        <View style={styles.answerTypeContainer}>
          {[{ id: 'descriptive', label: t.descriptive }, { id: 'truefalse', label: t.truefalse }, { id: 'multiple', label: t.multiple }].map((type) => (
            <TouchableOpacity key={type.id} style={[styles.answerTypeButton, { backgroundColor: colors.background, borderRadius: cpR ?? 5, borderWidth: cpB ?? 1, borderColor: colors.border }, answerType === type.id && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => { SoundManager.play('select'); setAnswerType(type.id as any); }}>
              <Text style={[styles.answerTypeText, { color: colors.textSecondary }, answerType === type.id && { color: onPrimary }]}>{type.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: cpR ?? 15 }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.question}</Text>
        <TextInput style={[styles.input, { minHeight: 80, textAlignVertical: 'top', backgroundColor: colors.background, borderColor: colors.border, color: isCyberpunk ? '#E0E0E0' : colors.text, borderRadius: cpR ?? 5 }]} value={question} onChangeText={setQuestion} placeholder={t.question} placeholderTextColor={colors.textSecondary} multiline />

        {/* 📷 OCRボタン：写真や画像から文字を抽出 */}
        {!showCropUI && (
          <TouchableOpacity
            style={[
              styles.ocrButton,
              {
                backgroundColor: ocrLoading ? colors.textSecondary : colors.primary,
                borderColor: colors.primary,
                borderRadius: cpR ?? 12,
                opacity: ocrLoading ? 0.7 : 1,
              }
            ]}
            onPress={handleOcrExtract}
            disabled={ocrLoading}
          >
            {ocrLoading ? (
              <View style={styles.ocrButtonContent}>
                <ActivityIndicator size="small" color={isCyberpunk ? '#000000' : '#ffffff'} />
                <Text style={[styles.ocrButtonText, { color: isCyberpunk ? '#000000' : '#ffffff', marginLeft: 8 }]}>
                  {locale === 'ja' ? `解析中 (${ocrProgress}%)...` : `Processing (${ocrProgress}%)...`}
                </Text>
              </View>
            ) : (
              <View style={styles.ocrButtonContent}>
                <Text style={[styles.ocrButtonIcon]}>📷</Text>
                <Text style={[styles.ocrButtonText, { color: isCyberpunk ? '#000000' : '#ffffff' }]}>
                  {locale === 'ja' ? '写真や画像から文字を抽出' : 'Extract text from image'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* クロップUI */}
        {showCropUI && selectedImage && (
          <View style={[styles.cropContainer, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: cpR ?? 12, padding: 16, marginBottom: 16 }]}>
            <Text style={[styles.cropTitle, { color: colors.text, marginBottom: 12 }]}>
              {locale === 'ja' ? '抽出したい範囲をドラッグで選択してください' : 'Drag to select the area to extract'}
            </Text>
            <div
              ref={containerRef as any}
              className="crop-image-container"
              style={{ borderColor: colors.border, touchAction: 'none' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <img
                ref={imageRef}
                src={selectedImage}
                alt="crop"
                style={styles.cropImage}
                draggable={false}
              />
              {cropArea.width > 0 && cropArea.height > 0 && (
                <div
                  className="crop-overlay"
                  style={{
                    left: cropArea.x,
                    top: cropArea.y,
                    width: cropArea.width,
                    height: cropArea.height,
                    borderColor: colors.primary,
                  }}
                />
              )}
            </div>
            <View style={[styles.cropButtons, { marginTop: 12 }]}>
              <TouchableOpacity
                style={[styles.cropButton, { backgroundColor: colors.primary, borderRadius: cpR ?? 8, marginRight: 8 }]}
                onPress={handleOcrExtract}
                disabled={ocrLoading || cropArea.width < 10 || cropArea.height < 10}
              >
                <Text style={[styles.cropButtonText, { color: onPrimary }]}>
                  {locale === 'ja' ? 'この範囲で文字抽出' : 'Extract Text'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cropButton, { backgroundColor: colors.error, borderRadius: cpR ?? 8 }]}
                onPress={cancelCrop}
              >
                <Text style={[styles.cropButtonText, { color: '#fff' }]}>
                  {locale === 'ja' ? 'キャンセル' : 'Cancel'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 問題入力欄のすぐ下に両解モード・タグ追加ボタンを配置 */}
        <View style={[styles.inlineButtons, { flexDirection: 'row', gap: 10, marginBottom: 16 }]}>
          <TouchableOpacity
            style={[
              styles.inlineModeButton,
              { 
                flex: 1,
                borderColor: colors.primary,
                backgroundColor: matchMode === 'all' ? colors.primary : 'transparent'
              }
            ]}
            onPress={toggleMatchMode}
          >
            <Text style={[
              styles.inlineModeButtonText,
              { 
                color: matchMode === 'all' 
                  ? (isCyberpunk ? '#000000' : '#ffffff') 
                  : colors.primary
              }
            ]}>
              {locale === 'ja' ? '両解モード' : 'Multi-Answer'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.inlineModeButton,
              { 
                flex: 1,
                borderColor: colors.primary,
                backgroundColor: showTagInput ? colors.primary : 'transparent'
              }
            ]}
            onPress={() => {
              SoundManager.play('decide');
              setShowTagInput(!showTagInput);
            }}
          >
            <Text style={[
              styles.inlineModeButtonText,
              { 
                color: showTagInput 
                  ? (isCyberpunk ? '#000000' : '#ffffff') 
                  : colors.primary
              }
            ]}>
              🏷️ {locale === 'ja' ? 'タグを追加' : 'Add Tags'}
            </Text>
          </TouchableOpacity>
        </View>

        {answerType === 'descriptive' && (
          <View>
            {matchMode === 'all' && (
              <View style={[styles.matchModeInfo, { backgroundColor: colors.primary + '15', borderColor: colors.primary, borderRadius: 6, padding: 10, marginBottom: 12 }]}>
                <Text style={[styles.matchModeInfoText, { color: colors.primary, fontSize: 12 }]}>
                  {locale === 'ja' 
                    ? '※ 各入力欄に正解を1つずつ入力してください（順不同）' 
                    : '※ Enter one correct answer in each field (order doesn\'t matter)'}
                </Text>
              </View>
            )}

            {descriptiveAnswers.map((answer, index) => (
              <View key={index} style={styles.descriptiveAnswerRow}>
                <TextInput
                  style={[styles.input, { flex: 1, minHeight: 60, textAlignVertical: 'top', backgroundColor: colors.background, borderColor: colors.border, color: isCyberpunk ? '#E0E0E0' : colors.text, borderRadius: cpR ?? 5 }]}
                  value={answer}
                  onChangeText={(text) => {
                    const newAnswers = [...descriptiveAnswers];
                    newAnswers[index] = text;
                    setDescriptiveAnswers(newAnswers);
                  }}
                  placeholder={locale === 'ja' ? `正解 ${index + 1}` : `Answer ${index + 1}`}
                  placeholderTextColor={colors.textSecondary}
                  multiline
                />
                {index > 0 && (
                  <TouchableOpacity
                    style={[styles.removeAnswerButton, { backgroundColor: colors.error }]}
                    onPress={() => {
                      setDescriptiveAnswers([descriptiveAnswers[0]]);
                      if (matchMode === 'all') {
                        setMatchMode('any');
                      }
                    }}
                  >
                    <Text style={[styles.removeAnswerButtonText, { color: '#fff' }]}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            
            <TouchableOpacity
              style={[styles.addAnswerButton, { borderColor: colors.primary, backgroundColor: colors.primary + '10', marginBottom: 16 }]}
              onPress={() => setDescriptiveAnswers([...descriptiveAnswers, ''])}
            >
              <Text style={[styles.addAnswerButtonText, { color: colors.primary }]}>
                + {locale === 'ja' ? '正解を追加' : 'Add Answer'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {answerType === 'truefalse' && (
          <View>
            <View style={styles.trueFalseContainer}>
              <TouchableOpacity style={[styles.trueFalseButton, { backgroundColor: colors.background, borderRadius: cpR ?? 5, borderWidth: cpB ?? 1, borderColor: colors.border }, trueFalseAnswer && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => { SoundManager.play('decide'); setTrueFalseAnswer(true); }}><Text style={[styles.trueFalseText, { color: colors.text }, trueFalseAnswer && { color: onPrimary }]}>O</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.trueFalseButton, { backgroundColor: colors.background, borderRadius: cpR ?? 5, borderWidth: cpB ?? 1, borderColor: colors.border }, !trueFalseAnswer && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => { SoundManager.play('decide'); setTrueFalseAnswer(false); }}><Text style={[styles.trueFalseText, { color: colors.text }, !trueFalseAnswer && { color: onPrimary }]}>×</Text></TouchableOpacity>
            </View>
            {!trueFalseAnswer && (
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top', backgroundColor: colors.background, borderColor: colors.border, color: isCyberpunk ? '#E0E0E0' : colors.text, borderRadius: cpR ?? 5, marginTop: 10 }]}
                value={explanation}
                onChangeText={setExplanation}
                placeholder={locale === 'ja' ? '備考（どこが違うのか・解説）' : 'Note (explanation)'}
                placeholderTextColor={colors.textSecondary}
                multiline
              />
            )}
          </View>
        )}
        {answerType === 'multiple' && (
          <View>
            {multipleChoice.options.map((option, index) => (
              <TextInput
                key={index}
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: isCyberpunk ? '#E0E0E0' : colors.text, borderRadius: cpR ?? 5 }]}
                value={option}
                onChangeText={(text) => {
                  const newOptions = [...multipleChoice.options];
                  newOptions[index] = text;
                  setMultipleChoice({...multipleChoice, options: newOptions});
                }}
                placeholder={`${t.options} ${index + 1}`}
                placeholderTextColor={colors.textSecondary}
              />
            ))}
            <View style={styles.correctAnswerContainer}>
              <Text style={[styles.correctAnswerLabel, { color: colors.text }]}>{t.correctAnswer}:</Text>
              <View style={styles.correctAnswerButtonsRow}>
                {[0, 1, 2, 3].map((i) => {
                  const isSelected = multipleChoice.correctAnswers.includes(i);
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.correctAnswerButton, { backgroundColor: colors.background, borderRadius: cpR ?? 5, borderWidth: cpB ?? 1, borderColor: colors.border }, isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => {
                        SoundManager.play('decide');
                        if (isSelected) {
                          const newAnswers = multipleChoice.correctAnswers.filter(a => a !== i);
                          setMultipleChoice({...multipleChoice, correctAnswers: newAnswers.length > 0 ? newAnswers : [0]});
                        } else {
                          setMultipleChoice({...multipleChoice, correctAnswers: [...multipleChoice.correctAnswers, i]});
                        }
                      }}
                    >
                      <Text style={[styles.correctAnswerText, { color: colors.text }, isSelected && { color: onPrimary }]}>{i + 1}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top', backgroundColor: colors.background, borderColor: colors.border, color: isCyberpunk ? '#E0E0E0' : colors.text, borderRadius: cpR ?? 5, marginTop: 10 }]}
              value={explanation}
              onChangeText={setExplanation}
              placeholder={locale === 'ja' ? '備考・解説（任意）' : 'Note / Explanation (optional)'}
              placeholderTextColor={colors.textSecondary}
              multiline
            />
          </View>
        )}
        <TouchableOpacity style={[styles.createButton, { backgroundColor: colors.primary, borderRadius: cpR ?? 25, borderWidth: cpB, borderColor: isCyberpunk ? colors.primary : undefined, marginTop: 8 }]} onPress={handleManualCreate}>
          <Text style={[styles.buttonText, { color: (isCyberpunk || currentTheme === 'dark') ? '#000000' : '#ffffff' }]}>{t.createQuestion}</Text>
        </TouchableOpacity>
      </View>

      {/* 🟢 画像添付UIを削除（OCR機能のみ使用） */}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 0, paddingVertical: 12, borderBottomWidth: 1, backgroundColor: 'transparent', flexWrap: 'wrap', gap: 10 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  headerButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  headerModeButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  headerModeButtonText: { fontSize: 14, fontWeight: 'bold' },
  closeButton: { paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', minWidth: 70 },
  closeButtonText: { fontSize: 14, fontWeight: 'bold' },
  section: { padding: 20, marginBottom: 25, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 5 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  input: { borderWidth: 1, padding: 10, marginBottom: 10, fontSize: 16 },
  ocrButton: { padding: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 2 },
  ocrButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ocrButtonIcon: { fontSize: 20, marginRight: 8 },
  ocrButtonText: { fontSize: 15, fontWeight: '700' },
  createButton: { padding: 15, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },
  button: { padding: 12, alignItems: 'center' },
  buttonText: { fontWeight: 'bold', fontSize: 16 },
  answerTypeContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 },
  answerTypeButton: { padding: 10, minWidth: 80, alignItems: 'center' },
  answerTypeText: { fontWeight: 'bold', fontSize: 12 },
  trueFalseContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15 },
  trueFalseButton: { padding: 15, minWidth: 60, alignItems: 'center' },
  trueFalseText: { fontWeight: 'bold', fontSize: 16 },
  correctAnswerContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 15 },
  correctAnswerLabel: { fontSize: 14, fontWeight: 'bold' },
  correctAnswerButton: { padding: 10, minWidth: 40, alignItems: 'center' },
  correctAnswerText: { fontWeight: 'bold', fontSize: 14 },
  correctAnswerButtonsRow: { flexDirection: 'row', gap: 10 },
  descriptiveAnswerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  removeAnswerButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  removeAnswerButtonText: { fontSize: 20, fontWeight: 'bold' },
  addAnswerButton: { padding: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center', marginTop: 8 },
  addAnswerButtonText: { fontSize: 14, fontWeight: '600' },
  tagInputContainer: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  tagInput: { flex: 1, borderWidth: 1, padding: 10 },
  addTagButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addTagText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  tagContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  tagText: { fontSize: 14, fontWeight: '500' },
  removeTagText: { fontSize: 16, fontWeight: 'bold' },
  imageUploadBtn: { padding: 24, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  imageUploadText: { fontSize: 15, fontWeight: '600' },
  imagePreview: { position: 'relative', overflow: 'hidden', marginBottom: 12 },
  matchModeInfo: { padding: 10, borderWidth: 1, marginTop: 8 },
  matchModeInfoText: { fontSize: 12, lineHeight: 18 },
  inlineButtons: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  inlineModeButton: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  inlineModeButtonText: { fontSize: 14, fontWeight: 'bold' },
  cropContainer: { marginBottom: 16 },
  cropTitle: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  cropImageContainer: { position: 'relative', overflow: 'hidden', borderWidth: 2, borderStyle: 'dashed' },
  cropImage: { width: '100%', height: 'auto' },
  cropOverlay: { position: 'absolute', borderWidth: 2 },
  cropButtons: { flexDirection: 'row', justifyContent: 'center' },
  cropButton: { paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', minWidth: 120 },
  cropButtonText: { fontSize: 14, fontWeight: 'bold' },
  // 🟢 ローディングオーバーレイ用スタイル
  ocrLoadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 999999 },
  ocrLoadingContent: { padding: 30, borderRadius: 20, alignItems: 'center', minWidth: 200 },
  ocrLoadingText: { fontSize: 16, fontWeight: 'bold', marginTop: 15 },
});
