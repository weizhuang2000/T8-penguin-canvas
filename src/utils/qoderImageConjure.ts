import {
  DEFAULT_CODEX_IMAGE_SNIPPETS,
  DEFAULT_CODEX_IMAGE_TEMPLATE_CATEGORIES,
  DEFAULT_CODEX_IMAGE_TEMPLATES,
  buildCodexImageConjurePrompt,
  createCodexImageConjureTask,
  deleteCodexImageSnippet,
  deleteCodexImageTemplate,
  enqueueCodexImageConjureTasks,
  expandCodexImagePromptSnippets,
  importCodexImagePromptPack,
  normalizeCodexImagePromptState,
  trimCodexImageConjureHistory,
  updateCodexImageConjureTask,
  upsertCodexImageSnippet,
  upsertCodexImageTemplate,
  type CodexImageConjurePromptBuildInput,
  type CodexImageConjureTask,
  type CodexImagePromptCategory,
  type CodexImagePromptSnippet,
  type CodexImagePromptState,
  type CodexImagePromptTemplate,
} from './codexImageConjure.ts';

export const QODER_IMAGE_CONJURE_PROMPT_SCHEMA = 't8-qoder-image-conjure-prompts' as const;

export type QoderImageConjureTask = CodexImageConjureTask;
export type QoderImagePromptCategory = CodexImagePromptCategory;
export type QoderImagePromptSnippet = CodexImagePromptSnippet;
export type QoderImagePromptState = CodexImagePromptState;
export type QoderImagePromptTemplate = CodexImagePromptTemplate;
export type QoderImageConjurePromptBuildInput = CodexImageConjurePromptBuildInput;

export const DEFAULT_QODER_IMAGE_TEMPLATE_CATEGORIES = DEFAULT_CODEX_IMAGE_TEMPLATE_CATEGORIES;
export const DEFAULT_QODER_IMAGE_TEMPLATES = DEFAULT_CODEX_IMAGE_TEMPLATES;
export const DEFAULT_QODER_IMAGE_SNIPPETS = DEFAULT_CODEX_IMAGE_SNIPPETS;
export const normalizeQoderImagePromptState = normalizeCodexImagePromptState;
export const importQoderImagePromptPack = importCodexImagePromptPack;
export const expandQoderImagePromptSnippets = expandCodexImagePromptSnippets;
export const buildQoderImageConjurePrompt = buildCodexImageConjurePrompt;
export const createQoderImageConjureTask = createCodexImageConjureTask;
export const enqueueQoderImageConjureTasks = enqueueCodexImageConjureTasks;
export const updateQoderImageConjureTask = updateCodexImageConjureTask;
export const trimQoderImageConjureHistory = trimCodexImageConjureHistory;
export const upsertQoderImageTemplate = upsertCodexImageTemplate;
export const deleteQoderImageTemplate = deleteCodexImageTemplate;
export const upsertQoderImageSnippet = upsertCodexImageSnippet;
export const deleteQoderImageSnippet = deleteCodexImageSnippet;

export function exportQoderImagePromptPack(state: unknown) {
  const normalized = normalizeQoderImagePromptState(state);
  return {
    schema: QODER_IMAGE_CONJURE_PROMPT_SCHEMA,
    version: 1,
    categories: normalized.categories,
    templates: normalized.templates,
    snippets: normalized.snippets,
  };
}
