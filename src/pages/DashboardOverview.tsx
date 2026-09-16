import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { tx, appLabel, dateFnsLocale } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { format, parseISO, differenceInDays, isAfter, isBefore, isEqual, startOfDay } from 'date-fns';
import { useState, useMemo } from 'react';
import {
  IconBed,
  IconAlertTriangle,
  IconCheck,
  IconSpray,
  IconCalendar,
  IconUsers,
  IconPlus,
  IconCash,
} from '@tabler/icons-react';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import {
  ResourceTimeline,
  type ResourceEvent,
  type ResourceGroup,
} from '@/components/widgets/ResourceTimeline';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    wohnungen, buchungen, reinigungen,
    wohnungenMap, buchungenMap, mitarbeiterMap,
    setWohnungen, setBuchungen, setReinigungen,
    fetchAll,
  } = data;

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'buchungen') {
        const b = top.record;
        const st = lookupKey(b.fields.status);
        if (st === 'anfrage') {
          return {
            label: tx('Bestätigen'),
            onClick: () => confirmBuchung(b),
          };
        }
        if (st === 'bestaetigt') {
          return {
            label: tx('Einchecken'),
            onClick: () => advanceBuchung(b, 'eingecheckt'),
          };
        }
        if (st === 'eingecheckt') {
          return {
            label: tx('Auschecken'),
            onClick: () => advanceBuchung(b, 'ausgecheckt'),
          };
        }
      }
      if (top.type === 'reinigungen') {
        const r = top.record;
        if (lookupKey(r.fields.status) === 'offen') {
          return {
            label: tx('Als erledigt markieren'),
            onClick: () => markReinigungenErledigt(r),
          };
        }
      }
      return undefined;
    },
  });
  const enrichedBuchungen = crud.enriched.buchungen;
  const enrichedReinigungen = crud.enriched.reinigungen;

  const clock = useClock();
  const today = format(clock, 'yyyy-MM-dd');

  // ── Buchungen-Status-Filter
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // ── Anfragen (unbestätigt)
  const anfragen = useMemo(
    () => enrichedBuchungen.filter(b => lookupKey(b.fields.status) === 'anfrage'),
    [enrichedBuchungen],
  );

  // ── Heute eingecheckt
  const heuteAnreise = useMemo(
    () => enrichedBuchungen.filter(b => b.fields.anreise === today && lookupKey(b.fields.status) === 'bestaetigt'),
    [enrichedBuchungen, today],
  );

  // ── Heute ausgecheckt (noch eingecheckt)
  const heuteAbreise = useMemo(
    () => enrichedBuchungen.filter(b => b.fields.abreise === today && lookupKey(b.fields.status) === 'eingecheckt'),
    [enrichedBuchungen, today],
  );

  // ── Offene Reinigungen heute & morgen
  const offeneReinigungen = useMemo(
    () => enrichedReinigungen.filter(r => lookupKey(r.fields.status) === 'offen'),
    [enrichedReinigungen],
  );

  const heuteReinigungen = useMemo(
    () => offeneReinigungen.filter(r => r.fields.datum === today),
    [offeneReinigungen, today],
  );

  // ── ResourceTimeline: groups = wohnungen
  const groups = useMemo<ResourceGroup[]>(
    () => wohnungen.map(w => ({
      key: w.record_id,
      label: w.fields.name ?? w.record_id,
      tone: lookupKey(w.fields.status) === 'gesperrt' ? 'warning' as const : 'default' as const,
    })),
    [wohnungen],
  );

  // ── ResourceTimeline: events = buchungen (nur nicht-storniert)
  const events = useMemo<ResourceEvent[]>(() => {
    const visible = statusFilter
      ? enrichedBuchungen.filter(b => lookupKey(b.fields.status) === statusFilter)
      : enrichedBuchungen.filter(b => lookupKey(b.fields.status) !== 'storniert');

    return visible
      .filter(b => !!b.fields.anreise && !!b.fields.wohnung)
      .map(b => {
        const st = lookupKey(b.fields.status);
        const tone =
          st === 'eingecheckt' ? 'success' as const
          : st === 'anfrage' ? 'warning' as const
          : st === 'ausgecheckt' ? 'default' as const
          : 'primary' as const;
        return {
          id: `buchung:${b.record_id}`,
          start: b.fields.anreise!,
          end: b.fields.abreise,
          allDay: true,
          title: b.gastName || b.fields.buchungsnummer || tx('Gast'),
          subtitle: b.fields.buchungsnummer,
          tone,
          group: extractRecordId(b.fields.wohnung) ?? '',
        };
      });
  }, [enrichedBuchungen, statusFilter]);

  // ── Overlap-check: darf eine Buchung auf diese Wohnung in diesem Zeitraum?
  function overlapCheck(
    wohnungId: string,
    newStart: string,
    newEnd: string | undefined,
    excludeId?: string,
  ): string | undefined {
    const s = parseISO(newStart);
    const e = newEnd ? parseISO(newEnd) : s;
    for (const b of buchungen) {
      if (b.record_id === excludeId) continue;
      if (lookupKey(b.fields.status) === 'storniert') continue;
      const bWohnungId = extractRecordId(b.fields.wohnung);
      if (bWohnungId !== wohnungId) continue;
      if (!b.fields.anreise) continue;
      const bs = parseISO(b.fields.anreise);
      const be = b.fields.abreise ? parseISO(b.fields.abreise) : bs;
      // Overlap: NOT (e < bs OR s > be)
      if (!(isBefore(e, bs) || isAfter(s, be) || isEqual(e, bs))) {
        return tx('Dieser Zeitraum ist bereits belegt');
      }
    }
    return undefined;
  }

  // ── Drag / resize handlers (optimistic)
  async function onEventDrop(id: string, newStart: string, newEnd?: string, newGroup?: string) {
    const rid = id.split(':')[1] ?? '';
    if (!rid) return;
    const b = buchungen.find(x => x.record_id === rid);
    if (!b) return;
    const targetWohnungId = newGroup ?? extractRecordId(b.fields.wohnung) ?? '';

    const conflict = overlapCheck(targetWohnungId, newStart, newEnd, rid);
    if (conflict) return conflict;

    const wohnungPatch = newGroup ? { wohnung: createRecordUrl(APP_IDS.WOHNUNGEN, newGroup) } : {};
    const before = { ...b.fields };
    setBuchungen(prev =>
      prev.map(x =>
        x.record_id === rid
          ? { ...x, fields: { ...x.fields, anreise: newStart, ...(newEnd ? { abreise: newEnd } : {}), ...wohnungPatch } }
          : x,
      ),
    );
    try {
      await LivingAppsService.updateBuchungenEntry(rid, {
        anreise: newStart,
        ...(newEnd ? { abreise: newEnd } : {}),
        ...wohnungPatch,
      });
      const gast = enrichedBuchungen.find(x => x.record_id === rid)?.gastName ?? '';
      undoToast(
        tx`${gast} — ${tx('Buchung verschoben')}`,
        async () => {
          setBuchungen(prev =>
            prev.map(x => (x.record_id === rid ? { ...x, fields: before } : x)),
          );
          await LivingAppsService.updateBuchungenEntry(rid, before as any);
        },
      );
    } catch {
      await fetchAll();
    }
  }

  async function onEventResize(id: string, newStart: string, newEnd: string) {
    const rid = id.split(':')[1] ?? '';
    if (!rid) return;
    const b = buchungen.find(x => x.record_id === rid);
    if (!b) return;
    const wohnungId = extractRecordId(b.fields.wohnung) ?? '';

    const conflict = overlapCheck(wohnungId, newStart, newEnd, rid);
    if (conflict) return conflict;

    const before = { ...b.fields };
    setBuchungen(prev =>
      prev.map(x =>
        x.record_id === rid
          ? { ...x, fields: { ...x.fields, anreise: newStart, abreise: newEnd } }
          : x,
      ),
    );
    try {
      await LivingAppsService.updateBuchungenEntry(rid, { anreise: newStart, abreise: newEnd });
      undoToast(tx('Aufenthalt angepasst'), async () => {
        setBuchungen(prev =>
          prev.map(x => (x.record_id === rid ? { ...x, fields: before } : x)),
        );
        await LivingAppsService.updateBuchungenEntry(rid, before as any);
      });
    } catch {
      await fetchAll();
    }
  }

  // ── Status-Advance helpers (shared: banner, work list, overlay footer)
  async function confirmBuchung(b: (typeof enrichedBuchungen)[0]) {
    const before = b.fields.status;
    const newStatus = lookupOption('buchungen', 'status', 'bestaetigt');
    setBuchungen(prev =>
      prev.map(x =>
        x.record_id === b.record_id ? { ...x, fields: { ...x.fields, status: newStatus } } : x,
      ),
    );
    try {
      await LivingAppsService.updateBuchungenEntry(b.record_id, { status: 'bestaetigt' });
      undoToast(
        tx`${b.gastName || b.fields.buchungsnummer || ''} — ${tx('bestätigt')}`,
        async () => {
          setBuchungen(prev =>
            prev.map(x => (x.record_id === b.record_id ? { ...x, fields: { ...x.fields, status: before } } : x)),
          );
          await LivingAppsService.updateBuchungenEntry(b.record_id, { status: 'anfrage' });
        },
      );
    } catch {
      await fetchAll();
    }
  }

  async function advanceBuchung(b: (typeof enrichedBuchungen)[0], nextStatus: string) {
    const before = b.fields.status;
    const newStatus = lookupOption('buchungen', 'status', nextStatus);
    setBuchungen(prev =>
      prev.map(x =>
        x.record_id === b.record_id ? { ...x, fields: { ...x.fields, status: newStatus } } : x,
      ),
    );
    try {
      await LivingAppsService.updateBuchungenEntry(b.record_id, { status: nextStatus });
      undoToast(tx('Status aktualisiert'), async () => {
        setBuchungen(prev =>
          prev.map(x => (x.record_id === b.record_id ? { ...x, fields: { ...x.fields, status: before } } : x)),
        );
        await LivingAppsService.updateBuchungenEntry(b.record_id, { status: lookupKey(before) ?? 'anfrage' });
      });
    } catch {
      await fetchAll();
    }
  }

  async function markReinigungenErledigt(r: (typeof enrichedReinigungen)[0]) {
    const before = r.fields.status;
    const newStatus = lookupOption('reinigungen', 'status', 'erledigt');
    setReinigungen(prev =>
      prev.map(x =>
        x.record_id === r.record_id ? { ...x, fields: { ...x.fields, status: newStatus } } : x,
      ),
    );
    try {
      await LivingAppsService.updateReinigungenEntry(r.record_id, { status: 'erledigt' });
      undoToast(tx('Reinigung als erledigt markiert'), async () => {
        setReinigungen(prev =>
          prev.map(x => (x.record_id === r.record_id ? { ...x, fields: { ...x.fields, status: before } } : x)),
        );
        await LivingAppsService.updateReinigungenEntry(r.record_id, { status: 'offen' });
      });
    } catch {
      await fetchAll();
    }
  }

  // ── Gesamtumsatz aktiver Buchungen (nicht storniert)
  const aktiveBuchungen = useMemo(
    () => enrichedBuchungen.filter(b => lookupKey(b.fields.status) !== 'storniert'),
    [enrichedBuchungen],
  );
  const umsatzAktiv = useMemo(
    () => aktiveBuchungen.reduce((sum, b) => sum + (b.fields.gesamtpreis ?? 0), 0),
    [aktiveBuchungen],
  );

  // ── Context-Zeile
  const contextLine = useMemo(() => {
    const anreisende = heuteAnreise.map(b => b.gastName).filter(Boolean);
    const abreisende = heuteAbreise.map(b => b.gastName).filter(Boolean);
    if (anreisende.length === 0 && abreisende.length === 0) {
      return anfragen.length > 0
        ? tx`${anfragen.length} offene ${tx('Anfragen')} warten auf Bestätigung.`
        : tx('Heute keine An- oder Abreisen.');
    }
    const parts: string[] = [];
    if (anreisende.length > 0) parts.push(tx`${namen(anreisende)} reist an`);
    if (abreisende.length > 0) parts.push(tx`${namen(abreisende)} reist ab`);
    return parts.join(' · ');
  }, [heuteAnreise, heuteAbreise, anfragen]);

  const statusOptions = LOOKUP_OPTIONS['buchungen']?.['status'] ?? [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {gruss(clock)}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors shrink-0"
          onClick={() => crud.buchungen.openCreate({})}
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Neue Buchung')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          anfragen.length > 0 ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tx('Jetzt bestätigen'),
                onClick: () => confirmBuchung(anfragen[0]),
              }}
            >
              <b>{namen(anfragen.map(b => b.gastName || b.fields.buchungsnummer || ''))}</b>
              {' '}
              {anfragen.length === 1
                ? tx('wartet auf Bestätigung')
                : tx`— ${anfragen.length} Anfragen warten auf Bestätigung`}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Anfragen')}
              value={anfragen.length}
              icon={<IconCalendar size={16} className="shrink-0" />}
              tone={anfragen.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => f === 'anfrage' ? null : 'anfrage')}
              active={statusFilter === 'anfrage'}
            />
            <StatStripItem
              title={tx('Bestätigt')}
              value={aktiveBuchungen.filter(b => lookupKey(b.fields.status) === 'bestaetigt').length}
              icon={<IconCheck size={16} className="shrink-0" />}
              tone="primary"
              onClick={() => setStatusFilter(f => f === 'bestaetigt' ? null : 'bestaetigt')}
              active={statusFilter === 'bestaetigt'}
            />
            <StatStripItem
              title={tx('Eingecheckt')}
              value={aktiveBuchungen.filter(b => lookupKey(b.fields.status) === 'eingecheckt').length}
              icon={<IconBed size={16} className="shrink-0" />}
              tone="success"
              onClick={() => setStatusFilter(f => f === 'eingecheckt' ? null : 'eingecheckt')}
              active={statusFilter === 'eingecheckt'}
            />
            <StatStripItem
              title={tx('Reinigungen heute')}
              value={heuteReinigungen.length}
              icon={<IconSpray size={16} className="shrink-0" />}
              tone={heuteReinigungen.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Umsatz aktiv')}
              value={formatCurrency(umsatzAktiv)}
              icon={<IconCash size={16} className="shrink-0" />}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <ResourceTimeline
            events={events}
            groups={groups}
            axis="day"
            defaultRange="week"
            locale={dateFnsLocale()}
            onEventClick={ev => {
              const rid = ev.id.split(':')[1] ?? '';
              const b = enrichedBuchungen.find(x => x.record_id === rid);
              if (b) crud.buchungen.openDetail(b);
            }}
            onEventDrop={onEventDrop}
            onEventResize={onEventResize}
            onRangeCreate={(start, end, group) => {
              crud.buchungen.openCreate({
                anreise: format(start, 'yyyy-MM-dd'),
                abreise: format(end, 'yyyy-MM-dd'),
                ...(group ? { wohnung: group } : {}),
              });
            }}
            onEmptyClick={(date, group) => {
              crud.buchungen.openCreate({
                anreise: format(date, 'yyyy-MM-dd'),
                ...(group ? { wohnung: group } : {}),
              });
            }}
            renderEvent={(ev, meta) => {
              const toneClass =
                ev.tone === 'success' ? 'text-emerald-700'
                : ev.tone === 'warning' ? 'text-amber-700'
                : ev.tone === 'primary' ? 'text-blue-700'
                : 'text-muted-foreground';
              return (
                <div className={`flex items-center gap-1 truncate text-xs ${toneClass}`}>
                  <IconBed size={12} className="shrink-0" />
                  {meta.isStart && <span className="truncate">{ev.title}</span>}
                </div>
              );
            }}
            renderGroupHeader={group => {
              const w = wohnungen.find(x => x.record_id === group.key);
              const belegungen = buchungen.filter(
                b =>
                  extractRecordId(b.fields.wohnung) === group.key &&
                  lookupKey(b.fields.status) !== 'storniert',
              ).length;
              const isGesperrt = lookupKey(w?.fields.status) === 'gesperrt';
              return (
                <div className="flex w-full items-center justify-between gap-1.5 min-w-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{group.label}</p>
                    {w?.fields.schlafplaetze != null && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                        <IconUsers size={10} className="shrink-0" />
                        {w.fields.schlafplaetze}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                      isGesperrt
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-secondary text-primary'
                    }`}
                  >
                    {isGesperrt ? tx('Gesperrt') : `${belegungen}`}
                  </span>
                </div>
              );
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Heute & morgen')}
              items={[
                ...heuteAnreise.map(b => ({
                  id: `an-${b.record_id}`,
                  title: b.gastName || b.fields.buchungsnummer || tx('Gast'),
                  secondLine: (
                    <>
                      <span className="font-medium text-emerald-600">{tx('Anreise heute')}</span>
                      <span className="text-muted-foreground"> · {b.wohnungName}</span>
                    </>
                  ),
                  action: {
                    label: tx('Einchecken'),
                    onClick: () => advanceBuchung(b, 'eingecheckt'),
                  },
                })),
                ...heuteAbreise.map(b => ({
                  id: `ab-${b.record_id}`,
                  title: b.gastName || b.fields.buchungsnummer || tx('Gast'),
                  secondLine: (
                    <>
                      <span className="font-medium text-amber-600">{tx('Abreise heute')}</span>
                      <span className="text-muted-foreground"> · {b.wohnungName}</span>
                    </>
                  ),
                  action: {
                    label: tx('Auschecken'),
                    onClick: () => advanceBuchung(b, 'ausgecheckt'),
                  },
                })),
                ...anfragen.slice(0, 3).map(b => ({
                  id: `anf-${b.record_id}`,
                  title: b.gastName || b.fields.buchungsnummer || tx('Gast'),
                  secondLine: (
                    <>
                      <span className="font-medium text-amber-600">{tx('Anfrage')}</span>
                      <span className="text-muted-foreground">
                        {' '}· {b.wohnungName}
                        {b.fields.anreise ? ` · ${formatDate(b.fields.anreise)}` : ''}
                      </span>
                    </>
                  ),
                  action: {
                    label: tx('Bestätigen'),
                    onClick: () => confirmBuchung(b),
                  },
                })),
              ]}
              onItemClick={id => {
                const rid = id.replace(/^(an|ab|anf)-/, '');
                const b = enrichedBuchungen.find(x => x.record_id === rid);
                if (b) crud.buchungen.openDetail(b);
              }}
              empty={{
                text: tx('Keine An- oder Abreisen heute.'),
                action: { label: tx('Neue Buchung'), onClick: () => crud.buchungen.openCreate({}) },
              }}
              max={8}
            />

            <WorkList
              title={tx('Offene Reinigungen')}
              items={offeneReinigungen.slice(0, 6).map(r => ({
                id: r.record_id,
                title: r.wohnungName || tx('Wohnung'),
                secondLine: (
                  <>
                    <span className="text-muted-foreground">{r.reinigungskraftName || tx('Unbesetzt')}</span>
                    {r.fields.datum && (
                      <span className="text-muted-foreground"> · {formatDate(r.fields.datum)}</span>
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
                text: tx('Alle Reinigungen erledigt.'),
                action: {
                  label: tx('Reinigung planen'),
                  onClick: () => crud.reinigungen.openCreate({}),
                },
              }}
              max={6}
            />
          </>
        }
      />

      {crud.surfaces}
    </div>
  );
}
