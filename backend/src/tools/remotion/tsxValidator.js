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
const COLOR_LITERAL_RE = /^(?:#[0-9a-f]{3,8}|rgba?\s*\(|hsla?\s*\(|hwb\s*\(|lab\s*\(|lch\s*\(|oklab\s*\(|oklch\s*\(|color\s*\()/i;

function staticString(node) {
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0]?.value?.cooked || '';
  return null;
}

function resolveArrayExpression(node, callPath) {
  if (node?.type === 'ArrayExpression') return node;
  if (node?.type !== 'Identifier') return null;
  const binding = callPath.scope.getBinding(node.name);
  const declarator = binding?.path?.isVariableDeclarator?.() ? binding.path : binding?.path?.parentPath;
  if (declarator?.isVariableDeclarator?.() && declarator.node.init?.type === 'ArrayExpression') return declarator.node.init;
  return null;
}

function uniqueAlias(source) {
  let suffix = 0;
  let alias = '__t8InterpolateColors';
  while (new RegExp(`\\b${alias}\\b`).test(source)) {
    suffix += 1;
    alias = `__t8InterpolateColors${suffix}`;
  }
  return alias;
}

function applyTextEdits(source, edits) {
  let next = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    next = `${next.slice(0, edit.start)}${edit.text}${next.slice(edit.end)}`;
  }
  return next;
}

function normalizeColorInterpolations(source, ast) {
  const directNames = new Set();
  const namespaceNames = new Set();
  let lastImportEnd = 0;
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    lastImportEnd = Math.max(lastImportEnd, Number(node.end) || 0);
    if (node.source.value !== 'remotion') continue;
    for (const specifier of node.specifiers || []) {
      if (specifier.type === 'ImportSpecifier' && specifier.imported?.name === 'interpolate') directNames.add(specifier.local.name);
      if (specifier.type === 'ImportNamespaceSpecifier') namespaceNames.add(specifier.local.name);
    }
  }

  const alias = uniqueAlias(source);
  const edits = [];
  const errors = [];
  const normalizations = [];
  let needsAliasImport = false;
  traverse(ast, {
    CallExpression(callPath) {
      const callee = callPath.node.callee;
      let editRange = null;
      let replacement = '';
      if (callee?.type === 'Identifier' && directNames.has(callee.name)) {
        editRange = {start: callee.start, end: callee.end};
        replacement = alias;
        needsAliasImport = true;
      } else if (callee?.type === 'MemberExpression' && !callee.computed && callee.object?.type === 'Identifier'
        && namespaceNames.has(callee.object.name) && callee.property?.type === 'Identifier' && callee.property.name === 'interpolate') {
        editRange = {start: callee.property.start, end: callee.property.end};
        replacement = 'interpolateColors';
      }
      if (!editRange || editRange.start == null || editRange.end == null) return;
      const outputRange = resolveArrayExpression(callPath.node.arguments?.[2], callPath);
      if (!outputRange) return;
      const values = outputRange.elements.map(staticString);
      const colorValues = values.filter((value) => typeof value === 'string' && COLOR_LITERAL_RE.test(value));
      if (colorValues.length === 0) return;
      if (values.every((value) => typeof value === 'string' && COLOR_LITERAL_RE.test(value))) {
        edits.push({...editRange, text: replacement});
        normalizations.push(`已将颜色 interpolate() 自动改为 interpolateColors()：${colorValues[0]}`);
      } else {
        errors.push(`interpolate() 的输出范围混用了颜色和非颜色值（${colorValues[0]}）；请拆分动画并对颜色单独使用 interpolateColors()`);
      }
    },
  });
  if (needsAliasImport && edits.some((edit) => edit.text === alias)) {
    edits.push({start: lastImportEnd, end: lastImportEnd, text: `\nimport {interpolateColors as ${alias}} from 'remotion';`});
  }
  return {
    source: edits.length ? applyTextEdits(source, edits) : source,
    errors,
    normalizations: [...new Set(normalizations)],
  };
}

function validateTsxSource(source) {
  let text = String(source || '').trim().replace(/^```(?:tsx|typescript|ts|jsx)?\s*/i, '').replace(/\s*```$/, '');
  let errors = [];
  let normalizations = [];
  if (!text) return { ok: false, source: text, errors: ['TSX 内容为空'], normalizations };
  if (text.length > MAX_SOURCE_LENGTH) return { ok: false, source: text, errors: [`TSX 超过 ${MAX_SOURCE_LENGTH} 字符限制`], normalizations };

  let ast;
  try {
    ast = parser.parse(text, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      errorRecovery: false,
    });
  } catch (error) {
    return { ok: false, source: text, errors: [`TSX 解析失败: ${error.message}`], normalizations };
  }

  const colorNormalization = normalizeColorInterpolations(text, ast);
  text = colorNormalization.source;
  errors = colorNormalization.errors;
  normalizations = colorNormalization.normalizations;
  if (normalizations.length > 0) {
    try {
      ast = parser.parse(text, {sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: false});
    } catch (error) {
      return {ok: false, source: text, errors: [`颜色插值自动修复后 TSX 解析失败: ${error.message}`], normalizations};
    }
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
  return { ok: errors.length === 0, source: text, errors, normalizations };
}

module.exports = { ALLOWED_IMPORTS, COLOR_LITERAL_RE, MAX_SOURCE_LENGTH, normalizeColorInterpolations, validateTsxSource };
