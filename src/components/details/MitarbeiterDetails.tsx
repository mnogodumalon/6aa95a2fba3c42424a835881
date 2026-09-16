import type { Mitarbeiter, Reinigungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface MitarbeiterDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Mitarbeiter;
  /** 1:N „Reinigungen" (reinigungskraft): VOLLE Liste — der Block filtert auf diesen Record. */
  reinigungenList: Reinigungen[];
  /** Zeilen-Klick → overlay.push auf das Reinigungen-Detail (nie der Edit-Dialog). */
  onOpenReinigungen: (record: Reinigungen) => void;
  /** Kontextuelles „+": öffnet den Reinigungen-Dialog mit diesem Record vorgesetzt. */
  onAddReinigungen: () => void;
}

export function MitarbeiterDetails({
  record,
  reinigungenList,
  onOpenReinigungen,
  onAddReinigungen,
}: MitarbeiterDetailsProps) {
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('mitarbeiter', 'vorname')} value={record.fields.vorname} format="text" />
        <RecordField label={fieldLabel('mitarbeiter', 'nachname')} value={record.fields.nachname} format="text" />
        <RecordField label={fieldLabel('mitarbeiter', 'rolle')} value={record.fields.rolle} format="pill" />
        <RecordField label={fieldLabel('mitarbeiter', 'telefon')} value={record.fields.telefon} format="text" />
        <RecordField label={fieldLabel('mitarbeiter', 'email')} value={record.fields.email} format="email" />
        <RecordField label={fieldLabel('mitarbeiter', 'status')} value={record.fields.status} format="pill" />
      </RecordSection>

      <SatelliteSection
        title={appLabel('reinigungen')}
        items={reinigungenList.filter(r => extractRecordId(r.fields.reinigungskraft) === record.record_id)}
        map={r => ({ name: appLabel('reinigungen'), meta: r.fields.datum })}
        onOpen={onOpenReinigungen}
        onAdd={onAddReinigungen}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.MITARBEITER} recordId={record.record_id} />
    </>
  );
}
