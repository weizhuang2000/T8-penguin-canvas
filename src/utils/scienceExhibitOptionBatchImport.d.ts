export interface ScienceExhibitOptionBatchItem {
  id: string;
  label: string;
  prompt: string;
  order: number;
  line?: number;
}

export interface ScienceExhibitOptionBatchError {
  line: number;
  message: string;
  source: string;
}

export function parseScienceExhibitOptionBatchText(text: string): {
  items: ScienceExhibitOptionBatchItem[];
  errors: ScienceExhibitOptionBatchError[];
};

export function mergeScienceExhibitOptionBatchItems<T extends { id: string; label: string; prompt: string; order: number }>(
  existing: T[],
  imported: T[],
): { items: T[]; added: number; updated: number };
