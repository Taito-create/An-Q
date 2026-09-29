/**
 * react-native-web の View は開発時に
 *   「Unexpected text node: <値>」
 * を console.error する（node_modules/react-native-web/dist/cjs/exports/View/index.js 参照）。
 *
 * そのため「View 相当の要素の直接の子」に評価結果が文字列（特に空文字 ''）になる式が
 * あると警告が出る。本スクリプトはその候補を静的に検出する。
 *
 * 検出ルール（View 相当要素の直接の子である式のみ）:
 *   1. 子の式が識別子 / メンバ式そのもの
 *   2. && / || 連鎖の左端（! を除いた最も左）が識別子 / メンバ式
 *   3. 三項演算子の分岐に文字列リテラルがある
 * かつ、その名前が「文字列型になり得る」場合のみ報告する。
 *   - useState('') / useState<string> / useState('a')
 *   - const x = '...' / const x: string ...
 *   - 同ファイル内の型定義にある文字列プロパティを参照するメンバ式
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;

const ROOT = __dirname;
let SRC = '';
function walk(p, out = []) {
  if (!fs.existsSync(p)) return out;
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    if (/node_modules|__tests__/.test(p)) return out;
    for (const e of fs.readdirSync(p)) walk(path.join(p, e), out);
  } else if (/\.(tsx|jsx)$/.test(p)) out.push(p);
  return out;
}
const files = [];
for (const t of ['app', 'src']) walk(path.join(ROOT, t), files);
for (const f of fs.readdirSync(ROOT)) if (/\.(tsx|jsx)$/.test(f)) files.push(path.join(ROOT, f));

const VIEWLIKE = /^(View|Animated\.View|ScrollView|SafeAreaView|KeyboardAvoidingView|LinearGradient|Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|FlatList|SectionList|Modal|Switch|ImageBackground)$/;
// データ由来（string | null | undefined）のプロパティは '' を格納しない前提なので除外
const NULLABLE_OK = new Set(['image', 'rawImageSrc', 'selectedImage']);

function nameOf(node) {
  if (!node) return '';
  if (node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'JSXMemberExpression') return nameOf(node.object) + '.' + nameOf(node.property);
  return '';
}
function baseName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    return node.property && node.property.type === 'Identifier' ? node.property.name : null;
  }
  return null;
}
function typeText(node) {
  if (!node || node.start == null || node.end == null) return '';
  return SRC.slice(node.start, node.end);
}

// 型注釈テキストが「文字列そのもの」か（: string / string / string | undefined など）
function isPlainString(t) {
  const s = (t || '').replace(/^:/, '').trim();
  if (!s) return false;
  if (s === 'string') return true;
  const parts = s.split('|').map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  return parts.includes('string') && parts.every((p) => p === 'string' || p === 'undefined' || p === 'null');
}
// '' を代入し得るのは「string か undefined」だけ。string | null は対象外（null 運用）
function isStrOrUndef(t) {
  const s = (t || '').replace(/^:/, '').trim();
  if (s === 'string') return true;
  const parts = s.split('|').map((x) => x.trim()).filter(Boolean);
  return parts.length === 2 && parts.includes('string') && parts.includes('undefined');
}

// string 型プロパティは別ファイルの型定義にあることが多いため、プロジェクト全体から集める
function walkTs(p, out = []) {
  if (!fs.existsSync(p)) return out;
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    if (/node_modules|__tests__/.test(p)) return out;
    for (const e of fs.readdirSync(p)) walkTs(path.join(p, e), out);
  } else if (/\.(tsx?|jsx)$/.test(p)) out.push(p);
  return out;
}
const STR_PROPS = new Set();
for (const t of ['app', 'src']) {
  for (const f of walkTs(path.join(ROOT, t))) collectFileStringProps(f);
}
function collectFileStringProps(file) {
  const code = fs.readFileSync(file, 'utf8');
  SRC = code;
  let ast;
  try { ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] }); } catch { return; }
  const collect = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'TSPropertySignature' && node.key && node.key.type === 'Identifier') {
      if (isStrOrUndef(typeText(node.typeAnnotation))) STR_PROPS.add(node.key.name);
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === 'object' && v.type) collect(v);
    }
  };
  traverse(ast, {
    TSTypeAliasDeclaration(p) { collect(p.node.typeAnnotation); },
    TSInterfaceDeclaration(p) { if (p.node.body) collect(p.node.body); },
    TSEnumDeclaration() {},
  });
}

function analyze(file) {
  const code = fs.readFileSync(file, 'utf8');
  SRC = code;
  let ast;
  try { ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] }); } catch { return []; }

  // --- 文字列型だと分かる名前を集める ---
  const strVars = new Set();     // 変数名（'' を値に持ち得る）
  const jsxProps = new Set();    // 同ファイル内で JSX が代入されているプロパティ名（例: subHub の icon: <Palette/>）
  traverse(ast, {
    ObjectProperty(p) {
      if (p.node.key && p.node.key.type === 'Identifier' &&
          (p.node.value.type === 'JSXElement' || p.node.value.type === 'JSXFragment')) {
        jsxProps.add(p.node.key.name);
      }
    },
    VariableDeclarator(p) {
      const { id, init } = p.node;
      const isStringValue = init && (init.type === 'StringLiteral' ||
        (init.type === 'TemplateLiteral' && init.quasis.length === 1 && init.expressions.length === 0));
      const annotation = typeText(id.typeAnnotation);
      if (id.type === 'Identifier' && (isStringValue || isStrOrUndef(annotation))) strVars.add(id.name);
      // const [x, setX] = useState('') / useState<string> / useState<string | undefined>
      if (id.type === 'ArrayPattern' && id.elements[0] && id.elements[0].type === 'Identifier' && init &&
          init.type === 'CallExpression' && generate(init.callee, { compact: true }).code === 'useState') {
        const arg = init.arguments[0];
        const typeArg = init.typeParameters && init.typeParameters.params && init.typeParameters.params[0];
        const argIsString = arg && (arg.type === 'StringLiteral' ||
          (arg.type === 'TemplateLiteral' && arg.expressions.length === 0));
        if (argIsString || (typeArg && isStrOrUndef(typeText(typeArg)))) strVars.add(id.elements[0].name);
      }
    },
  });

  // --- View の直接の子になる式を検査 ---
  const rows = [];
  const WRAP = new Set(['ParenthesizedExpression', 'TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression']);
  // 式の評価結果が「空文字 '' になり得るか」だけを判定する（null/undefined/boolean は Children.toArray が除去する）
  const mayBeEmptyString = (node, depth = 0) => {
    if (!node || depth > 5) return false;
    switch (node.type) {
      case 'ParenthesizedExpression': case 'TSAsExpression': case 'TSNonNullExpression': case 'TSSatisfiesExpression':
        return mayBeEmptyString(node.expression, depth + 1);
      case 'StringLiteral':
        return node.value === '';
      case 'TemplateLiteral':
        return node.expressions.length === 0 && node.quasis.every((q) => q.value.raw === '');
      case 'UnaryExpression':
        return false; // !x は boolean
      case 'LogicalExpression':
        // `A && B` の値は A（falsy 時）か B。`A || B` の値は A（truthy 時）か B。
        if (node.operator === '&&') return mayBeEmptyString(node.left, depth + 1) || mayBeEmptyString(node.right, depth + 1);
        if (node.operator === '||' || node.operator === '??') {
          return mayBeEmptyString(node.left, depth + 1) && mayBeEmptyString(node.right, depth + 1);
        }
        return false;
      case 'ConditionalExpression':
        return mayBeEmptyString(node.consequent, depth + 1) || mayBeEmptyString(node.alternate, depth + 1);
      case 'Identifier':
        return strVars.has(node.name);
      case 'MemberExpression': case 'OptionalMemberExpression': {
        const name = baseName(node);
        if (!name || jsxProps.has(name)) return false;
        return STR_PROPS.has(name) && !NULLABLE_OK.has(name);
      }
      default:
        return false;
    }
  };
  // 子として現れた式について「その値が '' になり得る」最初の部分式を返す（&& 連鎖は左から）
  const findEmptyStringSource = (expr, depth = 0) => {
    if (!expr || depth > 5) return null;
    if (expr.type === 'LogicalExpression' && expr.operator === '&&') {
      const l = findEmptyStringSource(expr.left, depth + 1);
      if (l) return l;
      return findEmptyStringSource(expr.right, depth + 1);
    }
    return mayBeEmptyString(expr, depth) ? expr : null;
  };
  // 子の式が最終的にどの要素の children へ flatten されるかを解決する。
  // Fragment / 条件式 / 論理式 / 配列は透過する（React.Children.toArray は flatten するため）。
  const TRANSPARENT = new Set(['JSXFragment', 'JSXExpressionContainer', 'ConditionalExpression',
    'LogicalExpression', 'ArrayExpression', 'SequenceExpression']);
  const enclosingTag = (p) => {
    let up = p.parentPath;
    while (up) {
      const n = up.node;
      if (n.type === 'JSXElement') return nameOf(n.openingElement.name);
      if (TRANSPARENT.has(n.type)) { up = up.parentPath; continue; }
      return null; // 関数境界などは越えない
    }
    return null;
  };
  // JSXText（<View>hello</View> のような直接のテキスト）と、文字列リテラル直書きの子も報告する
  traverse(ast, {
    'JSXText|StringLiteral'(p) {
      const n = p.node;
      if (n.type === 'JSXText') {
        if (!/[^\s]/.test(n.value)) return;      // 空白のみは Babel が除去するので無視
        if (!p.parentPath || p.parentPath.node.type !== 'JSXElement') return;
        const tag = nameOf(p.parentPath.node.openingElement.name);
        if (!VIEWLIKE.test(tag)) return;
        rows.push(`${path.relative(ROOT, file)}:${n.loc.start.line}\t<${tag}>\tJSXText\t${JSON.stringify(n.value.trim().slice(0, 60))}`);
        return;
      }
      if (n.value !== '') return;               // 空文字リテラルだけ対象
      const cont = p.parentPath && p.parentPath.node;
      if (!cont || cont.type !== 'JSXExpressionContainer') return;
      const e = cont.expression;
      if (!e || (e.type !== 'StringLiteral' && e.type !== 'TemplateLiteral')) return;
      const tag = enclosingTag(p.parentPath);
      if (!tag || !VIEWLIKE.test(tag)) return;
      rows.push(`${path.relative(ROOT, file)}:${cont.loc.start.line}\t<${tag}>\tEMPTY_LITERAL\t'${e.type === 'TemplateLiteral' ? '`' : ''}${generate(e, { compact: true }).code.slice(0, 40)}`);
    },
    JSXExpressionContainer(p) {
      const e = p.node.expression;
      if (!e || e.type === 'JSXEmptyExpression') return;
      const bad = findEmptyStringSource(e);
      if (!bad) return;
      const tag = enclosingTag(p);
      if (!tag || !VIEWLIKE.test(tag)) return;
      rows.push(`${path.relative(ROOT, file)}:${p.node.loc.start.line}\t<${tag}>\t${generate(bad, { compact: true }).code}\t${generate(e, { compact: true }).code.slice(0, 80)}`);
    },
  });
  return rows;
}

const all = [];
for (const f of files) all.push(...analyze(f));
fs.writeFileSync(path.join(ROOT, '_verify_emptystr_child_out.txt'), all.join('\n'), 'utf8');
if (all.length > 0) {
  console.log('file:line\t<parent>\t原因の式\t子の式');
  console.log(all.join('\n'));
}
console.log(`risky sites: ${all.length}`);
process.exitCode = all.length > 0 ? 1 : 0;