/**
 * EntityCrud — pre-generated CRUD + overlay plumbing for the dashboard.
 * Compose it; NEVER re-roll dialog state, submit handlers, an overlay stack
 * or a RecordOverlayHost in the page — this file owns all of it.
 *
 * API at a glance:
 *   const data = useDashboardData();
 *   const crud = useEntityCrud(data, {
 *     // optional — the ONE semantic slot on the overlay: the record's next
 *     // workflow step. Return undefined for types without one.
 *     footer: (top) => top.type === 'mitarbeiter'
 *       ? { label: …, onClick: () => … }
 *       : undefined,
 *   });
 *
 *   `top.type` is the SAME camelCase key as `crud.<entity>` — one spelling
 *   per entity, everywhere in this API.
 *   …
 *   crud.mitarbeiter.openCreate({ …defaults })   // create dialog, prefilled — defaults are
 *                                       // shape-tolerant: bare lookup keys / record ids are fine
 *   crud.mitarbeiter.openEdit(record)            // edit dialog (recordId + defaults wired)
 *   crud.mitarbeiter.openDetail(record)          // record overlay — pass the RAW record,
 *                                       // enrichment is resolved inside
 *   crud.overlay                         // RecordOverlayStack<OverlayItem> for drills:
 *                                       // push / pop / replace / close
 *   crud.enriched.mitarbeiter              // the display-ready array for EVERY entity —
 *                                       // Enriched* where relations exist, the raw array
 *                                       // otherwise. Reuse these; never call enrich*()
 *                                       // in the page, and never guess which entity has
 *                                       // one: they all do.
 *   {crud.surfaces}                      // render ONCE at the end of the page JSX:
 *                                       // all entity dialogs + the overlay host
 *
 * Built in (do NOT re-implement): optimistic update + Rückgängig counter-write
 * on edit, fetchAll-on-error, edit-from-overlay, and per-entity overlay bodies
 * (RecordHeader + <{Entity}Details> with every relation reachable and the
 * contextual "+" prefilled; list-field back-references additionally get a
 * "choose existing" picker that links an EXISTING record — built in, do not
 * re-roll). Drag writes (onEventDrop/onCardMove) stay YOURS:
 * optimistic setter first, PATCH in background, undoToast with counter-write.
 *
 * Overlay content per entity (the host renders these — you never compose
 * Details blocks yourself):
 *   mitarbeiter: vorname, nachname, rolle, telefon, email, status  ·  ← reinigungen (list + contextual +)
 *   wohnungen: name, beschreibung, stockwerk, schlafplaetze, quadratmeter, grundpreis_pro_nacht, endreinigung_preis, ausstattung, …  ·  ← buchungen (list + contextual +) · ← reinigungen (list + contextual +)
 *   gaeste: vorname, nachname, email, telefon, strasse, hausnummer, plz, ort, …  ·  ← buchungen (list + contextual +)
 *   buchungen: buchungsnummer, wohnung, gast, anreise, abreise, anzahl_personen, status, gesamtpreis, …  ·  → wohnungen · → gaeste · ← reinigungen (list + contextual +)
 *   reinigungen: wohnung, buchung, datum, reinigungskraft, status, bemerkungen  ·  → wohnungen · → buchungen · → mitarbeiter
 */
