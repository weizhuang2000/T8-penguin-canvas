'use strict';

const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const MAX_SOURCE_LENGTH = 100000;
const ALLOWED_IMPORTS = new Set([
  'react',
  'remotion',
  '@remotion/media',
  '@remotion/transitions',
  '@remotion/transitions/fade',
  '@remotion/transitions/slide',
  '@remotion/transitions/wipe',
  '@remotion/transitions/flip',
  '@remotion/transitions/clock-wipe',
  '@t8/remotion-kit',
]);
const BANNED_IDENTIFIERS = new Set([
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'eval', 'Function',
  'Worker', 'SharedWorker', 'process', 'require', 'global', 'globalThis',
  'localStorage', 'sessionStorage', 'indexedDB', 'document', 'window', 'navigator',
]);
const BANNED_STYLE_KEYS = new Set(['animation', 'animationName', 'transition', 'transitionProperty', 'backgroundImage']);

function validateTsxSource(source) {
  const text = String(source || '').trim().replace(/^```(?:tsx|typescript|ts|jsx)?\s*/i, '').replace(/\s*```$/, '');
  const errors = [];
  if (!text) return { ok: false, source: text, errors: ['TSX 内容为空'] };
  if (text.length > MAX_SOURCE_LENGTH) return { ok: false, source: text, errors: [`TSX 超过 ${MAX_SOURCE_LENGTH} 字符限制`] };

  let ast;
  try {
    ast = parser.parse(text, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      errorRecovery: false,
    });
  } catch (error) {
    return { ok: false, source: text, errors: [`TSX 解析失败: ${error.message}`] };
  }

  let hasExport = false;
  let hasFrameHook = false;
  let hasVideoConfig = false;
  let nodeCount = 0;
  const push = (message) => { if (!errors.includes(message)) errors.push(message); };

  traverse(ast, {
    enter(path) {
      nodeCount += 1;
      if (nodeCount > 20000) push('TSX AST 过于复杂');
      if (path.isImport()) push('禁止动态 import()');
    },
    ImportDeclaration(path) {
      const value = String(path.node.source.value || '');
      if (!ALLOWED_IMPORTS.has(value)) push(`禁止导入模块: ${value}`);
    },
    ExportNamedDeclaration(path) {
      const declaration = path.node.declaration;
      if (declaration?.type === 'VariableDeclaration') {
        hasExport ||= declaration.declarations.some((item) => item.id?.type === 'Identifier' && item.id.name === 'GeneratedComposition');
      }
      if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name === 'GeneratedComposition') hasExport = true;
      for (const item of path.node.specifiers || []) {
        if (item.exported?.name === 'GeneratedComposition') hasExport = true;
      }
    },
    ExportDefaultDeclaration() {
      push('请使用命名导出 GeneratedComposition，不允许 default export');
    },
    ReferencedIdentifier(path) {
      const name = path.node.name;
      if (BANNED_IDENTIFIERS.has(name) && !path.scope.hasBinding(name)) push(`禁止使用 API: ${name}`);
      if (name === 'useCurrentFrame') hasFrameHook = true;
      if (name === 'useVideoConfig') hasVideoConfig = true;
    },
    StringLiteral(path) {
      if (/^(?:https?:|file:|data:|blob:)/i.test(path.node.value)) push('禁止在 TSX 中写入外部 URL 或 data URL，请只引用 props.assets');
    },
    TemplateElement(path) {
      if (/(?:https?:|file:|data:|blob:)/i.test(path.node.value.raw || '')) push('禁止在 TSX 模板字符串中写入外部 URL');
    },
    ObjectProperty(path) {
      const key = path.node.key;
      const name = key?.type === 'Identifier' ? key.name : key?.type === 'StringLiteral' ? key.value : '';
      if (BANNED_STYLE_KEYS.has(name)) push(`禁止 CSS 属性: ${name}`);
    },
    JSXOpeningElement(path) {
      if (path.node.name?.type === 'JSXIdentifier' && ['img', 'audio', 'video', 'iframe', 'script'].includes(path.node.name.name)) {
        push(`禁止原生 <${path.node.name.name}>，请使用 Remotion 媒体组件`);
      }
    },
    CallExpression(path) {
      if (path.node.callee?.type === 'Import') push('禁止动态 import()');
    },
  });

  if (!hasExport) errors.push('必须命名导出 GeneratedComposition');
  if (!hasFrameHook) errors.push('动画必须使用 useCurrentFrame()');
  if (!hasVideoConfig) errors.push('动画必须使用 useVideoConfig()');
  return { ok: errors.length === 0, source: text, errors };
}

module.exports = { ALLOWED_IMPORTS, MAX_SOURCE_LENGTH, validateTsxSource };
