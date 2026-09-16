import type { EnrichedBuchungen, EnrichedReinigungen } from '@/types/enriched';
import type { Buchungen, Gaeste, Mitarbeiter, Reinigungen, Wohnungen } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface BuchungenMaps {
  wohnungenMap: Map<string, Wohnungen>;
  gaesteMap: Map<string, Gaeste>;
}

export function enrichBuchungen(
  buchungen: Buchungen[],
  maps: BuchungenMaps
): EnrichedBuchungen[] {
  return buchungen.map(r => ({
    ...r,
    wohnungName: resolveDisplay(r.fields.wohnung, maps.wohnungenMap, 'name'),
    gastName: resolveDisplay(r.fields.gast, maps.gaesteMap, 'vorname', 'nachname'),
  }));
}

interface ReinigungenMaps {
  wohnungenMap: Map<string, Wohnungen>;
  buchungenMap: Map<string, Buchungen>;
  mitarbeiterMap: Map<string, Mitarbeiter>;
}

export function enrichReinigungen(
  reinigungen: Reinigungen[],
  maps: ReinigungenMaps
): EnrichedReinigungen[] {
  return reinigungen.map(r => ({
    ...r,
    wohnungName: resolveDisplay(r.fields.wohnung, maps.wohnungenMap, 'name'),
    buchungName: resolveDisplay(r.fields.buchung, maps.buchungenMap, 'buchungsnummer'),
    reinigungskraftName: resolveDisplay(r.fields.reinigungskraft, maps.mitarbeiterMap, 'vorname', 'nachname'),
  }));
}
