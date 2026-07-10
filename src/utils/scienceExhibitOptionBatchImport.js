function consumeBatchField(input, fieldName) {
  const source = String(input || '').trimStart();
  if (!source) return { error: `缺少${fieldName}` };
  if (source.startsWith('**')) {
    const end = source.indexOf('**', 2);
    if (end < 0) return { error: `${fieldName}的 Markdown 粗体标记未闭合` };
    const value = source.slice(2, end).trim();
    const remainder = source.slice(end + 2);
    if (remainder && !/^\s/u.test(remainder)) return { error: `${fieldName}后缺少分隔空格` };
    return { value, rest: remainder.trimStart() };
  }
  const match = source.match(/^(\S+)(?:\s+|$)/u);
  if (!match) return { error: `无法读取${fieldName}` };
  return { value: match[1], rest: source.slice(match[0].length) };
}

export function parseScienceExhibitOptionBatchText(text) {
  const errors = [];
  const ordered = [];
  const indexById = new Map();
  String(text || '').split(/\r?\n/).forEach((sourceLine, index) => {
    const line = index + 1;
    const source = sourceLine.trim();
    if (!source) return;

    const idField = consumeBatchField(source, 'ID');
    if (idField.error) {
      errors.push({ line, message: idField.error, source: sourceLine });
      return;
    }
    const labelField = consumeBatchField(idField.rest, '名称');
    if (labelField.error) {
      errors.push({ line, message: labelField.error, source: sourceLine });
      return;
    }

    const id = String(idField.value || '').trim();
    const label = String(labelField.value || '').trim();
    const prompt = String(labelField.rest || '').trim();
    let message = '';
    if (!id || id.length > 96 || !/^[a-zA-Z0-9_-]+$/.test(id)) message = 'ID 仅允许英文、数字、-、_，且不能超过 96 个字符';
    else if (!label || !/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(label)) message = '名称必须包含中文字符';
    else if (!prompt || !/[a-zA-Z]/.test(prompt)) message = 'Prompt 定义必须包含英文内容';
    if (message) {
      errors.push({ line, message, source: sourceLine });
      return;
    }

    const item = { id, label, prompt, order: ordered.length, line };
    const existingIndex = indexById.get(id);
    if (existingIndex === undefined) {
      indexById.set(id, ordered.length);
      ordered.push(item);
    } else {
      ordered[existingIndex] = { ...item, order: existingIndex };
    }
  });
  return { items: ordered, errors };
}

export function mergeScienceExhibitOptionBatchItems(existing, imported) {
  const next = Array.isArray(existing) ? existing.map((item) => ({ ...item })) : [];
  const indexById = new Map(next.map((item, index) => [String(item?.id || ''), index]));
  let added = 0;
  let updated = 0;
  for (const item of Array.isArray(imported) ? imported : []) {
    const id = String(item?.id || '');
    const existingIndex = indexById.get(id);
    if (existingIndex === undefined) {
      indexById.set(id, next.length);
      next.push({ ...item, order: next.length });
      added += 1;
    } else {
      next[existingIndex] = {
        ...next[existingIndex],
        id,
        label: item.label,
        prompt: item.prompt,
      };
      updated += 1;
    }
  }
  return { items: next, added, updated };
}
