import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['name', 'beschreibung', 'stockwerk', 'schlafplaetze', 'quadratmeter', 'grundpreis_pro_nacht', 'endreinigung_preis', 'ausstattung', 'status'],
  defaults: {
    'status': { kind: 'lookup', key: 'verfuegbar', label: 'Verfügbar' },
    'schlafplaetze': { kind: 'literal', value: 1 },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
