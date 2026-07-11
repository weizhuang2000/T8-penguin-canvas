export interface DesignOptionBatchItem { id: string; label: string; prompt: string; order: number; line?: number }
export interface DesignOptionBatchError { line: number; message: string; source: string }
export function parseDesignOptionBatchText(text: string): { items: DesignOptionBatchItem[]; errors: DesignOptionBatchError[] };
export function mergeDesignOptionBatchItems<T extends DesignOptionBatchItem>(existing: T[], imported: T[]): { items: T[]; added: number; updated: number };
