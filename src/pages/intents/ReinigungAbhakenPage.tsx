/**
 * Reinigung abhaken — 3-Schritt-Wizard.
 * Steps: 1) Reinigung wählen (offen) → 2) Abschließen (status + bemerkungen) → 3) Bestätigen & aktualisieren.
 * Reads: reinigungen (gefiltert: status=offen). Writes: reinigungen (update status='erledigt', bemerkungen).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  useRecordSearch,
  useStepForm,
  useJourneySubmit,
  fieldDate,
  fieldLookup,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';
import { formatDate } from '@/lib/formatters';

export default function ReinigungAbhakenPage() {
  const [step, setStep] = useState(1);
  const [reinigungId, setReinigungId] = useState<string | null>(null);

  const reinigungen = useRecordSearch(servicePort, 'reinigungen', {
    searchFields: [],
    filter: "r.v_status == 'offen'",
    where: r => fieldLookup(r, 'status')?.key === 'offen',
    toItem: (r, ctx) => {
      const wohnungName = ctx.ref('wohnung') ?? tx('Unbekannte Wohnung');
      const datumRaw = fieldDate(r, 'datum');
      const datum = datumRaw ? formatDate(datumRaw) : '—';
      const status = fieldLookup(r, 'status');
      return {
        id: r.id,
        title: wohnungName,
        subtitle: datum,
        status: status ? { key: status.key, label: status.label } : undefined,
      };
    },
  });

  // Step 2 form: status (pre-filled 'erledigt') + bemerkungen
  const f = useStepForm('reinigungen', {
    fields: ['status', 'bemerkungen'],
    steps: { status: 2, bemerkungen: 2 },
    initial: { status: 'erledigt' },
    required: { bemerkungen: false },
  });

  const submit = useJourneySubmit(servicePort, [
    {
      key: 'reinigung',
      entity: 'reinigungen',
      form: f,
      updates: reinigungId ?? '',
      primary: true,
      verb: 'update',
    },
  ], { draftKey: 'reinigung-abhaken' });

  // Derive the picked record for display
  const pickedRecord = reinigungId ? reinigungen.recordOf(reinigungId) : undefined;
  const wohnungName = reinigungId
    ? (pickedRecord ? reinigungen.refLabel(pickedRecord, 'wohnung') : undefined) ?? reinigungen.labelOf(reinigungId) ?? tx('Unbekannte Wohnung')
    : undefined;
  const datumRaw = pickedRecord ? fieldDate(pickedRecord, 'datum') : undefined;
  const datumFormatted = datumRaw ? formatDate(datumRaw) : '—';

  return (
    <IntentWizardShell
      title={tx('Reinigung abhaken')}
      currentStep={step}
      onStepChange={setStep}
      forms={[f]}
      draftKey="reinigung-abhaken"
      intro={{
        description: tx('Offene Reinigung als erledigt markieren und optional Bemerkungen erfassen.'),
        needs: [tx('Name der Wohnung')],
      }}
    >
      <WizardStep
        label={tx('Reinigung wählen')}
        description={tx('Wähle die Reinigung, die du abgeschlossen hast.')}
      >
        <EntitySelectStep
          {...reinigungen.select}
          selectedId={reinigungId}
          emptyText={tx('Keine offenen Reinigungen vorhanden.')}
          create={false}
          onSelect={id => {
            setReinigungId(id);
            setStep(2);
          }}
        />
      </WizardStep>

      <WizardStep
        label={tx('Abschließen')}
        description={tx('Bestätige den Status und füge optional Bemerkungen zu Schäden hinzu.')}
      >
        {reinigungId ? (
          <div className="space-y-4">
            {wohnungName && (
              <div className="rounded-lg bg-secondary px-4 py-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{wohnungName}</span>
                {datumFormatted !== '—' && <span> · {datumFormatted}</span>}
              </div>
            )}
            <Bound
              form={f}
              name="status"
              hint={tx('Bestätige, dass die Reinigung abgeschlossen ist.')}
            />
            <Bound
              form={f}
              name="bemerkungen"
              rows={4}
              hint={tx('Schäden, Auffälligkeiten oder sonstige Hinweise (optional).')}
            />
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => f.validate(['status'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst eine Reinigung auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[f]}
            submit={submit}
            items={[
              { key: 'wohnung', label: tx('Wohnung'), value: wohnungName ?? '—' },
              { key: 'datum', label: tx('Reinigungsdatum'), value: datumFormatted },
            ]}
            whatHappensNext={tx('Die Reinigung wird sofort als erledigt markiert.')}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          submit={submit}
          forms={[f]}
          verb="updated"
          facts={[
            { label: tx('Wohnung'), value: wohnungName ?? '—' },
            { label: tx('Datum'), value: datumFormatted },
            { label: tx('Status'), value: tx('Erledigt') },
          ]}
          whatHappensNext={tx('Die Reinigung ist als erledigt erfasst.')}
          next={[
            { label: tx('Zur Übersicht'), href: '#/' },
            { label: tx('Neue Buchung'), href: '#/intents/neue-buchung' },
          ]}
          restartLabel={tx('Weitere Reinigung abhaken')}
        />
      )}
    </IntentWizardShell>
  );
}
