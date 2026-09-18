/**
 * Field rules — GENERATED from the app metadata. Do not edit.
 *
 * The mechanical truth about every field: what kind it is, whether the
 * platform's base view marks it required, which lookup keys exist, where an
 * applookup points, what the label is. `useStepForm` validates against these
 * rules and phrases its messages with the real labels; `toWirePayload` uses
 * them to shape the create payload; `SHAPES` tells a page which input FORM
 * fits the data (a date pair wants a calendar, not two fields) — it is a
 * signal, not a gate.
 */
import { appLabel, fieldLabel, lookupLabel } from '@/i18n';
import { policyLabel } from './policy';
import { LOOKUP_OPTIONS } from '@/types/app';

export type EntityKey = 'mitarbeiter' | 'wohnungen' | 'gaeste' | 'buchungen' | 'reinigungen';

/** The text fields of each entity — what a search may run over (generated;
 *  `never` for an entity without text of its own, e.g. a link table). */
export interface StringFields {
  "mitarbeiter": "vorname" | "nachname" | "telefon" | "email";
  "wohnungen": "name" | "beschreibung";
  "gaeste": "vorname" | "nachname" | "email" | "telefon" | "strasse" | "hausnummer" | "plz" | "ort" | "land" | "notizen";
  "buchungen": "buchungsnummer" | "notizen";
  "reinigungen": "bemerkungen";
}
export type StringFieldKey<E extends EntityKey> = E extends keyof StringFields ? StringFields[E] : never;

/** The applookup fields of each entity (generated). A pick stored through
 *  `form.set` on one of these must carry its display name — at compile time
 *  (`StepForm.set`), because the review would otherwise show the id. */
export interface RecordFields {
  "mitarbeiter": never;
  "wohnungen": never;
  "gaeste": never;
  "buchungen": "wohnung" | "gast";
  "reinigungen": "wohnung" | "buchung" | "reinigungskraft";
}
export type RecordFieldKey<E extends EntityKey> = E extends keyof RecordFields ? RecordFields[E] : never;

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'bool'
  | 'date'
  | 'datetime'
  | 'lookup'
  | 'multilookup'
  | 'record'
  | 'multirecord'
  | 'file'
  | 'geo';

export interface FieldRule {
  key: string;
  fulltype: string;
  kind: FieldKind;
  /** From the app's base view. A public page may override this per field. */
  required: boolean;
  /** Build-time label — `labelOf()` prefers the runtime i18n bundle. */
  label: string;
  /** Whether a journey may write it (`file` is upload-only, never via a journey). */
  writable: boolean;
  maxLength?: number;
  /** lookup / multilookup: the ONLY valid write values. */
  options?: string[];
  /** record / multirecord: the target app (always) and its entity key (when inside this appgroup). */
  targetAppId?: string;
  targetEntity?: EntityKey;
  format?: 'currency';
  /** HTML autocomplete token derived from the field name (given-name, email, tel, …). */
  autoComplete?: string;
}

export interface EntityInfo {
  key: EntityKey;
  appId: string;
  label: string;
  /** PascalCase plural — `get<pascal>()` on the service. */
  pascal: string;
  /** The single-record suffix — `create<single>()` on the service. */
  single: string;
}

/** Input-form signals per entity: which data shape each field (pair) has.
 *  `range`  — two date fields that form a stay/period → AvailabilityRangePicker
 *  `choice` — a lookup with few options → ChoiceGroup pills instead of a select
 *  `record` — an applookup → EntitySelectStep with search, never a raw id field
 *  `stock`  — a quantity that has a stock/capacity counterpart → show it, warn on overshoot */
export type Shape =
  | { kind: 'range'; from: string; to: string }
  | { kind: 'choice'; field: string; count: number }
  | { kind: 'record'; field: string; targetEntity?: EntityKey }
  | { kind: 'stock'; field: string };

export const ENTITIES: Record<EntityKey, EntityInfo> = {
  "mitarbeiter": {
    "key": "mitarbeiter",
    "appId": "6aa95a0531d8e22f033c262d",
    "label": "Mitarbeiter",
    "pascal": "Mitarbeiter",
    "single": "MitarbeiterEntry"
  },
  "wohnungen": {
    "key": "wohnungen",
    "appId": "6aa95a0cd994dd2c23c49aa6",
    "label": "Wohnungen",
    "pascal": "Wohnungen",
    "single": "WohnungenEntry"
  },
  "gaeste": {
    "key": "gaeste",
    "appId": "6aa95a0d7a984bb058dc68a5",
    "label": "Gäste",
    "pascal": "Gaeste",
    "single": "GaesteEntry"
  },
  "buchungen": {
    "key": "buchungen",
    "appId": "6aa95a0def12d19e974de8e8",
    "label": "Buchungen",
    "pascal": "Buchungen",
    "single": "BuchungenEntry"
  },
  "reinigungen": {
    "key": "reinigungen",
    "appId": "6aa95a0eef09c7d4801d28fb",
    "label": "Reinigungen",
    "pascal": "Reinigungen",
    "single": "ReinigungenEntry"
  }
};

