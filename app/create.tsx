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
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
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

  const [imageAnnotations, setImageAnnotations] = useState<ImageAnnotation[]>([]);
  const [annotationColor, setAnnotationColor] = useState('#FFFFFF');
  const [annotationOpacity, setAnnotationOpacity] = useState(80);

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        Alert.alert('エラー', locale === 'ja' ? '画像は5MB以下にしてください' : 'Image must be less than 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        Alert.alert('エラー', locale === 'ja' ? '画像ファイルを選択してください' : 'Please select an image file');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setSelectedImage(base64);
        setShowCropUI(true); // 画像選択後、クロップUIを表示
        SoundManager.play('decide');
      };
      reader.onerror = () => {
        Alert.alert('エラー', locale === 'ja' ? '画像の読み込みに失敗しました' : 'Failed to load image');
      };
      reader.readAsDataURL(file);
    }
  };

  // クロップ範囲のリセット
  const resetCropArea = () => {
    setCropArea({ x: 0, y: 0, width: 0, height: 0 });
  };

  // マウス/タッチイベントハンドラ
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !imageRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDragging(true);
    setDragStart({ x, y });
    setCropArea({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = x - dragStart.x;
    const height = y - dragStart.y;
    setCropArea({
      x: width < 0 ? x : dragStart.x,
      y: height < 0 ? y : dragStart.y,
      width: Math.abs(width),
      height: Math.abs(height),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 画像をクロップ（エラー安全版）
  const cropImage = (): string | null => {
    const img = imageRef.current;
    if (!img) {
      console.error("OCR Error: imageRef.current is null");
      Alert.alert("エラー", "画像要素が見つかりません。");
      return null;
    }

    // naturalWidth が 0 や undefined の場合のフォールバックを徹底
    const imgWidth = img.naturalWidth || img.width || 0;
    const imgHeight = img.naturalHeight || img.height || 0;

    if (imgWidth === 0 || imgHeight === 0) {
      console.error("OCR Error: Image dimensions are 0", { imgWidth, imgHeight });
      Alert.alert("エラー", "画像のサイズを正常に取得できませんでした。画像の読み込み完了を待つか、別の画像でお試しください。");
      return null;
    }

    try {
      const rect = img.getBoundingClientRect();
      const scaleX = imgWidth / (rect.width || 1);
      const scaleY = imgHeight / (rect.height || 1);

      const startX = Math.max(0, Math.min(cropArea.x, cropArea.x + cropArea.width)) * scaleX;
      const startY = Math.max(0, Math.min(cropArea.y, cropArea.y + cropArea.height)) * scaleY;
      const cropW = Math.max(10, Math.abs(cropArea.width)) * scaleX;
      const cropH = Math.max(10, Math.abs(cropArea.height)) * scaleY;

      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvas context is null");

      ctx.drawImage(img, startX, startY, cropW, cropH, 0, 0, cropW, cropH);
      return canvas.toDataURL('image/jpeg');
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
        if (!file) return;

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
        input.value = '';
      };
      input.click();
      return;
    }

    // クロップUI表示中は、選択範囲でOCR実行
    const deltaX = Math.abs(cropArea.width);
    const deltaY = Math.abs(cropArea.height);
    
    console.log("OCR Triggered - Crop Dimensions:", { deltaX, deltaY });

    if (!selectedImage) return;
    
    const croppedImage = cropImage();
    if (!croppedImage) {
      console.error("OCR Error: cropImage returned null");
      return;
    }

    console.log('Starting OCR from cropped image...');
    await processOcrFromDataUrl(croppedImage);
  };

  // DataURLからOCR処理を実行
  const processOcrFromDataUrl = async (dataUrl: string) => {
    setOcrLoading(true);
    setOcrProgress(0);

    let worker: any = null;
    try {
      console.log("OCR: Creating Tesseract Worker...");
      // Tesseract.js v7 の初期化（言語を指定、langPathは使用しない）
      worker = await Tesseract.createWorker('jpn', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });

      console.log("OCR: Setting parameters...");
      // ページセグメンテーションモード(PSM 4)の設定
      await worker.setParameters({
        tessedit_pageseg_mode: '4',
      });

      console.log("OCR: Recognizing text...");
      const { data: { text } } = await worker.recognize(dataUrl);
      
      if (text && text.trim().length > 0) {
        // 既存の入力値がある場合は改行して追加
        setQuestion(prev => prev ? `${prev}\n${text.trim()}` : text.trim());
        
        // 抽出が成功したらクロップUIを閉じてプレビューに戻す
        setShowCropUI(false);
        setSelectedImage(null);
        Alert.alert(t.success || 'Success', '文字の抽出が完了しました！');
      } else {
        Alert.alert(t.error || 'Error', '画像から文字を検出できませんでした。別の範囲をお試しください。');
      }

    } catch (err) {
      console.error("OCR Final Critical Error:", err);
      Alert.alert("OCRエラー", "文字認識処理中にエラーが発生しました。インターネット接続や画像を確認してください。");
    } finally {
      // 🟢 成功・失敗に関わらず、必ずローディング状態を解除してボタンを復帰させる
      if (worker) {
        await worker.terminate();
      }
      setOcrLoading(false);
      setOcrProgress(0);
    }
  };

  // OCR処理の共通ロジック
  const processOcr = async (file: File) => {
    try {
      setOcrLoading(true);
      setOcrProgress(0);

      const processedImageDataUrl = await preprocessImage(file);

      const worker = await Tesseract.createWorker('jpn', 1, {
        langPath: 'https://tessdata.projectnaptha.com/4.0.0_best/',
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
          }
          console.log(m);
        },
      });

      try {
        await worker.setParameters({
          tessedit_pageseg_mode: '4' as any,
        });

        const result = await worker.recognize(processedImageDataUrl);
        const extractedText = result.data.text.trim();
        if (!extractedText) {
          Alert.alert(
            locale === 'ja' ? '文字が見つかりません' : 'No text found',
            locale === 'ja' ? '画像から文字を検出できませんでした。別の画像をお試しください。' : 'Could not detect text from the image. Please try another image.'
          );
          return;
        }

        setQuestion(prev => {
          if (prev.trim()) {
            return prev + '\n' + extractedText;
          }
          return extractedText;
        });

        setShowCropUI(false);
        setSelectedImage(null);

        SoundManager.play('complete');
      } finally {
        await worker.terminate();
      }
    } catch (error) {
      console.error('OCR error:', error);
      Alert.alert(
        locale === 'ja' ? 'OCRエラー' : 'OCR Error',
        locale === 'ja' ? '文字の解析中にエラーが発生しました。もう一度お試しください。' : 'An error occurred during text recognition. Please try again.'
      );
    } finally {
      setOcrLoading(false);
      setOcrProgress(0);
    }
  };

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
        imageAnnotations: imageAnnotations && imageAnnotations.length > 0
          ? imageAnnotations
          : (newQuestionData.imageAnnotations || []),
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
      setSelectedImage(null); setImageAnnotations([]); setShowTagInput(false); setMatchMode('any');
    }
  };

  const addTag = () => { 
    if (tagInput.trim() && !tags.includes(tagInput.trim())) { 
      setTags([...tags, tagInput.trim()]); 
      setTagInput(''); 
    } 
  };
  const removeTag = (tagToRemove: string) => setTags(tags.filter(tag => tag !== tagToRemove));

  const addAnnotation = () => {
    const newAnnotation: ImageAnnotation = { id: Date.now().toString(), x: 50, y: 50, width: 100, height: 50, color: annotationColor, opacity: annotationOpacity / 100 };
    setImageAnnotations([...imageAnnotations, newAnnotation]);
  };

  return (
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
              style={{ borderColor: colors.border }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
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

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: cpR ?? 15 }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>📸 {locale === 'ja' ? '画像を添付（オプション）' : 'Attach Image (Optional)'}</Text>
        {!selectedImage ? (
          <TouchableOpacity style={[styles.imageUploadBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '10', borderRadius: cpR ?? 12 }]} onPress={() => document.getElementById('image-input')?.click()}>
            <Text style={[{ fontSize: 24, marginBottom: 8 }]}>📷</Text>
            <Text style={[styles.imageUploadText, { color: colors.primary }]}>{locale === 'ja' ? '画像をアップロード' : 'Upload Image'}</Text>
            <Text style={[{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }]}>JPG, PNG, WebP（{locale === 'ja' ? '最大 5MB' : 'Max 5MB'}）</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <View style={[styles.imagePreview, { backgroundColor: colors.background, borderRadius: cpR ?? 8, overflow: 'hidden', marginBottom: 12 }]}>
              <img src={selectedImage} alt="preview" className="question-image-preview" />
              {imageAnnotations.map((annotation) => (<View key={annotation.id} style={{ position: 'absolute', left: annotation.x, top: annotation.y, width: annotation.width, height: annotation.height, backgroundColor: annotation.color, opacity: annotation.opacity, borderWidth: 1, borderColor: 'rgba(0,0,0,0.3)', borderRadius: 4 }} />))}
            </View>
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.error, borderRadius: cpR ?? 8, marginBottom: 12 }]} onPress={() => { setSelectedImage(null); setImageAnnotations([]); }}>
              <Text style={[styles.buttonText, { color: '#fff' }]}>{locale === 'ja' ? '画像を削除' : 'Remove Image'}</Text>
            </TouchableOpacity>
            <View style={[{ backgroundColor: colors.card, borderRadius: cpR ?? 8, padding: 12, borderWidth: cpB ?? 1, borderColor: colors.border }]}>
              <Text style={[{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 10 }]}>✏️ {locale === 'ja' ? '隠すボックスを追加' : 'Add Hiding Box'}</Text>
              <View style={[{ gap: 10 }]}>
                <View style={[{ flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
                  <Text style={[{ fontSize: 12, color: colors.textSecondary, width: 60 }]}>{locale === 'ja' ? '色' : 'Color'}</Text>
                  <View style={[{ flexDirection: 'row', gap: 6 }]}>
                    {['#FFFFFF', '#000000', '#FFC107', '#4CAF50', '#2196F3'].map((color) => (<TouchableOpacity key={color} style={[{ width: 32, height: 32, borderRadius: cpR ?? 16, backgroundColor: color, borderWidth: cpB ?? 2, borderColor: annotationColor === color ? colors.primary : colors.border }]} onPress={() => setAnnotationColor(color)} />))}
                  </View>
                </View>
                <View style={[{ flexDirection: 'row', gap: 12, alignItems: 'center' }]}>
                  <Text style={[{ fontSize: 12, color: colors.textSecondary, width: 60 }]}>{locale === 'ja' ? '透明度' : 'Opacity'}</Text>
                  <input type="range" min="0" max="100" value={annotationOpacity} onChange={(e) => setAnnotationOpacity(parseInt(e.target.value, 10))} className="crop-range" aria-label={locale === 'ja' ? '透明度を調整' : 'Adjust opacity'} />
                </View>
                <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary, borderRadius: cpR ?? 8 }]} onPress={addAnnotation}>
                  <Text style={[styles.buttonText, { color: onPrimary, fontSize: 13 }]}>＋ {locale === 'ja' ? 'ボックスを追加' : 'Add Box'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        <input id="image-input" type="file" accept="image/*" onChange={handleImageSelect} className="hidden-file-input" aria-label={locale === 'ja' ? '画像をアップロード' : 'Upload image'} />
      </View>
    </ScrollView>
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
});