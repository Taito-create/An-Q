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

  // Load language from AsyncStorage on mount
  useEffect(() => {
    SoundManager.initialize();
  }, []);
  
  // Form states
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

  // Image upload states
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageAnnotations, setImageAnnotations] = useState<ImageAnnotation[]>([]);
  const [annotationColor, setAnnotationColor] = useState('#FFFFFF');
  const [annotationOpacity, setAnnotationOpacity] = useState(80);

  // Image selection handler
  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setSelectedImage(base64);
        SoundManager.play('decide');
      };
      reader.readAsDataURL(file);
    }
  };

  // Save question function
  const saveQuestion = async (newQuestionData: Partial<Question>): Promise<boolean> => {
    try {
      // 上限チェック
      const stats = await loadStats();
      const limit = stats.questionSlots ?? 20;
      if (questions.length >= limit) {
        Alert.alert(
          t.limitReached,
          `${t.limitReachedMsg} (${limit})`
        );
        return false;
      }

      const newQuestion: Question = {
        id: Date.now(),
        enabled: true,
        answerType: answerType,
        tags: tags,
        mistakeCount: 0,
        createdAt: Date.now(),
        image: selectedImage || null,
        imageAnnotations: imageAnnotations,
        isShared: false,
        ...newQuestionData,
      };

      await saveQuestions([...questions, newQuestion]);
      // ミッション統計を更新
      await incrementStat('questionsCreated', 1);
      return true;
    } catch (error) {
      console.error('Save question error:', error);
      Alert.alert(t.error, t.failedToSave);
      return false;
    }
  };

  // Manual create function
  const handleManualCreate = async () => {
    if (!question.trim()) {
      SoundManager.play('select');
      Alert.alert(t.error, t.enterQuestion);
      return;
    }

    let dataToSave: any = {
      question: question.trim(),
      answerType: answerType,
    };

    if (answerType === 'descriptive') {
      if (!descriptiveAnswer.trim()) {
        SoundManager.play('select');
        Alert.alert(t.error, t.enterAnswer);
        return;
      }
      dataToSave.descriptiveAnswer = descriptiveAnswer.trim();
    } else if (answerType === 'truefalse') {
      dataToSave.trueFalseAnswer = trueFalseAnswer;
    } else if (answerType === 'multiple') {
      if (multipleChoice.options.some(opt => !opt.trim())) {
        SoundManager.play('select');
        Alert.alert(t.error, t.fillAllOptions);
        return;
      }
      dataToSave.multipleChoice = multipleChoice;
    }

    const success = await saveQuestion(dataToSave);
    if (success) {
      SoundManager.play('complete');
      Alert.alert(t.success, t.questionSaved);
      // Reset form - stay on same page, do NOT navigate back
      setQuestion('');
      setDescriptiveAnswer('');
      setTags([]);
      setTagInput('');
      setAnswerType('descriptive');
      setTrueFalseAnswer(true);
      setMultipleChoice({
        options: ['', '', '', ''],
        correctAnswer: 0
      });
      setSelectedImage(null);
      setImageAnnotations([]);
    }
  };

  // Tag management functions
  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const addAnnotation = () => {
    const newAnnotation: ImageAnnotation = {
      id: Date.now().toString(),
      x: 50,
      y: 50,
      width: 100,
      height: 50,
      color: annotationColor,
      opacity: annotationOpacity / 100,
    };
    setImageAnnotations([...imageAnnotations, newAnnotation]);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={[styles.title, { color: colors.primary }]}>{t.createQuestionTitle}</Text>
      
      {/* Answer Type Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.answerType}</Text>
        <View style={styles.answerTypeContainer}>
          {[
            { id: 'descriptive', label: t.descriptive },
            { id: 'truefalse', label: t.truefalse },
            { id: 'multiple', label: t.multiple }
          ].map((type) => (
            <TouchableOpacity 
              key={type.id}
              style={[
                styles.answerTypeButton, 
                answerType === type.id && { backgroundColor: colors.primary }
              ]} 
              onPress={() => {
                SoundManager.play('select');
                setAnswerType(type.id as any);
              }}
            >
              <Text style={[
                styles.answerTypeText,
                answerType === type.id && { color: 'white' }
              ]}>
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Question Input */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.question}</Text>
        <TextInput 
          style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} 
          value={question} 
          onChangeText={setQuestion} 
          placeholder={t.question}
          multiline
        />
        
        {/* Answer Input based on type */}
        {answerType === 'descriptive' && (
          <TextInput 
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} 
            value={descriptiveAnswer} 
            onChangeText={setDescriptiveAnswer} 
            placeholder={t.answer}
            multiline
          />
        )}
        
        {answerType === 'truefalse' && (
          <View style={styles.trueFalseContainer}>
            <TouchableOpacity 
              style={[
                styles.trueFalseButton, 
                trueFalseAnswer && { backgroundColor: colors.primary }
              ]} 
              onPress={() => {
                SoundManager.play('decide');
                setTrueFalseAnswer(true);
              }}
            >
              <Text style={[
                styles.trueFalseText,
                trueFalseAnswer && { color: 'white' }
              ]}>O</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.trueFalseButton, 
                !trueFalseAnswer && { backgroundColor: colors.primary }
              ]} 
              onPress={() => {
                SoundManager.play('decide');
                setTrueFalseAnswer(false);
              }}
            >
              <Text style={[
                styles.trueFalseText,
                !trueFalseAnswer && { color: 'white' }
              ]}>×</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {answerType === 'multiple' && (
          <>
            {multipleChoice.options.map((option, index) => (
              <TextInput
                key={index}
                style={styles.input}
                value={option}
                onChangeText={(text) => {
                  const newOptions = [...multipleChoice.options];
                  newOptions[index] = text;
                  setMultipleChoice({...multipleChoice, options: newOptions});
                }}
                placeholder={`${t.options} ${index + 1}`}
              />
            ))}
            <View style={styles.correctAnswerContainer}>
              <Text style={styles.correctAnswerLabel}>{t.correctAnswer}:</Text>
              {[0, 1, 2, 3].map((i) => (
                <TouchableOpacity 
                  key={i} 
                  style={[
                    styles.correctAnswerButton, 
                    multipleChoice.correctAnswer === i && { backgroundColor: colors.primary }
                  ]} 
                  onPress={() => {
                    SoundManager.play('decide');
                    setMultipleChoice({...multipleChoice, correctAnswer: i});
                  }}
                >
                  <Text style={[
                    styles.correctAnswerText,
                    multipleChoice.correctAnswer === i && { color: 'white' }
                  ]}>{i + 1}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
        
        <TouchableOpacity 
          style={[styles.createButton, { backgroundColor: colors.primary }]}
          onPress={handleManualCreate}
        >
          <Text style={styles.buttonText}>{t.createQuestion}</Text>
        </TouchableOpacity>
      </View>

      {/* Image Upload Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📸 画像を添付（オプション）</Text>

        {!selectedImage ? (
          <TouchableOpacity
            style={[styles.imageUploadBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '10' }]}
            onPress={() => {
              document.getElementById('image-input')?.click();
            }}
          >
            <Text style={[{ fontSize: 24, marginBottom: 8 }]}>📷</Text>
            <Text style={[styles.imageUploadText, { color: colors.primary }]}>
              画像をアップロード
            </Text>
            <Text style={[{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }]}>
              JPG, PNG, WebP（最大 5MB）
            </Text>
          </TouchableOpacity>
        ) : (
          <View>
            {/* 画像プレビュー */}
            <View style={[styles.imagePreview, { backgroundColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }]}>
              <img
                src={selectedImage}
                alt="preview"
                style={{ width: '100%', height: 'auto', maxHeight: 300 }}
              />

              {/* アノテーション（テキストボックス） */}
              {imageAnnotations.map((annotation) => (
                <View
                  key={annotation.id}
                  style={{
                    position: 'absolute',
                    left: annotation.x,
                    top: annotation.y,
                    width: annotation.width,
                    height: annotation.height,
                    backgroundColor: annotation.color,
                    opacity: annotation.opacity,
                    borderWidth: 1,
                    borderColor: 'rgba(0,0,0,0.3)',
                    borderRadius: 4,
                  }}
                />
              ))}
            </View>

            {/* 画像削除ボタン */}
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.error, marginBottom: 12 }]}
              onPress={() => {
                setSelectedImage(null);
                setImageAnnotations([]);
              }}
            >
              <Text style={[styles.buttonText, { color: '#fff' }]}>画像を削除</Text>
            </TouchableOpacity>

            {/* アノテーション追加UI */}
            <View style={[{ backgroundColor: colors.card, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: colors.border }]}>
              <Text style={[{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 10 }]}>
                ✏️ 隠すボックスを追加
              </Text>

              <View style={[{ gap: 10 }]}>
                {/* カラーピッカー */}
                <View style={[{ flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
                  <Text style={[{ fontSize: 12, color: colors.textSecondary, width: 60 }]}>色</Text>
                  <View style={[{ flexDirection: 'row', gap: 6 }]}>
                    {['#FFFFFF', '#000000', '#FFC107', '#4CAF50', '#2196F3'].map((color) => (
                      <TouchableOpacity
                        key={color}
                        style={[{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: color,
                          borderWidth: 2,
                          borderColor: annotationColor === color ? colors.primary : colors.border,
                        }]}
                        onPress={() => setAnnotationColor(color)}
                      />
                    ))}
                  </View>
                </View>

                {/* 透明度スライダー */}
                <View style={[{ flexDirection: 'row', gap: 12, alignItems: 'center' }]}>
                  <Text style={[{ fontSize: 12, color: colors.textSecondary, width: 60 }]}>透明度</Text>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={annotationOpacity}
                    onChange={(e) => setAnnotationOpacity(parseInt(e.target.value, 10))}
                    style={{ flex: 1, height: 6, borderRadius: 3, accentColor: colors.primary }}
                  />
                </View>

                {/* ボックス追加ボタン */}
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.primary }]}
                  onPress={addAnnotation}
                >
                  <Text style={[styles.buttonText, { color: '#fff', fontSize: 13 }]}>＋ ボックスを追加</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* 隠しファイルインプット */}
        <input
          id="image-input"
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          style={{ display: 'none' }}
        />
      </View>

      {/* Tags Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.tags}</Text>
        <View style={styles.tagInputContainer}>
          <TextInput
            style={styles.tagInput}
            value={tagInput}
            onChangeText={setTagInput}
            placeholder={t.enterTag}
            onSubmitEditing={() => {
              SoundManager.play('decide');
              addTag();
            }}
          />
          <TouchableOpacity 
            style={[styles.addTagButton, { backgroundColor: colors.primary }]} 
            onPress={() => {
              SoundManager.play('decide');
              addTag();
            }}
          >
            <Text style={styles.addTagText}>+</Text>
          </TouchableOpacity>
        </View>
        
        {tags.length > 0 && (
          <View style={styles.tagContainer}>
            {tags.map((tag, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.tag, { backgroundColor: colors.primary + '20' }]}
                onPress={() => {
                  SoundManager.play('select');
                  removeTag(tag);
                }}
              >
                <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
                <Text style={[styles.removeTagText, { color: colors.primary }]}>×</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>


      {/* Back Button */}
      <TouchableOpacity 
        style={[styles.backButton, { backgroundColor: colors.primary }]}
        onPress={() => { SoundManager.play('decide'); navigate('/'); }}
      >
        <Text style={[styles.backButtonText, { color: onPrimary }]}> {t.back}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
  },
  section: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 15,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 10,
    backgroundColor: 'white',
    marginBottom: 10,
    fontSize: 16,
  },
  createButton: {
    padding: 15,
    borderRadius: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  button: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  backButton: {
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
    backgroundColor: 'transparent',
  },
  backButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: 'bold',
  },
  answerTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  answerTypeButton: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 5,
    minWidth: 80,
    alignItems: 'center',
  },
  answerTypeText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 12,
  },
  trueFalseContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
  },
  trueFalseButton: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 5,
    minWidth: 60,
    alignItems: 'center',
  },
  trueFalseText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 16,
  },
  correctAnswerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 15,
  },
  correctAnswerLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  correctAnswerButton: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 5,
    minWidth: 40,
    alignItems: 'center',
  },
  correctAnswerText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 14,
  },
  tagInputContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
  },
  tagInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 10,
    backgroundColor: 'white',
  },
  addTagButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTagText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '500',
  },
  removeTagText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Image upload styles
  imageUploadBtn: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageUploadText: {
    fontSize: 15,
    fontWeight: '600',
  },
  imagePreview: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
});