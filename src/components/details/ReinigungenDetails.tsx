import type { Reinigungen, Wohnungen, Buchungen, Mitarbeiter } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';

export interface ReinigungenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Reinigungen;
  /** N:1-Ziel „Wohnungen": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  wohnungenList: Wohnungen[];
  /** Klick auf die Wohnungen-Relation → overlay.push auf dessen Detail. */
  onOpenWohnungen?: (record: Wohnungen) => void;
  /** N:1-Ziel „Buchungen": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  buchungenList: Buchungen[];
  /** Klick auf die Buchungen-Relation → overlay.push auf dessen Detail. */
  onOpenBuchungen?: (record: Buchungen) => void;
  /** N:1-Ziel „Mitarbeiter": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  mitarbeiterList: Mitarbeiter[];
  /** Klick auf die Mitarbeiter-Relation → overlay.push auf dessen Detail. */
  onOpenMitarbeiter?: (record: Mitarbeiter) => void;
}

export function ReinigungenDetails({
  record,
  wohnungenList,
  onOpenWohnungen,
  buchungenList,
  onOpenBuchungen,
  mitarbeiterList,
  onOpenMitarbeiter,
}: ReinigungenDetailsProps) {
  const wohnungTarget = wohnungenList.find(r => r.record_id === extractRecordId(record.fields.wohnung));
  const buchungTarget = buchungenList.find(r => r.record_id === extractRecordId(record.fields.buchung));
  const reinigungskraftTarget = mitarbeiterList.find(r => r.record_id === extractRecordId(record.fields.reinigungskraft));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('reinigungen', 'datum')} value={record.fields.datum} format="date" />
        <RecordField label={fieldLabel('reinigungen', 'status')} value={record.fields.status} format="pill" />
        <RecordField label={fieldLabel('reinigungen', 'bemerkungen')} value={record.fields.bemerkungen} format="longtext" className="md:col-span-2" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={2}>
        <RecordRelation
          label={fieldLabel('reinigungen', 'wohnung')}
          name={wohnungTarget?.fields.name ?? '—'}
          meta={undefined}
          onClick={wohnungTarget && onOpenWohnungen ? () => onOpenWohnungen!(wohnungTarget!) : undefined}
        />
        <RecordRelation
          label={fieldLabel('reinigungen', 'buchung')}
          name={buchungTarget?.fields.buchungsnummer ?? '—'}
          meta={undefined}
          onClick={buchungTarget && onOpenBuchungen ? () => onOpenBuchungen!(buchungTarget!) : undefined}
        />
        <RecordRelation
          label={fieldLabel('reinigungen', 'reinigungskraft')}
          name={reinigungskraftTarget?.fields.vorname ?? '—'}
          meta={[reinigungskraftTarget?.fields.telefon, reinigungskraftTarget?.fields.email].filter(Boolean).join(' · ') || undefined}
          onClick={reinigungskraftTarget && onOpenMitarbeiter ? () => onOpenMitarbeiter!(reinigungskraftTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.REINIGUNGEN} recordId={record.record_id} />
    </>
  );
}
