/**
 * Neue Buchung — 4-Schritt-Wizard.
 * Steps: 1) Wohnung wählen → 2) Zeitraum & Personen → 3) Gast wählen → 4) Prüfen & anlegen.
 * Reads: wohnungen (verfügbare), buchungen (Belegung), gaeste.
 * Writes: buchungen (createBuchungenEntry).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, AvailabilityRangePicker,
 *           Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { AvailabilityRangePicker } from '@/components/blocks/AvailabilityRangePicker';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  useRecordSearch,
  useOccupancy,
  useStepForm,
  useJourneySubmit,
  fieldText,
  fieldNumber,
  fieldLookup,
  todayIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function NeueBuchungPage() {
  const [step, setStep] = useState(1);

  // Step 1: Wohnungen — nur verfügbare
  const wohnungen = useRecordSearch(servicePort, 'wohnungen', {
    filter: "r.v_status == 'verfuegbar'", /* i18n-exempt */
    where: r => fieldLookup(r, 'status')?.key === 'verfuegbar',
    searchFields: ['name'],
    toItem: w => ({
      id: w.id,
      title: fieldText(w, 'name'),
      subtitle: [
        fieldNumber(w, 'schlafplaetze') != null
          ? tx`${fieldNumber(w, 'schlafplaetze')} Schlafplätze`
          : null,
        fieldNumber(w, 'grundpreis_pro_nacht') != null
          ? tx`${fieldNumber(w, 'grundpreis_pro_nacht')} €/Nacht`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      status: fieldLookup(w, 'status') ?? undefined,
    }),
  });

  // Step 3: Gäste — alle qualifizieren
  const gaeste = useRecordSearch(servicePort, 'gaeste', {
    searchFields: ['vorname', 'nachname', 'email'],
    toItem: g => ({
      id: g.id,
      title: `${fieldText(g, 'vorname')} ${fieldText(g, 'nachname')}`.trim(),
      subtitle: fieldText(g, 'email') || undefined,
    }),
    orderby: ['r.v_nachname asc'],
  });

  // Haupt-Formular für buchungen
  const buchung = useStepForm('buchungen', {
    steps: {
      wohnung: 1,
      anreise: 2,
      abreise: 2,
      anzahl_personen: 2,
      gast: 3,
    },
    // buchungsnummer und status werden vom Plan gesetzt
    required: { buchungsnummer: false, status: false },
    initial: { anzahl_personen: '' },
  });

  // Belegung für die gewählte Wohnung (storniert = frei)
  const wohnungId = buchung.get('wohnung') as string | undefined;
  const belegung = useOccupancy(servicePort, 'buchungen', { resource: wohnungId ?? null });

  const anreise = buchung.get('anreise') as string | null;
  const abreise = buchung.get('abreise') as string | null;

  // Buchungsnummer: B-YYYY-NNN — wird zur Laufzeit generiert
  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'buchung',
        entity: 'buchungen',
        form: buchung,
        primary: true,
        values: (_ctx) => {
          const today = todayIso(); // yyyy-MM-dd
          const year = today.slice(0, 4);
          const rand = Math.floor(100 + Math.random() * 900); // 3-stellig
          return {
            status: 'anfrage',
            buchungsnummer: `B-${year}-${rand}`,
          };
        },
      },
    ],
    { draftKey: 'neue-buchung' }
  );

  const wohnungRecord = wohnungId ? wohnungen.recordOf(wohnungId) : undefined;
  const wohnungName = wohnungId
    ? wohnungen.labelOf(wohnungId) ?? fieldText(wohnungRecord!, 'name')
    : undefined;

  return (
    <IntentWizardShell
      title={tx('Neue Buchung')}
      currentStep={step}
      onStepChange={setStep}
      forms={[buchung]}
      draftKey="neue-buchung"
      intro={{
        description: tx('Wohnung und Gast in einem Schritt erfassen — die Buchung wird sofort angelegt.'),
        needs: [tx('Name der Wohnung'), tx('Reisedaten'), tx('Name des Gastes')],
      }}
    >
      {/* Schritt 1: Wohnung wählen */}
      <WizardStep
        label={tx('Wohnung')}
        description={tx('Verfügbare Wohnung auswählen.')}
      >
        <EntitySelectStep
          {...wohnungen.select}
          selectedId={buchung.get('wohnung') as string | undefined}
          avatar="none"
          emptyText={tx('Keine verfügbare Wohnung gefunden. Bitte prüfe den Status der Wohnungen.')}
          create={false}
          searchPlaceholder={tx('Wohnung suchen …')}
          onSelect={id => {
            buchung.set('wohnung', id, wohnungen.labelOf(id));
            setStep(2);
          }}
        />
      </WizardStep>

      {/* Schritt 2: Zeitraum & Personen */}
      <WizardStep
        label={tx('Zeitraum')}
        description={tx('An- und Abreise wählen — belegte Nächte sind ausgegraut.')}
        needs={['wohnung']}
      >
        <div className="space-y-6">
          <AvailabilityRangePicker
            {...buchung.range('anreise', 'abreise', {
              blocked: belegung.blocked,
              unit: 'nights',
            })}
            disablePast
            months={2}
            legend
          />
          <Bound form={buchung} name="anzahl_personen" />
          <StepNav
            onNext={() => buchung.validate(['anreise', 'abreise', 'anzahl_personen'])}
            nextStepLabel={tx('Gast')}
          />
        </div>
      </WizardStep>

      {/* Schritt 3: Gast wählen oder neu anlegen */}
      <WizardStep
        label={tx('Gast')}
        description={tx('Bestehenden Gast wählen oder neu anlegen.')}
        needs={['anreise', 'abreise']}
      >
        <EntitySelectStep
          {...gaeste.select}
          selectedId={buchung.get('gast') as string | undefined}
          searchPlaceholder={tx('Name oder E-Mail suchen …')}
          create={{ fields: ['vorname', 'nachname', 'email', 'telefon'] }}
          createLabel={tx('Neuen Gast anlegen')}
          onSelect={id => {
            buchung.set('gast', id, gaeste.labelOf(id));
            setStep(4);
          }}
        />
      </WizardStep>

      {/* Schritt 4: Prüfen & bestätigen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[buchung]}
            submit={submit}
            items={[
              {
                key: 'wohnungname',
                label: tx('Wohnung'),
                value: wohnungName ?? '—',
                step: 1,
                keys: ['wohnung'],
              },
              ...(anreise && abreise
                ? []
                : []),
            ]}
            whatHappensNext={tx('Die Buchung wird mit Status „Anfrage" angelegt. Danach kannst du sie im Flow „Buchung bearbeiten" bestätigen.')}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[buchung]}
          submit={submit}
          restartLabel={tx('Weitere Buchung anlegen')}
          whatHappensNext={tx('Sobald die Anzahlung eingetroffen ist, die Buchung über „Buchung bearbeiten" bestätigen.')}
          next={[
            {
              label: tx('Buchung bearbeiten'),
              href: '#/intents/buchung-status',
            },
            {
              label: tx('Zum Dashboard'),
              href: '#/',
            },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
