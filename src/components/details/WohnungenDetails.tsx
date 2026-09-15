import type { Wohnungen, Buchungen, Reinigungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { MediaThumbnail } from '@/components/widgets/MediaViewer';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface WohnungenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Wohnungen;
  /** 1:N „Buchungen" (wohnung): VOLLE Liste — der Block filtert auf diesen Record. */
  buchungenList: Buchungen[];
  /** Zeilen-Klick → overlay.push auf das Buchungen-Detail (nie der Edit-Dialog). */
  onOpenBuchungen: (record: Buchungen) => void;
  /** Kontextuelles „+": öffnet den Buchungen-Dialog mit diesem Record vorgesetzt. */
  onAddBuchungen: () => void;
  /** 1:N „Reinigungen" (wohnung): VOLLE Liste — der Block filtert auf diesen Record. */
  reinigungenList: Reinigungen[];
  /** Zeilen-Klick → overlay.push auf das Reinigungen-Detail (nie der Edit-Dialog). */
  onOpenReinigungen: (record: Reinigungen) => void;
  /** Kontextuelles „+": öffnet den Reinigungen-Dialog mit diesem Record vorgesetzt. */
  onAddReinigungen: () => void;
}

export function WohnungenDetails({
  record,
  buchungenList,
  onOpenBuchungen,
  onAddBuchungen,
  reinigungenList,
  onOpenReinigungen,
  onAddReinigungen,
}: WohnungenDetailsProps) {
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('wohnungen', 'name')} value={record.fields.name} format="text" />
        <RecordField label={fieldLabel('wohnungen', 'beschreibung')} value={record.fields.beschreibung} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('wohnungen', 'stockwerk')} value={record.fields.stockwerk} format="text" />
        <RecordField label={fieldLabel('wohnungen', 'schlafplaetze')} value={record.fields.schlafplaetze} format="text" />
        <RecordField label={fieldLabel('wohnungen', 'quadratmeter')} value={record.fields.quadratmeter} format="text" />
        <RecordField label={fieldLabel('wohnungen', 'grundpreis_pro_nacht')} value={record.fields.grundpreis_pro_nacht} format="text" />
        <RecordField label={fieldLabel('wohnungen', 'endreinigung_preis')} value={record.fields.endreinigung_preis} format="text" />
        <RecordField label={fieldLabel('wohnungen', 'ausstattung')} value={Array.isArray(record.fields.ausstattung) ? record.fields.ausstattung.map((v: unknown) => (v && typeof v === 'object' && 'label' in v) ? (v as {label: unknown}).label : v).join(', ') : null} format="text" />
        <RecordField label={fieldLabel('wohnungen', 'foto')} className="md:col-span-2">
          {record.fields.foto ? (
            <MediaThumbnail src={record.fields.foto as string} fit="contain" className="max-h-64 w-full rounded-lg" />
          ) : '—'}
        </RecordField>
        <RecordField label={fieldLabel('wohnungen', 'status')} value={record.fields.status} format="pill" />
      </RecordSection>

      <SatelliteSection
        title={appLabel('buchungen')}
        items={buchungenList.filter(r => extractRecordId(r.fields.wohnung) === record.record_id)}
        map={r => ({ name: r.fields.buchungsnummer ?? appLabel('buchungen'), meta: r.fields.anreise })}
        onOpen={onOpenBuchungen}
        onAdd={onAddBuchungen}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title={appLabel('reinigungen')}
        items={reinigungenList.filter(r => extractRecordId(r.fields.wohnung) === record.record_id)}
        map={r => ({ name: appLabel('reinigungen'), meta: r.fields.datum })}
        onOpen={onOpenReinigungen}
        onAdd={onAddReinigungen}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.WOHNUNGEN} recordId={record.record_id} />
    </>
  );
}