export const FIELD_RULES: Record<EntityKey, Record<string, FieldRule>> = {
  "mitarbeiter": {
    "vorname": {
      "key": "vorname",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Vorname",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "given-name"
    },
    "nachname": {
      "key": "nachname",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Nachname",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "family-name"
    },
    "rolle": {
      "key": "rolle",
      "fulltype": "lookup/radio",
      "kind": "lookup",
      "required": true,
      "label": "Rolle",
      "writable": true,
      "options": [
        "reinigung",
        "vermietung"
      ]
    },
    "telefon": {
      "key": "telefon",
      "fulltype": "string/tel",
      "kind": "tel",
      "required": false,
      "label": "Telefon",
      "writable": true,
      "autoComplete": "tel"
    },
    "email": {
      "key": "email",
      "fulltype": "string/email",
      "kind": "email",
      "required": false,
      "label": "E-Mail",
      "writable": true,
      "autoComplete": "email"
    },
    "status": {
      "key": "status",
      "fulltype": "lookup/radio",
      "kind": "lookup",
      "required": true,
      "label": "Status",
      "writable": true,
      "options": [
        "aktiv",
        "inaktiv"
      ]
    }
  },
  "wohnungen": {
    "name": {
      "key": "name",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Name der Wohnung",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "name"
    },
    "beschreibung": {
      "key": "beschreibung",
      "fulltype": "string/textarea",
      "kind": "textarea",
      "required": false,
      "label": "Beschreibung",
      "writable": true
    },
    "stockwerk": {
      "key": "stockwerk",
      "fulltype": "number",
      "kind": "number",
      "required": false,
      "label": "Stockwerk",
      "writable": true
    },
    "schlafplaetze": {
      "key": "schlafplaetze",
      "fulltype": "number",
      "kind": "number",
      "required": true,
      "label": "Schlafplätze",
      "writable": true
    },
    "quadratmeter": {
      "key": "quadratmeter",
      "fulltype": "number",
      "kind": "number",
      "required": false,
      "label": "Quadratmeter",
      "writable": true
    },
    "grundpreis_pro_nacht": {
      "key": "grundpreis_pro_nacht",
      "fulltype": "number",
      "kind": "number",
      "required": true,
      "label": "Grundpreis pro Nacht (€)",
      "writable": true,
      "format": "currency"
    },
    "endreinigung_preis": {
      "key": "endreinigung_preis",
      "fulltype": "number",
      "kind": "number",
      "required": false,
      "label": "Endreinigung (€)",
      "writable": true,
      "format": "currency"
    },
    "ausstattung": {
      "key": "ausstattung",
      "fulltype": "multiplelookup/checkbox",
      "kind": "multilookup",
      "required": false,
      "label": "Ausstattung",
      "writable": true,
      "options": [
        "seeblick",
        "kueche",
        "wlan",
        "parkplatz",
        "haustiere_erlaubt",
        "balkon"
      ]
    },
    "foto": {
      "key": "foto",
      "fulltype": "file",
      "kind": "file",
      "required": false,
      "label": "Foto",
      "writable": false
    },
    "status": {
      "key": "status",
      "fulltype": "lookup/radio",
      "kind": "lookup",
      "required": true,
      "label": "Status",
      "writable": true,
      "options": [
        "verfuegbar",
        "gesperrt"
      ]
    }
  },
  "gaeste": {
    "vorname": {
      "key": "vorname",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Vorname",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "given-name"
    },
    "nachname": {
      "key": "nachname",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Nachname",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "family-name"
    },
    "email": {
      "key": "email",
      "fulltype": "string/email",
      "kind": "email",
      "required": false,
      "label": "E-Mail",
      "writable": true,
      "autoComplete": "email"
    },
    "telefon": {
      "key": "telefon",
      "fulltype": "string/tel",
      "kind": "tel",
      "required": false,
      "label": "Telefon",
      "writable": true,
      "autoComplete": "tel"
    },
    "strasse": {
      "key": "strasse",
      "fulltype": "string/text",
      "kind": "text",
      "required": false,
      "label": "Straße",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "address-line1"
    },
    "hausnummer": {
      "key": "hausnummer",
      "fulltype": "string/text",
      "kind": "text",
      "required": false,
      "label": "Hausnummer",
      "writable": true,
      "maxLength": 4000
    },
    "plz": {
      "key": "plz",
      "fulltype": "string/text",
      "kind": "text",
      "required": false,
      "label": "Postleitzahl",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "postal-code"
    },
    "ort": {
      "key": "ort",
      "fulltype": "string/text",
      "kind": "text",
      "required": false,
      "label": "Ort",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "address-level2"
    },
    "land": {
      "key": "land",
      "fulltype": "string/text",
      "kind": "text",
      "required": false,
      "label": "Land",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "country-name"
    },
    "notizen": {
      "key": "notizen",
      "fulltype": "string/textarea",
      "kind": "textarea",
      "required": false,
      "label": "Notizen",
      "writable": true
    }
  },
  "buchungen": {
    "buchungsnummer": {
      "key": "buchungsnummer",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Buchungsnummer",
      "writable": true,
      "maxLength": 4000
    },
    "wohnung": {
      "key": "wohnung",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": true,
      "label": "Wohnung",
      "writable": true,
      "targetAppId": "6aa95a0cd994dd2c23c49aa6",
      "targetEntity": "wohnungen"
    },
    "gast": {
      "key": "gast",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": true,
      "label": "Gast",
      "writable": true,
      "targetAppId": "6aa95a0d7a984bb058dc68a5",
      "targetEntity": "gaeste"
    },
    "anreise": {
      "key": "anreise",
      "fulltype": "date/date",
      "kind": "date",
      "required": true,
      "label": "Anreise",
      "writable": true
    },
    "abreise": {
      "key": "abreise",
      "fulltype": "date/date",
      "kind": "date",
      "required": true,
      "label": "Abreise",
      "writable": true
    },
    "anzahl_personen": {
      "key": "anzahl_personen",
      "fulltype": "number",
      "kind": "number",
      "required": true,
      "label": "Anzahl Personen",
      "writable": true
    },
    "status": {
      "key": "status",
      "fulltype": "lookup/select",
      "kind": "lookup",
      "required": true,
      "label": "Status",
      "writable": true,
      "options": [
        "anfrage",
        "bestaetigt",
        "eingecheckt",
        "ausgecheckt",
        "storniert"
      ]
    },
    "gesamtpreis": {
      "key": "gesamtpreis",
      "fulltype": "number",
      "kind": "number",
      "required": false,
      "label": "Gesamtpreis (€)",
      "writable": true,
      "format": "currency"
    },
    "anzahlung_erhalten": {
      "key": "anzahlung_erhalten",
      "fulltype": "bool",
      "kind": "bool",
      "required": false,
      "label": "Anzahlung erhalten",
      "writable": true
    },
    "notizen": {
      "key": "notizen",
      "fulltype": "string/textarea",
      "kind": "textarea",
      "required": false,
      "label": "Notizen",
      "writable": true
    }
  },
  "reinigungen": {
    "wohnung": {
      "key": "wohnung",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": true,
      "label": "Wohnung",
      "writable": true,
      "targetAppId": "6aa95a0cd994dd2c23c49aa6",
      "targetEntity": "wohnungen"
    },
    "buchung": {
      "key": "buchung",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": false,
      "label": "Buchung",
      "writable": true,
      "targetAppId": "6aa95a0def12d19e974de8e8",
      "targetEntity": "buchungen"
    },
    "datum": {
      "key": "datum",
      "fulltype": "date/date",
      "kind": "date",
      "required": true,
      "label": "Reinigungsdatum",
      "writable": true
    },
    "reinigungskraft": {
      "key": "reinigungskraft",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": true,
      "label": "Reinigungskraft",
      "writable": true,
      "targetAppId": "6aa95a0531d8e22f033c262d",
      "targetEntity": "mitarbeiter"
    },
    "status": {
      "key": "status",
      "fulltype": "lookup/radio",
      "kind": "lookup",
      "required": true,
      "label": "Status",
      "writable": true,
      "options": [
        "offen",
        "erledigt"
      ]
    },
    "bemerkungen": {
      "key": "bemerkungen",
      "fulltype": "string/textarea",
      "kind": "textarea",
      "required": false,
      "label": "Bemerkungen",
      "writable": true
    }
  }
};

