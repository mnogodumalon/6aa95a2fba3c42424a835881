import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['vorname', 'nachname', 'email', 'telefon', 'strasse', 'hausnummer', { row: ['plz', 'ort'], cols: '1fr 2fr' }, 'land', 'notizen'],
  defaults: {},
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
