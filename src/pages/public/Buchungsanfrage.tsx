import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { AvailabilityRangePicker } from '@/components/blocks/AvailabilityRangePicker';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  loadPublicPagesConfig,
  PageUnavailableError,
  prepareChallenge,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  occupancyFor,
  type JourneyRecord,
} from '@/lib/journey';
import { tx } from '@/i18n';
import { Input } from '@/components/ui/input';
import {
  IconHome,
  IconCalendar,
  IconUser,
  IconCheck,
} from '@tabler/icons-react';

const SLUG = 'buchungsanfrage';

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
    key: 'wohnung',
    heading: tx('Wohnung wählen'),
    description: tx('Wähle eine verfügbare Ferienwohnung am Chiemsee.'),
  },
  {
    label: tx('Zeitraum'),
    key: 'zeitraum',
    heading: tx('An- und Abreise'),
    description: tx('Wähle deinen Aufenthaltszeitraum — belegte Nächte sind markiert und nicht auswählbar.'),
  },
  {
    label: tx('Kontakt'),
    key: 'kontakt',
    heading: tx('Deine Kontaktdaten'),
    description: tx('Damit wir deine Anfrage bearbeiten und bestätigen können.'),
  },
  {
    label: tx('Prüfen'),
    key: 'zusammenfassung',
    heading: tx('Zusammenfassung'),
  },
];

  const [step, setStep] = useState(1);

  const port = useMemo(() => createPublicPort(cfg, page), [cfg, page]);

  // Form für Buchungsdaten
  const buchung = useStepForm('buchungen', {
    fields: ['wohnung', 'anreise', 'abreise', 'anzahl_personen'],
    required: { wohnung: true, anreise: true, abreise: true, anzahl_personen: true },
    steps: { wohnung: 1, anreise: 2, abreise: 2, anzahl_personen: 2 },
    autoComplete: true,
  });

  // Form für Gastdaten
  const gast = useStepForm('gaeste', {
    fields: ['vorname', 'nachname', 'email', 'telefon'],
    required: { vorname: true, nachname: true },
    steps: { vorname: 3, nachname: 3, email: 3, telefon: 3 },
    autoComplete: true,
  });

  // Wohnungen laden
  const wohnungenSearch = useRecordSearch(port, 'wohnungen', {
    searchFields: ['name', 'beschreibung'],
    toItem: (r) => ({
      id: r.id,
      title: (r.fields.name as string) ?? '',
      subtitle: [
        r.fields.schlafplaetze != null
          ? tx`${r.fields.schlafplaetze as number} Schlafplätze`
          : null,
        r.fields.grundpreis_pro_nacht != null
          ? tx`ab ${(r.fields.grundpreis_pro_nacht as number).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} / Nacht`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
    }),
  });

  // Belegungen laden (nur für Verfügbarkeitsprüfung — kein Suchfeld benötigt)
  const buchungenSearch = useRecordSearch(port, 'buchungen', {
    searchFields: ['buchungsnummer'],
  });

  const pickedWohnungId = buchung.get('wohnung') as string | null;

  // Belegung berechnen (per gewählter Wohnung)
  const blocked = useMemo(
    () =>
      occupancyFor('buchungen', buchungenSearch.records, {
        resource: pickedWohnungId ?? undefined,
      }),
    [buchungenSearch.records, pickedWohnungId],
  );

  // Plan: erst Gast anlegen, dann Buchung verlinken
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
      },
    ],
    { draftKey: 'buchungsanfrage' },
  );

  // Challenge vorbereiten sobald Benutzer die Seite öffnet
  useEffect(() => {
    const ep = page.endpoints?.find(
      (e) => e.entity === 'buchungen' && e.op === 'create',
    );
    if (ep?.app_id) {
      prepareChallenge(cfg, page, 'POST', `/apps/${ep.app_id}/records`);
    }
  }, [cfg, page]);

  const restart = () => {
    submit.reset();
    buchung.reset();
    gast.reset();
    setStep(1);
  };

  return (
    <IntentWizardShell
      steps={STEPS}
      currentStep={step}
      onStepChange={setStep}
      back={false}
      forms={[buchung, gast]}
      draftKey="buchungsanfrage"
    >
      {/* Schritt 1: Wohnung wählen */}
      {step === 1 && (
        <>
          <EntitySelectStep
            {...wohnungenSearch.select}
            avatar="none"
            columns={1}
            selectedId={pickedWohnungId}
            searchPlaceholder={tx('Wohnung suchen …')}
            emptyIcon={<IconHome size={40} className="text-muted-foreground" />}
            emptyText={tx('Keine verfügbaren Wohnungen gefunden.')}
            onSelect={(id) => {
              buchung.set('wohnung', id, wohnungenSearch.labelOf(id) ?? id);
            }}
          />
          <StepNav
            hideBack
            nextDisabled={!pickedWohnungId}
            onNext={() => {
              if (!pickedWohnungId) return tx('Bitte eine Wohnung auswählen.');
            }}
            nextStepLabel={tx('Zeitraum')}
          />
        </>
      )}

      {/* Schritt 2: Zeitraum */}
      {step === 2 && (
        <>
          <AvailabilityRangePicker
            {...buchung.range('anreise', 'abreise', { blocked, minNights: 1 })}
          />

          <Field form={buchung} name="anzahl_personen" className="mt-4">
            <Input
              {...buchung.number('anzahl_personen')}
              placeholder={tx('z. B. 2')}
            />
          </Field>

          <StepNav
            onBack={() => setStep(1)}
            onNext={() => {
              const ok = buchung.validate(['anreise', 'abreise', 'anzahl_personen']);
              if (!ok) return false;
            }}
            nextStepLabel={tx('Kontakt')}
          />
        </>
      )}

      {/* Schritt 3: Kontaktdaten */}
      {step === 3 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field form={gast} name="vorname">
              <Input {...gast.field('vorname')} placeholder={tx('Dein Vorname')} />
            </Field>
            <Field form={gast} name="nachname">
              <Input {...gast.field('nachname')} placeholder={tx('Dein Nachname')} />
            </Field>
          </div>

          <Field form={gast} name="email" className="mt-4">
            <Input {...gast.field('email')} placeholder={tx('deine@email.de')} />
          </Field>

          <Field form={gast} name="telefon" className="mt-4">
            <Input {...gast.field('telefon')} placeholder={tx('+49 …')} />
          </Field>

          <StepNav
            onBack={() => setStep(2)}
            onNext={() => {
              const ok = gast.validate(['vorname', 'nachname', 'email', 'telefon']);
              if (!ok) return false;
            }}
            nextStepLabel={tx('Zusammenfassung')}
          />
        </>
      )}

      {/* Schritt 4: Zusammenfassung + Absenden */}
      {step === 4 && !submit.done && (
        <SummaryStep
          forms={[buchung, gast]}
          submit={submit}
          whatHappensNext={tx(
            'Wir prüfen deine Anfrage und melden uns innerhalb von 24 Stunden per E-Mail bei dir.',
          )}
          confirmLabel={tx('Anfrage absenden')}
        />
      )}

      {/* Erfolgsmeldung */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[buchung, gast]}
          title={tx('Anfrage eingegangen!')}
          whatHappensNext={tx(
            'Wir haben deine Buchungsanfrage erhalten und melden uns innerhalb von 24 Stunden bei dir.',
          )}
          submit={submit}
          restartLabel={tx('Weitere Anfrage stellen')}
          next={[
            {
              label: tx('Weitere Anfrage stellen'),
              onClick: restart,
              icon: <IconCalendar size={16} />,
            },
          ]}
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
        else setUnavailable(true);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || unavailable || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading && (unavailable || !page)} />;
  }

  return (
    <PublicShell
      title={tx('Buchungsanfrage')}
      description={tx('Ferienwohnung am Chiemsee — wähle deine Wunschunterkunft und teile uns deinen Reisezeitraum mit.')}
    >
      <BuchungsanfrageInner cfg={cfg} page={page} />
    </PublicShell>
  );
}
