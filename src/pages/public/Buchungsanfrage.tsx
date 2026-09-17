import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  PageUnavailableError,
  type PublicPageConfig,
  type PublicPagesConfig,
  type PublicRecordResult,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  fieldLookup,
  fieldLookups,
  fieldNumber,
  fieldText,
  occupancyFor,
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  type JourneyRecord,
} from '@/lib/journey';
import { IntentWizardShell, type WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { AvailabilityRangePicker } from '@/components/blocks/AvailabilityRangePicker';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { tx } from '@/i18n';

const SLUG = 'buchungsanfrage';

interface WohnungItem {
  id: string;
  title: string;
  subtitle?: string;
  stats?: { label: string; value: string | number }[];
  icon?: undefined;
}

function formatCurrency(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export default function Buchungsanfrage() {
  const STEPS: WizardStep[] = [
  {
    label: tx('Wohnung wählen'),
    key: 'wohnung',
    description: tx('Wähle eine verfügbare Ferienwohnung.'),
  },
  {
    label: tx('Reisezeitraum'),
    key: 'zeitraum',
    description: tx('Wähle An- und Abreise. Belegte Nächte sind markiert und nicht wählbar.'),
  },
  {
    label: tx('Kontaktdaten'),
    key: 'kontakt',
    description: tx('Deine Kontaktdaten für die Buchungsanfrage.'),
  },
  {
    label: tx('Zusammenfassung'),
    key: 'zusammenfassung',
  },
];

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [step, setStep] = useState(1);

  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then(c => {
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
        setLoading(false);
      })
      .catch(err => {
        if (err instanceof PageUnavailableError) setUnavailable(true);
        setLoading(false);
      });
  }, []);

  // ALL hooks before early returns
  const port = useMemo(
    () => (cfg && page ? createPublicPort(cfg, page) : null),
    [cfg, page],
  );

  // Wohnungen search
  const wohnungSearch = useRecordSearch(
    port ?? { door: 'public', list: async () => [], count: async () => null, get: async () => null, create: async () => { throw new Error(); }, ref: () => '' },
    'wohnungen',
    {
      searchFields: ['name'],
      toItem: (record): WohnungItem => {
        const ausstattung = fieldLookups(record, 'ausstattung').map(l => l.label).join(', ');
        const preis = fieldNumber(record, 'grundpreis_pro_nacht');
        const schlafplaetze = fieldNumber(record, 'schlafplaetze');
        return {
          id: record.id,
          title: fieldText(record, 'name'),
          subtitle: ausstattung || undefined,
          stats: [
            { label: tx('pro Nacht'), value: formatCurrency(preis) },
            { label: tx('Schlafplätze'), value: schlafplaetze ?? '—' },
          ],
        };
      },
    },
  );

  // Buchungen records for occupancy
  const buchungSearch = useRecordSearch(
    port ?? { door: 'public', list: async () => [], count: async () => null, get: async () => null, create: async () => { throw new Error(); }, ref: () => '' },
    'buchungen',
    { searchFields: ['buchungsnummer'] },
  );

  // Gast form (step 3)
  const gastForm = useStepForm('gaeste', {
    fields: ['vorname', 'nachname', 'email', 'telefon'],
    required: { vorname: true, nachname: true, email: false, telefon: false },
    steps: { vorname: 3, nachname: 3, email: 3, telefon: 3 },
    autoComplete: true,
  });

  // Buchung form (steps 1, 2)
  const buchungForm = useStepForm('buchungen', {
    fields: ['wohnung', 'anreise', 'abreise', 'anzahl_personen', 'gesamtpreis', 'gast'],
    required: { wohnung: true, anreise: true, abreise: true, anzahl_personen: true, gesamtpreis: false, gast: false },
    steps: { wohnung: 1, anreise: 2, abreise: 2, anzahl_personen: 2 },
    autoComplete: true,
  });

  const submit = useJourneySubmit(
    port ?? { door: 'public', list: async () => [], count: async () => null, get: async () => null, create: async () => { throw new Error(); }, ref: () => '' },
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
    { draftKey: 'buchungsanfrage' },
  );

  if (loading) return <PublicShell loading />;
  if (unavailable || !cfg || !page || !port) return <PublicShell unavailable />;

  // Derive selected wohnung record
  const selectedWohnungId = buchungForm.get('wohnung') as string | null;
  const selectedWohnungRecord = selectedWohnungId
    ? wohnungSearch.recordOf(selectedWohnungId) ?? null
    : null;

  // Occupancy: all loaded buchungen, filtered to the selected wohnung
  const blocked = occupancyFor('buchungen', buchungSearch.records, {
    resource: selectedWohnungId ?? null,
  });

  // Derived pricing
  const anreise = buchungForm.get('anreise') as string | null;
  const abreise = buchungForm.get('abreise') as string | null;
  let nights = 0;
  if (anreise && abreise) {
    const a = new Date(anreise);
    const b = new Date(abreise);
    nights = Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
  }
  const grundpreis = selectedWohnungRecord
    ? (fieldNumber(selectedWohnungRecord, 'grundpreis_pro_nacht') ?? 0)
    : 0;
  const endreinigung = selectedWohnungRecord
    ? (fieldNumber(selectedWohnungRecord, 'endreinigung_preis') ?? 0)
    : 0;
  const gesamtpreis = nights * grundpreis + endreinigung;

  const schlafplaetze = selectedWohnungRecord
    ? (fieldNumber(selectedWohnungRecord, 'schlafplaetze') ?? 1)
    : 10;

  // Sync gesamtpreis into buchungForm whenever it changes
  const currentGesamtpreis = buchungForm.get('gesamtpreis') as number | null;
  if (gesamtpreis !== currentGesamtpreis && nights > 0) {
    buchungForm.set('gesamtpreis', gesamtpreis);
  }

  const handleWohnungSelect = (id: string) => {
    buchungForm.set('wohnung', id, wohnungSearch.labelOf(id));
    setStep(2);
  };

  const handleRestart = () => {
    submit.reset();
    gastForm.reset();
    buchungForm.reset();
    setStep(1);
  };

  return (
    <PublicShell
      title={page.title}
      description={page.description ?? tx('Wähle deine Wunschferienwohnung und sende uns deine Buchungsanfrage — wir melden uns schnellstmöglich bei dir.')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[buchungForm, gastForm]}
        draftKey="buchungsanfrage"
      >
        {/* Step 1 — Wohnung wählen */}
        {step === 1 && !submit.done && (
          <>
            <EntitySelectStep
              {...wohnungSearch.select}
              avatar="none"
              columns={1}
              selectedId={selectedWohnungId}
              onSelect={handleWohnungSelect}
              emptyText={tx('Keine verfügbaren Wohnungen gefunden.')}
              searchPlaceholder={tx('Wohnung suchen …')}
            />
            {/* Apartment photo below the list when one is selected */}
            {selectedWohnungRecord && (() => {
              const foto = selectedWohnungRecord.fields['foto'] as string | null | undefined;
              const ausstattungItems = fieldLookups(selectedWohnungRecord, 'ausstattung');
              return foto ? (
                <div className="mt-4 space-y-3">
                  <img
                    src={foto}
                    alt={fieldText(selectedWohnungRecord, 'name')}
                    className="w-full rounded-lg object-cover max-h-56"
                  />
                  {ausstattungItems.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {ausstattungItems.map(a => (
                        <StatusBadge key={a.key} statusKey={a.key} label={a.label} tone="info" />
                      ))}
                    </div>
                  )}
                </div>
              ) : ausstattungItems.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {ausstattungItems.map(a => (
                    <StatusBadge key={a.key} statusKey={a.key} label={a.label} tone="info" />
                  ))}
                </div>
              ) : null;
            })()}
            <StepNav
              onNext={() => buchungForm.validate(['wohnung'])}
              nextStepLabel={tx('Reisezeitraum')}
              hideBack
            />
          </>
        )}

        {/* Step 2 — Reisezeitraum & Personen */}
        {step === 2 && !submit.done && (
          <>
            {selectedWohnungRecord && (
              <p className="text-sm text-muted-foreground mb-3">
                {fieldText(selectedWohnungRecord, 'name')}
                {' · '}
                {formatCurrency(fieldNumber(selectedWohnungRecord, 'grundpreis_pro_nacht'))}
                {tx(' / Nacht')}
              </p>
            )}
            <AvailabilityRangePicker
              {...buchungForm.range('anreise', 'abreise', { blocked })}
              months={2}
              unit="nights"
            />
            <div className="mt-5">
              <Bound
                form={buchungForm}
                name="anzahl_personen"
                hint={schlafplaetze > 0 ? tx`Maximal ${schlafplaetze} Personen` : undefined}
              />
            </div>
            {nights > 0 && (
              <div className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span>{tx`${nights} Nächte × ${formatCurrency(grundpreis)}`}</span>
                  <span>{formatCurrency(nights * grundpreis)}</span>
                </div>
                {endreinigung > 0 && (
                  <div className="flex justify-between">
                    <span>{tx('Endreinigung')}</span>
                    <span>{formatCurrency(endreinigung)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                  <span>{tx('Gesamt')}</span>
                  <span>{formatCurrency(gesamtpreis)}</span>
                </div>
              </div>
            )}
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => buchungForm.validate(['anreise', 'abreise', 'anzahl_personen'])}
              nextStepLabel={tx('Kontaktdaten')}
            />
          </>
        )}

        {/* Step 3 — Kontaktdaten */}
        {step === 3 && !submit.done && (
          <>
            <Bound form={gastForm} name="vorname" />
            <Bound form={gastForm} name="nachname" />
            <Bound form={gastForm} name="email" />
            <Bound form={gastForm} name="telefon" />
            <StepNav
              onBack={() => setStep(2)}
              onNext={() => gastForm.validate(['vorname', 'nachname', 'email', 'telefon'])}
              nextStepLabel={tx('Zusammenfassung')}
            />
          </>
        )}

        {/* Step 4 — Zusammenfassung & Absenden */}
        {step === 4 && !submit.done && (
          <SummaryStep
            forms={[buchungForm, gastForm]}
            submit={submit}
            whatHappensNext={tx('Wir prüfen die Verfügbarkeit und melden uns so schnell wie möglich bei dir.')}
            items={
              gesamtpreis > 0
                ? [{ key: 'gesamtpreis', label: tx('Gesamtpreis (geschätzt)'), value: formatCurrency(gesamtpreis) }]
                : []
            }
          />
        )}

        {/* Success */}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[buchungForm, gastForm]}
            whatHappensNext={tx('Ihre Buchungsanfrage wurde erfolgreich gesendet. Das Team wird sich schnellstmöglich bei dir melden.')}
            next={[{ label: tx('Weitere Anfrage stellen'), onClick: handleRestart }]}
            submit={submit}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
