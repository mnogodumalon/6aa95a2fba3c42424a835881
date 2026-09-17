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
  useOccupancy,
  fieldLookups,
  fieldNumber,
  fieldText,
  type JourneyRecord,
} from '@/lib/journey';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { AvailabilityRangePicker } from '@/components/blocks/AvailabilityRangePicker';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { tx } from '@/i18n';

const SLUG = 'buchungsanfrage';

interface WohnungItem {
  id: string;
  title: string;
  subtitle?: string;
  stats?: { label: string; value: string | number }[];
  icon?: React.ReactNode;
}

function AusstattungBadges({ record }: { record: JourneyRecord }) {
  const items = fieldLookups(record, 'ausstattung');
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {items.map((item) => (
        <span
          key={item.key}
          className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground"
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

function WohnungCard({
  record,
  selected,
  onSelect,
}: {
  record: JourneyRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  const foto = record.fields.foto as string | null | undefined;
  const name = fieldText(record, 'name');
  const schlafplaetze = fieldNumber(record, 'schlafplaetze');
  const preis = fieldNumber(record, 'grundpreis_pro_nacht');

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={[
        'w-full text-left rounded-xl border-2 overflow-hidden transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'border-primary ring-1 ring-primary'
          : 'border-border hover:border-primary/50',
      ].join(' ')}
    >
      {foto && (
        <img
          src={foto}
          alt={name}
          className="w-full h-40 object-cover"
        />
      )}
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-base leading-snug">{name}</p>
          {selected && (
            <span className="shrink-0 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {tx('Ausgewählt')}
            </span>
          )}
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground">
          {schlafplaetze !== null && (
            <span>
              {schlafplaetze}{' '}
              {schlafplaetze === 1 ? tx('Schlafplatz') : tx('Schlafplätze')}
            </span>
          )}
          {preis !== null && (
            <span>
              {tx('ab')}{' '}
              {preis.toLocaleString('de-DE', {
                style: 'currency',
                currency: 'EUR',
              })}
              {' '}{tx('/ Nacht')}
            </span>
          )}
        </div>
        <AusstattungBadges record={record} />
      </div>
    </button>
  );
}

function BuchungsanfrageWizard({
  cfg,
  page,
}: {
  cfg: PublicPagesConfig;
  page: PublicPageConfig;
}) {
  const STEPS = [
  {
    label: tx('Wohnung'),
    key: 'wohnung',
    heading: tx('Wohnung wählen'),
    description: tx('Wähle die Ferienwohnung, die du anfragen möchtest.'),
    needs: ['wohnung'],
  },
  {
    label: tx('Zeitraum'),
    key: 'zeitraum',
    heading: tx('Reisezeitraum & Personen'),
    description: tx('Wähle An- und Abreise — belegte Nächte sind nicht wählbar.'),
    needs: ['anreise', 'abreise', 'anzahl_personen'],
  },
  {
    label: tx('Kontakt'),
    key: 'kontakt',
    heading: tx('Kontaktdaten'),
    description: tx('Gib deine Kontaktdaten ein, damit wir uns bei dir melden können.'),
    needs: ['vorname', 'nachname'],
  },
  {
    label: tx('Prüfen'),
    key: 'pruefen',
    heading: tx('Anfrage prüfen'),
  },
];

  const [step, setStep] = useState(1);

  const port = useMemo(() => createPublicPort(cfg, page), [cfg, page]);

  // Form: buchungen — resource field 'wohnung' must be listed here; 'gast' is
  // filled by the plan's link (references the gaeste step), but must be in
  // fields so the surface layer knows the form provides it.
  const buchungForm = useStepForm('buchungen', {
    fields: ['wohnung', 'gast', 'anreise', 'abreise', 'anzahl_personen'],
    required: { wohnung: true, anreise: true, abreise: true, anzahl_personen: true },
    steps: { wohnung: 1, anreise: 2, abreise: 2, anzahl_personen: 2 },
    autoComplete: true,
  });

  // Form: gaeste — visitor's own contact data
  const gastForm = useStepForm('gaeste', {
    fields: ['vorname', 'nachname', 'email', 'telefon'],
    required: { vorname: true, nachname: true },
    steps: { vorname: 3, nachname: 3, email: 3, telefon: 3 },
    autoComplete: true,
  });

  const wohnungId = buchungForm.get('wohnung') as string | null;

  // Load wohnungen (scoped to verfuegbar by endpoint)
  const wohnungSearch = useRecordSearch(port, 'wohnungen', {
    searchFields: ['name'],
    toItem: (r): WohnungItem => ({
      id: r.id,
      title: fieldText(r, 'name'),
    }),
  });

  // Occupancy for selected wohnung — useOccupancy applies the entity's rule
  // (resource=wohnung, freeKeys=['storniert']) and returns blocked nights.
  const occupancy = useOccupancy(port, 'buchungen', {
    resource: wohnungId ?? undefined,
  });

  const blocked = occupancy.blocked;

  const submit = useJourneySubmit(
    port,
    [
      { key: 'gast', entity: 'gaeste', form: gastForm },
      {
        key: 'buchung',
        entity: 'buchungen',
        form: buchungForm,
        primary: true,
        needs: ['gast'],
        link: { gast: 'gast' },
      },
    ],
    { draftKey: 'buchungsanfrage' }
  );

  function restart() {
    submit.reset();
    buchungForm.reset();
    gastForm.reset();
    setStep(1);
  }

  const selectedWohnungRecord = wohnungSearch.recordOf(wohnungId ?? '');

  return (
    <IntentWizardShell
      steps={STEPS}
      currentStep={step}
      onStepChange={setStep}
      back={false}
      forms={[buchungForm, gastForm]}
      draftKey="buchungsanfrage"
    >
      {/* Step 1 — Wohnung wählen */}
      {step === 1 && (
        <div className="space-y-4">
          {wohnungSearch.select.loading && (
            <p className="text-sm text-muted-foreground">{tx('Wohnungen werden geladen …')}</p>
          )}
          {wohnungSearch.select.error && (
            <p className="text-sm text-destructive">{wohnungSearch.select.error}</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {wohnungSearch.records.map((record) => (
              <WohnungCard
                key={record.id}
                record={record}
                selected={wohnungId === record.id}
                onSelect={() => {
                  buchungForm.set('wohnung', record.id, fieldText(record, 'name'));
                }}
              />
            ))}
          </div>
          {!wohnungSearch.select.loading && wohnungSearch.records.length === 0 && !wohnungSearch.select.error && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {tx('Derzeit sind keine Wohnungen verfügbar.')}
            </p>
          )}
          <StepNav
            onNext={() => buchungForm.validate(['wohnung'])}
            nextStepLabel={tx('Zeitraum')}
          />
        </div>
      )}

      {/* Step 2 — Zeitraum & Personen */}
      {step === 2 && (
        <div className="space-y-6">
          {selectedWohnungRecord && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-sm">
              <span className="font-medium">{fieldText(selectedWohnungRecord, 'name')}</span>
              {fieldNumber(selectedWohnungRecord, 'grundpreis_pro_nacht') !== null && (
                <span className="text-muted-foreground">
                  {(fieldNumber(selectedWohnungRecord, 'grundpreis_pro_nacht') ?? 0).toLocaleString('de-DE', {
                    style: 'currency',
                    currency: 'EUR',
                  })}{' '}
                  {tx('/ Nacht')}
                </span>
              )}
            </div>
          )}
          <div>
            <AvailabilityRangePicker
              {...buchungForm.range('anreise', 'abreise', { blocked, minNights: 1 })}
            />
          </div>
          <Bound form={buchungForm} name="anzahl_personen" />
          <StepNav
            onBack={() => setStep(1)}
            onNext={() =>
              buchungForm.validate(['anreise', 'abreise', 'anzahl_personen'])
            }
            nextStepLabel={tx('Kontakt')}
          />
        </div>
      )}

      {/* Step 3 — Kontaktdaten */}
      {step === 3 && (
        <div className="space-y-4">
          <Bound form={gastForm} name="vorname" />
          <Bound form={gastForm} name="nachname" />
          <Bound form={gastForm} name="email" />
          <Bound form={gastForm} name="telefon" />
          <StepNav
            onBack={() => setStep(2)}
            onNext={() => gastForm.validate(['vorname', 'nachname', 'email', 'telefon'])}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      )}

      {/* Step 4 — Zusammenfassung / Erfolg */}
      {step === 4 && !submit.result && (
        <SummaryStep
          forms={[buchungForm, gastForm]}
          submit={submit}
          whatHappensNext={tx(
            'Wir prüfen deine Anfrage und melden uns so schnell wie möglich bei dir.'
          )}
          confirmLabel={tx('Anfrage absenden')}
        />
      )}

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[buchungForm, gastForm]}
          whatHappensNext={tx(
            'Deine Anfrage ist bei uns eingegangen. Wir melden uns in Kürze per E-Mail oder Telefon.'
          )}
          next={[{ label: tx('Weitere Anfrage stellen'), onClick: restart }]}
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
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
        if (!c?.pages[SLUG]) setUnavailable(true);
      })
      .catch((err) => {
        if (err instanceof PageUnavailableError) setUnavailable(true);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PublicShell loading />;
  if (unavailable || !cfg || !page) return <PublicShell unavailable />;

  return (
    <PublicShell
      title={page.title}
      description={tx('Wähle eine Ferienwohnung, lege deinen Reisezeitraum fest und sende uns deine Anfrage.')}
    >
      <BuchungsanfrageWizard cfg={cfg} page={page} />
    </PublicShell>
  );
}