export const SHAPES: Record<EntityKey, Shape[]> = {
  "mitarbeiter": [
    {
      "kind": "choice",
      "field": "rolle",
      "count": 2
    },
    {
      "kind": "choice",
      "field": "status",
      "count": 2
    }
  ],
  "wohnungen": [
    {
      "kind": "choice",
      "field": "status",
      "count": 2
    },
    {
      "kind": "stock",
      "field": "stockwerk"
    }
  ],
  "gaeste": [],
  "buchungen": [
    {
      "kind": "range",
      "from": "anreise",
      "to": "abreise"
    },
    {
      "kind": "choice",
      "field": "status",
      "count": 5
    },
    {
      "kind": "record",
      "field": "wohnung",
      "targetEntity": "wohnungen"
    },
    {
      "kind": "record",
      "field": "gast",
      "targetEntity": "gaeste"
    }
  ],
  "reinigungen": [
    {
      "kind": "choice",
      "field": "status",
      "count": 2
    },
    {
      "kind": "record",
      "field": "wohnung",
      "targetEntity": "wohnungen"
    },
    {
      "kind": "record",
      "field": "buchung",
      "targetEntity": "buchungen"
    },
    {
      "kind": "record",
      "field": "reinigungskraft",
      "targetEntity": "mitarbeiter"
    }
  ]
};

