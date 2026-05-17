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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SoundManager } from './sound';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { useTheme } from './theme';
import { loadStats, incrementStat } from './missions';

// Question interface
interface Question {
  id: number;
  question: string;
  answerType: 'descriptive' | 'truefalse' | 'multiple';
  descriptiveAnswer?: string;
  trueFalseAnswer?: boolean;
  multipleChoice?: {
    options: string[];
    correctAnswer: number;
  };
  enabled: boolean;
  tags: string[];
  mistakeCount: number;
  createdAt: number;
  topic?: string;
  source?: string;
}

export default function CreateQuestionScreen() {
  const router = useNavigate();
  const { colors, onPrimary } = useTheme();
  const locale = useLocale();
  const t = translations[locale];

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

  // Save question function
  const saveQuestion = async (newQuestionData: any) => {
    try {
      const existingQuestions = await AsyncStorage.getItem('quiz_questions');
      const questions = existingQuestions ? JSON.parse(existingQuestions) : [];

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
        ...newQuestionData
      };
      
      questions.push(newQuestion);
      await AsyncStorage.setItem('quiz_questions', JSON.stringify(questions));
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
      // Reset form
      setQuestion('');
      setDescriptiveAnswer('');
      setTags([]);
      setTagInput('');
      // Navigate back after a short delay
      setTimeout(() => {
        router.canGoBack() ? navigate(-1) : navigate("/");
      }, 1000);
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
          style={styles.input} 
          value={question} 
          onChangeText={setQuestion} 
          placeholder={t.question}
          multiline
        />
        
        {/* Answer Input based on type */}
        {answerType === 'descriptive' && (
          <TextInput 
            style={styles.input} 
            value={descriptiveAnswer} 
            onChangeText={setDescriptiveAnswer} 
            placeholder={t.answer}
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

      {/* AI Section - Coming Soon */}
      <View style={[styles.section, styles.comingSoonSection]}>
        <View style={styles.comingSoonHeader}>
          <Text style={styles.sectionTitle}>{t.aiConsultation}</Text>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonBadgeText}>{t.comingSoon}</Text>
          </View>
        </View>
        
        <TextInput 
          style={[styles.input, styles.comingSoonInput]} 
          value="" 
          onChangeText={() => {}} 
          placeholder={t.aiFeatureUpdate}
          editable={false}
        />
        
        <TouchableOpacity 
          style={[styles.createButton, styles.comingSoonButton]} 
          onPress={() => {
            SoundManager.play('select');
            Alert.alert(t.comingSoonAlert, t.comingSoonMessage);
          }}
          disabled={true}
        >
          <Text style={styles.buttonText}>{t.comingSoon}...</Text>
        </TouchableOpacity>
      </View>

      {/* Back Button */}
      <TouchableOpacity 
        style={[styles.backButton, { backgroundColor: colors.primary }]}
        onPress={() => { SoundManager.play('decide'); router.canGoBack() ? navigate(-1) : navigate("/"); }}
      >
        <Text style={[styles.backButtonText, { color: onPrimary }]}>{t.back}</Text>
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
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  backButton: {
    padding: 15,
    alignItems: 'center',
    marginBottom: 40,
    borderRadius: 12,
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
  comingSoonSection: {
    opacity: 0.6,
    backgroundColor: '#f8f9fa',
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: '#ddd',
  },
  comingSoonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  comingSoonBadge: {
    backgroundColor: '#ff9500',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 15,
  },
  comingSoonBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  comingSoonInput: {
    backgroundColor: '#f0f0f0',
  },
  comingSoonButton: {
    backgroundColor: '#ccc',
  },
  comingSoonRocket: {
    position: 'absolute',
    top: 10,
    right: 10,
    fontSize: 20,
  },
});
