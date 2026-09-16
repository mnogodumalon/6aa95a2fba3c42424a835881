import type { Buchungen, Wohnungen, Gaeste, Reinigungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface BuchungenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Buchungen;
  /** N:1-Ziel „Wohnungen": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  wohnungenList: Wohnungen[];
  /** Klick auf die Wohnungen-Relation → overlay.push auf dessen Detail. */
  onOpenWohnungen?: (record: Wohnungen) => void;
  /** N:1-Ziel „Gaeste": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  gaesteList: Gaeste[];
  /** Klick auf die Gaeste-Relation → overlay.push auf dessen Detail. */
  onOpenGaeste?: (record: Gaeste) => void;
  /** 1:N „Reinigungen" (buchung): VOLLE Liste — der Block filtert auf diesen Record. */
  reinigungenList: Reinigungen[];
  /** Zeilen-Klick → overlay.push auf das Reinigungen-Detail (nie der Edit-Dialog). */
  onOpenReinigungen: (record: Reinigungen) => void;
  /** Kontextuelles „+": öffnet den Reinigungen-Dialog mit diesem Record vorgesetzt. */
  onAddReinigungen: () => void;
}

export function BuchungenDetails({
  record,
  wohnungenList,
  onOpenWohnungen,
  gaesteList,
  onOpenGaeste,
  reinigungenList,
  onOpenReinigungen,
  onAddReinigungen,
}: BuchungenDetailsProps) {
  const wohnungTarget = wohnungenList.find(r => r.record_id === extractRecordId(record.fields.wohnung));
  const gastTarget = gaesteList.find(r => r.record_id === extractRecordId(record.fields.gast));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('buchungen', 'buchungsnummer')} value={record.fields.buchungsnummer} format="text" />
        <RecordField label={fieldLabel('buchungen', 'anreise')} value={record.fields.anreise} format="date" />
        <RecordField label={fieldLabel('buchungen', 'abreise')} value={record.fields.abreise} format="date" />
        <RecordField label={fieldLabel('buchungen', 'anzahl_personen')} value={record.fields.anzahl_personen} format="text" />
        <RecordField label={fieldLabel('buchungen', 'status')} value={record.fields.status} format="pill" />
        <RecordField label={fieldLabel('buchungen', 'gesamtpreis')} value={record.fields.gesamtpreis} format="text" />
        <RecordField label={fieldLabel('buchungen', 'anzahlung_erhalten')} value={record.fields.anzahlung_erhalten} format="bool" />
        <RecordField label={fieldLabel('buchungen', 'notizen')} value={record.fields.notizen} format="longtext" className="md:col-span-2" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={2}>
        <RecordRelation
          label={fieldLabel('buchungen', 'wohnung')}
          name={wohnungTarget?.fields.name ?? '—'}
          meta={undefined}
          onClick={wohnungTarget && onOpenWohnungen ? () => onOpenWohnungen!(wohnungTarget!) : undefined}
        />
        <RecordRelation
          label={fieldLabel('buchungen', 'gast')}
          name={gastTarget?.fields.vorname ?? '—'}
          meta={[gastTarget?.fields.email, gastTarget?.fields.telefon].filter(Boolean).join(' · ') || undefined}
          onClick={gastTarget && onOpenGaeste ? () => onOpenGaeste!(gastTarget!) : undefined}
        />
      </RecordSection>

      <SatelliteSection
        title={appLabel('reinigungen')}
        items={reinigungenList.filter(r => extractRecordId(r.fields.buchung) === record.record_id)}
        map={r => ({ name: appLabel('reinigungen'), meta: r.fields.datum })}
        onOpen={onOpenReinigungen}
        onAdd={onAddReinigungen}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.BUCHUNGEN} recordId={record.record_id} />
    </>
  );
}
