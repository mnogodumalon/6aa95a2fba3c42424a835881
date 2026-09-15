import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['buchungsnummer', 'wohnung', 'gast', { row: ['anreise', 'abreise'] }, 'anzahl_personen', 'status', 'gesamtpreis', 'anzahlung_erhalten', 'notizen'],
  defaults: {
    'status': { kind: 'lookup', key: 'anfrage', label: 'Anfrage' },
    'anzahlung_erhalten': { kind: 'literal', value: false },
  },
  computed: {
    '_buchung_dauer_nächte': { kind: 'dateDiff', from: 'anreise', to: 'abreise', unit: 'days' },
    'gesamtpreis': { op: 'add', left: { op: 'mul', left: { kind: 'applookup', ownKey: 'wohnung', lookupKey: 'grundpreis_pro_nacht' }, right: { kind: 'dateDiff', from: 'anreise', to: 'abreise', unit: 'days' } }, right: { kind: 'applookup', ownKey: 'wohnung', lookupKey: 'endreinigung_preis' } },
  },
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