import { useState, useMemo, type ReactNode } from 'react';
import type { Mitarbeiter, Wohnungen, Gaeste, Buchungen, Reinigungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { enrichBuchungen, enrichReinigungen } from '@/lib/enrich';
import type { EnrichedBuchungen, EnrichedReinigungen } from '@/types/enriched';
import { useDashboardData } from '@/hooks/useDashboardData';
import {
  useRecordOverlayStack, RecordOverlayHost, RecordHeader,
  type RecordOverlayStack,
} from '@/components/widgets/RecordView';
import { MitarbeiterDialog, type MitarbeiterDialogDefaults } from '@/components/dialogs/MitarbeiterDialog';
import { MitarbeiterDetails } from '@/components/details/MitarbeiterDetails';
import { WohnungenDialog, type WohnungenDialogDefaults } from '@/components/dialogs/WohnungenDialog';
import { WohnungenDetails } from '@/components/details/WohnungenDetails';
import { GaesteDialog, type GaesteDialogDefaults } from '@/components/dialogs/GaesteDialog';
import { GaesteDetails } from '@/components/details/GaesteDetails';
import { BuchungenDialog, type BuchungenDialogDefaults } from '@/components/dialogs/BuchungenDialog';
import { BuchungenDetails } from '@/components/details/BuchungenDetails';
import { ReinigungenDialog, type ReinigungenDialogDefaults } from '@/components/dialogs/ReinigungenDialog';
import { ReinigungenDetails } from '@/components/details/ReinigungenDetails';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { t, appLabel } from '@/i18n';
import { undoToast } from '@/lib/polish';
import { formatDate } from '@/lib/formatters';

// The overlay union — one branch per entity, `record` typed the way the data
// flows: Enriched* where enrichment exists, the raw record type otherwise.
// The host resolves enrichment itself; pages pass raw records everywhere.
export type OverlayItem =
  | { type: 'mitarbeiter'; record: Mitarbeiter }
  | { type: 'wohnungen'; record: Wohnungen }
  | { type: 'gaeste'; record: Gaeste }
  | { type: 'buchungen'; record: EnrichedBuchungen }
  | { type: 'reinigungen'; record: EnrichedReinigungen };

/** The useDashboardData() return — pass it in, never re-fetch inside. */
export type EntityCrudData = ReturnType<typeof useDashboardData>;

export interface EntityCrudOptions {
  /** Per-type overlay footer — the record's next workflow step. */
  footer?: (top: OverlayItem) => ReactNode | { label: ReactNode; onClick: () => void } | undefined;
  placement?: 'side' | 'center';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface EntityCrudApi<TRecord, TDefaults> {
  /** Open the create dialog, optionally prefilled (shape-tolerant defaults). */
  openCreate: (defaults?: TDefaults) => void;
  /** Open the edit dialog for a record (recordId + defaults are wired). */
  openEdit: (record: TRecord) => void;
  /** Open the record overlay (raw record is fine — enrichment resolved inside). */
  openDetail: (record: TRecord) => void;
}

export interface EntityCrud {
  /** The overlay stack for drills: push / pop / replace / close. */
  overlay: RecordOverlayStack<OverlayItem>;
  /** Render ONCE at the end of the page JSX — all dialogs + the overlay host. */
  surfaces: ReactNode;
  mitarbeiter: EntityCrudApi<Mitarbeiter, MitarbeiterDialogDefaults>;
  wohnungen: EntityCrudApi<Wohnungen, WohnungenDialogDefaults>;
  gaeste: EntityCrudApi<Gaeste, GaesteDialogDefaults>;
  buchungen: EntityCrudApi<Buchungen, BuchungenDialogDefaults>;
  reinigungen: EntityCrudApi<Reinigungen, ReinigungenDialogDefaults>;
  /** The display-ready array per entity: Enriched* where an enrich function
   *  exists, the raw array otherwise. One key per entity so no page has to
   *  know which is which. Reuse these; never re-enrich in the page. */
  enriched: { mitarbeiter: Mitarbeiter[]; wohnungen: Wohnungen[]; gaeste: Gaeste[]; buchungen: EnrichedBuchungen[]; reinigungen: EnrichedReinigungen[] };
}

export function useEntityCrud(data: EntityCrudData, options?: EntityCrudOptions): EntityCrud {
  const overlay = useRecordOverlayStack<OverlayItem>();
  const [mitarbeiterDialog, setMitarbeiterDialog] = useState<{ defaults?: MitarbeiterDialogDefaults; editing?: Mitarbeiter } | null>(null);
  const [wohnungenDialog, setWohnungenDialog] = useState<{ defaults?: WohnungenDialogDefaults; editing?: Wohnungen } | null>(null);
  const [gaesteDialog, setGaesteDialog] = useState<{ defaults?: GaesteDialogDefaults; editing?: Gaeste } | null>(null);
  const [buchungenDialog, setBuchungenDialog] = useState<{ defaults?: BuchungenDialogDefaults; editing?: Buchungen } | null>(null);
  const [reinigungenDialog, setReinigungenDialog] = useState<{ defaults?: ReinigungenDialogDefaults; editing?: Reinigungen } | null>(null);
  const enrichedBuchungen = useMemo(() => enrichBuchungen(data.buchungen, { wohnungenMap: data.wohnungenMap, gaesteMap: data.gaesteMap }), [data.buchungen, data.wohnungenMap, data.gaesteMap]);
  const enrichedReinigungen = useMemo(() => enrichReinigungen(data.reinigungen, { wohnungenMap: data.wohnungenMap, buchungenMap: data.buchungenMap, mitarbeiterMap: data.mitarbeiterMap }), [data.reinigungen, data.wohnungenMap, data.buchungenMap, data.mitarbeiterMap]);

  function detailMitarbeiter(record: Mitarbeiter, push = false) {
    const item: OverlayItem = { type: 'mitarbeiter', record };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitMitarbeiter(fields: Mitarbeiter['fields']) {
    const editing = mitarbeiterDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setMitarbeiter(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateMitarbeiterEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('mitarbeiter')} — ${t('crud_updated')}`, async () => {
        data.setMitarbeiter(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateMitarbeiterEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createMitarbeiterEntry(fields);
      undoToast(`${appLabel('mitarbeiter')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailWohnungen(record: Wohnungen, push = false) {
    const item: OverlayItem = { type: 'wohnungen', record };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitWohnungen(fields: Wohnungen['fields']) {
    const editing = wohnungenDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setWohnungen(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateWohnungenEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('wohnungen')} — ${t('crud_updated')}`, async () => {
        data.setWohnungen(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateWohnungenEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createWohnungenEntry(fields);
      undoToast(`${appLabel('wohnungen')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailGaeste(record: Gaeste, push = false) {
    const item: OverlayItem = { type: 'gaeste', record };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitGaeste(fields: Gaeste['fields']) {
    const editing = gaesteDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setGaeste(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateGaesteEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('gaeste')} — ${t('crud_updated')}`, async () => {
        data.setGaeste(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateGaesteEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createGaesteEntry(fields);
      undoToast(`${appLabel('gaeste')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailBuchungen(record: Buchungen, push = false) {
    const rec = enrichedBuchungen.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'buchungen', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitBuchungen(fields: Buchungen['fields']) {
    const editing = buchungenDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setBuchungen(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateBuchungenEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('buchungen')} — ${t('crud_updated')}`, async () => {
        data.setBuchungen(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateBuchungenEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createBuchungenEntry(fields);
      undoToast(`${appLabel('buchungen')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailReinigungen(record: Reinigungen, push = false) {
    const rec = enrichedReinigungen.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'reinigungen', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitReinigungen(fields: Reinigungen['fields']) {
    const editing = reinigungenDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setReinigungen(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateReinigungenEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('reinigungen')} — ${t('crud_updated')}`, async () => {
        data.setReinigungen(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateReinigungenEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createReinigungenEntry(fields);
      undoToast(`${appLabel('reinigungen')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  const surfaces = (
    <>
      <MitarbeiterDialog
        open={mitarbeiterDialog !== null}
        onClose={() => setMitarbeiterDialog(null)}
        onSubmit={submitMitarbeiter}
        defaultValues={mitarbeiterDialog?.defaults}
        recordId={mitarbeiterDialog?.editing?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Mitarbeiter']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Mitarbeiter']}
      />
      <WohnungenDialog
        open={wohnungenDialog !== null}
        onClose={() => setWohnungenDialog(null)}
        onSubmit={submitWohnungen}
        defaultValues={wohnungenDialog?.defaults}
        recordId={wohnungenDialog?.editing?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Wohnungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Wohnungen']}
      />
      <GaesteDialog
        open={gaesteDialog !== null}
        onClose={() => setGaesteDialog(null)}
        onSubmit={submitGaeste}
        defaultValues={gaesteDialog?.defaults}
        recordId={gaesteDialog?.editing?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Gaeste']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Gaeste']}
      />
      <BuchungenDialog
        open={buchungenDialog !== null}
        onClose={() => setBuchungenDialog(null)}
        onSubmit={submitBuchungen}
        defaultValues={buchungenDialog?.defaults}
        recordId={buchungenDialog?.editing?.record_id}
        wohnungenList={data.wohnungen}
        gaesteList={data.gaeste}
        enablePhotoScan={AI_PHOTO_SCAN['Buchungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Buchungen']}
      />
      <ReinigungenDialog
        open={reinigungenDialog !== null}
        onClose={() => setReinigungenDialog(null)}
        onSubmit={submitReinigungen}
        defaultValues={reinigungenDialog?.defaults}
        recordId={reinigungenDialog?.editing?.record_id}
        wohnungenList={data.wohnungen}
        buchungenList={data.buchungen}
        mitarbeiterList={data.mitarbeiter}
        enablePhotoScan={AI_PHOTO_SCAN['Reinigungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Reinigungen']}
      />
      <RecordOverlayHost
        overlay={overlay}
        placement={options?.placement}
        size={options?.size}
        footer={options?.footer}
        render={(top) => {
          if (top.type === 'mitarbeiter') {
            return (
              <>
                <RecordHeader title={top.record.fields.vorname ?? appLabel('mitarbeiter')} subtitle={undefined} />
                <MitarbeiterDetails
                  record={top.record}
                  reinigungenList={data.reinigungen}
                  onOpenReinigungen={(r) => detailReinigungen(r, true)}
                  onAddReinigungen={() => setReinigungenDialog({ defaults: { reinigungskraft: createRecordUrl(APP_IDS.MITARBEITER, top.record.record_id) } })}
                />
              </>
            );
          }
          if (top.type === 'wohnungen') {
            return (
              <>
                <RecordHeader title={top.record.fields.name ?? appLabel('wohnungen')} subtitle={undefined} />
                <WohnungenDetails
                  record={top.record}
                  buchungenList={data.buchungen}
                  onOpenBuchungen={(r) => detailBuchungen(r, true)}
                  onAddBuchungen={() => setBuchungenDialog({ defaults: { wohnung: createRecordUrl(APP_IDS.WOHNUNGEN, top.record.record_id) } })}
                  reinigungenList={data.reinigungen}
                  onOpenReinigungen={(r) => detailReinigungen(r, true)}
                  onAddReinigungen={() => setReinigungenDialog({ defaults: { wohnung: createRecordUrl(APP_IDS.WOHNUNGEN, top.record.record_id) } })}
                />
              </>
            );
          }
          if (top.type === 'gaeste') {
            return (
              <>
                <RecordHeader title={top.record.fields.vorname ?? appLabel('gaeste')} subtitle={undefined} />
                <GaesteDetails
                  record={top.record}
                  buchungenList={data.buchungen}
                  onOpenBuchungen={(r) => detailBuchungen(r, true)}
                  onAddBuchungen={() => setBuchungenDialog({ defaults: { gast: createRecordUrl(APP_IDS.GAESTE, top.record.record_id) } })}
                />
              </>
            );
          }
          if (top.type === 'buchungen') {
            return (
              <>
                <RecordHeader title={top.record.fields.buchungsnummer ?? appLabel('buchungen')} subtitle={top.record.fields.anreise ? formatDate(top.record.fields.anreise) : undefined} />
                <BuchungenDetails
                  record={top.record}
                  wohnungenList={data.wohnungen}
                  onOpenWohnungen={(r) => detailWohnungen(r, true)}
                  gaesteList={data.gaeste}
                  onOpenGaeste={(r) => detailGaeste(r, true)}
                  reinigungenList={data.reinigungen}
                  onOpenReinigungen={(r) => detailReinigungen(r, true)}
                  onAddReinigungen={() => setReinigungenDialog({ defaults: { buchung: createRecordUrl(APP_IDS.BUCHUNGEN, top.record.record_id) } })}
                />
              </>
            );
          }
          if (top.type === 'reinigungen') {
            return (
              <>
                <RecordHeader title={appLabel('reinigungen')} subtitle={top.record.fields.datum ? formatDate(top.record.fields.datum) : undefined} />
                <ReinigungenDetails
                  record={top.record}
                  wohnungenList={data.wohnungen}
                  onOpenWohnungen={(r) => detailWohnungen(r, true)}
                  buchungenList={data.buchungen}
                  onOpenBuchungen={(r) => detailBuchungen(r, true)}
                  mitarbeiterList={data.mitarbeiter}
                  onOpenMitarbeiter={(r) => detailMitarbeiter(r, true)}
                />
              </>
            );
          }
          return null;
        }}
        onEdit={(top) => {
          overlay.close();
          if (top.type === 'mitarbeiter') setMitarbeiterDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'wohnungen') setWohnungenDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'gaeste') setGaesteDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'buchungen') setBuchungenDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'reinigungen') setReinigungenDialog({ editing: top.record, defaults: top.record.fields });
        }}
      />
    </>
  );

  return {
    overlay,
    surfaces,
    mitarbeiter: {
      openCreate: (defaults?: MitarbeiterDialogDefaults) => setMitarbeiterDialog({ defaults }),
      openEdit: (record: Mitarbeiter) => setMitarbeiterDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Mitarbeiter) => detailMitarbeiter(record, false),
    },
    wohnungen: {
      openCreate: (defaults?: WohnungenDialogDefaults) => setWohnungenDialog({ defaults }),
      openEdit: (record: Wohnungen) => setWohnungenDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Wohnungen) => detailWohnungen(record, false),
    },
    gaeste: {
      openCreate: (defaults?: GaesteDialogDefaults) => setGaesteDialog({ defaults }),
      openEdit: (record: Gaeste) => setGaesteDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Gaeste) => detailGaeste(record, false),
    },
    buchungen: {
      openCreate: (defaults?: BuchungenDialogDefaults) => setBuchungenDialog({ defaults }),
      openEdit: (record: Buchungen) => setBuchungenDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Buchungen) => detailBuchungen(record, false),
    },
    reinigungen: {
      openCreate: (defaults?: ReinigungenDialogDefaults) => setReinigungenDialog({ defaults }),
      openEdit: (record: Reinigungen) => setReinigungenDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Reinigungen) => detailReinigungen(record, false),
    },
    enriched: { mitarbeiter: data.mitarbeiter, wohnungen: data.wohnungen, gaeste: data.gaeste, buchungen: enrichedBuchungen, reinigungen: enrichedReinigungen },
  };
}
