import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { dateFnsLocale } from '@/i18n';
import { format, parseISO, differenceInCalendarDays, isToday, isBefore, addDays, isAfter } from 'date-fns';
import { useState, useMemo } from 'react';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import {
  ResourceTimeline,
  type ResourceEvent,
  type ResourceGroup,
} from '@/components/widgets/ResourceTimeline';
import { APP_IDS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import {
  IconAlertTriangle,
  IconCalendar,
  IconHome,
  IconBrush,
  IconUsers,
  IconCheck,
} from '@tabler/icons-react';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    wohnungen, buchungen, reinigungen,
    wohnungenMap, buchungenMap,
    fetchAll,
    setBuchungen,
    setReinigungen,
  } = data;

  const clock = useClock();
  const today = format(clock, 'yyyy-MM-dd');

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'buchungen') {
        const b = top.record;
        const key = lookupKey(b.fields.status);
        if (key === 'anfrage') return { label: tx('Bestätigen'), onClick: () => confirmBooking(b) };
        if (key === 'bestaetigt') return { label: tx('Einchecken'), onClick: () => advanceBuchung(b, 'eingecheckt') };
        if (key === 'eingecheckt') return { label: tx('Auschecken'), onClick: () => advanceBuchung(b, 'ausgecheckt') };
      }
      if (top.type === 'reinigungen') {
        const r = top.record;
        const key = lookupKey(r.fields.status);
        if (key === 'offen') return { label: tx('Als erledigt markieren'), onClick: () => markReinigungenErledigt(r) };
      }
      return undefined;
    },
  });
  const enrichedBuchungen = crud.enriched.buchungen;
  const enrichedReinigungen = crud.enriched.reinigungen;

  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  // --- Derived data ---
  const offeneAnfragen = useMemo(
    () => enrichedBuchungen.filter(b => lookupKey(b.fields.status) === 'anfrage'),
    [enrichedBuchungen],
  );
  const aktiveJetzt = useMemo(
    () => enrichedBuchungen.filter(b => {
      const key = lookupKey(b.fields.status);
      return key === 'eingecheckt';
    }),
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
  const ueberfaelligeReinigungen = useMemo(
    () => offeneReinigungen.filter(r => r.fields.datum && r.fields.datum < today),
    [offeneReinigungen, today],
  );

  // Filtered bookings for the timeline if a status filter is active
  const filteredBuchungen = useMemo(() => {
    if (!filterStatus) return enrichedBuchungen;
    return enrichedBuchungen.filter(b => lookupKey(b.fields.status) === filterStatus);
  }, [enrichedBuchungen, filterStatus]);

  // --- ResourceTimeline groups = Wohnungen ---
  const groups = useMemo<ResourceGroup[]>(
    () => wohnungen.map(w => ({
      key: w.record_id,
      label: w.fields.name ?? w.record_id,
      tone: lookupKey(w.fields.status) === 'gesperrt' ? 'warning' as const : 'default' as const,
    })),
    [wohnungen],
  );

  // --- ResourceTimeline events = Buchungen ---
  const timelineEvents = useMemo<ResourceEvent[]>(() => {
    return filteredBuchungen
      .filter(b => !!b.fields.anreise && !!b.fields.wohnung)
      .map(b => {
        const statusKey = lookupKey(b.fields.status) ?? 'anfrage';
        const tone =
          statusKey === 'anfrage' ? ('warning' as const) :
          statusKey === 'bestaetigt' ? ('primary' as const) :
          statusKey === 'eingecheckt' ? ('success' as const) :
          statusKey === 'storniert' ? ('default' as const) :
          ('default' as const);
        return {
          id: `buchung:${b.record_id}`,
          start: b.fields.anreise!,
          end: b.fields.abreise,
          allDay: true,
          title: b.gastName || b.fields.buchungsnummer || tx('Buchung'),
          subtitle: b.wohnungName,
          tone,
          group: extractRecordId(b.fields.wohnung) ?? '',
        };
      });
  }, [filteredBuchungen]);

  // --- Workflow helpers ---
  function confirmBooking(b: typeof enrichedBuchungen[0]) {
    const prev = b.fields.status;
    setBuchungen(all =>
      all.map(x => x.record_id === b.record_id
        ? { ...x, fields: { ...x.fields, status: lookupOption('buchungen', 'status', 'bestaetigt') } }
        : x),
    );
    undoToast(tx`${b.gastName || b.fields.buchungsnummer || ''} — bestätigt`, async () => {
      setBuchungen(all =>
        all.map(x => x.record_id === b.record_id ? { ...x, fields: { ...x.fields, status: prev } } : x),
      );
      await LivingAppsService.updateBuchungenEntry(b.record_id, { status: lookupKey(prev) });
    });
    LivingAppsService.updateBuchungenEntry(b.record_id, { status: 'bestaetigt' }).catch(fetchAll);
  }

  function advanceBuchung(b: typeof enrichedBuchungen[0], nextStatus: string) {
    const prev = b.fields.status;
    setBuchungen(all =>
      all.map(x => x.record_id === b.record_id
        ? { ...x, fields: { ...x.fields, status: lookupOption('buchungen', 'status', nextStatus) } }
        : x),
    );
    undoToast(tx`${b.gastName || b.fields.buchungsnummer || ''} — ${nextStatus === 'eingecheckt' ? tx('eingecheckt') : tx('ausgecheckt')}`, async () => {
      setBuchungen(all =>
        all.map(x => x.record_id === b.record_id ? { ...x, fields: { ...x.fields, status: prev } } : x),
      );
      await LivingAppsService.updateBuchungenEntry(b.record_id, { status: lookupKey(prev) });
    });
    LivingAppsService.updateBuchungenEntry(b.record_id, { status: nextStatus }).catch(fetchAll);
  }

  function markReinigungenErledigt(r: typeof enrichedReinigungen[0]) {
    const prev = r.fields.status;
    setReinigungen(all =>
      all.map(x => x.record_id === r.record_id
        ? { ...x, fields: { ...x.fields, status: lookupOption('reinigungen', 'status', 'erledigt') } }
        : x),
    );
    undoToast(tx`${r.wohnungName || ''} — ${tx('Reinigung erledigt')}`, async () => {
      setReinigungen(all =>
        all.map(x => x.record_id === r.record_id ? { ...x, fields: { ...x.fields, status: prev } } : x),
      );
      await LivingAppsService.updateReinigungenEntry(r.record_id, { status: lookupKey(prev) });
    });
    LivingAppsService.updateReinigungenEntry(r.record_id, { status: 'erledigt' }).catch(fetchAll);
  }

  // --- Context line ---
  const contextLine = useMemo(() => {
    const parts: string[] = [];
    if (heuteAnreise.length > 0) {
      const names = namen(heuteAnreise.map(b => b.gastName));
      parts.push(`${tx('Anreise heute')}: ${names}`);
    }
    if (heuteAbreise.length > 0) {
      const names = namen(heuteAbreise.map(b => b.gastName));
      parts.push(`${tx('Abreise heute')}: ${names}`);
    }
    if (offeneReinigungen.length > 0) {
      parts.push(tx`${offeneReinigungen.length} Reinigung(en) offen`);
    }
    return parts.length > 0 ? parts.join(' · ') : tx('Heute sind keine An- oder Abreisen geplant.');
  }, [heuteAnreise, heuteAbreise, offeneReinigungen]);

  // --- Drop handler (reschedule) ---
  async function handleEventDrop(
    id: string,
    newStart: string,
    newEnd?: string,
    newGroup?: string,
  ): Promise<string | void> {
    const rid = id.split(':')[1] ?? '';
    if (!rid) return;
    const b = buchungenMap.get(rid);
    if (!b) return;

    // Overlap check: no two bookings may overlap for the same flat
    const wohnungId = newGroup ?? extractRecordId(b.fields.wohnung) ?? '';
    const start = parseISO(newStart);
    const end = newEnd ? parseISO(newEnd) : start;

    const overlap = enrichedBuchungen.some(other => {
      if (other.record_id === rid) return false;
      if (extractRecordId(other.fields.wohnung) !== wohnungId) return false;
      const oKey = lookupKey(other.fields.status);
      if (oKey === 'storniert') return false;
      if (!other.fields.anreise) return false;
      const oStart = parseISO(other.fields.anreise);
      const oEnd = other.fields.abreise ? parseISO(other.fields.abreise) : oStart;
      return !(isAfter(start, oEnd) || isBefore(end, oStart));
    });

    if (overlap) return tx('Diese Wohnung ist im gewählten Zeitraum bereits belegt.');

    const wohnungPatch = newGroup ? { wohnung: createRecordUrl(APP_IDS.WOHNUNGEN, newGroup) } : {};
    setBuchungen(all =>
      all.map(x =>
        x.record_id === rid
          ? { ...x, fields: { ...x.fields, anreise: newStart, ...(newEnd ? { abreise: newEnd } : {}), ...wohnungPatch } }
          : x,
      ),
    );
    undoToast(tx`Buchung verschoben`, async () => {
      setBuchungen(all =>
        all.map(x => x.record_id === rid ? b : x),
      );
      await LivingAppsService.updateBuchungenEntry(rid, {
        anreise: b.fields.anreise,
        ...(b.fields.abreise ? { abreise: b.fields.abreise } : {}),
        ...(b.fields.wohnung ? { wohnung: b.fields.wohnung } : {}),
      });
    });
    LivingAppsService.updateBuchungenEntry(rid, {
      anreise: newStart,
      ...(newEnd ? { abreise: newEnd } : {}),
      ...wohnungPatch,
    }).catch(fetchAll);
  }

  async function handleEventResize(id: string, newStart: string, newEnd: string): Promise<string | void> {
    const rid = id.split(':')[1] ?? '';
    const b = buchungenMap.get(rid);
    if (!b) return;

    const wohnungId = extractRecordId(b.fields.wohnung) ?? '';
    const start = parseISO(newStart);
    const end = parseISO(newEnd);

    const overlap = enrichedBuchungen.some(other => {
      if (other.record_id === rid) return false;
      if (extractRecordId(other.fields.wohnung) !== wohnungId) return false;
      if (lookupKey(other.fields.status) === 'storniert') return false;
      if (!other.fields.anreise) return false;
      const oStart = parseISO(other.fields.anreise);
      const oEnd = other.fields.abreise ? parseISO(other.fields.abreise) : oStart;
      return !(isAfter(start, oEnd) || isBefore(end, oStart));
    });

    if (overlap) return tx('Diese Wohnung ist im gewählten Zeitraum bereits belegt.');

    setBuchungen(all =>
      all.map(x =>
        x.record_id === rid
          ? { ...x, fields: { ...x.fields, anreise: newStart, abreise: newEnd } }
          : x,
      ),
    );
    undoToast(tx`Zeitraum angepasst`, async () => {
      setBuchungen(all => all.map(x => x.record_id === rid ? b : x));
      await LivingAppsService.updateBuchungenEntry(rid, {
        anreise: b.fields.anreise,
        abreise: b.fields.abreise,
      });
    });
    LivingAppsService.updateBuchungenEntry(rid, { anreise: newStart, abreise: newEnd }).catch(fetchAll);
  }

  // --- Hero: urgent signal = offene Anfragen ---
  const hero = offeneAnfragen.length > 0 ? (
    <HeroBanner
      icon={<IconAlertTriangle size={18} />}
      action={{
        label: tx('Anfrage bestätigen'),
        onClick: () => confirmBooking(offeneAnfragen[0]),
      }}
    >
      <b>{namen(offeneAnfragen.map(b => b.gastName))}</b>
      {' '}
      {offeneAnfragen.length === 1
        ? tx('hat eine Anfrage gestellt — bitte bestätigen.')
        : tx('haben Anfragen gestellt — bitte bestätigen.')}
    </HeroBanner>
  ) : undefined;

  // --- KPIs ---
  const kpis = (
    <StatStrip>
      <StatStripItem
        title={tx('Anfragen')}
        value={offeneAnfragen.length}
        icon={<IconAlertTriangle size={16} className="shrink-0" />}
        tone={offeneAnfragen.length > 0 ? 'warning' : 'default'}
        onClick={() => setFilterStatus(f => f === 'anfrage' ? null : 'anfrage')}
        active={filterStatus === 'anfrage'}
      />
      <StatStripItem
        title={tx('Eingecheckt')}
        value={aktiveJetzt.length}
        icon={<IconHome size={16} className="shrink-0" />}
        tone={aktiveJetzt.length > 0 ? 'success' : 'default'}
        onClick={() => setFilterStatus(f => f === 'eingecheckt' ? null : 'eingecheckt')}
        active={filterStatus === 'eingecheckt'}
      />
      <StatStripItem
        title={tx('Anreisen heute')}
        value={heuteAnreise.length}
        icon={<IconCalendar size={16} className="shrink-0" />}
        tone={heuteAnreise.length > 0 ? 'primary' : 'default'}
      />
      <StatStripItem
        title={tx('Reinigungen offen')}
        value={offeneReinigungen.length}
        icon={<IconBrush size={16} className="shrink-0" />}
        tone={ueberfaelligeReinigungen.length > 0 ? 'destructive' : offeneReinigungen.length > 0 ? 'warning' : 'default'}
      />
    </StatStrip>
  );

  // --- Aside: open cleanings + upcoming arrivals ---
  const bevorstehend7Tage = useMemo(() => {
    const in7 = format(addDays(clock, 7), 'yyyy-MM-dd');
    return enrichedBuchungen
      .filter(b => {
        const key = lookupKey(b.fields.status);
        if (key === 'storniert' || key === 'ausgecheckt') return false;
        return b.fields.anreise && b.fields.anreise > today && b.fields.anreise <= in7;
      })
      .sort((a, b) => (a.fields.anreise ?? '').localeCompare(b.fields.anreise ?? ''));
  }, [enrichedBuchungen, today, clock]);

  const aside = (
    <>
      <WorkList
        title={tx('Offene Reinigungen')}
        items={offeneReinigungen.map(r => ({
          id: r.record_id,
          title: r.wohnungName || tx('Wohnung'),
          secondLine: (
            <>
              {r.reinigungskraftName
                ? <span className="font-medium text-foreground">{r.reinigungskraftName}</span>
                : <span className="text-muted-foreground">{tx('Keine Reinigungskraft')}</span>}
              {r.fields.datum && (
                <span className={`text-sm ${r.fields.datum < today ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                  {' · '}{formatDate(r.fields.datum)}
                </span>
              )}
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
          text: tx('Keine offenen Reinigungen — alles erledigt.'),
          action: {
            label: tx('Reinigung hinzufügen'),
            onClick: () => crud.reinigungen.openCreate({}),
          },
        }}
      />
      <WorkList
        title={tx('Anreisen (nächste 7 Tage)')}
        items={bevorstehend7Tage.map(b => ({
          id: b.record_id,
          title: b.gastName || b.fields.buchungsnummer || tx('Gast'),
          secondLine: (
            <>
              <span className="font-medium text-foreground">{b.wohnungName}</span>
              <span className="text-muted-foreground">
                {' · '}{formatDate(b.fields.anreise)}
                {isToday(parseISO(b.fields.anreise!)) ? <span className="ml-1 text-primary font-semibold">{tx('Heute!')}</span> : null}
              </span>
            </>
          ),
          action: lookupKey(b.fields.status) === 'anfrage'
            ? { label: tx('Bestätigen'), onClick: () => confirmBooking(b) }
            : lookupKey(b.fields.status) === 'bestaetigt'
              ? { label: tx('Einchecken'), onClick: () => advanceBuchung(b, 'eingecheckt') }
              : undefined,
        }))}
        onItemClick={id => {
          const b = enrichedBuchungen.find(x => x.record_id === id);
          if (b) crud.buchungen.openDetail(b);
        }}
        empty={{
          text: tx('Keine Anreisen in den nächsten 7 Tagen.'),
          action: {
            label: tx('Buchung anlegen'),
            onClick: () => crud.buchungen.openCreate({ status: 'bestaetigt' }),
          },
        }}
      />
    </>
  );

  // --- Primary: Belegungsplan ---
  const primary = (
    <ResourceTimeline
      events={timelineEvents}
      groups={groups}
      axis="day"
      defaultRange="week"
      locale={dateFnsLocale()}
      onEventClick={ev => {
        const rid = ev.id.split(':')[1] ?? '';
        const b = enrichedBuchungen.find(x => x.record_id === rid);
        if (b) crud.buchungen.openDetail(b);
      }}
      onEventDrop={handleEventDrop}
      onEventResize={handleEventResize}
      onRangeCreate={(start, end, group) => {
        crud.buchungen.openCreate({
          anreise: format(start, 'yyyy-MM-dd'),
          abreise: format(end, 'yyyy-MM-dd'),
          ...(group ? { wohnung: group } : {}),
          status: 'anfrage',
        });
      }}
      onEmptyClick={(date, group) => {
        crud.buchungen.openCreate({
          anreise: format(date, 'yyyy-MM-dd'),
          ...(group ? { wohnung: group } : {}),
          status: 'anfrage',
        });
      }}
    />
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
      </div>
      <DashboardGrid
        variant="wide"
        hero={hero}
        kpis={kpis}
        aside={aside}
        primary={primary}
      />
      {crud.surfaces}
    </div>
  );
}
