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
import { useQuestions } from './hooks/useQuestions';
import { Question, ImageAnnotation } from './types/question';

export default function CreateQuestionScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const { questions, saveQuestions } = useQuestions();

  useEffect(() => {
    SoundManager.initialize();
  }, []);
  
  const [question, setQuestion] = useState('');
  const [answerType, setAnswerType] = useState<'descriptive' | 'truefalse' | 'multiple'>('descriptive');
  const [descriptiveAnswer, setDescriptiveAnswer] = useState('');
  const [trueFalseAnswer, setTrueFalseAnswer] = useState(true);
  const [multipleChoice, setMultipleChoice] = useState({
    options: ['', '', '', ''],
    correctAnswer: 0
  });
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

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
        // 🔧 先にスプレッドして、後から selectedImage / imageAnnotations を上書き
        ...newQuestionData,
        // 🔧 selectedImage を必ず優先（newQuestionData に undefined が入っていても画像が消えないように）
        image: selectedImage || newQuestionData.image || null,
        imageAnnotations: imageAnnotations && imageAnnotations.length > 0
          ? imageAnnotations
          : (newQuestionData.imageAnnotations || []),
      };
      await saveQuestions([...questions, newQuestion]);
      await incrementStat('questionsCreated', 1);
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
    let dataToSave: any = { question: question.trim(), answerType: answerType };
    if (answerType === 'descriptive') {
      if (!descriptiveAnswer.trim()) { SoundManager.play('select'); Alert.alert(t.error, t.enterAnswer); return; }
      dataToSave.descriptiveAnswer = descriptiveAnswer.trim();
    } else if (answerType === 'truefalse') {
      dataToSave.trueFalseAnswer = trueFalseAnswer;
    } else if (answerType === 'multiple') {
      if (multipleChoice.options.some(opt => !opt.trim())) { SoundManager.play('select'); Alert.alert(t.error, t.fillAllOptions); return; }
      dataToSave.multipleChoice = multipleChoice;
    }
    const success = await saveQuestion(dataToSave);
    if (success) {
      SoundManager.play('complete');
      Alert.alert(t.success, t.questionSaved);
      setQuestion(''); setDescriptiveAnswer(''); setTags([]); setTagInput(''); setAnswerType('descriptive');
      setTrueFalseAnswer(true); setMultipleChoice({ options: ['', '', '', ''], correctAnswer: 0 });
      setSelectedImage(null); setImageAnnotations([]);
    }
  };

  const addTag = () => { if (tagInput.trim() && !tags.includes(tagInput.trim())) { setTags([...tags, tagInput.trim()]); setTagInput(''); } };
  const removeTag = (tagToRemove: string) => setTags(tags.filter(tag => tag !== tagToRemove));

  const addAnnotation = () => {
    const newAnnotation: ImageAnnotation = { id: Date.now().toString(), x: 50, y: 50, width: 100, height: 50, color: annotationColor, opacity: annotationOpacity / 100 };
    setImageAnnotations([...imageAnnotations, newAnnotation]);
  };

  return (
    <ScrollView style={styles.container}>
      {/* ✅ ヘッダー + 戻るボタン */}
      <View style={[styles.header, { borderBottomColor: colors.border, marginBottom: 16, paddingHorizontal: 0 }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          ✏️ {locale === 'ja' ? '問題作成' : 'Create Question'}
        </Text>
        <TouchableOpacity style={[styles.closeButton, { backgroundColor: colors.primary }]} onPress={() => { SoundManager.play('decide'); navigate('/'); }}>
          <Text style={[styles.closeButtonText, { color: onPrimary }]}>{locale === 'ja' ? '戻る' : 'Back'}</Text>
        </TouchableOpacity>
      </View>

      {/* Answer Type */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.answerType}</Text>
        <View style={styles.answerTypeContainer}>
          {[{ id: 'descriptive', label: t.descriptive }, { id: 'truefalse', label: t.truefalse }, { id: 'multiple', label: t.multiple }].map((type) => (
            <TouchableOpacity key={type.id} style={[styles.answerTypeButton, answerType === type.id && { backgroundColor: colors.primary }]} onPress={() => { SoundManager.play('select'); setAnswerType(type.id as any); }}>
              <Text style={[styles.answerTypeText, answerType === type.id && { color: 'white' }]}>{type.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Question Input */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.question}</Text>
        <TextInput style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} value={question} onChangeText={setQuestion} placeholder={t.question} multiline />
        {answerType === 'descriptive' && (<TextInput style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} value={descriptiveAnswer} onChangeText={setDescriptiveAnswer} placeholder={t.answer} multiline />)}
        {answerType === 'truefalse' && (
          <View style={styles.trueFalseContainer}>
            <TouchableOpacity style={[styles.trueFalseButton, trueFalseAnswer && { backgroundColor: colors.primary }]} onPress={() => { SoundManager.play('decide'); setTrueFalseAnswer(true); }}><Text style={[styles.trueFalseText, trueFalseAnswer && { color: 'white' }]}>O</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.trueFalseButton, !trueFalseAnswer && { backgroundColor: colors.primary }]} onPress={() => { SoundManager.play('decide'); setTrueFalseAnswer(false); }}><Text style={[styles.trueFalseText, !trueFalseAnswer && { color: 'white' }]}>×</Text></TouchableOpacity>
          </View>
        )}
        {answerType === 'multiple' && (
          <>{multipleChoice.options.map((option, index) => (<TextInput key={index} style={styles.input} value={option} onChangeText={(text) => { const newOptions = [...multipleChoice.options]; newOptions[index] = text; setMultipleChoice({...multipleChoice, options: newOptions}); }} placeholder={`${t.options} ${index + 1}`} />))}
            <View style={styles.correctAnswerContainer}>
              <Text style={styles.correctAnswerLabel}>{t.correctAnswer}:</Text>
              {[0, 1, 2, 3].map((i) => (<TouchableOpacity key={i} style={[styles.correctAnswerButton, multipleChoice.correctAnswer === i && { backgroundColor: colors.primary }]} onPress={() => { SoundManager.play('decide'); setMultipleChoice({...multipleChoice, correctAnswer: i}); }}><Text style={[styles.correctAnswerText, multipleChoice.correctAnswer === i && { color: 'white' }]}>{i + 1}</Text></TouchableOpacity>))}
            </View>
          </>
        )}
        <TouchableOpacity style={[styles.createButton, { backgroundColor: colors.primary }]} onPress={handleManualCreate}><Text style={styles.buttonText}>{t.createQuestion}</Text></TouchableOpacity>
      </View>

      {/* ✅ Image Upload Section - locale対応 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📸 {locale === 'ja' ? '画像を添付（オプション）' : 'Attach Image (Optional)'}</Text>
        {!selectedImage ? (
          <TouchableOpacity style={[styles.imageUploadBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]} onPress={() => document.getElementById('image-input')?.click()}>
            <Text style={[{ fontSize: 24, marginBottom: 8 }]}>📷</Text>
            <Text style={[styles.imageUploadText, { color: colors.primary }]}>{locale === 'ja' ? '画像をアップロード' : 'Upload Image'}</Text>
            <Text style={[{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }]}>JPG, PNG, WebP（{locale === 'ja' ? '最大 5MB' : 'Max 5MB'}）</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <View style={[styles.imagePreview, { backgroundColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }]}>
              <img src={selectedImage} alt="preview" style={{ width: '100%', height: 'auto', maxHeight: 300 }} />
              {imageAnnotations.map((annotation) => (<View key={annotation.id} style={{ position: 'absolute', left: annotation.x, top: annotation.y, width: annotation.width, height: annotation.height, backgroundColor: annotation.color, opacity: annotation.opacity, borderWidth: 1, borderColor: 'rgba(0,0,0,0.3)', borderRadius: 4 }} />))}
            </View>
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.error, marginBottom: 12 }]} onPress={() => { setSelectedImage(null); setImageAnnotations([]); }}>
              <Text style={[styles.buttonText, { color: '#fff' }]}>{locale === 'ja' ? '画像を削除' : 'Remove Image'}</Text>
            </TouchableOpacity>
            <View style={[{ backgroundColor: colors.card, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: colors.border }]}>
              <Text style={[{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 10 }]}>✏️ {locale === 'ja' ? '隠すボックスを追加' : 'Add Hiding Box'}</Text>
              <View style={[{ gap: 10 }]}>
                <View style={[{ flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
                  <Text style={[{ fontSize: 12, color: colors.textSecondary, width: 60 }]}>{locale === 'ja' ? '色' : 'Color'}</Text>
                  <View style={[{ flexDirection: 'row', gap: 6 }]}>
                    {['#FFFFFF', '#000000', '#FFC107', '#4CAF50', '#2196F3'].map((color) => (<TouchableOpacity key={color} style={[{ width: 32, height: 32, borderRadius: 16, backgroundColor: color, borderWidth: 2, borderColor: annotationColor === color ? colors.primary : colors.border }]} onPress={() => setAnnotationColor(color)} />))}
                  </View>
                </View>
                <View style={[{ flexDirection: 'row', gap: 12, alignItems: 'center' }]}>
                  <Text style={[{ fontSize: 12, color: colors.textSecondary, width: 60 }]}>{locale === 'ja' ? '透明度' : 'Opacity'}</Text>
                  <input type="range" min="0" max="100" value={annotationOpacity} onChange={(e) => setAnnotationOpacity(parseInt(e.target.value, 10))} style={{ flex: 1, height: 6, borderRadius: 3, accentColor: colors.primary }} />
                </View>
                <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={addAnnotation}>
                  <Text style={[styles.buttonText, { color: '#fff', fontSize: 13 }]}>＋ {locale === 'ja' ? 'ボックスを追加' : 'Add Box'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        <input id="image-input" type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
      </View>

      {/* Tags Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.tags}</Text>
        <View style={styles.tagInputContainer}>
          <TextInput style={styles.tagInput} value={tagInput} onChangeText={setTagInput} placeholder={t.enterTag} onSubmitEditing={() => { SoundManager.play('decide'); addTag(); }} />
          <TouchableOpacity style={[styles.addTagButton, { backgroundColor: colors.primary }]} onPress={() => { SoundManager.play('decide'); addTag(); }}><Text style={styles.addTagText}>+</Text></TouchableOpacity>
        </View>
        {tags.length > 0 && (<View style={styles.tagContainer}>{tags.map((tag, index) => (<TouchableOpacity key={index} style={[styles.tag, { backgroundColor: colors.primary + '20' }]} onPress={() => { SoundManager.play('select'); removeTag(tag); }}><Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text><Text style={[styles.removeTagText, { color: colors.primary }]}>×</Text></TouchableOpacity>))}</View>)}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 0, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: 'transparent' },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  closeButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minWidth: 70 },
  closeButtonText: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  section: { backgroundColor: 'white', padding: 20, borderRadius: 15, marginBottom: 25, borderWidth: 1, borderColor: '#e0e0e0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 5 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 5, padding: 10, backgroundColor: 'white', marginBottom: 10, fontSize: 16 },
  createButton: { padding: 15, borderRadius: 25, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },
  button: { padding: 12, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  answerTypeContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 },
  answerTypeButton: { backgroundColor: '#f0f0f0', padding: 10, borderRadius: 5, minWidth: 80, alignItems: 'center' },
  answerTypeText: { color: '#333', fontWeight: 'bold', fontSize: 12 },
  trueFalseContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15 },
  trueFalseButton: { backgroundColor: '#f0f0f0', padding: 15, borderRadius: 5, minWidth: 60, alignItems: 'center' },
  trueFalseText: { color: '#333', fontWeight: 'bold', fontSize: 16 },
  correctAnswerContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 15 },
  correctAnswerLabel: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  correctAnswerButton: { backgroundColor: '#f0f0f0', padding: 10, borderRadius: 5, minWidth: 40, alignItems: 'center' },
  correctAnswerText: { color: '#333', fontWeight: 'bold', fontSize: 14 },
  tagInputContainer: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  tagInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 5, padding: 10, backgroundColor: 'white' },
  addTagButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  addTagText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  tagContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, gap: 6 },
  tagText: { fontSize: 14, fontWeight: '500' },
  removeTagText: { fontSize: 16, fontWeight: 'bold' },
  imageUploadBtn: { padding: 24, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  imageUploadText: { fontSize: 15, fontWeight: '600' },
  imagePreview: { position: 'relative', borderRadius: 8, overflow: 'hidden', marginBottom: 12 },
});