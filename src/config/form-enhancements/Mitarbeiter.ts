import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['vorname', 'nachname', 'rolle', 'telefon', 'email', 'status'],
  defaults: {
    'rolle': { kind: 'lookup', key: 'reinigung', label: 'Reinigung' },
    'status': { kind: 'lookup', key: 'aktiv', label: 'Aktiv' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
