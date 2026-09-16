/**
 * Buchung Status — 4-Schritt-Wizard.
 * Steps: 1) Buchung wählen (aktive Buchungen) → 2) Nächsten Status bestätigen →
 *        3) Reinigung anlegen (nur bei Auschecken, optional) → 4) Prüfen & anlegen.
 * Reads: buchungen (mit EnrichedBuchungen via ctx.ref), mitarbeiter (Reinigungskräfte).
 * Writes: buchungen (status update), reinigungen (create, bedingt).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, StepNav,
 *            SummaryStep, SuccessStep, StatusBadge, Field, Bound.
 */
import { useState, useMemo } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldText,
  fieldLookup,
  fieldDate,
  fieldRef,
  optionsOf,
  todayIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

/** Status-Reihenfolge für den Fortschritt */
const STATUS_FLOW: Record<string, string> = {
  anfrage: 'bestaetigt',
  bestaetigt: 'eingecheckt',
  eingecheckt: 'ausgecheckt',
};

export default function BuchungStatusPage() {
  const [step, setStep] = useState(1);

  // Schritt 1: Aktive Buchungen — nur anfrage | bestaetigt | eingecheckt
  const buchungen = useRecordSearch(servicePort, 'buchungen', {
    searchFields: ['buchungsnummer'],
    filter: "r.v_status in ['anfrage', 'bestaetigt', 'eingecheckt']",
    where: r => {
      const s = fieldLookup(r, 'status')?.key;
      return s === 'anfrage' || s === 'bestaetigt' || s === 'eingecheckt';
    },
    toItem: (b, ctx) => ({
      id: b.id,
      title: fieldText(b, 'buchungsnummer'),
      subtitle: [ctx.ref('wohnung'), ctx.ref('gast')].filter(Boolean).join(' · '),
      status: fieldLookup(b, 'status') ?? undefined,
      stats: [
        { label: tx('Anreise'), value: fieldDate(b, 'anreise') ?? '—' },
        { label: tx('Abreise'), value: fieldDate(b, 'abreise') ?? '—' },
      ],
    }),
    orderby: ['r.v_anreise asc'],
  });

  // Schritt 3: Reinigungskräfte — nur Mitarbeiter mit rolle=reinigung und status=aktiv
  const reinigungskraefte = useRecordSearch(servicePort, 'mitarbeiter', {
    searchFields: ['vorname', 'nachname'],
    filter: "r.v_rolle == 'reinigung' and r.v_status == 'aktiv'",
    where: r =>
      fieldLookup(r, 'rolle')?.key === 'reinigung' &&
      fieldLookup(r, 'status')?.key === 'aktiv',
    toItem: r => ({
      id: r.id,
      title: `${fieldText(r, 'vorname')} ${fieldText(r, 'nachname')}`.trim(),
      subtitle: fieldText(r, 'telefon') || undefined,
    }),
    orderby: ['r.v_nachname asc'],
  });

  // Form: Status-Advance (update buchungen)
  const statusForm = useStepForm('buchungen', {
    fields: ['status'],
    steps: { status: 2 },
    required: { status: true },
  });

  // Form: Reinigung anlegen
  const reinigungForm = useStepForm('reinigungen', {
    fields: ['datum', 'reinigungskraft'],
    steps: { datum: 3, reinigungskraft: 3 },
    initial: { datum: todayIso() },
  });

  // Gewählte Buchung und deren abgeleitete Werte
  const selectedBuchungId = statusForm.get('_buchungId') as string | undefined;
  const selectedBuchungRecord = selectedBuchungId
    ? buchungen.recordOf(selectedBuchungId)
    : undefined;
  const currentStatus = selectedBuchungRecord
    ? fieldLookup(selectedBuchungRecord, 'status')?.key
    : undefined;
  const nextStatusKey = currentStatus ? STATUS_FLOW[currentStatus] : undefined;

  // Wohnungs-ID aus der gewählten Buchung (für den Reinigungsplan)
  const wohnungId = selectedBuchungRecord
    ? fieldRef(selectedBuchungRecord, 'wohnung')
    : undefined;

  // Ob der nächste Status "ausgecheckt" ist → Reinigungsschritt aktivieren
  const isAusgecheckt = nextStatusKey === 'ausgecheckt';

  // Plan: 1) Buchungsstatus aktualisieren, 2) ggf. Reinigung anlegen
  const capturedWohnungId = wohnungId;
  const plan = isAusgecheckt
    ? [
        {
          key: 'statusUpdate',
          entity: 'buchungen' as const,
          updates: selectedBuchungId ?? '',
          values: nextStatusKey ? { status: nextStatusKey } : {},
          primary: true,
          verb: 'update' as const,
          label: tx('Status aktualisieren'),
        },
        {
          key: 'reinigung',
          entity: 'reinigungen' as const,
          form: reinigungForm,
          needs: ['statusUpdate'],
          values: (ctx: { port: unknown; done: Record<string, { id: string }> }) => ({
            wohnung: capturedWohnungId ?? '',
            buchung: ctx.done['statusUpdate']?.id ?? '',
            status: 'offen',
          }),
          label: tx('Reinigung anlegen'),
        },
      ]
    : [
        {
          key: 'statusUpdate',
          entity: 'buchungen' as const,
          updates: selectedBuchungId ?? '',
          values: nextStatusKey ? { status: nextStatusKey } : {},
          primary: true,
          verb: 'update' as const,
          label: tx('Status aktualisieren'),
        },
      ];

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'buchung-status' });

  // Nächster-Status-Optionen für ChoiceGroup: nur genau die eine erlaubte Option
  const nextStatusOptions = useMemo(() => {
    if (!nextStatusKey) return [];
    const allOptions = optionsOf('buchungen', 'status');
    return allOptions.filter(o => o.key === nextStatusKey);
  }, [nextStatusKey]);

  // Beim Laden der Buchung den nächsten Status vorausfüllen
  const handleBuchungSelect = (id: string) => {
    const rec = buchungen.recordOf(id);
    const curStatus = rec ? fieldLookup(rec, 'status')?.key : undefined;
    const nxt = curStatus ? STATUS_FLOW[curStatus] : undefined;
    // _buchungId ist ein internes Steuerfeld (kein echtes Buchungsfeld)
    // Wir nutzen statusForm.set nur für das echte Feld 'status'
    if (nxt) statusForm.set('status', nxt);
    // Den Record in einem separaten state merken
    setSelectedId(id);
    buchungen.labelOf(id); // warm-up label
    setStep(2);
  };

  // Getrennter State für die Buchungs-ID (da _buchungId kein Buchungsfeld ist)
  const [selectedId, setSelectedId] = useState<string>('');

  const restart = () => {
    submit.reset();
    statusForm.reset();
    reinigungForm.reset({ datum: todayIso() });
    setSelectedId('');
    setStep(1);
  };

  // Label der gewählten Buchung für Zusammenfassung
  const buchungLabel = selectedId ? (buchungen.labelOf(selectedId) ?? selectedId) : '—';
  const wohnungLabel = selectedBuchungRecord
    ? buchungen.refLabel(selectedBuchungRecord, 'wohnung')
    : undefined;
  const gastLabel = selectedBuchungRecord
    ? buchungen.refLabel(selectedBuchungRecord, 'gast')
    : undefined;

  return (
    <IntentWizardShell
      title={tx('Buchungsstatus ändern')}
      subtitle={tx('Status Schritt für Schritt weiterführen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[statusForm, reinigungForm]}
      draftKey="buchung-status"
      intro={{
        description: tx('Führe eine aktive Buchung zum nächsten Statusschritt weiter.'),
        needs: [tx('Buchungsnummer'), tx('Zugangscode oder Absprache zur Übergabe')],
      }}
    >
      {/* Schritt 1: Buchung wählen */}
      <WizardStep
        label={tx('Buchung')}
        description={tx('Wähle eine aktive Buchung, deren Status du ändern möchtest.')}
      >
        <EntitySelectStep
          {...buchungen.select}
          selectedId={selectedId || null}
          onSelect={handleBuchungSelect}
          avatar="none"
          searchPlaceholder={tx('Buchungsnummer suchen …')}
          emptyText={tx('Keine aktiven Buchungen gefunden. Alle Buchungen sind bereits abgeschlossen oder storniert.')}
          create={false}
          columns={1}
        />
      </WizardStep>

      {/* Schritt 2: Nächsten Status bestätigen */}
      <WizardStep
        label={tx('Status')}
        description={tx('Bestätige den nächsten Statusschritt für diese Buchung.')}
        needs={['status']}
      >
        {selectedId ? (
          <div className="space-y-6">
            {/* Buchungsinfo-Karte */}
            <div className="rounded-xl border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">{buchungLabel}</span>
                {currentStatus && (
                  <StatusBadge
                    statusKey={currentStatus}
                    label={fieldLookup(selectedBuchungRecord!, 'status')?.label}
                  />
                )}
              </div>
              {wohnungLabel && (
                <div className="text-sm text-muted-foreground">{wohnungLabel}</div>
              )}
              {gastLabel && (
                <div className="text-sm text-muted-foreground">{gastLabel}</div>
              )}
              <div className="flex gap-4 text-sm text-muted-foreground">
                {selectedBuchungRecord && (
                  <>
                    <span>{tx('Anreise')}: {fieldDate(selectedBuchungRecord, 'anreise') ?? '—'}</span>
                    <span>{tx('Abreise')}: {fieldDate(selectedBuchungRecord, 'abreise') ?? '—'}</span>
                  </>
                )}
              </div>
            </div>

            {/* Nächster Status */}
            {nextStatusKey ? (
              <Field form={statusForm} name="status" label={tx('Neuer Status')}>
                <ChoiceGroup
                  {...statusForm.choice('status')}
                  options={nextStatusOptions}
                />
              </Field>
            ) : (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {tx('Für diese Buchung ist kein weiterer Statusschritt möglich.')}
              </div>
            )}

            <StepNav
              onBack={() => setStep(1)}
              onNext={() => {
                if (!nextStatusKey) return tx('Kein weiterer Schritt möglich.');
                return statusForm.validate(['status']);
              }}
              nextStepLabel={isAusgecheckt ? tx('Reinigung') : tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst eine Buchung auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Reinigung anlegen (nur bei Auschecken) */}
      <WizardStep
        label={tx('Reinigung')}
        description={tx('Lege eine Reinigungsaufgabe für die ausgecheckte Wohnung an.')}
        enabledIf={isAusgecheckt}
      >
        <div className="space-y-6">
          <Bound form={reinigungForm} name="datum" label={tx('Reinigungsdatum')} />

          <Field
            form={reinigungForm}
            name="reinigungskraft"
            label={tx('Reinigungskraft')}
          >
            <EntitySelectStep
              {...reinigungskraefte.select}
              {...reinigungForm.records('reinigungskraft', reinigungskraefte.labelOf)}
              avatar="initials"
              searchPlaceholder={tx('Name suchen …')}
              emptyText={tx('Keine aktive Reinigungskraft gefunden. Bitte in den Mitarbeiterdaten prüfen.')}
              create={false}
            />
          </Field>

          <StepNav
            onBack={() => setStep(2)}
            onNext={() => reinigungForm.validate(['datum', 'reinigungskraft'])}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      {/* Schritt 4: Prüfen & Bestätigen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done ? (
          <SummaryStep
            forms={isAusgecheckt ? [statusForm, reinigungForm] : [statusForm]}
            submit={submit}
            items={[
              {
                key: '_buchung',
                label: tx('Buchung'),
                value: buchungLabel,
              },
              ...(wohnungLabel
                ? [{ key: '_wohnung', label: tx('Wohnung'), value: wohnungLabel }]
                : []),
              ...(gastLabel
                ? [{ key: '_gast', label: tx('Gast'), value: gastLabel }]
                : []),
              {
                key: '_neuer_status',
                label: tx('Neuer Status'),
                value: nextStatusOptions[0]?.label ?? nextStatusKey ?? '—',
              },
            ]}
            whatHappensNext={
              isAusgecheckt
                ? tx('Der Buchungsstatus wird auf „Ausgecheckt" gesetzt und eine Reinigungsaufgabe wird angelegt.')
                : tx('Der Buchungsstatus wird sofort aktualisiert.')
            }
            confirmLabel={tx('Status aktualisieren')}
          />
        ) : null}
      </WizardStep>

      {/* Erfolgsmeldung */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={isAusgecheckt ? [statusForm, reinigungForm] : [statusForm]}
          verb="updated"
          actions={{ copy: false, print: false }}
          whatHappensNext={
            isAusgecheckt
              ? tx('Die Reinigungsaufgabe erscheint im Ablauf „Reinigung abhaken".')
              : undefined
          }
          next={[
            {
              label: tx('Weitere Buchung'),
              onClick: restart,
            },
            ...(isAusgecheckt
              ? [
                  {
                    label: tx('Reinigung abhaken'),
                    href: '#/intents/reinigung-abschliessen' as const,
                  },
                ]
              : [
                  {
                    label: tx('Neue Buchung'),
                    href: '#/intents/neue-buchung' as const,
                  },
                ]),
            {
              label: tx('Zum Dashboard'),
              href: '#/' as const,
            },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