/** The fields a record of this entity is recognised by (a person: first and
 *  last name; else its title-like text field) — the same choice the dashboard's
 *  enrichment makes for `<key>Name`. `useRecordSearch` resolves an applookup to
 *  this name (`ctx.ref('gast')` in `toItem`). */
export const DISPLAY_FIELDS: Record<EntityKey, string[]> = {
  "mitarbeiter": [
    "vorname",
    "nachname"
  ],
  "wohnungen": [
    "name"
  ],
  "gaeste": [
    "vorname",
    "nachname"
  ],
  "buchungen": [
    "buchungsnummer"
  ],
  "reinigungen": [
    "bemerkungen"
  ]
};

/** The display name of a record: its display fields joined, else the first
 *  non-empty text value, else ''. */
/** A display-field value as text: strings as they are, a lookup `{ key, label }`
 *  (either door hydrates lookups to objects) by its label — an entity whose
 *  only title-like field is a lookup/select otherwise had no name at all. */
function displayPart(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object' && 'label' in v) {
    const l = (v as { label?: unknown }).label;
    return l === null || l === undefined ? '' : String(l).trim();
  }
  return '';
}

export function displayNameOf(entity: EntityKey, fields: Record<string, unknown>): string {
  const parts = (DISPLAY_FIELDS[entity] ?? [])
    .map(k => displayPart(fields[k]))
    .filter(v => v !== '');
  if (parts.length > 0) return parts.join(' ');
  for (const [k, rule] of Object.entries(FIELD_RULES[entity] ?? {})) {
    if (rule.kind !== 'text' && rule.kind !== 'email') continue;
    const v = fields[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

export function ruleOf(entity: EntityKey, key: string): FieldRule | undefined {
  return FIELD_RULES[entity]?.[key];
}

/** The field label as the user sees it — the owner's policy label first (a
 *  public page's "Felder anpassen"), runtime bundle second, generated label last. */
export function labelOf(entity: EntityKey, key: string): string {
  const own = policyLabel(entity, key);
  if (own) return own;
  const fromBundle = fieldLabel(entity, key);
  if (fromBundle !== key) return fromBundle;
  return ruleOf(entity, key)?.label ?? key;
}

export function entityLabel(entity: EntityKey): string {
  const fromBundle = appLabel(entity);
  if (fromBundle !== entity) return fromBundle;
  return ENTITIES[entity]?.label ?? entity;
}

/** Lookup options with runtime labels — the only legitimate source of `{key,label}` pairs. */
export function optionsOf(entity: EntityKey, key: string): Array<{ key: string; label: string }> {
  const generated = (LOOKUP_OPTIONS as Record<string, Record<string, Array<{ key: string; label: string }>>>)[entity]?.[key];
  if (generated && generated.length) return generated.map(o => ({ key: o.key, label: o.label }));
  const keys = ruleOf(entity, key)?.options ?? [];
  return keys.map(k => ({ key: k, label: lookupLabel(entity, key, k) ?? k }));
}

export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object' && 'from' in (v as object) && 'to' in (v as object)) {
    const r = v as { from: unknown; to: unknown };
    return isEmptyValue(r.from) && isEmptyValue(r.to);
  }
  return false;
}
