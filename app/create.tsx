import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  ScrollView,
  Text,
  View,
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
import './create.css';

export default function CreateQuestionScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary, isCyberpunk } = useTheme();
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

  // 両解モードがONのとき、回答が2つ未満なら自動的に2つにする
  useEffect(() => {
    if (matchMode === 'all' && descriptiveAnswers.length < 2) {
      setDescriptiveAnswers(['', '']);
    }
  }, [matchMode]);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
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
        SoundManager.play('decide');
      };
      reader.onerror = () => {
        Alert.alert('エラー', locale === 'ja' ? '画像の読み込みに失敗しました' : 'Failed to load image');
      };
      reader.readAsDataURL(file);
    }
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
      // 複数の正解を配列として保存（両解モード対応）
      const answers = descriptiveAnswers.map(a => a.trim()).filter(Boolean);
      if (answers.length === 0) { SoundManager.play('select'); Alert.alert(t.error, t.enterAnswer); return; }
      
      // 両解モードの場合は配列として保存、通常モードは単一文字列
      if (matchMode === 'all') {
        dataToSave.descriptiveAnswer = answers;  // 配列で保存
      } else {
        dataToSave.descriptiveAnswer = answers[0];  // 単一文字列
      }
      dataToSave.matchMode = matchMode;  // 両解モードを保存
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
            onPress={() => {
              SoundManager.play('decide');
              setMatchMode(matchMode === 'all' ? 'any' : 'all');
            }}
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
            {/* 両解モードON時の説明 */}
            {matchMode === 'all' && (
              <View style={[styles.matchModeInfo, { backgroundColor: colors.primary + '15', borderColor: colors.primary, borderRadius: 6, padding: 10, marginBottom: 12 }]}>
                <Text style={[styles.matchModeInfoText, { color: colors.primary, fontSize: 12 }]}>
                  {locale === 'ja' 
                    ? '※ 各入力欄に正解を1つずつ入力してください（順不同）' 
                    : '※ Enter one correct answer in each field (order doesn\'t matter)'}
                </Text>
              </View>
            )}

            {/* 動的回答入力欄 */}
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
                {descriptiveAnswers.length > 1 && (
                  <TouchableOpacity
                    style={[styles.removeAnswerButton, { backgroundColor: colors.error }]}
                    onPress={() => {
                      const newAnswers = descriptiveAnswers.filter((_, i) => i !== index);
                      setDescriptiveAnswers(newAnswers.length > 0 ? newAnswers : ['']);
                    }}
                  >
                    <Text style={[styles.removeAnswerButtonText, { color: '#fff' }]}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            
            {/* 回答追加ボタン */}
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
            
            {/* 4択問題の解説入力欄 */}
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
        <TouchableOpacity style={[styles.createButton, { backgroundColor: colors.primary, borderRadius: cpR ?? 25, borderWidth: cpB, borderColor: isCyberpunk ? colors.primary : undefined, marginTop: 8 }]} onPress={handleManualCreate}><Text style={[styles.buttonText, { color: isCyberpunk ? '#ffffff' : '#000000' }]}>{t.createQuestion}</Text></TouchableOpacity>
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
});
