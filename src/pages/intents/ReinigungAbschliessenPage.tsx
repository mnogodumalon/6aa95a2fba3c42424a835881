/**
 * Reinigung abschließen — 3-Schritt-Wizard.
 * Steps: 1) Reinigung wählen (nur status=offen) → 2) Abschluss bestätigen (status + bemerkungen) → 3) Prüfen & speichern.
 * Reads: reinigungen (gefiltert auf offen). Writes: reinigungen (update status=erledigt, bemerkungen).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldLookup,
  fieldDate,
  fieldRef,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function ReinigungAbschliessenPage() {
  const [step, setStep] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | undefined>(undefined);

  // Schritt 1: Reinigungen mit status=offen suchen
  const reinigungen = useRecordSearch(servicePort, 'reinigungen', {
    filter: "r.v_status == 'offen'", /* i18n-exempt */
    where: r => fieldLookup(r, 'status')?.key === 'offen',
    searchFields: ['bemerkungen'],
    orderby: ['r.v_datum asc'],
    toItem: (r, ctx) => ({
      id: r.id,
      title: ctx.ref('wohnung') ?? tx('Wohnung'),
      subtitle: fieldDate(r, 'datum') ?? undefined,
      status: fieldLookup(r, 'status') ?? undefined,
      stats: [
        {
          label: tx('Reinigungskraft'),
          value: ctx.ref('reinigungskraft') ?? tx('—'),
        },
      ],
    }),
  });

  // Formular: nur die Felder, die dieser Flow anfragt
  const f = useStepForm('reinigungen', {
    fields: ['status', 'bemerkungen'],
    steps: { status: 2, bemerkungen: 2 },
    initial: { status: 'erledigt' },
    required: { bemerkungen: false },
  });

  // Plan: update der gewählten Reinigung
  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'reinigung',
        entity: 'reinigungen',
        form: f,
        updates: selectedId ?? '',
        primary: true,
        verb: 'update',
      },
    ],
    { draftKey: 'reinigung-abschliessen' },
  );

  // Anzeige-Kontext für den SuccessStep
  const wohnungLabel = selectedLabel ?? (selectedId ? reinigungen.labelOf(selectedId) : undefined);

  return (
    <IntentWizardShell
      title={tx('Reinigung abschließen')}
      subtitle={tx('Offene Reinigung als erledigt markieren')}
      currentStep={step}
      onStepChange={setStep}
      forms={[f]}
      draftKey="reinigung-abschliessen"
      intro={{
        description: tx('Eine offene Reinigung auswählen und als erledigt markieren.'),
        needs: [tx('Die betreffende Wohnung'), tx('Ggf. Schadensmeldungen')],
      }}
    >
      {/* Schritt 1: Reinigung wählen */}
      <WizardStep
        label={tx('Reinigung wählen')}
        description={tx('Wähle die Reinigung, die du abschließen möchtest — nur offene Reinigungen werden angezeigt.')}
      >
        <EntitySelectStep
          {...reinigungen.select}
          avatar="none"
          selectedId={selectedId}
          emptyText={tx('Keine offenen Reinigungen vorhanden.')}
          create={false}
          searchPlaceholder={tx('Reinigung suchen …')}
          onSelect={id => {
            const rec = reinigungen.recordOf(id);
            const label = reinigungen.labelOf(id) ?? tx('Reinigung');
            setSelectedId(id);
            setSelectedLabel(label);
            // Wohnungsname für den Kontext merken
            if (rec) {
              const wRef = fieldRef(rec, 'wohnung');
              if (wRef) {
                f.remember(wRef, reinigungen.refLabel(rec, 'wohnung') ?? label);
              }
            }
            setStep(2);
          }}
        />
      </WizardStep>

      {/* Schritt 2: Abschluss bestätigen */}
      <WizardStep
        label={tx('Abschluss')}
        description={tx('Status bestätigen und optionale Bemerkungen zu Schäden eintragen.')}
      >
        <div className="space-y-5">
          <Bound form={f} name="status" />
          <Bound
            form={f}
            name="bemerkungen"
            hint={tx('Optional: Schäden, Besonderheiten oder Hinweise für die nächste Buchung.')}
            rows={4}
            placeholder={tx('z. B. Kratzer an der Küchenfront entdeckt …')}
          />
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => f.validate(['status'])}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      {/* Schritt 3: Prüfen & bestätigen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done ? (
          <SummaryStep
            forms={[f]}
            submit={submit}
            items={
              wohnungLabel
                ? [{ key: 'wohnung', label: tx('Wohnung'), value: wohnungLabel }]
                : []
            }
            whatHappensNext={tx('Die Reinigung wird als erledigt gespeichert und steht für weitere Auswertungen bereit.')}
            confirmLabel={tx('Reinigung abschließen')}
          />
        ) : null}
      </WizardStep>

      {/* Erfolg */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[f]}
          submit={submit}
          verb="updated"
          whatHappensNext={tx('Die Reinigung ist abgeschlossen und im System aktualisiert.')}
          restartLabel={tx('Weitere Reinigung abschließen')}
          next={[
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
