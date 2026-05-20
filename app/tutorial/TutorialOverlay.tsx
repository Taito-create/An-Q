import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useTutorial } from './tutorialContext';
import { useTheme } from '../theme';
import { translations } from '../translations';

export default function TutorialOverlay() {
  const { colors } = useTheme();
  const t = translations.ja; // 簡略のため日本語固定
  const { tutorialState, nextStep, previousStep, skipTutorial, completeTutorial } = useTutorial();
  
  const [fadeAnim] = useState(new Animated.Value(0));

  // フェードインアニメーション
  useEffect(() => {
    if (tutorialState.isActive) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  }, [tutorialState.isActive, fadeAnim]);

  if (!tutorialState.isActive || tutorialState.currentStep >= tutorialState.tasks.length) {
    return null;
  }

  const currentTask = tutorialState.tasks[tutorialState.currentStep];
  const progress = ((tutorialState.currentStep + 1) / tutorialState.tasks.length) * 100;

  return (
    <Animated.View 
      style={[
        styles.overlay, 
        { 
          opacity: fadeAnim,
          backgroundColor: 'rgba(0, 0, 0, 0.85)'
        }
      ]}
    >
      <View style={styles.container}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: `${progress}%`,
                    backgroundColor: colors.primary 
                  }
                ]} 
              />
            </View>
            <Text style={[styles.progressText, { color: colors.text }]}>
              {tutorialState.currentStep + 1} / {tutorialState.tasks.length}
            </Text>
          </View>
          
          <TouchableOpacity 
            style={[styles.skipButton, { backgroundColor: colors.border }]} 
            onPress={skipTutorial}
          >
            <Text style={[styles.skipButtonText, { color: colors.text }]}>
              {t.skipTutorial}
            </Text>
          </TouchableOpacity>
        </View>

        {/* メインコンテンツ */}
        <View style={styles.content}>
          <View style={[styles.taskCard, { backgroundColor: colors.card }]}>
            {/* タスクタイトル */}
            <Text style={[styles.taskTitle, { color: colors.text }]}>
              🎯 {currentTask.taskTitle}
            </Text>
            
            {/* アクションテキスト */}
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>
              {currentTask.actionText}
            </Text>
            
            {/* インタラクティブタスクの場合の指示 */}
            {currentTask.isInteractive && (
              <View style={[styles.interactiveBox, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.interactiveText, { color: colors.primary }]}>
                  ✨ 光っているボタンを押してみましょう！
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* フッター */}
        <View style={styles.footer}>
          {/* 前のボタン */}
          <TouchableOpacity
            style={[
              styles.navButton,
              styles.previousButton,
              tutorialState.currentStep === 0 && styles.disabledButton,
              { backgroundColor: tutorialState.currentStep > 0 ? colors.primary : colors.border }
            ]}
            onPress={previousStep}
            disabled={tutorialState.currentStep === 0}
          >
            <Text style={[
              styles.navButtonText,
              { color: tutorialState.currentStep > 0 ? '#fff' : colors.textSecondary }
            ]}>
              {t.previous}
            </Text>
          </TouchableOpacity>

          {/* 次のボタン */}
          <TouchableOpacity
            style={[
              styles.navButton,
              styles.nextButton,
              { backgroundColor: colors.primary }
            ]}
            onPress={() => {
              if (tutorialState.currentStep === tutorialState.tasks.length - 1) {
                completeTutorial();
              } else {
                nextStep();
              }
            }}
          >
            <Text style={[styles.navButtonText, { color: '#fff' }]}>
              {tutorialState.currentStep === tutorialState.tasks.length - 1 
                ? t.complete 
                : (currentTask.nextButtonText || t.next)
              }
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'center',
  },
  skipButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  skipButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  taskCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  taskTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  actionText: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 16,
  },
  interactiveBox: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  interactiveText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  navButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  previousButton: {
    // スタイルは動的に設定
  },
  nextButton: {
    // スタイルは動的に設定
  },
  disabledButton: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
