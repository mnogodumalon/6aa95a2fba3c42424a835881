import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  occupancyFor,
  fieldLookups,
  fieldText,
  fieldNumber,
  todayIso,
  type JourneyRecord,
} from '@/lib/journey';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { AvailabilityRangePicker } from '@/components/blocks/AvailabilityRangePicker';
import { Bound } from '@/components/blocks/Bound';
import { tx } from '@/i18n';

const SLUG = 'buchungsanfrage';

// Ausstattungs-Icons (emoji fallback — alle browser-safe)
const AUSSTATTUNG_ICONS: Record<string, string> = {
  seeblick: '🌊',
  kueche: '🍳',
  wlan: '📶',
  parkplatz: '🅿️',
  haustiere_erlaubt: '🐾',
  balkon: '🌿',
};

function generateBuchungsnummer(): string {
  const today = todayIso(); // yyyy-MM-dd
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ANF-${today}-${rand}`;
}

interface WohnungItem {
  id: string;
  title: string;
  subtitle?: string;
  stats?: { label: string; value: string | number }[];
}

function toWohnungItem(record: JourneyRecord): WohnungItem {
  const name = fieldText(record, 'name');
  const schlafplaetze = fieldNumber(record, 'schlafplaetze');
  const preis = fieldNumber(record, 'grundpreis_pro_nacht');
  const beschreibung = fieldText(record, 'beschreibung');
  return {
    id: record.id,
    title: name,
    subtitle: beschreibung || undefined,
    stats: [
      { label: tx('Schlafplätze'), value: schlafplaetze ?? '—' },
      { label: tx('Grundpreis/Nacht'), value: preis != null ? `${preis} €` : '—' },
    ],
  };
}

interface WohnungDetails {
  name: string;
  beschreibung: string;
  schlafplaetze: number | null;
  grundpreis_pro_nacht: number | null;
  foto: string | null;
  ausstattung: { key: string; label: string }[];
}

function getWohnungDetails(record: JourneyRecord): WohnungDetails {
  return {
    name: fieldText(record, 'name'),
    beschreibung: fieldText(record, 'beschreibung'),
    schlafplaetze: fieldNumber(record, 'schlafplaetze'),
    grundpreis_pro_nacht: fieldNumber(record, 'grundpreis_pro_nacht'),
    foto: (record.fields.foto as string) ?? null,
    ausstattung: fieldLookups(record, 'ausstattung'),
  };
}

// Inner page — rendered after config loads
function BuchungsanfragePage({
  cfg,
  page,
}: {
  cfg: PublicPagesConfig;
  page: PublicPageConfig;
}) {
  const STEPS = [
  {
    label: tx('Wohnung wählen'),
    description: tx('Wähle eine verfügbare Ferienwohnung.'),
  },
  {
    label: tx('Zeitraum & Personen'),
    description: tx('Wähle deinen Reisezeitraum — belegte Nächte sind gesperrt.'),
  },
  {
    label: tx('Kontaktdaten'),
    description: tx('Deine persönlichen Angaben für die Buchungsanfrage.'),
  },
  {
    label: tx('Zusammenfassung'),
    description: tx('Prüfe deine Angaben und sende die Anfrage ab.'),
  },
];

  const [step, setStep] = useState(1);

  const port = useMemo(() => createPublicPort(cfg, page), [cfg, page]);

  // ── Form: Buchung ────────────────────────────────────────────────────────
  const buchung = useStepForm('buchungen', {
    fields: ['wohnung', 'anreise', 'abreise', 'anzahl_personen', 'buchungsnummer', 'gast'],
    required: { wohnung: true, anreise: true, abreise: true, anzahl_personen: true, buchungsnummer: false, gast: true },
    steps: {
      wohnung: 1,
      anreise: 2,
      abreise: 2,
      anzahl_personen: 2,
    },
    autoComplete: true,
  });

  // ── Form: Gast ───────────────────────────────────────────────────────────
  const gast = useStepForm('gaeste', {
    fields: ['vorname', 'nachname', 'email', 'telefon'],
    required: { vorname: true, nachname: true, email: false, telefon: false },
    steps: { vorname: 3, nachname: 3, email: 3, telefon: 3 },
    autoComplete: true,
  });

  // ── Wohnungen laden ──────────────────────────────────────────────────────
  const wohnungenSearch = useRecordSearch(port, 'wohnungen', {
    searchFields: ['name', 'beschreibung'],
    toItem: toWohnungItem,
  });

  // Aktuell gewählte Wohnung (Record)
  const selectedWohnungId = buchung.get('wohnung') as string | null;
  const selectedWohnungRecord = selectedWohnungId
    ? wohnungenSearch.recordOf(selectedWohnungId)
    : undefined;

  // ── Buchungen für Belegungskalender laden ────────────────────────────────
  // Wir laden erst, wenn eine Wohnung gewählt ist (Step 2)
  const buchungenSearch = useRecordSearch(port, 'buchungen', {
    searchFields: ['buchungsnummer'],
    where: (r) => {
      // Nur Buchungen der gewählten Wohnung
      if (!selectedWohnungId) return false;
      const wohnungRef = r.fields.wohnung as string | null;
      return typeof wohnungRef === 'string' && wohnungRef.endsWith(`/${selectedWohnungId}`);
    },
  });

  const blocked = useMemo(
    () =>
      occupancyFor('buchungen', buchungenSearch.records, {
        resource: selectedWohnungId ?? undefined,
      }),
    [buchungenSearch.records, selectedWohnungId],
  );

  // ── Submit-Plan ───────────────────────────────────────────────────────────
  const submit = useJourneySubmit(
    port,
    [
      { key: 'gast', entity: 'gaeste', form: gast },
      {
        key: 'buchung',
        entity: 'buchungen',
        form: buchung,
        primary: true,
        needs: ['gast'],
        link: { gast: 'gast' },
        values: () => ({ buchungsnummer: generateBuchungsnummer() }),
      },
    ],
    { draftKey: 'buchungsanfrage' },
  );

  function restart() {
    submit.reset();
    buchung.reset();
    gast.reset();
    setStep(1);
  }

  // ── Wohnung wählen ───────────────────────────────────────────────────────
  const wohnungDetails: WohnungDetails | null = selectedWohnungRecord
    ? getWohnungDetails(selectedWohnungRecord)
    : null;

  return (
    <IntentWizardShell
      steps={STEPS}
      currentStep={step}
      onStepChange={setStep}
      back={false}
      forms={[buchung, gast]}
      draftKey="buchungsanfrage"
    >
      {/* ── Step 1: Wohnung wählen ─────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <EntitySelectStep
            {...wohnungenSearch.select}
            avatar="none"
            columns={1}
            selectedId={selectedWohnungId}
            onSelect={(id) => {
              buchung.set('wohnung', id, wohnungenSearch.labelOf(id) ?? id);
            }}
            emptyText={tx('Keine verfügbaren Wohnungen gefunden.')}
            searchPlaceholder={tx('Wohnung suchen…')}
          />

          {/* Hero-Vorschau der gewählten Wohnung */}
          {wohnungDetails && (
            <div className="rounded-xl overflow-hidden border bg-muted/30">
              {wohnungDetails.foto && (
                <img
                  src={wohnungDetails.foto}
                  alt={wohnungDetails.name}
                  className="w-full h-48 object-cover"
                />
              )}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-semibold text-base">{wohnungDetails.name}</h3>
                  {wohnungDetails.grundpreis_pro_nacht != null && (
                    <span className="text-sm font-medium text-primary">
                      {wohnungDetails.grundpreis_pro_nacht} €{tx('/Nacht')}
                    </span>
                  )}
                </div>
                {wohnungDetails.schlafplaetze != null && (
                  <p className="text-sm text-muted-foreground">
                    {tx('Schlafplätze')}: {wohnungDetails.schlafplaetze}
                  </p>
                )}
                {wohnungDetails.beschreibung && (
                  <p className="text-sm text-muted-foreground">{wohnungDetails.beschreibung}</p>
                )}
                {wohnungDetails.ausstattung.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {wohnungDetails.ausstattung.map((a) => (
                      <span
                        key={a.key}
                        className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium"
                      >
                        {AUSSTATTUNG_ICONS[a.key] ?? '✓'} {a.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <StepNav
            hideBack
            onNext={() => {
              if (!selectedWohnungId) return tx('Bitte wähle eine Wohnung aus.');
              return true;
            }}
            nextStepLabel={tx('Zeitraum')}
          />
        </div>
      )}

      {/* ── Step 2: Zeitraum & Personen ────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          <AvailabilityRangePicker
            {...buchung.range('anreise', 'abreise', { blocked, minNights: 1 })}
          />
          <Bound form={buchung} name="anzahl_personen" />
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => buchung.validate(['anreise', 'abreise', 'anzahl_personen'])}
            nextStepLabel={tx('Kontaktdaten')}
          />
        </div>
      )}

      {/* ── Step 3: Kontaktdaten ─────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <Bound form={gast} name="vorname" />
          <Bound form={gast} name="nachname" />
          <Bound form={gast} name="email" />
          <Bound form={gast} name="telefon" />
          <StepNav
            onBack={() => setStep(2)}
            onNext={() => gast.validate(['vorname', 'nachname', 'email', 'telefon'])}
            nextStepLabel={tx('Zusammenfassung')}
          />
        </div>
      )}

      {/* ── Step 4: Zusammenfassung ──────────────────────────────────────── */}
      {step === 4 && !submit.done && (
        <SummaryStep
          forms={[buchung, gast]}
          submit={submit}
          whatHappensNext={tx(
            'Wir prüfen deine Anfrage und melden uns so schnell wie möglich per E-Mail oder Telefon.',
          )}
          confirmLabel={tx('Anfrage senden')}
        />
      )}

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[buchung, gast]}
          whatHappensNext={tx(
            'Wir melden uns innerhalb von 24 Stunden bei dir. Bitte prüfe auch deinen Spam-Ordner.',
          )}
          next={[{ label: tx('Weitere Anfrage stellen'), onClick: restart }]}
          submit={submit}
          restartLabel={tx('Neue Anfrage')}
        />
      )}
    </IntentWizardShell>
  );
}

export default function Buchungsanfrage() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then((c) => {
        const p = c?.pages[SLUG] ?? null;
        if (!p) {
          setUnavailable(true);
        } else {
          setCfg(c);
          setPage(p);
        }
      })
      .catch((err) => {
        if (err instanceof PageUnavailableError) {
          setUnavailable(true);
        } else {
          setUnavailable(true);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PublicShell loading />;
  if (unavailable || !cfg || !page) return <PublicShell unavailable />;

  return (
    <PublicShell
      title={page.title}
      description={page.description}
    >
      <BuchungsanfragePage cfg={cfg} page={page} />
    </PublicShell>
  );
}
