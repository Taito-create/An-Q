// check-answers.js
// Run with: node check-answers.js <path-to-firestore-export.json>
//
// このスクリプトは、Firestore のエクスポートJSONから
// descriptiveAnswerGroups / descriptiveAnswer が失われた記述問題を検出します。

const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) {
  console.log('Usage: node check-answers.js <firestore-export.json>');
  process.exit(1);
}

// ファイルを読み込む
const fileContent = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(fileContent);

const affected = [];
let totalDescriptive = 0;
let totalQuestions = 0;

/**
 * 単一の問題オブジェクトをチェックする
 */
function checkQuestion(q, userId, contextPath) {
  if (!q) return;

  totalQuestions++;

  if (q.answerType === 'descriptive') {
    totalDescriptive++;

    // descriptiveAnswerGroups が存在して配列かチェック
    const hasAnswerGroups = q.descriptiveAnswerGroups &&
      Array.isArray(q.descriptiveAnswerGroups) &&
      q.descriptiveAnswerGroups.length > 0 &&
      q.descriptiveAnswerGroups.some(group =>
        Array.isArray(group) ? group.some(a => a && a.trim()) : (group && group.trim())
      );

    // descriptiveAnswer が存在するかチェック（旧形式）
    let hasDescriptiveAnswer = false;
    if (q.descriptiveAnswer !== undefined && q.descriptiveAnswer !== null) {
      if (Array.isArray(q.descriptiveAnswer)) {
        hasDescriptiveAnswer = q.descriptiveAnswer.some(a => a && a.trim());
      } else if (typeof q.descriptiveAnswer === 'string') {
        hasDescriptiveAnswer = q.descriptiveAnswer.trim().length > 0;
      }
    }

    if (!hasAnswerGroups && !hasDescriptiveAnswer) {
      affected.push({
        userId: userId || 'unknown',
        questionId: q.id,
        question: q.question || '(問題文なし)',
        answerType: q.answerType,
        descriptiveAnswerGroups: q.descriptiveAnswerGroups,
        descriptiveAnswer: q.descriptiveAnswer,
        matchMode: q.matchMode,
        contextPath: contextPath || 'unknown',
        tags: q.tags || [],
        createdAt: q.createdAt || 'unknown',
      });
    }
  }
}

/**
 * 再帰的にオブジェクトを探索して問題配列を探す
 * Firestore エクスポートの構造に対応:
 * - { userQuestions: { userId: { questions: [...] } } }
 * - { userId: { questions: [...] } }
 * - { questions: [...] }
 * - ネストした任意の構造
 */
function traverseObject(obj, currentPath, userId) {
  if (!obj || typeof obj !== 'object') return;

  // 問題配列を検出
  if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object' && ('answerType' in obj[0] || 'question' in obj[0])) {
    obj.forEach((q, i) => checkQuestion(q, userId, `${currentPath}[${i}]`));
    return;
  }

  // オブジェクトの各キーを探索
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;

    // questions キーを検出
    if (key === 'questions' && Array.isArray(value)) {
      value.forEach((q, i) => checkQuestion(q, userId, `${currentPath}.${key}[${i}]`));
      continue;
    }

    // userQuestions や userId などのキーに進む
    if (typeof value === 'object') {
      // ユーザーIDを追跡（キーが uid っぽい場合）
      const nextUserId = key === 'userQuestions' ? '' : (userId || key);
      traverseObject(value, `${currentPath}.${key}`, nextUserId);
    }
  }
}

// 探索開始
console.log('🔍 Firestore エクスポートを分析中...');
traverseObject(data, '$', '');

// 結果を表示
console.log('\n' + '='.repeat(60));
console.log(`📊 分析結果:`);
console.log(`   総問題数: ${totalQuestions}`);
console.log(`   記述問題数: ${totalDescriptive}`);
console.log(`   ❌ 回答データが失われた問題: ${affected.length}`);
console.log('='.repeat(60));

if (affected.length > 0) {
  console.log('\n❌ 影響を受けた問題一覧:');
  affected.forEach((q, i) => {
    console.log(`\n${i + 1}. [${q.userId}] ID: ${q.questionId}`);
    console.log(`   問題文: ${q.question}`);
    console.log(`   場所: ${q.contextPath}`);
    console.log(`   descriptiveAnswerGroups: ${q.descriptiveAnswerGroups === undefined ? 'undefined' : JSON.stringify(q.descriptiveAnswerGroups)}`);
    console.log(`   descriptiveAnswer: ${q.descriptiveAnswer === undefined ? 'undefined' : JSON.stringify(q.descriptiveAnswer)}`);
    console.log(`   matchMode: ${q.matchMode === undefined ? 'undefined' : q.matchMode}`);
    if (q.tags && q.tags.length > 0) {
      console.log(`   タグ: ${q.tags.join(', ')}`);
    }
  });

  // JSONファイルに保存
  const outputFile = path.join(process.cwd(), 'affected-questions.json');
  fs.writeFileSync(outputFile, JSON.stringify(affected, null, 2));
  console.log(`\n✅ 詳細データを ${outputFile} に保存しました。`);
} else {
  console.log('\n✅ 回答データが失われた問題は見つかりませんでした。');
}