import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['wohnung', 'buchung', 'datum', 'reinigungskraft', 'status', 'bemerkungen'],
  defaults: {
    'datum': { kind: 'today' },
    'status': { kind: 'lookup', key: 'offen', label: 'Offen' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
