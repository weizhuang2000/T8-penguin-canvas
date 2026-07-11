function readField(input, name) {
  const source = String(input || '').trimStart();
  if (!source) return { error: `缺少${name}` };
  if (source.startsWith('**')) {
    const end = source.indexOf('**', 2);
    if (end < 0) return { error: `${name}的 Markdown 粗体标记未闭合` };
    return { value: source.slice(2, end).trim(), rest: source.slice(end + 2).trimStart() };
  }
  const match = source.match(/^(\S+)(?:\s+|$)/u);
  return match
    ? { value: match[1], rest: source.slice(match[0].length) }
    : { error: `无法读取${name}` };
}

export function parseDesignOptionBatchText(text) {
  const errors = [];
  const items = [];
  const indexById = new Map();
  String(text || '').split(/\r?\n/).forEach((sourceLine, index) => {
    const line = index + 1;
    const source = sourceLine.trim();
    if (!source) return;
    const idField = readField(source, 'ID');
    const labelField = idField.error ? null : readField(idField.rest, '名称');
    const id = String(idField.value || '').trim();
    const label = String(labelField?.value || '').trim();
    const prompt = String(labelField?.rest || '').trim();
    let message = idField.error || labelField?.error || '';
    if (!message && (!id || id.length > 96 || !/^[a-zA-Z0-9_-]+$/.test(id))) message = 'ID 只能包含英文、数字、-、_，且不超过 96 个字符';
    if (!message && !label) message = '名称不能为空';
    if (!message && !prompt) message = 'Prompt 定义不能为空';
    if (message) {
      errors.push({ line, message, source: sourceLine });
      return;
    }
    const item = { id, label, prompt, order: items.length, line };
    const existing = indexById.get(id);
    if (existing === undefined) {
      indexById.set(id, items.length);
      items.push(item);
    } else {
      items[existing] = { ...item, order: existing };
    }
  });
  return { items, errors };
}

export function mergeDesignOptionBatchItems(existing, imported) {
  const items = Array.isArray(existing) ? existing.map((item) => ({ ...item })) : [];
  const indexById = new Map(items.map((item, index) => [String(item?.id || ''), index]));
  let added = 0;
  let updated = 0;
  for (const item of Array.isArray(imported) ? imported : []) {
    const index = indexById.get(String(item?.id || ''));
    if (index === undefined) {
      indexById.set(item.id, items.length);
      items.push({ ...item, order: items.length });
      added += 1;
    } else {
      items[index] = { ...items[index], id: item.id, label: item.label, prompt: item.prompt };
      updated += 1;
    }
  }
  return { items, added, updated };
}
