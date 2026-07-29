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
  Modal,
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
import { loadTagMasterList, addTagToMasterList, removeTagFromMasterList } from './utils/storageUtils';
import Tesseract from 'tesseract.js';
import './create.css';

export default function CreateQuestionScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary, isCyberpunk, currentTheme } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const { questions, saveQuestions, applyQuestionsChange, removeTagFromAllQuestions } = useQuestionsContext();
  const { user } = useAuth();
  const cpR: number | undefined = isCyberpunk ? 0 : undefined;
  const cpB: number | undefined = isCyberpunk ? 2 : undefined;

  useEffect(() => {
    SoundManager.initialize();
  }, []);
  
  const [question, setQuestion] = useState('');
  const [answerType, setAnswerType] = useState<'descriptive' | 'truefalse' | 'multiple'>('descriptive');
  const [answerGroups, setAnswerGroups] = useState<string[][]>([['']]);
  const [trueFalseAnswer, setTrueFalseAnswer] = useState(true);
  const [explanation, setExplanation] = useState('');
  const [multipleChoice, setMultipleChoice] = useState({
    options: ['', '', '', ''],
    correctAnswers: [0] as number[]
  });
  const [tags, setTags] = useState<string[]>([]);
  const [tagMasterList, setTagMasterList] = useState<string[]>([]);

  // タグ追加モーダル用 state
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  // タグ削除モード用 state
  const [isTagDeleteMode, setIsTagDeleteMode] = useState(false);

  // タグ削除確認モーダル用 state
  const [showTagDeleteModal, setShowTagDeleteModal] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);

  // Toast notification state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // 作成中フラグ（二重送信防止）
  const [isCreating, setIsCreating] = useState(false);

  type OcrTarget = { type: 'question' } | { type: 'answer'; groupIndex: number; answerIndex: number };
  const [ocrTarget, setOcrTarget] = useState<OcrTarget>({ type: 'question' });

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

  // 🟢 画像添付UIを削除（OCR機能のみ使用）

  // タグのマスターリストを読み込む
  useEffect(() => {
    loadTagMasterList().then(setTagMasterList);
  }, []);

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
  const handleOcrExtract = async (target: OcrTarget = { type: 'question' }) => {
    setOcrTarget(target);
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

      worker = await (Tesseract as any).createWorker('jpn+jpn_vert', 1, {
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
        if (ocrTarget.type === 'question') {
          setQuestion(prev => prev ? `${prev}\n${cleanedText}` : cleanedText);
        } else {
          setAnswerGroups(prev => {
            const updated = prev.map(g => [...g]);
            const current = updated[ocrTarget.groupIndex][ocrTarget.answerIndex] || '';
            updated[ocrTarget.groupIndex][ocrTarget.answerIndex] = current ? `${current}\n${cleanedText}` : cleanedText;
            return updated;
          });
        }
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
      await applyQuestionsChange(current => [...current, newQuestion]);
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
    // Prevent double submission
    if (isCreating) {
      console.log('⏳ 既に作成中です');
      return;
    }

    if (!question.trim()) {
      SoundManager.play('select');
      Alert.alert(t.error, t.enterQuestion);
      return;
    }

    setIsCreating(true);

    try {
    let dataToSave: any = { question: question.trim() || '', answerType: answerType };
    if (answerType === 'descriptive') {
      const cleanedGroups = answerGroups
        .map(group => group.map(a => a.trim()).filter(Boolean))
        .filter(group => group.length > 0);

      if (cleanedGroups.length === 0) { SoundManager.play('select'); Alert.alert(t.error, t.enterAnswer); return; }

      dataToSave.descriptiveAnswerGroups = cleanedGroups;
      // 互換性のため、旧形式のフィールドも一緒に保存しておく
      // （browse.tsx編集画面・答え表示アラートが対応するまでの暫定措置）
      dataToSave.descriptiveAnswer = cleanedGroups.flat();
      dataToSave.matchMode = cleanedGroups.length > 1 ? 'all' : 'any';
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
      // Show toast notification instead of Alert
      setToastMessage('✅ 問題を作成しました！');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000); // Auto dismiss after 3s
      
      setQuestion(''); setAnswerGroups([['']]); setTags([]); setAnswerType('descriptive');
      setTrueFalseAnswer(true); setExplanation(''); setMultipleChoice({ options: ['', '', '', ''], correctAnswers: [0] });
      setSelectedImage(null);
    }
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert(t.error, t.failedToSave);
    } finally {
      setIsCreating(false);
    }
  };

  const handleTagToggle = async (tag: string) => {
    SoundManager.play('select');
    if (tags.includes(tag)) {
      setTags(prev => prev.filter(t => t !== tag));
    } else {
      setTags(prev => [...prev, tag]);
    }
  };

  const handleTagLongPress = (tag: string) => {
    Alert.alert(
      locale === 'ja' ? 'タグを削除' : 'Delete Tag',
      locale === 'ja'
        ? `「${tag}」を削除しますか？\n削除すると、このタグが付いている全ての問題からも取り除かれます。`
        : `Delete "${tag}"?\nThis will also remove it from all questions that have this tag.`,
      [
        { text: locale === 'ja' ? 'キャンセル' : 'Cancel', style: 'cancel' },
        {
          text: locale === 'ja' ? '削除する' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            await removeTagFromAllQuestions(tag);
            await removeTagFromMasterList(tag);
            setTagMasterList(prev => prev.filter(t => t !== tag));
            setTags(prev => prev.filter(t => t !== tag));
          }
        }
      ]
    );
  };

  const handleAddNewTag = async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) {
      Alert.alert(
        locale === 'ja' ? 'エラー' : 'Error',
        locale === 'ja' ? 'タグ名を入力してください' : 'Please enter a tag name'
      );
      return;
    }
    SoundManager.play('decide');
    const added = await addTagToMasterList(trimmed);
    if (added) {
      setTagMasterList(prev => [...prev, trimmed]);
      setTags(prev => [...prev, trimmed]);
      setNewTagName('');
      setShowAddTagModal(false);
      setIsTagDeleteMode(false);
      SoundManager.play('complete');
    } else {
      Alert.alert(t.error, locale === 'ja' ? '既に存在するタグです' : 'Tag already exists');
    }
  };

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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={[styles.addTagHeaderBtn, { 
              backgroundColor: isTagDeleteMode ? colors.error : colors.primary,
              borderRadius: 8, 
              paddingHorizontal: 14, 
              paddingVertical: 8 
            }]}
            onPress={() => {
              if (isTagDeleteMode) {
                setIsTagDeleteMode(false);
              } else {
                if (tagMasterList.length === 0) {
                  Alert.alert(
                    locale === 'ja' ? '削除するタグがありません' : 'No tags to delete',
                    locale === 'ja' ? 'タグが存在しないため、削除モードを開始できません。' : 'There are no tags to delete.'
                  );
                  return;
                }
                setIsTagDeleteMode(true);
              }
            }}
          >
            <Text style={[styles.addTagHeaderBtnText, { 
              color: isTagDeleteMode ? '#ffffff' : onPrimary, 
              fontWeight: 'bold', 
              fontSize: 13 
            }]}>
              {isTagDeleteMode ? '✕ キャンセル' : '− タグ'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addTagHeaderBtn, { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }]}
            onPress={() => setShowAddTagModal(true)}
          >
            <Text style={[styles.addTagHeaderBtnText, { color: onPrimary, fontWeight: 'bold', fontSize: 13 }]}>
              ＋ タグ
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.primary, borderRadius: isCyberpunk ? 0 : 10, alignItems: 'center', justifyContent: 'center', minWidth: 70 }} onPress={() => { SoundManager.play('decide'); navigate('/'); }}>
            <Text style={{ color: isCyberpunk ? '#000000' : onPrimary, fontWeight: '700', fontSize: 14 }}>{locale === 'ja' ? '戻る' : 'Back'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* タグセクション - 横スクロール表示 */}
      {tagMasterList.length > 0 && (
        <View style={[styles.tagSection, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 16 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
              {tagMasterList.map((tag) => {
                const isSelected = tags.includes(tag);
                const isDeleteMode = isTagDeleteMode;
                
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[
                      styles.tagChip,
                      {
                        backgroundColor: isDeleteMode 
                          ? colors.error + '20' 
                          : isSelected ? colors.primary : colors.primary + '20',
                        borderColor: isDeleteMode 
                          ? colors.error 
                          : isSelected ? colors.primary : colors.border,
                        borderWidth: 2,
                        borderRadius: 20,
                        paddingHorizontal: 14,
                        paddingVertical: 6,
                        opacity: isDeleteMode ? 0.9 : 1,
                      }
                    ]}
                    onPress={() => {
                      if (isDeleteMode) {
                        setTagToDelete(tag);
                        setShowTagDeleteModal(true);
                        return;
                      }
                      
                      if (tags.includes(tag)) {
                        setTags(prev => prev.filter(t => t !== tag));
                      } else {
                        setTags(prev => [...prev, tag]);
                      }
                    }}
                    onLongPress={() => {
                      if (!isDeleteMode) {
                        setTagToDelete(tag);
                        setShowTagDeleteModal(true);
                      }
                    }}
                  >
                    <Text style={[
                      styles.tagChipText,
                      {
                        color: isDeleteMode 
                          ? colors.error 
                          : isSelected ? onPrimary : colors.primary,
                        fontWeight: isSelected || isDeleteMode ? 'bold' : '500',
                        fontSize: 13,
                      }
                    ]}>
                      {isDeleteMode ? '✕ ' : ''}
                      {isSelected && !isDeleteMode ? '✓ ' : ''}{tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          {isTagDeleteMode && (
            <Text style={{ color: colors.error, fontSize: 12, marginTop: 8, textAlign: 'center' }}>
              {locale === 'ja' ? '⚠️ 削除したいタグをタップしてください' : '⚠️ Tap the tag you want to delete'}
            </Text>
          )}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.question}</Text>
          {!showCropUI && (
            <TouchableOpacity
              style={[styles.ocrIconButton, { backgroundColor: colors.primary, borderRadius: 8, padding: 10 }]}
              onPress={() => handleOcrExtract({ type: 'question' })}
              disabled={ocrLoading}
            >
              <Text style={{ fontSize: 20, color: onPrimary }}>📷</Text>
            </TouchableOpacity>
          )}
        </View>
        <TextInput style={[styles.input, { minHeight: 80, textAlignVertical: 'top', backgroundColor: colors.background, borderColor: colors.border, color: isCyberpunk ? '#E0E0E0' : colors.text, borderRadius: cpR ?? 5 }]} value={question} onChangeText={setQuestion} placeholder={t.question} placeholderTextColor={colors.textSecondary} multiline />

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
                onPress={() => handleOcrExtract(ocrTarget)}
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

        {answerType === 'descriptive' && (
          <View>
            {answerGroups.map((group, groupIndex) => (
              <View key={groupIndex} style={[
                styles.answerGroupCard,
                { 
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  borderWidth: 2,
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 14,
                }
              ]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.answerGroupHeader, { backgroundColor: colors.primary + '20', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 }]}>
                      <Text style={[styles.answerGroupHeaderText, { color: colors.primary, fontWeight: 'bold', fontSize: 13 }]}>
                        {locale === 'ja' ? `📝 正解 ${groupIndex + 1}` : `✅ Answer ${groupIndex + 1}`}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.ocrIconButton, { backgroundColor: colors.primary, borderRadius: 8 }]}
                      onPress={() => handleOcrExtract({ type: 'answer', groupIndex, answerIndex: 0 })}
                      disabled={ocrLoading}
                    >
                      <Text style={{ fontSize: 16, color: onPrimary }}>📷</Text>
                    </TouchableOpacity>
                  </View>
                  {answerGroups.length > 1 && groupIndex > 0 && (
                    <TouchableOpacity
                      style={{ padding: 6, borderRadius: 20, backgroundColor: colors.error + '20' }}
                      onPress={() => {
                        const newGroups = answerGroups.filter((_, i) => i !== groupIndex);
                        setAnswerGroups(newGroups.length > 0 ? newGroups : [['']]);
                      }}
                    >
                      <Text style={{ color: colors.error, fontSize: 14, fontWeight: 'bold' }}>✕ {locale === 'ja' ? '削除' : 'Remove'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                
                {group.map((answer, answerIndex) => (
                  <View key={answerIndex} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500', minWidth: 24 }}>
                      {String.fromCharCode(65 + answerIndex)}
                    </Text>
                    <TextInput
                      style={[styles.input, { 
                        flex: 1, 
                        minHeight: 44, 
                        textAlignVertical: 'center',
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        color: colors.text,
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        fontSize: 14,
                      }]}
                      value={answer}
                      onChangeText={(text) => {
                        const newGroups = answerGroups.map(g => [...g]);
                        newGroups[groupIndex][answerIndex] = text;
                        setAnswerGroups(newGroups);
                      }}
                      placeholder={locale === 'ja' ? '言い換え候補を入力' : 'Enter alternative answer'}
                      placeholderTextColor={colors.textSecondary}
                    />
                    {group.length > 1 && answerIndex > 0 && (
                      <TouchableOpacity
                        style={{ padding: 6, borderRadius: 16, backgroundColor: colors.error + '20' }}
                        onPress={() => {
                          const newGroups = answerGroups.map(g => [...g]);
                          newGroups[groupIndex] = newGroups[groupIndex].filter((_, i) => i !== answerIndex);
                          const filtered = newGroups.filter(g => g.length > 0);
                          setAnswerGroups(filtered.length > 0 ? filtered : [['']]);
                        }}
                      >
                        <Text style={{ color: colors.error, fontSize: 16, fontWeight: 'bold' }}>×</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                
                <TouchableOpacity
                  style={{ alignSelf: 'flex-start', marginTop: 6 }}
                  onPress={() => {
                    const newGroups = answerGroups.map(g => [...g]);
                    newGroups[groupIndex] = [...newGroups[groupIndex], ''];
                    setAnswerGroups(newGroups);
                  }}
                >
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
                    ＋ {locale === 'ja' ? '言い換えを追加' : 'Add alternative'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              style={[
                styles.addAnswerSlotBtn,
                {
                  backgroundColor: colors.primary + '15',
                  borderColor: colors.primary,
                  borderWidth: 2,
                  borderStyle: 'dashed',
                  borderRadius: 12,
                  padding: 14,
                  alignItems: 'center',
                  marginTop: 8,
                }
              ]}
              onPress={() => setAnswerGroups([...answerGroups, ['']])}
            >
              <Text style={[styles.addAnswerSlotBtnText, { color: colors.primary, fontSize: 15, fontWeight: 'bold' }]}>
                ＋ {locale === 'ja' ? '新しい正解を追加（複数空欄用）' : 'Add new answer slot (for multiple blanks)'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                {locale === 'ja' ? '例：「AとB」のような複数回答が必要な問題に' : 'For questions requiring multiple answers like "A and B"'}
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
        <TouchableOpacity
          style={[styles.createButton, {
            backgroundColor: isCreating ? colors.textSecondary : colors.primary,
            borderRadius: cpR ?? 25,
            borderWidth: cpB,
            borderColor: isCyberpunk ? colors.primary : undefined,
            marginTop: 8,
            opacity: isCreating ? 0.6 : 1,
          }]}
          onPress={handleManualCreate}
          disabled={isCreating}
        >
          <Text style={[styles.buttonText, { color: (isCyberpunk || currentTheme === 'dark') ? '#000000' : '#ffffff' }]}>
            {isCreating ? '⏳ 作成中...' : t.createQuestion}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 🟢 画像添付UIを削除（OCR機能のみ使用） */}

      {/* タグ追加モーダル（問題集作成と同様のスタイル） */}
      <Modal visible={showAddTagModal} transparent animationType="fade" statusBarTranslucent={true}>
        <View style={[styles.modalOverlay, { zIndex: 9999 }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {locale === 'ja' ? '🏷️ 新しいタグを追加' : '🏷️ Add New Tag'}
            </Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.text }]}
              value={newTagName}
              onChangeText={setNewTagName}
              placeholder={locale === 'ja' ? 'タグ名を入力' : 'Enter tag name'}
              placeholderTextColor={colors.textSecondary}
              maxLength={20}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => {
                  setShowAddTagModal(false);
                  setNewTagName('');
                }}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>
                  {locale === 'ja' ? 'キャンセル' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
                onPress={handleAddNewTag}
              >
                <Text style={[styles.modalSaveText, { color: onPrimary }]}>
                  {locale === 'ja' ? '追加' : 'Add'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* タグ削除確認モーダル */}
      <Modal visible={showTagDeleteModal} transparent animationType="fade" statusBarTranslucent={true}>
        <View style={[styles.modalOverlay, { zIndex: 9999 }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              🗑️ {locale === 'ja' ? 'タグを削除' : 'Delete Tag'}
            </Text>
            <Text style={[{ color: colors.textSecondary, textAlign: 'center', marginBottom: 20, fontSize: 14, lineHeight: 22 }]}>
              {locale === 'ja'
                ? `「${tagToDelete}」を全ての問題から削除しますか？\nこの操作は取り消せません。`
                : `Delete "${tagToDelete}" from all questions?\nThis action cannot be undone.`}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => {
                  setShowTagDeleteModal(false);
                  setTagToDelete(null);
                }}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>
                  {locale === 'ja' ? 'キャンセル' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: colors.error }]}
                onPress={async () => {
                  if (tagToDelete) {
                    await removeTagFromAllQuestions(tagToDelete);
                    await removeTagFromMasterList(tagToDelete);
                    setTagMasterList(prev => prev.filter(t => t !== tagToDelete));
                    setTags(prev => prev.filter(t => t !== tagToDelete));
                    SoundManager.play('delete');
                    
                    if (tagMasterList.length <= 1) {
                      setIsTagDeleteMode(false);
                    }
                    
                    setShowTagDeleteModal(false);
                    setTagToDelete(null);
                  }
                }}
              >
                <Text style={[styles.modalSaveText, { color: '#ffffff' }]}>
                  {locale === 'ja' ? '削除する' : 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Toast Notification */}
      {showToast && (
        <View style={styles.toastContainer}>
          <TouchableOpacity 
            style={[styles.toast, { backgroundColor: colors.success }]}
            onPress={() => setShowToast(false)}
            activeOpacity={0.8}
          >
            <Text style={[styles.toastText, { color: '#fff' }]}>
              {toastMessage}
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
  ocrIconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
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
  answerGroupCard: {
    padding: 14,
    borderWidth: 2,
    borderRadius: 12,
    marginBottom: 14,
  },
  answerGroupHeader: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  answerGroupHeaderText: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  addAnswerSlotBtn: {
    padding: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  addAnswerSlotBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  tagSection: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  addTagHeaderBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addTagHeaderBtnText: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 2,
    marginRight: 8,
  },
  tagChipText: {
    fontSize: 13,
  },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContainer: { width: '85%', maxWidth: 400, padding: 24, borderRadius: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  modalCancelText: { fontWeight: 'bold' },
  modalSaveBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center' },
  modalSaveText: { color: '#000000', fontWeight: 'bold', fontSize: 15 },
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
  // Toast notification styles
  toastContainer: {
    position: 'absolute',
    bottom: 40,
    left: '50%',
    transform: [{ translateX: '-50%' }],
    zIndex: 999,
  },
  toast: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  toastText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
