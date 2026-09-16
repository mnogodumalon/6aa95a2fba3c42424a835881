/**
 * Reinigungen erfassen — Zwei-Subflow-Wizard.
 * Sub-flow A: Neuen Reinigungstermin anlegen
 *   Step A1) Buchung wählen (ausgecheckt) → Step A2) Details (Wohnung, Datum, Reinigungskraft, Status, Bemerkungen) → Step A3) Prüfen & anlegen.
 * Sub-flow B: Erledigt melden
 *   Step B1) Reinigung wählen (offen) → Step B2) Abschluss (Bemerkungen, Status) → Step B3) Prüfen & aktualisieren.
 * Reads: buchungen, reinigungen, wohnungen, mitarbeiter. Writes: reinigungen (create / update).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, Field, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';
import { Field } from '@/components/blocks/Field';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { DatePicker } from '@/components/DatePicker';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldText,
  fieldLookup,
  fieldDate,
  fieldRef,
  todayIso,
  combineFilters,
  refFilter,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

type SubFlow = 'A' | 'B' | null;

export default function ReinigungenErfassenPage() {
  const [subFlow, setSubFlow] = useState<SubFlow>(null);
  const [step, setStep] = useState(1);

  // ── Sub-flow A: Buchung auswählen (ausgecheckt) ──────────────────────────
  const buchungen = useRecordSearch(servicePort, 'buchungen', {
    filter: "r.v_status == 'ausgecheckt'", /* i18n-exempt */
    where: r => fieldLookup(r, 'status')?.key === 'ausgecheckt',
    searchFields: ['buchungsnummer'],
    toItem: b => ({
      id: b.id,
      title: fieldText(b, 'buchungsnummer'),
      subtitle: fieldDate(b, 'abreise') ?? undefined,
    }),
  });

  // ── Sub-flow A: Reinigungskraft (nur rolle=reinigung) ────────────────────
  const reinigungskraefte = useRecordSearch(servicePort, 'mitarbeiter', {
    filter: "r.v_rolle == 'reinigung'", /* i18n-exempt */
    where: r => fieldLookup(r, 'rolle')?.key === 'reinigung',
    searchFields: ['vorname', 'nachname'],
    toItem: m => ({
      id: m.id,
      title: `${fieldText(m, 'vorname')} ${fieldText(m, 'nachname')}`.trim(),
      subtitle: fieldText(m, 'telefon') || undefined,
    }),
  });

  // ── Sub-flow A: Wohnungen (überschreibbar) ────────────────────────────────
  const wohnungen = useRecordSearch(servicePort, 'wohnungen', {
    searchFields: ['name'],
    toItem: w => ({ id: w.id, title: fieldText(w, 'name') }),
  });

  // ── Sub-flow B: Offene Reinigungen ───────────────────────────────────────
  const offeneReinigungen = useRecordSearch(servicePort, 'reinigungen', {
    filter: "r.v_status == 'offen'", /* i18n-exempt */
    where: r => fieldLookup(r, 'status')?.key === 'offen',
    searchFields: ['bemerkungen'],
    toItem: (r, _ctx) => ({
      id: r.id,
      title: _ctx.ref('wohnung') ?? tx('Unbekannte Wohnung'),
      subtitle: fieldDate(r, 'datum') ?? undefined,
      status: fieldLookup(r, 'status') ?? undefined,
    }),
  });

  // ── Formulare ────────────────────────────────────────────────────────────
  // Sub-flow A: Reinigung anlegen
  const neuForm = useStepForm('reinigungen', {
    steps: {
      wohnung: 2,
      buchung: 2,
      datum: 2,
      reinigungskraft: 2,
      status: 2,
      bemerkungen: 2,
    },
    initial: { status: 'offen' },
    required: { buchung: false },
  });

  // Sub-flow B: Erledigt melden (update)
  const erledigtForm = useStepForm('reinigungen', {
    id: 'erledigt',
    steps: { bemerkungen: 2, status: 2 },
    initial: { status: 'erledigt' },
  });

  // ── Pläne ────────────────────────────────────────────────────────────────
  const submitNeu = useJourneySubmit(servicePort, [
    { key: 'reinigung', entity: 'reinigungen', form: neuForm, primary: true },
  ], { draftKey: 'reinigung-erfassen-neu' });

  const submitErledigt = useJourneySubmit(servicePort, [
    {
      key: 'reinigung',
      entity: 'reinigungen',
      form: erledigtForm,
      updates: (_ctx) => erledigtForm.get('_reinigungId') as string | undefined,
      primary: true,
      verb: 'update',
    },
  ], { draftKey: 'reinigung-erfassen-erledigt' });

  // ── Hilfsfunktionen ───────────────────────────────────────────────────────
  const restartNeu = () => {
    submitNeu.reset();
    neuForm.reset();
    setStep(1);
    setSubFlow(null);
  };

  const restartErledigt = () => {
    submitErledigt.reset();
    erledigtForm.reset();
    setStep(1);
    setSubFlow(null);
  };

  // ── Sub-flow-Auswahl ──────────────────────────────────────────────────────
  if (subFlow === null) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8 space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">{tx('Reinigung erfassen')}</h1>
        <p className="text-muted-foreground">{tx('Was möchtest du tun?')}</p>
        <div className="grid gap-3">
          <button
            type="button"
            className="w-full text-left rounded-2xl border bg-card p-5 shadow-lg hover:bg-secondary transition-colors"
            onClick={() => { setSubFlow('A'); setStep(1); }}
          >
            <div className="font-semibold text-foreground">{tx('Neuen Reinigungstermin anlegen')}</div>
            <div className="text-sm text-muted-foreground mt-1">{tx('Nach dem Auschecken einen Termin erstellen und einer Reinigungskraft zuweisen.')}</div>
          </button>
          <button
            type="button"
            className="w-full text-left rounded-2xl border bg-card p-5 shadow-lg hover:bg-secondary transition-colors"
            onClick={() => { setSubFlow('B'); setStep(1); }}
          >
            <div className="font-semibold text-foreground">{tx('Erledigt melden')}</div>
            <div className="text-sm text-muted-foreground mt-1">{tx('Einen offenen Reinigungstermin als abgeschlossen markieren.')}</div>
          </button>
        </div>
      </div>
    );
  }

  // ── Sub-flow A: Neuen Reinigungstermin anlegen ───────────────────────────
  if (subFlow === 'A') {
    const pickedBuchungId = neuForm.get('buchung') as string | null;
    const pickedBuchungRecord = pickedBuchungId ? buchungen.recordOf(pickedBuchungId) : undefined;

    return (
      <IntentWizardShell
        title={tx('Neuen Reinigungstermin anlegen')}
        currentStep={step}
        onStepChange={setStep}
        back={{ href: '#/', label: tx('Zurück') }}
        forms={[neuForm]}
        draftKey="reinigung-erfassen-neu"
        intro={{
          description: tx('Reinigungstermin nach dem Auschecken erstellen und zuweisen.'),
          needs: [tx('Ausgecheckte Buchung'), tx('Verfügbare Reinigungskraft')],
        }}
      >
        {/* Schritt 1: Buchung wählen */}
        <WizardStep
          label={tx('Buchung')}
          description={tx('Ausgecheckte Buchung auswählen, für die die Reinigung geplant wird.')}
        >
          <EntitySelectStep
            {...buchungen.select}
            selectedId={pickedBuchungId ?? null}
            emptyText={tx('Keine ausgecheckten Buchungen gefunden.')}
            create={false}
            onSelect={id => {
              const rec = buchungen.recordOf(id);
              neuForm.set('buchung', id, buchungen.labelOf(id));
              // Wohnung und Datum aus Buchung vorausfüllen
              if (rec) {
                const wohnungId = fieldRef(rec, 'wohnung');
                if (wohnungId) {
                  neuForm.set('wohnung', wohnungId, wohnungen.labelOf(wohnungId));
                }
                const abreise = fieldDate(rec, 'abreise');
                if (abreise) {
                  neuForm.set('datum', abreise);
                }
              }
              setStep(2);
            }}
          />
        </WizardStep>

        {/* Schritt 2: Details */}
        <WizardStep
          label={tx('Details')}
          description={tx('Wohnung, Reinigungsdatum und Reinigungskraft festlegen.')}
          needs={['buchung']}
        >
          <div className="space-y-5">
            {/* Buchung (read-only Anzeige) */}
            {pickedBuchungId && (
              <div className="rounded-xl border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{tx('Buchung:')}</span>{' '}
                {neuForm.labels['buchung'] ?? pickedBuchungId}
              </div>
            )}

            {/* Wohnung — überschreibbar via EntitySelectStep */}
            <Field form={neuForm} name="wohnung" label={tx('Wohnung')}>
              <EntitySelectStep
                {...wohnungen.select}
                selectedId={neuForm.get('wohnung') as string | null}
                {...neuForm.record('wohnung')}
                onSelect={id => neuForm.set('wohnung', id, wohnungen.labelOf(id))}
                create={false}
                mode="combobox"
              />
            </Field>

            {/* Datum */}
            <Field form={neuForm} name="datum">
              <DatePicker {...neuForm.date('datum')} />
            </Field>

            {/* Reinigungskraft */}
            <Field form={neuForm} name="reinigungskraft">
              <EntitySelectStep
                {...reinigungskraefte.select}
                selectedId={neuForm.get('reinigungskraft') as string | null}
                {...neuForm.record('reinigungskraft')}
                onSelect={id => neuForm.set('reinigungskraft', id, reinigungskraefte.labelOf(id))}
                emptyText={tx('Keine Reinigungskraft mit der Rolle „Reinigung" gefunden.')}
                create={false}
                mode="combobox"
              />
            </Field>

            {/* Status */}
            <Field form={neuForm} name="status">
              <ChoiceGroup {...neuForm.choice('status')} />
            </Field>

            {/* Bemerkungen */}
            <Bound form={neuForm} name="bemerkungen" rows={3} />

            <StepNav
              onBack={() => setStep(1)}
              onNext={() => neuForm.validate(['wohnung', 'datum', 'reinigungskraft', 'status'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        </WizardStep>

        {/* Schritt 3: Prüfen & anlegen */}
        <WizardStep label={tx('Prüfen')}>
          {!submitNeu.done && (
            <SummaryStep
              forms={[neuForm]}
              submit={submitNeu}
              whatHappensNext={tx('Der Reinigungstermin wird angelegt und der Reinigungskraft zugewiesen.')}
              items={[
                ...(pickedBuchungId
                  ? [{
                      key: 'buchung_anzeige',
                      label: tx('Buchung'),
                      value: neuForm.labels['buchung'] ?? pickedBuchungId,
                    }]
                  : []),
              ]}
            />
          )}
        </WizardStep>

        {submitNeu.result && (
          <SuccessStep
            result={submitNeu.result}
            submit={submitNeu}
            forms={[neuForm]}
            restartLabel={tx('Weiteren Termin anlegen')}
            next={[
              { label: tx('Erledigt melden'), onClick: () => { restartNeu(); setSubFlow('B'); } },
              { label: tx('Zum Dashboard'), href: '#/' },
            ]}
            whatHappensNext={tx('Die Reinigungskraft kann den Termin unter „Erledigt melden" abhaken.')}
          />
        )}
      </IntentWizardShell>
    );
  }

  // ── Sub-flow B: Erledigt melden ──────────────────────────────────────────
  const pickedReinigungId = erledigtForm.get('_reinigungId') as string | null;

  return (
    <IntentWizardShell
      title={tx('Reinigung als erledigt melden')}
      currentStep={step}
      onStepChange={setStep}
      back={{ href: '#/', label: tx('Zurück') }}
      forms={[erledigtForm]}
      draftKey="reinigung-erfassen-erledigt"
      intro={{
        description: tx('Einen offenen Reinigungstermin abschließen und optional Bemerkungen hinterlassen.'),
        needs: [tx('Offener Reinigungstermin')],
      }}
    >
      {/* Schritt B1: Reinigung wählen */}
      <WizardStep
        label={tx('Reinigung')}
        description={tx('Offenen Reinigungstermin auswählen, der abgeschlossen werden soll.')}
      >
        <EntitySelectStep
          {...offeneReinigungen.select}
          selectedId={pickedReinigungId ?? null}
          emptyText={tx('Keine offenen Reinigungstermine vorhanden.')}
          create={false}
          onSelect={id => {
            erledigtForm.set('_reinigungId', id);
            const rec = offeneReinigungen.recordOf(id);
            if (rec) {
              const bem = fieldText(rec, 'bemerkungen');
              if (bem) erledigtForm.set('bemerkungen', bem);
            }
            setStep(2);
          }}
        />
      </WizardStep>

      {/* Schritt B2: Abschluss */}
      <WizardStep
        label={tx('Abschluss')}
        description={tx('Status bestätigen und optionale Bemerkungen (z. B. Schäden) hinterlassen.')}
        needs={['_reinigungId']}
      >
        <div className="space-y-5">
          <Field form={erledigtForm} name="status">
            <ChoiceGroup {...erledigtForm.choice('status')} />
          </Field>

          <Bound form={erledigtForm} name="bemerkungen" rows={3} hint={tx('Z. B. festgestellte Schäden oder besondere Hinweise')} />

          <StepNav
            onBack={() => setStep(1)}
            onNext={() => erledigtForm.validate(['status'])}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      {/* Schritt B3: Prüfen & aktualisieren */}
      <WizardStep label={tx('Prüfen')}>
        {!submitErledigt.done && (
          <SummaryStep
            forms={[erledigtForm]}
            submit={submitErledigt}
            whatHappensNext={tx('Der Reinigungstermin wird als erledigt markiert.')}
            items={[
              ...(pickedReinigungId
                ? [{
                    key: 'reinigung_anzeige',
                    label: tx('Reinigung'),
                    value: offeneReinigungen.labelOf(pickedReinigungId) ?? pickedReinigungId,
                  }]
                : []),
            ]}
          />
        )}
      </WizardStep>

      {submitErledigt.result && (
        <SuccessStep
          result={submitErledigt.result}
          submit={submitErledigt}
          forms={[erledigtForm]}
          verb="updated"
          restartLabel={tx('Weitere Reinigung melden')}
          next={[
            { label: tx('Neuen Termin anlegen'), onClick: () => { restartErledigt(); setSubFlow('A'); } },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Die Reinigung ist abgeschlossen und im System aktualisiert.')}
        />
      )}
    </IntentWizardShell>
  );
}
