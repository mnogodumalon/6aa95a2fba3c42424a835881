/**
 * Buchung-Status ändern — 2-Schritt-Wizard.
 * Steps: 1) Buchung wählen (nur aktive: anfrage|bestaetigt|eingecheckt) → 2) Status + Details → 3) Prüfen & speichern.
 * Reads: buchungen (gefiltert auf aktive), wohnungen, gaeste (via ctx.ref für Kartentitel).
 * Writes: buchungen (update — status, gesamtpreis, anzahlung_erhalten, notizen).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldText,
  fieldLookup,
  fieldDate,
  fieldNumber,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

/** The next logical status for a given current status key. */
function nextStatusKey(currentKey: string | null): string | null {
  if (currentKey === 'anfrage') return 'bestaetigt';
  if (currentKey === 'bestaetigt') return 'eingecheckt';
  if (currentKey === 'eingecheckt') return 'ausgecheckt';
  return null;
}

export default function BuchungStatusPage() {
  const [step, setStep] = useState(1);
  const [pickedId, setPickedId] = useState<string | null>(null);

  // Step 1: search only active bookings (not ausgecheckt, not storniert)
  const buchungen = useRecordSearch(servicePort, 'buchungen', {
    searchFields: ['buchungsnummer'],
    filter: "r.v_status in ['anfrage', 'bestaetigt', 'eingecheckt']",
    where: r => {
      const key = fieldLookup(r, 'status')?.key;
      return key === 'anfrage' || key === 'bestaetigt' || key === 'eingecheckt';
    },
    toItem: (b, ctx) => {
      const statusVal = fieldLookup(b, 'status');
      const anreise = fieldDate(b, 'anreise');
      const abreise = fieldDate(b, 'abreise');
      const zeitraum =
        anreise && abreise ? `${anreise} – ${abreise}` : anreise ?? '—';
      return {
        id: b.id,
        title: fieldText(b, 'buchungsnummer'),
        subtitle: `${ctx.ref('wohnung') ?? '—'} · ${ctx.ref('gast') ?? '—'} · ${zeitraum}`,
        status: statusVal ?? undefined,
      };
    },
    orderby: ['r.v_anreise asc'],
  });

  // Step 2 form: only the fields this flow changes
  const f = useStepForm('buchungen', {
    fields: ['status', 'gesamtpreis', 'anzahlung_erhalten', 'notizen'],
    steps: { status: 2, gesamtpreis: 2, anzahlung_erhalten: 2, notizen: 2 },
    required: {
      // gesamtpreis, anzahlung_erhalten, notizen are optional in this flow
      gesamtpreis: false,
      anzahlung_erhalten: false,
      notizen: false,
    },
  });

  // Derive the picked booking record and its current status
  const pickedRecord = pickedId ? buchungen.recordOf(pickedId) : undefined;
  const currentStatusKey = pickedRecord ? fieldLookup(pickedRecord, 'status')?.key ?? null : null;

  // Plan: update the existing booking record
  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'buchung',
        entity: 'buchungen',
        form: f,
        updates: pickedId ?? '',
        primary: true,
        verb: 'update',
      },
    ],
    { draftKey: 'buchung-status' }
  );

  return (
    <IntentWizardShell
      title={tx('Buchung aktualisieren')}
      subtitle={tx('Status, Preis und Notizen einer bestehenden Buchung anpassen.')}
      currentStep={step}
      onStepChange={setStep}
      forms={[f]}
      draftKey="buchung-status"
      intro={{
        description: tx('Den Status einer aktiven Buchung weiterschreiben oder stornieren.'),
        needs: [tx('Buchungsnummer'), tx('Neuer Status')],
      }}
    >
      {/* Step 1 — Buchung wählen */}
      <WizardStep
        label={tx('Buchung')}
        heading={tx('Buchung wählen')}
        description={tx('Nur aktive Buchungen (Anfrage, Bestätigt, Eingecheckt) werden angezeigt.')}
      >
        <EntitySelectStep
          {...buchungen.select}
          selectedId={pickedId}
          emptyText={tx('Keine aktiven Buchungen gefunden. Alle Buchungen sind bereits abgeschlossen.')}
          searchPlaceholder={tx('Buchungsnummer suchen …')}
          onSelect={id => {
            const rec = buchungen.recordOf(id);
            setPickedId(id);
            if (rec) {
              const statusKey = fieldLookup(rec, 'status')?.key ?? null;
              const suggestedNext = nextStatusKey(statusKey) ?? statusKey;
              if (suggestedNext) {
                f.set('status', suggestedNext);
              }
              const preis = fieldNumber(rec, 'gesamtpreis');
              if (preis !== null) {
                f.set('gesamtpreis', String(preis));
              }
            }
            setStep(2);
          }}
        />
      </WizardStep>

      {/* Step 2 — Status und Details */}
      <WizardStep
        label={tx('Details')}
        heading={tx('Status und Details')}
        description={tx('Nächsten Status wählen und ggf. Preis und Notizen aktualisieren.')}
      >
        {pickedRecord ? (
          <div className="space-y-6">
            {/* Context card showing current booking info */}
            <div className="rounded-xl bg-secondary p-4 space-y-1">
              <p className="font-medium text-sm">
                {fieldText(pickedRecord, 'buchungsnummer')}
              </p>
              <p className="text-sm text-muted-foreground">
                {buchungen.refLabel(pickedRecord, 'wohnung') ?? '—'}
                {' · '}
                {buchungen.refLabel(pickedRecord, 'gast') ?? '—'}
              </p>
              <p className="text-sm text-muted-foreground">
                {fieldDate(pickedRecord, 'anreise') ?? '—'}
                {' – '}
                {fieldDate(pickedRecord, 'abreise') ?? '—'}
              </p>
              <div className="pt-1">
                <StatusBadge
                  statusKey={fieldLookup(pickedRecord, 'status')?.key}
                  label={fieldLookup(pickedRecord, 'status')?.label}
                />
              </div>
            </div>

            {/* Status choice — restricted to valid next steps */}
            <Bound
              form={f}
              name="status"
              label={tx('Neuer Status')}
              hint={tx('Nur sinnvolle Folgeschritte werden angezeigt.')}
            />

            <Bound form={f} name="gesamtpreis" hint={tx('Aktuellen Wert überschreiben (optional).')} />
            <Bound form={f} name="anzahlung_erhalten" />
            <Bound form={f} name="notizen" rows={4} />

            <StepNav
              onNext={() => f.validate(['status'])}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav
            onBack={() => setStep(1)}
            hideBack={false}
            nextDisabled
          >
            <p className="text-sm text-muted-foreground">
              {tx('Bitte zuerst eine Buchung in Schritt 1 auswählen.')}
            </p>
          </StepNav>
        )}
      </WizardStep>

      {/* Step 3 — Prüfen & Bestätigen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && pickedRecord && (
          <SummaryStep
            forms={[f]}
            submit={submit}
            confirmLabel={tx('Status speichern')}
            whatHappensNext={tx('Der neue Status der Buchung wird sofort gespeichert.')}
            items={[
              {
                key: '_buchung',
                label: tx('Buchung'),
                value: fieldText(pickedRecord, 'buchungsnummer'),
              },
            ]}
          />
        )}
        {!submit.done && !pickedRecord && (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            <p className="text-sm text-muted-foreground">
              {tx('Bitte zuerst eine Buchung auswählen.')}
            </p>
          </StepNav>
        )}
      </WizardStep>

      {/* Success screen */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[f]}
          verb="updated"
          actions={{ copy: false, print: false }}
          whatHappensNext={tx('Der Status der Buchung ist jetzt aktualisiert.')}
          next={[
            {
              label: tx('Weitere Buchung aktualisieren'),
              onClick: () => {
                submit.reset();
                f.reset();
                setPickedId(null);
                setStep(1);
              },
            },
            {
              label: tx('Reinigung erfassen'),
              href: '#/intents/reinigung-erfassen',
            },
            {
              label: tx('Neue Buchung anlegen'),
              href: '#/intents/neue-buchung',
            },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
