import { lookupLabel } from '@/i18n';

// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
/** A raw record URL (applookup reference). NEVER render this directly
 *  in JSX — it is a URL, not a display value. Show the enriched `*Name`
 *  field or resolve it via the entity map instead. Assignable to/from
 *  string everywhere; the `& {}` keeps the alias NAME visible in tsc
 *  error messages (a plain primitive alias gets normalized away). */
export type RecordUrl = string & {};
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Mitarbeiter {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    rolle?: LookupValue;
    telefon?: string;
    email?: string;
    status?: LookupValue;
  };
}

export interface Wohnungen {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    name?: string;
    beschreibung?: string;
    stockwerk?: number;
    schlafplaetze?: number;
    quadratmeter?: number;
    grundpreis_pro_nacht?: number;
    endreinigung_preis?: number;
    ausstattung?: LookupValue[];
    foto?: string;
    status?: LookupValue;
  };
}

export interface Gaeste {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    email?: string;
    telefon?: string;
    strasse?: string;
    hausnummer?: string;
    plz?: string;
    ort?: string;
    land?: string;
    notizen?: string;
  };
}

export interface Buchungen {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    buchungsnummer?: string;
    wohnung?: RecordUrl; // applookup -> URL zu 'Wohnungen' Record
    gast?: RecordUrl; // applookup -> URL zu 'Gaeste' Record
    anreise?: string; // Format: YYYY-MM-DD oder ISO String
    abreise?: string; // Format: YYYY-MM-DD oder ISO String
    anzahl_personen?: number;
    status?: LookupValue;
    gesamtpreis?: number;
    anzahlung_erhalten?: boolean;
    notizen?: string;
  };
}

export interface Reinigungen {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    wohnung?: RecordUrl; // applookup -> URL zu 'Wohnungen' Record
    buchung?: RecordUrl; // applookup -> URL zu 'Buchungen' Record
    datum?: string; // Format: YYYY-MM-DD oder ISO String
    reinigungskraft?: RecordUrl; // applookup -> URL zu 'Mitarbeiter' Record
    status?: LookupValue;
    bemerkungen?: string;
  };
}

export const APP_IDS = {
  MITARBEITER: '6aa95a0531d8e22f033c262d',
  WOHNUNGEN: '6aa95a0cd994dd2c23c49aa6',
  GAESTE: '6aa95a0d7a984bb058dc68a5',
  BUCHUNGEN: '6aa95a0def12d19e974de8e8',
  REINIGUNGEN: '6aa95a0eef09c7d4801d28fb',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'mitarbeiter': {
    rolle: [{ key: "reinigung", get label() { return lookupLabel('mitarbeiter', 'rolle', "reinigung") ?? "Reinigung"; } }, { key: "vermietung", get label() { return lookupLabel('mitarbeiter', 'rolle', "vermietung") ?? "Vermietung"; } }],
    status: [{ key: "aktiv", get label() { return lookupLabel('mitarbeiter', 'status', "aktiv") ?? "Aktiv"; } }, { key: "inaktiv", get label() { return lookupLabel('mitarbeiter', 'status', "inaktiv") ?? "Inaktiv"; } }],
  },
  'wohnungen': {
    ausstattung: [{ key: "seeblick", get label() { return lookupLabel('wohnungen', 'ausstattung', "seeblick") ?? "Seeblick"; } }, { key: "kueche", get label() { return lookupLabel('wohnungen', 'ausstattung', "kueche") ?? "Küche"; } }, { key: "wlan", get label() { return lookupLabel('wohnungen', 'ausstattung', "wlan") ?? "WLAN"; } }, { key: "parkplatz", get label() { return lookupLabel('wohnungen', 'ausstattung', "parkplatz") ?? "Parkplatz"; } }, { key: "haustiere_erlaubt", get label() { return lookupLabel('wohnungen', 'ausstattung', "haustiere_erlaubt") ?? "Haustiere erlaubt"; } }, { key: "balkon", get label() { return lookupLabel('wohnungen', 'ausstattung', "balkon") ?? "Balkon"; } }],
    status: [{ key: "verfuegbar", get label() { return lookupLabel('wohnungen', 'status', "verfuegbar") ?? "Verfügbar"; } }, { key: "gesperrt", get label() { return lookupLabel('wohnungen', 'status', "gesperrt") ?? "Gesperrt"; } }],
  },
  'buchungen': {
    status: [{ key: "anfrage", get label() { return lookupLabel('buchungen', 'status', "anfrage") ?? "Anfrage"; } }, { key: "bestaetigt", get label() { return lookupLabel('buchungen', 'status', "bestaetigt") ?? "Bestätigt"; } }, { key: "eingecheckt", get label() { return lookupLabel('buchungen', 'status', "eingecheckt") ?? "Eingecheckt"; } }, { key: "ausgecheckt", get label() { return lookupLabel('buchungen', 'status', "ausgecheckt") ?? "Ausgecheckt"; } }, { key: "storniert", get label() { return lookupLabel('buchungen', 'status', "storniert") ?? "Storniert"; } }],
  },
  'reinigungen': {
    status: [{ key: "offen", get label() { return lookupLabel('reinigungen', 'status', "offen") ?? "Offen"; } }, { key: "erledigt", get label() { return lookupLabel('reinigungen', 'status', "erledigt") ?? "Erledigt"; } }],
  },
};

