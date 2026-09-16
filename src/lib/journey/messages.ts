/**
 * Required-field messages — WRITTEN BY THE BUILD AGENT, never by a heuristic.
 *
 * The layer knows two things about an empty required field: that it is
 * required and what its label is. Out of that it can only say „„Anreise" ist
 * ein Pflichtfeld". What the person should do instead („Bitte einen Gast
 * auswählen.") is meaning, and meaning is the agent's: the Phase-2 orchestrator
 * writes one short instruction per required field — what is needed, not why — to
 * `.intents-staging/messages.json`, the integration step validates it against
 * the app metadata and renders it into the block below. Scaffold updates keep
 * the block. Do not edit outside the markers.
 *
 * Every door reads this and nothing else: `useStepForm` (flows and public
 * pages), the generated {Entity}Dialog and the public form's server-error line.
 * A field without a sentence falls back to the label sentence — never to a
 * bare „Dieses Feld ist erforderlich".
 *
 * Required fields per entity (from the base view):
 *   - mitarbeiter: vorname (Vorname), nachname (Nachname), rolle (Rolle), status (Status)
 *   - wohnungen: name (Name der Wohnung), schlafplaetze (Schlafplätze), grundpreis_pro_nacht (Grundpreis pro Nacht (€)), status (Status)
 *   - gaeste: vorname (Vorname), nachname (Nachname)
 *   - buchungen: buchungsnummer (Buchungsnummer), wohnung (Wohnung), gast (Gast), anreise (Anreise), abreise (Abreise), anzahl_personen (Anzahl Personen), status (Status)
 *   - reinigungen: wohnung (Wohnung), datum (Reinigungsdatum), reinigungskraft (Reinigungskraft), status (Status)
 */
import { t, tx } from '@/i18n';
import { labelOf, type EntityKey } from './rules';

/** The writable fields of each entity — the keys a message may address (generated). */
export interface MessageFields {
  "mitarbeiter": "vorname" | "nachname" | "rolle" | "telefon" | "email" | "status";
  "wohnungen": "name" | "beschreibung" | "stockwerk" | "schlafplaetze" | "quadratmeter" | "grundpreis_pro_nacht" | "endreinigung_preis" | "ausstattung" | "status";
  "gaeste": "vorname" | "nachname" | "email" | "telefon" | "strasse" | "hausnummer" | "plz" | "ort" | "land" | "notizen";
  "buchungen": "buchungsnummer" | "wohnung" | "gast" | "anreise" | "abreise" | "anzahl_personen" | "status" | "gesamtpreis" | "anzahlung_erhalten" | "notizen";
  "reinigungen": "wohnung" | "buchung" | "datum" | "reinigungskraft" | "status" | "bemerkungen";
}
export type MessageFieldKey<E extends EntityKey> = E extends keyof MessageFields ? MessageFields[E] : never;

export const REQUIRED_MESSAGES: { [E in EntityKey]?: Partial<Record<MessageFieldKey<E>, string>> } = {
  // <custom:messages>
  mitarbeiter: { vorname: "Bitte den Vornamen eingeben.", nachname: "Bitte den Nachnamen eingeben.", rolle: "Bitte eine Rolle auswählen.", status: "Bitte den Status wählen." },
  wohnungen: { name: "Bitte den Namen der Wohnung eingeben.", schlafplaetze: "Bitte die Anzahl der Schlafplätze eingeben.", grundpreis_pro_nacht: "Bitte den Grundpreis pro Nacht eingeben.", status: "Bitte den Status wählen." },
  gaeste: { vorname: "Bitte den Vornamen eingeben.", nachname: "Bitte den Nachnamen eingeben." },
  buchungen: { buchungsnummer: "Bitte eine Buchungsnummer eingeben.", wohnung: "Bitte eine Wohnung auswählen.", gast: "Bitte einen Gast auswählen.", anreise: "Bitte das Anreisedatum wählen.", abreise: "Bitte das Abreisedatum wählen.", anzahl_personen: "Bitte die Personenzahl eingeben.", status: "Bitte den Status wählen." },
  reinigungen: { wohnung: "Bitte eine Wohnung auswählen.", datum: "Bitte das Reinigungsdatum wählen.", reinigungskraft: "Bitte eine Reinigungskraft auswählen.", status: "Bitte den Status wählen." },
  // </custom:messages>
};

/** The sentence shown when `key` of `entity` is required and empty — the
 *  agent's own text (translated at runtime like every page string), else the
 *  label sentence. Call it while rendering, not at module scope. */
export function requiredMessage(entity: EntityKey, key: string): string {
  const own = (REQUIRED_MESSAGES as Record<string, Record<string, string | undefined> | undefined>)[entity]?.[key];
  if (own && own.trim()) return tx(own);
  return t('v_required', { label: labelOf(entity, key) });
}

/** True when the agent wrote a sentence for the field. */
export function hasOwnMessage(entity: EntityKey, key: string): boolean {
  const own = (REQUIRED_MESSAGES as Record<string, Record<string, string | undefined> | undefined>)[entity]?.[key];
  return Boolean(own && own.trim());
}
