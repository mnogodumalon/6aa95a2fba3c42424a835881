import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { tx } from '@/i18n';
import { Input } from '@/components/ui/input';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  occupancyFor,
  fieldNumber,
  fieldText,
  todayIso,
} from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { AvailabilityRangePicker } from '@/components/blocks/AvailabilityRangePicker';
import { Field } from '@/components/blocks/Field';
import type { SelectItem } from '@/components/blocks/EntitySelectStep';
import { format } from 'date-fns';

// ─── Wizard steps ───────────────────────────────────────────────────────────
// ─── Page inner (needs cfg + page) ──────────────────────────────────────────
function BuchungsanfrageInner({
  cfg,
  page,
}: {
  cfg: PublicPagesConfig;
  page: PublicPageConfig;
}) {
  const STEPS = [
  {
    label: tx('Wohnung'),
    heading: tx('Wohnung wählen'),
    description: tx('Wählen Sie eine verfügbare Wohnung aus.'),
  },
  {
    label: tx('Reisezeitraum'),
    heading: tx('Reisezeitraum & Personen'),
    description: tx('Wählen Sie An- und Abreise. Bereits belegte Nächte sind gesperrt.'),
  },
  {
    label: tx('Kontakt'),
    heading: tx('Kontaktdaten'),
    description: tx('Geben Sie Ihre persönlichen Daten ein.'),
  },
  {
    label: tx('Prüfen'),
    heading: tx('Zusammenfassung'),
  },
];

  const [step, setStep] = useState(1);
  const [selectedWohnungId, setSelectedWohnungId] = useState<string | null>(null);

  const port = useMemo(() => createPublicPort(cfg, page), [cfg, page]);

  // ── Forms ──
  // Gast form
  const gast = useStepForm('gaeste', {
    fields: ['vorname', 'nachname', 'email', 'telefon'],
    required: { vorname: true, nachname: true, email: false, telefon: false },
    steps: { vorname: 3, nachname: 3, email: 3, telefon: 3 },
    autoComplete: true,
  });

  // Buchung form — resource field `wohnung` must be in fields
  const buchung = useStepForm('buchungen', {
    fields: ['wohnung', 'buchungsnummer', 'anreise', 'abreise', 'anzahl_personen'],
    required: { wohnung: true, buchungsnummer: true, anreise: true, abreise: true, anzahl_personen: true },
    steps: { wohnung: 1, anreise: 2, abreise: 2, anzahl_personen: 2 },
    autoComplete: true,
  });

  // ── Plan ──
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
        values: () => ({
          buchungsnummer:
            'ANF-' +
            format(new Date(), 'yyyy-MM-dd') +
            '-' +
            Math.random().toString(36).slice(2, 7).toUpperCase(),
        }),
      },
    ],
    { draftKey: 'buchungsanfrage' },
  );

  // ── Load wohnungen ──
  const wohnungenSearch = useRecordSearch(port, 'wohnungen', {
    searchFields: ['name'],
    toItem: (r): SelectItem => ({
      id: r.id,
      title: fieldText(r, 'name'),
      subtitle: tx`${fieldNumber(r, 'schlafplaetze') ?? 0} Schlafplätze · ${fieldNumber(r, 'grundpreis_pro_nacht') ?? 0} €/Nacht`,
    }),
  });

  // ── Load buchungen for occupancy ──
  const buchungenSearch = useRecordSearch(port, 'buchungen', {
    searchFields: ['buchungsnummer'],
  });

  // ── Occupancy for selected apartment ──
  const blocked = useMemo(
    () =>
      occupancyFor('buchungen', buchungenSearch.records, {
        resource: selectedWohnungId,
      }),
    [buchungenSearch.records, selectedWohnungId],
  );

  // ── When wohnung selection changes keep form field + local state in sync ──
  function handleSelectWohnung(id: string) {
    setSelectedWohnungId(id);
    buchung.set('wohnung', id, wohnungenSearch.labelOf(id) ?? id);
    setStep(2);
  }

  // ── Restart ──
  function restart() {
    setSelectedWohnungId(null);
    gast.reset();
    buchung.reset();
    submit.reset();
    setStep(1);
  }

  // ── Selected apartment data for success screen ──
  const selectedWohnungRecord = selectedWohnungId
    ? wohnungenSearch.recordOf(selectedWohnungId)
    : undefined;
  const wohnungName = selectedWohnungRecord
    ? fieldText(selectedWohnungRecord, 'name')
    : (buchung.labels['wohnung'] ?? '');
  const fotoUrl = selectedWohnungRecord
    ? (selectedWohnungRecord.fields['foto'] as string | undefined) ?? null
    : null;

  // ── Render ──
  return (
    <IntentWizardShell
      steps={STEPS}
      currentStep={step}
      onStepChange={setStep}
      back={false}
      forms={[gast, buchung]}
      draftKey="buchungsanfrage"
    >
      {/* ── Step 1: Wohnung wählen ── */}
      {step === 1 && (
        <div className="space-y-4">
          {wohnungenSearch.select.loading && (
            <p className="text-sm text-muted-foreground">{tx('Wird geladen …')}</p>
          )}
          {!wohnungenSearch.select.loading && wohnungenSearch.select.items.length === 0 && (
            <p className="text-sm text-muted-foreground">{tx('Derzeit sind keine Wohnungen verfügbar.')}</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {wohnungenSearch.records.map((r) => {
              const name = fieldText(r, 'name');
              const schlafplaetze = fieldNumber(r, 'schlafplaetze') ?? 0;
              const preis = fieldNumber(r, 'grundpreis_pro_nacht') ?? 0;
              const reinigung = fieldNumber(r, 'endreinigung_preis');
              const foto = r.fields['foto'] as string | undefined;
              const beschreibung = fieldText(r, 'beschreibung');
              const ausstattungRaw = (r.fields['ausstattung'] ?? []) as Array<string | { key: string; label: string }>;
              const ausstattungKeys = ausstattungRaw.map((x) => (typeof x === 'string' ? x : x.key));
              const ausstattungLabels: Record<string, string> = {
                seeblick: 'Seeblick',
                kueche: 'Küche',
                wlan: 'WLAN',
                parkplatz: 'Parkplatz',
                haustiere_erlaubt: 'Haustiere erlaubt',
                balkon: 'Balkon',
              };
              const isSelected = selectedWohnungId === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelectWohnung(r.id)}
                  className={[
                    'rounded-xl border text-left transition-all focus-visible:ring-2',
                    isSelected
                      ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                      : 'border-border hover:border-primary/60 hover:bg-muted/30',
                  ].join(' ')}
                >
                  {foto && (
                    <img
                      src={foto}
                      alt={name}
                      className="w-full h-40 object-cover rounded-t-xl"
                    />
                  )}
                  <div className="p-4 space-y-1">
                    <p className="font-semibold text-sm">{name}</p>
                    {beschreibung && (
                      <p className="text-xs text-muted-foreground">{beschreibung}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {tx`${schlafplaetze} Schlafplätze`}
                    </p>
                    <p className="text-sm font-medium">
                      {tx`ab ${preis} €/Nacht`}
                    </p>
                    {reinigung != null && (
                      <p className="text-xs text-muted-foreground">
                        {tx`Endreinigung: ${reinigung} €`}
                      </p>
                    )}
                    {ausstattungKeys.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {ausstattungKeys.map((key) => (
                          <span
                            key={key}
                            className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {ausstattungLabels[key] ?? key}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {buchung.error('wohnung') && (
            <p className="text-sm text-destructive">{buchung.error('wohnung')}</p>
          )}
          <StepNav
            hideBack
            onNext={() => {
              if (!selectedWohnungId) {
                buchung.validate(['wohnung']);
                return false;
              }
              setStep(2);
            }}
            nextStepLabel={tx('Reisezeitraum')}
          />
        </div>
      )}

      {/* ── Step 2: Reisezeitraum & Personen ── */}
      {step === 2 && (
        <div className="space-y-6">
          <AvailabilityRangePicker
            {...buchung.range('anreise', 'abreise', { blocked })}
          />
          <Field form={buchung} name="anzahl_personen" label={tx('Anzahl Personen')}>
            <Input {...buchung.number('anzahl_personen')} min={1} />
          </Field>
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => {
              const ok = buchung.validate(['anreise', 'abreise', 'anzahl_personen']);
              return ok || false;
            }}
            nextStepLabel={tx('Kontakt')}
          />
        </div>
      )}

      {/* ── Step 3: Kontaktdaten ── */}
      {step === 3 && (
        <div className="space-y-4">
          <Field form={gast} name="vorname" label={tx('Vorname')}>
            <Input {...gast.field('vorname')} placeholder={tx('Max')} />
          </Field>
          <Field form={gast} name="nachname" label={tx('Nachname')}>
            <Input {...gast.field('nachname')} placeholder={tx('Mustermann')} />
          </Field>
          <Field form={gast} name="email" label={tx('E-Mail')}>
            <Input {...gast.field('email')} placeholder={tx('max@beispiel.de')} />
          </Field>
          <Field form={gast} name="telefon" label={tx('Telefon')}>
            <Input {...gast.field('telefon')} placeholder={tx('+49 …')} />
          </Field>
          <StepNav
            onBack={() => setStep(2)}
            onNext={() => {
              const ok = gast.validate(['vorname', 'nachname']);
              return ok || false;
            }}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      )}

      {/* ── Step 4: Zusammenfassung + Absenden ── */}
      {step === 4 && !submit.result && (
        <SummaryStep
          forms={[buchung, gast]}
          submit={submit}
          whatHappensNext={tx(
            'Wir prüfen Ihre Anfrage und melden uns innerhalb von 24 Stunden per E-Mail.',
          )}
          confirmLabel={tx('Anfrage absenden')}
        />
      )}

      {/* ── Erfolg ── */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[buchung, gast]}
          title={tx('Anfrage eingegangen!')}
          whatHappensNext={tx(
            'Ihre Buchungsanfrage wurde übermittelt. Das Team meldet sich in Kürze.',
          )}
          facts={[
            ...(wohnungName ? [{ label: tx('Wohnung'), value: wohnungName }] : []),
          ]}
          submit={submit}
          restartLabel={tx('Neue Anfrage')}
          next={[{ label: tx('Neue Anfrage'), onClick: restart }]}
        />
      )}
    </IntentWizardShell>
  );
}

// ─── Page root ───────────────────────────────────────────────────────────────
export default function Buchungsanfrage() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    loadPublicPagesConfig('buchungsanfrage')
      .then((c) => {
        setCfg(c);
        setPage(c?.pages['buchungsanfrage'] ?? null);
        if (!c?.pages['buchungsanfrage']) setUnavailable(true);
      })
      .catch((err) => {
        if (err instanceof PageUnavailableError) setUnavailable(true);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || unavailable || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={unavailable && !loading} />;
  }

  return (
    <PublicShell
      title={tx('Buchungsanfrage')}
      description={tx('Wählen Sie eine Wohnung, Ihren Reisezeitraum und senden Sie uns Ihre Anfrage.')}
    >
      <BuchungsanfrageInner cfg={cfg} page={page} />
    </PublicShell>
  );
}