// Optimistic LookupValue writes: never re-type a label — resolve the schema
// option instead (its label is a locale-aware getter; falls back to the key).
// WRONG: status: { key: 'offen', label: 'Offen' }   (frozen in one language)
// RIGHT: status: lookupOption('<appKey>', 'status', 'offen')
export function lookupOption(app: string, field: string, key: string): LookupValue {
  return LOOKUP_OPTIONS[app]?.[field]?.find(o => o.key === key) ?? { key, label: key };
}

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'mitarbeiter': {
    'vorname': 'string/text',
    'nachname': 'string/text',
    'rolle': 'lookup/radio',
    'telefon': 'string/tel',
    'email': 'string/email',
    'status': 'lookup/radio',
  },
  'wohnungen': {
    'name': 'string/text',
    'beschreibung': 'string/textarea',
    'stockwerk': 'number',
    'schlafplaetze': 'number',
    'quadratmeter': 'number',
    'grundpreis_pro_nacht': 'number',
    'endreinigung_preis': 'number',
    'ausstattung': 'multiplelookup/checkbox',
    'foto': 'file',
    'status': 'lookup/radio',
  },
  'gaeste': {
    'vorname': 'string/text',
    'nachname': 'string/text',
    'email': 'string/email',
    'telefon': 'string/tel',
    'strasse': 'string/text',
    'hausnummer': 'string/text',
    'plz': 'string/text',
    'ort': 'string/text',
    'land': 'string/text',
    'notizen': 'string/textarea',
  },
  'buchungen': {
    'buchungsnummer': 'string/text',
    'wohnung': 'applookup/select',
    'gast': 'applookup/select',
    'anreise': 'date/date',
    'abreise': 'date/date',
    'anzahl_personen': 'number',
    'status': 'lookup/select',
    'gesamtpreis': 'number',
    'anzahlung_erhalten': 'bool',
    'notizen': 'string/textarea',
  },
  'reinigungen': {
    'wohnung': 'applookup/select',
    'buchung': 'applookup/select',
    'datum': 'date/date',
    'reinigungskraft': 'applookup/select',
    'status': 'lookup/radio',
    'bemerkungen': 'string/textarea',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateMitarbeiter = StripLookup<Mitarbeiter['fields']>;
export type CreateWohnungen = StripLookup<Wohnungen['fields']>;
export type CreateGaeste = StripLookup<Gaeste['fields']>;
export type CreateBuchungen = StripLookup<Buchungen['fields']>;
export type CreateReinigungen = StripLookup<Reinigungen['fields']>;