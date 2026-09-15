import { useMemo, useState } from 'react';
import { format, parseISO, differenceInCalendarDays, isToday, isBefore, isAfter, startOfDay } from 'date-fns';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { ResourceTimeline, type ResourceEvent, type ResourceGroup } from '@/components/widgets/ResourceTimeline';
import { tx, appLabel } from '@/i18n';
import { dateFnsLocale } from '@/i18n';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS, lookupOption } from '@/types/app';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { IconCalendar, IconAlertCircle, IconCheck, IconSpray, IconUsers, IconHome, IconClock } from '@tabler/icons-react';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    wohnungen, buchungen, reinigungen,
    wohnungenMap, buchungenMap,
    setBuchungen, setReinigungen,
    fetchAll,
  } = data;

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'buchungen') {
        const b = top.record;
        const status = lookupKey(b.fields.status);
        if (status === 'anfrage') return {
          label: tx('Buchung bestätigen'),
          onClick: () => confirmBuchung(b),
        };
        if (status === 'bestaetigt') return {
          label: tx('Einchecken'),
          onClick: () => advanceBuchung(b, 'eingecheckt'),
        };
        if (status === 'eingecheckt') return {
          label: tx('Auschecken'),
          onClick: () => advanceBuchung(b, 'ausgecheckt'),
        };
      }
      if (top.type === 'reinigungen') {
        const r = top.record;
        const status = lookupKey(r.fields.status);
        if (status === 'offen') return {
          label: tx('Als erledigt markieren'),
          onClick: () => markReinigungenErledigt(r),
        };
      }
      return undefined;
    },
  });

  const enrichedBuchungen = crud.enriched.buchungen;
  const enrichedReinigungen = crud.enriched.reinigungen;

  const clock = useClock();
  const today = format(clock, 'yyyy-MM-dd');

  // --- Derived data ---
  const offeneAnfragen = useMemo(
    () => enrichedBuchungen.filter(b => lookupKey(b.fields.status) === 'anfrage'),
    [enrichedBuchungen],
  );

  const heuteAnreise = useMemo(
    () => enrichedBuchungen.filter(b => b.fields.anreise === today && lookupKey(b.fields.status) !== 'storniert'),
    [enrichedBuchungen, today],
  );

  const heuteAbreise = useMemo(
    () => enrichedBuchungen.filter(b => b.fields.abreise === today && lookupKey(b.fields.status) !== 'storniert'),
    [enrichedBuchungen, today],
  );

  const offeneReinigungen = useMemo(
    () => enrichedReinigungen.filter(r => lookupKey(r.fields.status) === 'offen'),
    [enrichedReinigungen],
  );

  const faelligeReinigungen = useMemo(
    () => offeneReinigungen
      .filter(r => r.fields.datum && r.fields.datum <= today)
      .sort((a, b) => (a.fields.datum ?? '').localeCompare(b.fields.datum ?? '')),
    [offeneReinigungen, today],
  );

  const eingecheckteBuchungen = useMemo(
    () => enrichedBuchungen.filter(b => lookupKey(b.fields.status) === 'eingecheckt'),
    [enrichedBuchungen],
  );

  // Context line for greeting
  const contextLine = useMemo(() => {
    const parts: string[] = [];
    if (heuteAnreise.length > 0) {
      const names = namen(heuteAnreise.map(b => b.gastName ?? b.fields.buchungsnummer ?? ''));
      parts.push(tx`${names} reist heute an.`);
    }
    if (heuteAbreise.length > 0) {
      const names = namen(heuteAbreise.map(b => b.gastName ?? b.fields.buchungsnummer ?? ''));
      parts.push(tx`${names} reist heute ab.`);
    }
    if (parts.length === 0) {
      if (eingecheckteBuchungen.length > 0) {
        const names = namen(eingecheckteBuchungen.map(b => b.gastName ?? ''));
        return tx`${names} ist gerade eingecheckt.`;
      }
      return tx('Keine Ankünfte oder Abreisen heute.');
    }
    return parts.join(' ');
  }, [heuteAnreise, heuteAbreise, eingecheckteBuchungen]);

  // --- Workflow actions ---
  async function confirmBuchung(b: typeof enrichedBuchungen[0]) {
    const prev = lookupKey(b.fields.status);
    setBuchungen(all =>
      all.map(x =>
        x.record_id === b.record_id
          ? { ...x, fields: { ...x.fields, status: lookupOption('buchungen', 'status', 'bestaetigt') } }
          : x,
      ),
    );
    undoToast(tx`${b.gastName ?? b.fields.buchungsnummer ?? ''} — Buchung bestätigt`, async () => {
      setBuchungen(all =>
        all.map(x =>
          x.record_id === b.record_id
            ? { ...x, fields: { ...x.fields, status: lookupOption('buchungen', 'status', prev ?? 'anfrage') } }
            : x,
        ),
      );
      await LivingAppsService.updateBuchungenEntry(b.record_id, { status: prev ?? 'anfrage' });
    });
    try {
      await LivingAppsService.updateBuchungenEntry(b.record_id, { status: 'bestaetigt' });
    } catch {
      await fetchAll();
    }
  }

  async function advanceBuchung(b: typeof enrichedBuchungen[0], newStatus: string) {
    const prev = lookupKey(b.fields.status);
    setBuchungen(all =>
      all.map(x =>
        x.record_id === b.record_id
          ? { ...x, fields: { ...x.fields, status: lookupOption('buchungen', 'status', newStatus) } }
          : x,
      ),
    );
    undoToast(tx`${b.gastName ?? b.fields.buchungsnummer ?? ''} — Status aktualisiert`, async () => {
      setBuchungen(all =>
        all.map(x =>
          x.record_id === b.record_id
            ? { ...x, fields: { ...x.fields, status: lookupOption('buchungen', 'status', prev ?? 'anfrage') } }
            : x,
        ),
      );
      await LivingAppsService.updateBuchungenEntry(b.record_id, { status: prev ?? 'anfrage' });
    });
    try {
      await LivingAppsService.updateBuchungenEntry(b.record_id, { status: newStatus });
    } catch {
      await fetchAll();
    }
  }

  async function markReinigungenErledigt(r: typeof enrichedReinigungen[0]) {
    setReinigungen(all =>
      all.map(x =>
        x.record_id === r.record_id
          ? { ...x, fields: { ...x.fields, status: lookupOption('reinigungen', 'status', 'erledigt') } }
          : x,
      ),
    );
    undoToast(tx`${r.wohnungName ?? ''} — Reinigung als erledigt markiert`, async () => {
      setReinigungen(all =>
        all.map(x =>
          x.record_id === r.record_id
            ? { ...x, fields: { ...x.fields, status: lookupOption('reinigungen', 'status', 'offen') } }
            : x,
        ),
      );
      await LivingAppsService.updateReinigungenEntry(r.record_id, { status: 'offen' });
    });
    try {
      await LivingAppsService.updateReinigungenEntry(r.record_id, { status: 'erledigt' });
    } catch {
      await fetchAll();
    }
  }

  // --- ResourceTimeline wiring ---
  const groups = useMemo<ResourceGroup[]>(
    () => wohnungen.map(w => ({
      key: w.record_id,
      label: w.fields.name ?? w.record_id,
    })),
    [wohnungen],
  );

  const events = useMemo<ResourceEvent[]>(
    () =>
      enrichedBuchungen
        .filter(b => !!b.fields.anreise && lookupKey(b.fields.status) !== 'storniert')
        .map(b => {
          const status = lookupKey(b.fields.status);
          const tone =
            status === 'anfrage' ? 'warning'
            : status === 'bestaetigt' ? 'primary'
            : status === 'eingecheckt' ? 'success'
            : 'default';
          const roomId = extractRecordId(b.fields.wohnung);
          return {
            id: `buchung:${b.record_id}`,
            start: b.fields.anreise!,
            end: b.fields.abreise,
            allDay: true,
            title: b.gastName || b.fields.buchungsnummer || tx('Gast'),
            subtitle: b.fields.status?.label,
            tone,
            group: roomId ?? '',
          };
        }),
    [enrichedBuchungen],
  );

  const reschedule = async (id: string, newStart: string, newEnd?: string, newGroup?: string) => {
    const rid = id.split(':')[1] ?? '';
    if (!rid) return;

    // Overlap check: no two bookings for the same apartment may overlap
    const moving = buchungen.find(b => b.record_id === rid);
    if (moving) {
      const targetGroup = newGroup ?? extractRecordId(moving.fields.wohnung) ?? '';
      const conflict = enrichedBuchungen.find(b => {
        if (b.record_id === rid) return false;
        if (lookupKey(b.fields.status) === 'storniert') return false;
        const bGroup = extractRecordId(b.fields.wohnung) ?? '';
        if (bGroup !== targetGroup) return false;
        const bStart = b.fields.anreise ?? '';
        const bEnd = b.fields.abreise ?? bStart;
        const ns = newStart;
        const ne = newEnd ?? newStart;
        return !(ne < bStart || ns > bEnd);
      });
      if (conflict) return tx('Diese Wohnung ist in diesem Zeitraum bereits belegt.');
    }

    const wohnungPatch = newGroup
      ? { wohnung: createRecordUrl(APP_IDS.WOHNUNGEN, newGroup) }
      : {};
    setBuchungen(prev =>
      prev.map(b =>
        b.record_id === rid
          ? { ...b, fields: { ...b.fields, anreise: newStart, ...(newEnd ? { abreise: newEnd } : {}), ...wohnungPatch } }
          : b,
      ),
    );
    const label = enrichedBuchungen.find(b => b.record_id === rid)?.gastName ?? rid;
    undoToast(tx`${label} — Buchung verschoben`, async () => {
      if (moving) {
        setBuchungen(prev => prev.map(b => b.record_id === rid ? moving : b));
        await LivingAppsService.updateBuchungenEntry(rid, {
          anreise: moving.fields.anreise,
          abreise: moving.fields.abreise,
          wohnung: moving.fields.wohnung,
        });
      }
    });
    try {
      await LivingAppsService.updateBuchungenEntry(rid, {
        anreise: newStart,
        ...(newEnd ? { abreise: newEnd } : {}),
        ...wohnungPatch,
      });
    } catch {
      await fetchAll();
    }
  };

  const resize = async (id: string, newStart: string, newEnd: string) => {
    const rid = id.split(':')[1] ?? '';
    if (!rid) return;
    const moving = buchungen.find(b => b.record_id === rid);
    setBuchungen(prev =>
      prev.map(b => b.record_id === rid ? { ...b, fields: { ...b.fields, anreise: newStart, abreise: newEnd } } : b),
    );
    const label = enrichedBuchungen.find(b => b.record_id === rid)?.gastName ?? rid;
    undoToast(tx`${label} — Aufenthaltsdauer geändert`, async () => {
      if (moving) {
        setBuchungen(prev => prev.map(b => b.record_id === rid ? moving : b));
        await LivingAppsService.updateBuchungenEntry(rid, {
          anreise: moving.fields.anreise,
          abreise: moving.fields.abreise,
        });
      }
    });
    try {
      await LivingAppsService.updateBuchungenEntry(rid, { anreise: newStart, abreise: newEnd });
    } catch {
      await fetchAll();
    }
  };

  // Hero: unconfirmed bookings arriving today or past (need immediate action)
  const heroAnfragenHeute = useMemo(
    () => offeneAnfragen.filter(b => b.fields.anreise && b.fields.anreise <= today),
    [offeneAnfragen, today],
  );

  // Filter state for StatStrip
  const [filter, setFilter] = useState<'all' | 'anfrage' | 'eingecheckt' | 'reinigung'>('all');

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{gruss(clock)}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <button
          onClick={() => crud.buchungen.openCreate({ status: 'bestaetigt' })}
          className="mt-2 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors sm:mt-0"
        >
          <IconCalendar size={16} className="shrink-0" />
          {tx('Neue Buchung')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          heroAnfragenHeute.length > 0
            ? (
              <HeroBanner
                icon={<IconAlertCircle size={18} />}
                action={{
                  label: tx('Jetzt bestätigen'),
                  onClick: () => confirmBuchung(heroAnfragenHeute[0]),
                }}
              >
                <b>{namen(heroAnfragenHeute.map(b => b.gastName ?? b.fields.buchungsnummer ?? ''))}</b>
                {' '}{heroAnfragenHeute.length === 1
                  ? tx('hat eine unbestätigte Anfrage — Anreise heute oder überfällig.')
                  : tx('haben unbestätigte Anfragen — Anreise heute oder überfällig.')}
              </HeroBanner>
            )
            : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Offene Anfragen')}
              value={offeneAnfragen.length}
              icon={<IconClock size={16} className="shrink-0" />}
              tone={offeneAnfragen.length > 0 ? 'warning' : 'default'}
              onClick={() => setFilter(f => f === 'anfrage' ? 'all' : 'anfrage')}
              active={filter === 'anfrage'}
            />
            <StatStripItem
              title={tx('Eingecheckt')}
              value={eingecheckteBuchungen.length}
              icon={<IconUsers size={16} className="shrink-0" />}
              tone={eingecheckteBuchungen.length > 0 ? 'success' : 'default'}
              onClick={() => setFilter(f => f === 'eingecheckt' ? 'all' : 'eingecheckt')}
              active={filter === 'eingecheckt'}
            />
            <StatStripItem
              title={tx('Anreisen heute')}
              value={heuteAnreise.length}
              icon={<IconHome size={16} className="shrink-0" />}
              tone={heuteAnreise.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Reinigungen offen')}
              value={faelligeReinigungen.length}
              icon={<IconSpray size={16} className="shrink-0" />}
              tone={faelligeReinigungen.length > 0 ? 'destructive' : 'default'}
              onClick={() => setFilter(f => f === 'reinigung' ? 'all' : 'reinigung')}
              active={filter === 'reinigung'}
            />
          </StatStrip>
        }
        primary={
          <ResourceTimeline
            events={filter === 'anfrage'
              ? events.filter(e => {
                  const rid = e.id.split(':')[1] ?? '';
                  const b = enrichedBuchungen.find(x => x.record_id === rid);
                  return lookupKey(b?.fields.status) === 'anfrage';
                })
              : filter === 'eingecheckt'
              ? events.filter(e => {
                  const rid = e.id.split(':')[1] ?? '';
                  const b = enrichedBuchungen.find(x => x.record_id === rid);
                  return lookupKey(b?.fields.status) === 'eingecheckt';
                })
              : events}
            groups={groups}
            axis="day"
            defaultRange="week"
            locale={dateFnsLocale()}
            onEventClick={ev => {
              const rid = ev.id.split(':')[1] ?? '';
              const b = enrichedBuchungen.find(x => x.record_id === rid);
              if (b) crud.buchungen.openDetail(b);
            }}
            onEventDrop={reschedule}
            onEventResize={resize}
            onRangeCreate={(start, end, group) => {
              crud.buchungen.openCreate({
                anreise: format(start, 'yyyy-MM-dd'),
                abreise: format(end, 'yyyy-MM-dd'),
                wohnung: group ?? undefined,
              });
            }}
            onEmptyClick={(date, group) => {
              crud.buchungen.openCreate({
                anreise: format(date, 'yyyy-MM-dd'),
                wohnung: group ?? undefined,
              });
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Offene Anfragen')}
              items={offeneAnfragen.slice(0, 8).map(b => ({
                id: b.record_id,
                title: b.gastName || b.fields.buchungsnummer || tx('Gast'),
                secondLine: (
                  <>
                    <span className="font-medium text-amber-600">{tx('Anfrage')}</span>
                    <span className="text-muted-foreground">
                      {' · '}{b.wohnungName}{' · '}
                      {b.fields.anreise ? formatDate(b.fields.anreise) : '—'}
                      {b.fields.abreise ? ` – ${formatDate(b.fields.abreise)}` : ''}
                    </span>
                  </>
                ),
                action: {
                  label: tx('Bestätigen'),
                  onClick: () => confirmBuchung(b),
                },
              }))}
              onItemClick={id => {
                const b = enrichedBuchungen.find(x => x.record_id === id);
                if (b) crud.buchungen.openDetail(b);
              }}
              empty={{
                text: tx('Keine offenen Anfragen — alles bestätigt.'),
                action: {
                  label: tx('Neue Buchung'),
                  onClick: () => crud.buchungen.openCreate({ status: 'bestaetigt' }),
                },
              }}
            />
            <WorkList
              title={tx('Fällige Reinigungen')}
              items={faelligeReinigungen.slice(0, 8).map(r => ({
                id: r.record_id,
                title: r.wohnungName || tx('Wohnung'),
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{tx('Offen')}</span>
                    <span className="text-muted-foreground">
                      {' · '}{r.reinigungskraftName || tx('Keine Reinigungskraft')}
                      {r.fields.datum ? ` · ${formatDate(r.fields.datum)}` : ''}
                    </span>
                  </>
                ),
                action: {
                  label: tx('Erledigt'),
                  onClick: () => markReinigungenErledigt(r),
                },
              }))}
              onItemClick={id => {
                const r = enrichedReinigungen.find(x => x.record_id === id);
                if (r) crud.reinigungen.openDetail(r);
              }}
              empty={{
                text: tx('Alle Reinigungen erledigt.'),
                action: {
                  label: tx('Reinigung planen'),
                  onClick: () => crud.reinigungen.openCreate({}),
                },
              }}
            />
          </>
        }
      />

      {crud.surfaces}
    </div>
  );
}
