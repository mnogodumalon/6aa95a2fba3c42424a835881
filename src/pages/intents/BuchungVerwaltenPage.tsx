/**
 * Buchung verwalten — 4-Schritt-Wizard.
 * Steps: 1) Buchung wählen → 2) Neuen Status setzen → 3) Reinigung (nur bei Auschecken) → 4) Prüfen & bestätigen.
 * Reads: buchungen (anfrage|bestaetigt|eingecheckt), mitarbeiter (reinigung + aktiv).
 * Writes: buchungen (update status + notizen); reinigungen (create, nur wenn ausgecheckt).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, StepNav, SummaryStep, SuccessStep.
 */
import { useState, useMemo } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Field } from '@/components/blocks/Field';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldText,
  fieldLookup,
  fieldDate,
  fieldRef,
  todayIso,
  type PlanStep,
  type PlanContext,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { LOOKUP_OPTIONS } from '@/types/app';
import { tx } from '@/i18n';

// Erlaubte Status-Übergänge je Ausgangsstatus
const TRANSITIONS: Record<string, string[]> = {
  anfrage: ['bestaetigt', 'storniert'],
  bestaetigt: ['eingecheckt', 'storniert'],
  eingecheckt: ['ausgecheckt'],
};

export default function BuchungVerwaltenPage() {
  const [step, setStep] = useState(1);
  // Gewählte Buchungs-ID und Record – separat vom Formular (kein Buchungsfeld)
  const [buchungId, setBuchungId] = useState<string | null>(null);

  // Step 1: Buchungen wählen — nur anfrage|bestaetigt|eingecheckt
  const buchungen = useRecordSearch(servicePort, 'buchungen', {
    searchFields: ['buchungsnummer'],
    filter: "r.v_status in ['anfrage', 'bestaetigt', 'eingecheckt']",
    where: r => {
      const key = fieldLookup(r, 'status')?.key;
      return key === 'anfrage' || key === 'bestaetigt' || key === 'eingecheckt';
    },
    toItem: (b, ctx) => ({
      id: b.id,
      title: fieldText(b, 'buchungsnummer') || b.id,
      subtitle: [ctx.ref('wohnung'), ctx.ref('gast')].filter(Boolean).join(' · '),
      status: fieldLookup(b, 'status') ?? undefined,
    }),
    orderby: ['r.v_anreise asc'],
  });

  // Step 3: Reinigungskräfte (Mitarbeiter mit rolle=reinigung, status=aktiv)
  const reinigungskraefte = useRecordSearch(servicePort, 'mitarbeiter', {
    searchFields: ['vorname', 'nachname'],
    // Zwei separate filters kombiniert: vSQL erlaubt 'and' (lowercase)
    filter: "r.v_rolle == 'reinigung' and r.v_status == 'aktiv'",
    where: r =>
      fieldLookup(r, 'rolle')?.key === 'reinigung' &&
      fieldLookup(r, 'status')?.key === 'aktiv',
    toItem: m => ({
      id: m.id,
      title: `${fieldText(m, 'vorname')} ${fieldText(m, 'nachname')}`.trim(),
    }),
  });

  // Buchungs-Update-Formular
  const buchungForm = useStepForm('buchungen', {
    fields: ['status', 'notizen'],
    steps: { status: 2, notizen: 2 },
    required: { notizen: false },
  });

  // Reinigungs-Formular (nur bei ausgecheckt benötigt)
  const reinigungForm = useStepForm('reinigungen', {
    fields: ['datum', 'reinigungskraft'],
    steps: { datum: 3, reinigungskraft: 3 },
    initial: { datum: todayIso() },
  });

  // Abgeleiteter State
  const buchungRecord = buchungId ? buchungen.recordOf(buchungId) : undefined;
  const aktuellerStatus = buchungRecord ? fieldLookup(buchungRecord, 'status')?.key ?? '' : '';
  const neuerStatus = buchungForm.get('status') as string | null;
  const istAusgecheckt = neuerStatus === 'ausgecheckt';

  // Erlaubte Übergänge für den aktuellen Status (Inside component — locale-aware)
  const erlaubteOptionen = useMemo(() => {
    const allowed = TRANSITIONS[aktuellerStatus] ?? [];
    return (LOOKUP_OPTIONS['buchungen']?.['status'] ?? []).filter(o => allowed.includes(o.key));
  }, [aktuellerStatus]);

  // Plan: Update Buchung, ggf. Create Reinigung
  const plan = useMemo<PlanStep[]>(() => {
    const steps: PlanStep[] = [
      {
        key: 'buchung',
        entity: 'buchungen',
        form: buchungForm,
        updates: buchungId ?? '',
        primary: true,
        verb: 'update',
      },
    ];
    if (istAusgecheckt) {
      steps.push({
        key: 'reinigung',
        entity: 'reinigungen',
        form: reinigungForm,
        needs: ['buchung'],
        values: (ctx: PlanContext) => ({
          wohnung: buchungRecord ? fieldRef(buchungRecord, 'wohnung') ?? undefined : undefined,
          buchung: ctx.done['buchung']?.id,
          status: 'offen',
        }),
        verb: 'create',
      });
    }
    return steps;
  }, [buchungId, buchungForm, reinigungForm, istAusgecheckt, buchungRecord]);

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'buchung-verwalten' });

  const restart = () => {
    submit.reset();
    buchungForm.reset();
    reinigungForm.reset({ datum: todayIso() });
    setBuchungId(null);
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Buchung verwalten')}
      subtitle={tx('Status weiterschalten und Übergabe vorbereiten')}
      currentStep={step}
      onStepChange={setStep}
      forms={[buchungForm, reinigungForm]}
      draftKey="buchung-verwalten"
      intro={{
        description: tx('Wähle eine offene Buchung und setze den nächsten Status.'),
        needs: [tx('Buchungsnummer'), tx('Bei Auschecken: Reinigungsdatum')],
      }}
      back={{ href: '#/', label: tx('Dashboard') }}
    >
      {/* Schritt 1: Buchung wählen */}
      <WizardStep
        label={tx('Buchung')}
        description={tx('Nur Buchungen mit Status Anfrage, Bestätigt oder Eingecheckt werden angezeigt.')}
      >
        <EntitySelectStep
          {...buchungen.select}
          selectedId={buchungId}
          onSelect={id => {
            const rec = buchungen.recordOf(id);
            const abreise = rec ? fieldDate(rec, 'abreise') : null;
            setBuchungId(id);
            buchungForm.reset();
            reinigungForm.reset({ datum: abreise ?? todayIso() });
            setStep(2);
          }}
          emptyText={tx('Keine offenen Buchungen vorhanden.')}
          create={false}
          avatar="none"
        />
      </WizardStep>

      {/* Schritt 2: Neuen Status wählen */}
      <WizardStep
        label={tx('Neuer Status')}
        description={tx('Nur erlaubte Übergänge vom aktuellen Status werden angezeigt.')}
      >
        {buchungId && buchungRecord ? (
          <div className="space-y-4">
            {/* Aktuelle Buchungsinfo */}
            <div className="rounded-lg bg-secondary p-4 space-y-1 text-sm">
              <div className="font-medium">
                {fieldText(buchungRecord, 'buchungsnummer') || buchungId}
              </div>
              <div className="text-muted-foreground flex items-center gap-2 flex-wrap">
                <span>{tx('Aktueller Status')}:</span>
                <StatusBadge
                  statusKey={aktuellerStatus}
                  label={fieldLookup(buchungRecord, 'status')?.label}
                />
              </div>
            </div>

            {/* Status-Auswahl */}
            <Field form={buchungForm} name="status" label={tx('Nächster Status')}>
              <ChoiceGroup
                {...buchungForm.choice('status')}
                options={erlaubteOptionen}
              />
            </Field>

            {/* Notizen (optional) */}
            <Bound form={buchungForm} name="notizen" rows={3} />

            <StepNav
              onBack={() => setStep(1)}
              onNext={() => {
                const ok = buchungForm.validate(['status']);
                if (!ok) return false;
                // Bei Auschecken: weiter zu Reinigungsschritt
                setStep(neuerStatus === 'ausgecheckt' ? 3 : 4);
              }}
              nextStepLabel={neuerStatus === 'ausgecheckt' ? tx('Reinigung') : tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst eine Buchung wählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Reinigung (nur bei ausgecheckt) */}
      <WizardStep
        label={tx('Reinigung')}
        enabledIf={istAusgecheckt}
        description={tx('Lege Reinigungsdatum und zuständige Reinigungskraft fest.')}
      >
        {istAusgecheckt ? (
          <div className="space-y-4">
            <Bound form={reinigungForm} name="datum" label={tx('Reinigungsdatum')} />

            <Field form={reinigungForm} name="reinigungskraft" label={tx('Reinigungskraft')}>
              <EntitySelectStep
                {...reinigungskraefte.select}
                selectedId={reinigungForm.get('reinigungskraft') as string | null}
                onSelect={id => {
                  reinigungForm.set('reinigungskraft', id, reinigungskraefte.labelOf(id));
                }}
                emptyText={tx('Keine aktiven Reinigungskräfte gefunden.')}
                create={false}
                avatar="initials"
              />
            </Field>

            <StepNav
              onBack={() => setStep(2)}
              onNext={() => reinigungForm.validate(['datum', 'reinigungskraft'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(2)} nextDisabled>
            {tx('Dieser Schritt ist nur bei Auschecken aktiv.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 4: Zusammenfassung */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && buchungId ? (
          <SummaryStep
            forms={[buchungForm, reinigungForm]}
            submit={submit}
            items={[
              {
                key: '_buchung_nr',
                label: tx('Buchung'),
                value: buchungRecord
                  ? (fieldText(buchungRecord, 'buchungsnummer') || buchungId)
                  : buchungId,
                step: 1,
              },
              ...(istAusgecheckt
                ? [
                    {
                      key: '_reinigung_hinweis',
                      label: tx('Reinigungsauftrag'),
                      value: tx('Wird automatisch angelegt'),
                    },
                  ]
                : []),
            ]}
            whatHappensNext={
              istAusgecheckt
                ? tx('Der Buchungsstatus wird auf "Ausgecheckt" gesetzt und ein Reinigungsauftrag wird automatisch angelegt.')
                : tx('Der Buchungsstatus wird sofort aktualisiert.')
            }
          />
        ) : !buchungId ? (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst eine Buchung wählen.')}
          </StepNav>
        ) : null}
      </WizardStep>

      {/* Erfolgsschritt */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[buchungForm, reinigungForm]}
          verb="updated"
          actions={{ copy: false, print: false }}
          whatHappensNext={
            istAusgecheckt
              ? tx('Der Reinigungsauftrag ist jetzt offen — abhaken, sobald die Wohnung fertig ist.')
              : undefined
          }
          next={[
            { label: tx('Weitere Buchung verwalten'), onClick: restart },
            ...(istAusgecheckt
              ? [{ label: tx('Reinigung abhaken'), href: '#/intents/reinigung-abhaken' as const }]
              : [{ label: tx('Neue Buchung anlegen'), href: '#/intents/neue-buchung' as const }]),
            { label: tx('Zum Dashboard'), href: '#/' as const },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
