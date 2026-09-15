import type { Gaeste, Buchungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface GaesteDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Gaeste;
  /** 1:N „Buchungen" (gast): VOLLE Liste — der Block filtert auf diesen Record. */
  buchungenList: Buchungen[];
  /** Zeilen-Klick → overlay.push auf das Buchungen-Detail (nie der Edit-Dialog). */
  onOpenBuchungen: (record: Buchungen) => void;
  /** Kontextuelles „+": öffnet den Buchungen-Dialog mit diesem Record vorgesetzt. */
  onAddBuchungen: () => void;
}

export function GaesteDetails({
  record,
  buchungenList,
  onOpenBuchungen,
  onAddBuchungen,
}: GaesteDetailsProps) {
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('gaeste', 'vorname')} value={record.fields.vorname} format="text" />
        <RecordField label={fieldLabel('gaeste', 'nachname')} value={record.fields.nachname} format="text" />
        <RecordField label={fieldLabel('gaeste', 'email')} value={record.fields.email} format="email" />
        <RecordField label={fieldLabel('gaeste', 'telefon')} value={record.fields.telefon} format="text" />
        <RecordField label={fieldLabel('gaeste', 'strasse')} value={record.fields.strasse} format="text" />
        <RecordField label={fieldLabel('gaeste', 'hausnummer')} value={record.fields.hausnummer} format="text" />
        <RecordField label={fieldLabel('gaeste', 'plz')} value={record.fields.plz} format="text" />
        <RecordField label={fieldLabel('gaeste', 'ort')} value={record.fields.ort} format="text" />
        <RecordField label={fieldLabel('gaeste', 'land')} value={record.fields.land} format="text" />
        <RecordField label={fieldLabel('gaeste', 'notizen')} value={record.fields.notizen} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <SatelliteSection
        title={appLabel('buchungen')}
        items={buchungenList.filter(r => extractRecordId(r.fields.gast) === record.record_id)}
        map={r => ({ name: r.fields.buchungsnummer ?? appLabel('buchungen'), meta: r.fields.anreise })}
        onOpen={onOpenBuchungen}
        onAdd={onAddBuchungen}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.GAESTE} recordId={record.record_id} />
    </>
  );
}
