import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  PageUnavailableError,
  prepareChallenge,
  type PublicPageConfig,
  type PublicPagesConfig,
} from '@/lib/publicClient';
import { tx } from '@/i18n';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  useOccupancy,
  type JourneyRecord,
} from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { IntentWizardShell, type WizardStep } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { EntitySelectStep, type SelectItem } from '@/components/blocks/EntitySelectStep';
import { AvailabilityRangePicker } from '@/components/blocks/AvailabilityRangePicker';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { IconHome, IconBed, IconCurrencyEuro } from '@tabler/icons-react';

const SLUG = 'buchungsanfrage';

interface WohnungItem extends SelectItem {
  schlafplaetze: number | null;
  grundpreis: number | null;
}

export default function Buchungsanfrage() {
  const STEPS: WizardStep[] = [
  {
    label: tx('Wohnung'),
    heading: tx('Wohnung wählen'),
    description: tx('Wähle die passende Ferienwohnung für deinen Aufenthalt.'),
  },
  {
    label: tx('Reisedaten'),
    heading: tx('Reisedaten & Personen'),
    description: tx('An- und Abreise wählen — belegte Nächte sind bereits markiert.'),
  },
  {
    label: tx('Kontakt'),
    heading: tx('Deine Kontaktdaten'),
    description: tx('Damit wir deine Anfrage bestätigen können.'),
  },
  {
    label: tx('Übersicht'),
    heading: tx('Alles richtig?'),
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
        if (!c?.pages[SLUG]) setUnavailable(true);
      })
      .catch(err => {
        if (err instanceof PageUnavailableError) setUnavailable(true);
        setLoading(false);
      });
  }, []);

  // ALL hooks before any early return
  const port = useMemo(
    () => (cfg && page ? createPublicPort(cfg, page) : null),
    [cfg, page],
  );

  const wohnungenSearch = useRecordSearch<'wohnungen', WohnungItem>(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    port!,
    'wohnungen',
    {
      searchFields: ['name'],
      filter: "r.v_status == 'verfuegbar'",
      toItem: (r): WohnungItem => ({
        id: r.id,
        title: (r.fields.name as string) ?? '',
        subtitle: (() => {
          const beds = r.fields.schlafplaetze as number | null;
          const price = r.fields.grundpreis_pro_nacht as number | null;
          const parts: string[] = [];
          if (beds != null) parts.push(tx`${beds} Schlafplätze`);
          if (price != null)
            parts.push(
              new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(price) +
                ' / Nacht',
            );
          return parts.join(' · ');
        })(),
        icon: <IconHome size={20} className="shrink-0 text-muted-foreground" />,
        schlafplaetze: (r.fields.schlafplaetze as number) ?? null,
        grundpreis: (r.fields.grundpreis_pro_nacht as number) ?? null,
      }),
    },
  );

  const gast = useStepForm('gaeste', {
    fields: ['vorname', 'nachname', 'email', 'telefon'],
    required: { vorname: true, nachname: true, email: false, telefon: false },
    steps: { vorname: 3, nachname: 3, email: 3, telefon: 3 },
    autoComplete: true,
  });

  const buchung = useStepForm('buchungen', {
    fields: ['wohnung', 'anreise', 'abreise', 'anzahl_personen'],
    required: { wohnung: true, anreise: true, abreise: true, anzahl_personen: true },
    steps: { wohnung: 1, anreise: 2, abreise: 2, anzahl_personen: 2 },
    autoComplete: true,
  });

  const selectedWohnungId = buchung.get('wohnung') as string | null;

  const occupancy = useOccupancy(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    port!,
    'buchungen',
    { resource: selectedWohnungId ?? undefined },
  );

  const submit = useJourneySubmit(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    port!,
    [
      { key: 'gast', entity: 'gaeste', form: gast },
      {
        key: 'buchung',
        entity: 'buchungen',
        form: buchung,
        primary: true,
        needs: ['gast'],
        link: { gast: 'gast' },
      },
    ],
    { draftKey: 'buchungsanfrage' },
  );

  if (loading || unavailable || !cfg || !page || !port) {
    return <PublicShell loading={loading} unavailable={unavailable && !loading} />;
  }

  const wohnungLabel =
    selectedWohnungId ? (wohnungenSearch.labelOf(selectedWohnungId) ?? '') : '';

  function handleWohnungSelect(id: string) {
    const rec = wohnungenSearch.recordOf(id);
    const label = wohnungenSearch.labelOf(id) ?? (rec ? ((rec.fields.name as string) ?? '') : '');
    buchung.set('wohnung', id, label);
    prepareChallenge(cfg!, page!, 'POST', `/apps/${page!.endpoints?.find(e => e.op === 'create' && e.entity === 'gaeste')?.app_id}/records`);
    setStep(2);
  }

  function handleRestart() {
    submit.reset();
    gast.reset();
    buchung.reset();
    setStep(1);
  }

  return (
    <PublicShell
      title={tx('Buchungsanfrage')}
      description={tx('Stelle eine Anfrage für eine Ferienwohnung — wir melden uns schnellstmöglich bei dir.')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[gast, buchung]}
        draftKey="buchungsanfrage"
        loading={!wohnungenSearch.select.loading ? false : step === 1}
        error={wohnungenSearch.select.error ? new Error(wohnungenSearch.select.error) : null}
      >
        {/* Schritt 1: Wohnung wählen */}
        {step === 1 && !submit.done && (
          <div className="space-y-4">
            <EntitySelectStep
              {...wohnungenSearch.select}
              id={buchung.fieldId('wohnung')}
              invalid={buchung.error('wohnung') != null}
              selectedId={selectedWohnungId}
              onSelect={handleWohnungSelect}
              avatar="none"
              columns={1}
              searchPlaceholder={tx('Wohnung suchen ...')}
              emptyIcon={<IconHome size={40} className="text-muted-foreground" />}
              emptyText={tx('Keine verfügbaren Wohnungen gefunden.')}
            />
            {!selectedWohnungId && (
              <StepNav
                hideBack
                onNext={() => buchung.validate(['wohnung'])}
                nextStepLabel={tx('Reisedaten')}
              />
            )}
          </div>
        )}

        {/* Schritt 2: Reisedaten & Personen */}
        {step === 2 && !submit.done && (
          <div className="space-y-5">
            {selectedWohnungId && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <IconHome size={16} className="shrink-0 text-muted-foreground" />
                <span className="font-medium">{wohnungLabel}</span>
                <button
                  type="button"
                  className="ml-auto text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => setStep(1)}
                >
                  {tx('Ändern')}
                </button>
              </div>
            )}

            {selectedWohnungId && (
              <>
                {occupancy.loading ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    {tx('Belegungskalender wird geladen ...')}
                  </div>
                ) : (
                  <Field form={buchung} name="anreise" label={tx('An- & Abreise')}>
                    <AvailabilityRangePicker
                      {...buchung.range('anreise', 'abreise', {
                        blocked: occupancy.blocked,
                        minNights: 1,
                        unit: 'nights',
                      })}
                    />
                  </Field>
                )}

                <Field form={buchung} name="anzahl_personen">
                  <div className="flex items-center gap-3">
                    <IconBed size={16} className="shrink-0 text-muted-foreground" />
                    <input
                      {...buchung.number('anzahl_personen')}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="2"
                    />
                  </div>
                </Field>

                {(() => {
                  const selectedRec = wohnungenSearch.recordOf(selectedWohnungId);
                  const beds = selectedRec
                    ? (selectedRec.fields.schlafplaetze as number | null)
                    : null;
                  const price = selectedRec
                    ? (selectedRec.fields.grundpreis_pro_nacht as number | null)
                    : null;
                  if (beds == null && price == null) return null;
                  return (
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      {beds != null && (
                        <span className="flex items-center gap-1">
                          <IconBed size={14} className="shrink-0" />
                          {tx`${beds} Schlafplätze`}
                        </span>
                      )}
                      {price != null && (
                        <span className="flex items-center gap-1">
                          <IconCurrencyEuro size={14} className="shrink-0" />
                          {new Intl.NumberFormat('de-DE', {
                            style: 'currency',
                            currency: 'EUR',
                          }).format(price)}
                          {' / '}
                          {tx('Nacht')}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </>
            )}

            <StepNav
              onBack={() => setStep(1)}
              onNext={() => buchung.validate(['anreise', 'abreise', 'anzahl_personen'])}
              nextStepLabel={tx('Kontaktdaten')}
            />
          </div>
        )}

        {/* Schritt 3: Gast-Kontaktdaten */}
        {step === 3 && !submit.done && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Bound form={gast} name="vorname" />
              <Bound form={gast} name="nachname" />
            </div>
            <Bound form={gast} name="email" />
            <Bound form={gast} name="telefon" />

            <StepNav
              onBack={() => setStep(2)}
              onNext={() => gast.validate(['vorname', 'nachname'])}
              nextStepLabel={tx('Überprüfen')}
            />
          </div>
        )}

        {/* Schritt 4: Zusammenfassung & Absenden */}
        {step === 4 && !submit.done && (
          <SummaryStep
            forms={[buchung, gast]}
            submit={submit}
            whatHappensNext={tx('Wir prüfen deine Anfrage und melden uns innerhalb von 24 Stunden per E-Mail oder Telefon.')}
            confirmLabel={tx('Anfrage absenden')}
          />
        )}

        {/* Erfolg */}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[buchung, gast]}
            whatHappensNext={tx('Wir prüfen deine Anfrage und melden uns innerhalb von 24 Stunden per E-Mail oder Telefon bei dir.')}
            next={[{ label: tx('Neue Anfrage stellen'), onClick: handleRestart }]}
            referencePrefix="B"
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
