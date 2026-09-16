import type { Buchungen, Reinigungen } from './app';

export type EnrichedBuchungen = Buchungen & {
  wohnungName: string;
  gastName: string;
};

export type EnrichedReinigungen = Reinigungen & {
  wohnungName: string;
  buchungName: string;
  reinigungskraftName: string;
};
