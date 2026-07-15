'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {RULE_CATALOG, SKILL_SOURCE} = require('../backend/src/tools/remotion/skillCatalog');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function auditSkill(sourceRoot) {
  const root = path.resolve(String(sourceRoot || ''));
  const rulesDir = path.basename(root).toLowerCase() === 'rules' ? root : path.join(root, 'rules');
  if (!fs.existsSync(rulesDir)) throw new Error(`找不到规则目录: ${rulesDir}`);
  const upstream = fs.readdirSync(rulesDir).filter((name) => name.endsWith('.md')).map((name) => path.basename(name, '.md')).sort();
  const expected = Object.keys(RULE_CATALOG).sort();
  const missing = expected.filter((id) => !upstream.includes(id));
  const added = upstream.filter((id) => !expected.includes(id));
  const changed = expected.filter((id) => upstream.includes(id) && sha256(path.join(rulesDir, `${id}.md`)) !== RULE_CATALOG[id].sha256);
  return {source: SKILL_SOURCE, expectedCount: expected.length, upstreamCount: upstream.length, missing, added, changed, ok: !missing.length && !added.length && !changed.length};
}

if (require.main === module) {
  const index = process.argv.indexOf('--source');
  const source = index >= 0 ? process.argv[index + 1] : process.argv[2];
  if (!source) {
    console.error('用法: node scripts/audit-remotion-skill.cjs --source <skill 目录或 rules 目录>');
    process.exit(2);
  }
  try {
    const result = auditSkill(source);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 2;
  }
}

module.exports = {auditSkill};
