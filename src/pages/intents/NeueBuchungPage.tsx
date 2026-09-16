/**
 * Neue Buchung — 4-Schritt-Wizard.
 * Steps: 1) Wohnung wählen → 2) Zeitraum wählen → 3) Gast wählen → 4) Details → 5) Prüfen & anlegen.
 * Reads: wohnungen (verfügbar), gaeste, buchungen (Belegung). Writes: buchungen (createBuchungenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, AvailabilityRangePicker, ChoiceGroup, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { AvailabilityRangePicker } from '@/components/blocks/AvailabilityRangePicker';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';
import { Field } from '@/components/blocks/Field';
import { Input } from '@/components/ui/input';
import {
  useRecordSearch,
  useOccupancy,
  useStepForm,
  useJourneySubmit,
  fieldText,
  fieldLookup,
  fieldNumber,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

const DRAFT_KEY = 'neue-buchung';

export default function NeueBuchungPage() {
  const [step, setStep] = useState(1);

  // ONE form for buchungen
  const buchung = useStepForm('buchungen', {
    steps: {
      wohnung: 1,
      anreise: 2,
      abreise: 2,
      gast: 3,
      buchungsnummer: 4,
      anzahl_personen: 4,
      status: 4,
      notizen: 4,
    },
    initial: { status: 'anfrage' },
  });

  // Selected wohnung id — drive the occupancy hook
  const wohnungId = buchung.get('wohnung') as string | null;
  const anreise = buchung.get('anreise') as string | null;
  const abreise = buchung.get('abreise') as string | null;

  // Occupancy for the selected wohnung
  const belegung = useOccupancy(servicePort, 'buchungen', {
    resource: wohnungId ?? null,
  });

  // Wohnungen: only verfuegbar
  const wohnungen = useRecordSearch(servicePort, 'wohnungen', {
    filter: "r.v_status == 'verfuegbar'", /* i18n-exempt */
    where: r => fieldLookup(r, 'status')?.key === 'verfuegbar',
    searchFields: ['name'],
    toItem: w => ({
      id: w.id,
      title: fieldText(w, 'name'),
      subtitle: (() => {
        const preis = fieldNumber(w, 'grundpreis_pro_nacht');
        return preis != null ? tx`${preis.toLocaleString('de-DE')} €/Nacht` : undefined;
      })(),
      status: fieldLookup(w, 'status') ?? undefined,
    }),
  });

  // Gaeste: alle
  const gaeste = useRecordSearch(servicePort, 'gaeste', {
    searchFields: ['vorname', 'nachname', 'email'],
    toItem: g => ({
      id: g.id,
      title: `${fieldText(g, 'vorname')} ${fieldText(g, 'nachname')}`.trim() || tx('Unbekannt'),
      subtitle: fieldText(g, 'email') || undefined,
    }),
    orderby: ['r.v_nachname asc'],
  });

  // Nächte und Gesamtpreis berechnen
  const naechte =
    anreise && abreise
      ? Math.max(0, differenceInCalendarDays(parseISO(abreise), parseISO(anreise)))
      : null;

  const wohnungRecord = wohnungId ? wohnungen.recordOf(wohnungId) : undefined;
  const grundpreis = wohnungRecord ? fieldNumber(wohnungRecord, 'grundpreis_pro_nacht') ?? 0 : 0;
  const endreinigung = wohnungRecord ? fieldNumber(wohnungRecord, 'endreinigung_preis') ?? 0 : 0;
  const gesamtpreis =
    naechte != null && naechte > 0 ? naechte * grundpreis + endreinigung : null;

  // Plan: eine Buchung anlegen
  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'buchung',
        entity: 'buchungen',
        form: buchung,
        primary: true,
        values: gesamtpreis != null ? { gesamtpreis } : {},
      },
    ],
    { draftKey: DRAFT_KEY },
  );

  return (
    <IntentWizardShell
      title={tx('Neue Buchung')}
      currentStep={step}
      onStepChange={setStep}
      forms={[buchung]}
      draftKey={DRAFT_KEY}
      intro={{
        description: tx('Wohnung wählen, Zeitraum festlegen und Gast zuordnen — fertig.'),
        needs: [tx('Wohnung verfügbar'), tx('Gästedaten')],
      }}
    >
      {/* Schritt 1: Wohnung wählen */}
      <WizardStep
        label={tx('Wohnung')}
        description={tx('Welche Wohnung soll gebucht werden?')}
      >
        <EntitySelectStep
          {...wohnungen.select}
          selectedId={wohnungId}
          onSelect={id => {
            buchung.set('wohnung', id, wohnungen.labelOf(id));
            setStep(2);
          }}
          emptyText={tx('Keine Wohnung ist derzeit als verfügbar markiert.')}
          create={false}
          avatar="none"
        />
      </WizardStep>

      {/* Schritt 2: Zeitraum wählen */}
      <WizardStep
        label={tx('Zeitraum')}
        description={tx('An- und Abreise wählen — belegte Nächte sind ausgegraut.')}
        needs={['wohnung']}
      >
        <div className="space-y-4">
          <AvailabilityRangePicker
            {...buchung.range('anreise', 'abreise', {
              blocked: belegung.blocked,
            })}
            disablePast
            legend
          />
          {naechte != null && naechte > 0 && gesamtpreis != null && (
            <div className="rounded-xl bg-secondary px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {naechte === 1
                    ? tx('1 Nacht')
                    : `${naechte} ${tx('Nächte')}`}
                  {' × '}
                  {grundpreis.toLocaleString('de-DE')} €
                </span>
                <span>{(naechte * grundpreis).toLocaleString('de-DE')} €</span>
              </div>
              {endreinigung > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{tx('Endreinigung')}</span>
                  <span>{endreinigung.toLocaleString('de-DE')} €</span>
                </div>
              )}
              <div className="flex justify-between font-semibold pt-1 border-t border-border">
                <span>{tx('Gesamtpreis')}</span>
                <span>{gesamtpreis.toLocaleString('de-DE')} €</span>
              </div>
            </div>
          )}
          <StepNav
            onNext={() => buchung.validate(['anreise', 'abreise'])}
            nextStepLabel={tx('Gast')}
          />
        </div>
      </WizardStep>

      {/* Schritt 3: Gast wählen */}
      <WizardStep
        label={tx('Gast')}
        description={tx('Bestehenden Gast suchen oder neu anlegen.')}
        needs={['anreise', 'abreise']}
      >
        <EntitySelectStep
          {...gaeste.select}
          selectedId={buchung.get('gast') as string | null}
          onSelect={id => {
            buchung.set('gast', id, gaeste.labelOf(id));
            setStep(4);
          }}
          create={{ fields: ['vorname', 'nachname', 'email'] }}
          createLabel={tx('Neuen Gast anlegen')}
          searchPlaceholder={tx('Name oder E-Mail suchen …')}
          avatar="initials"
        />
      </WizardStep>

      {/* Schritt 4: Details */}
      <WizardStep
        label={tx('Details')}
        description={tx('Buchungsnummer und weitere Angaben eintragen.')}
        needs={['gast']}
      >
        <div className="space-y-4">
          <Field
            form={buchung}
            name="buchungsnummer"
            hint={tx('Muster: B-2026-001')}
          >
            <Input {...buchung.field('buchungsnummer')} placeholder="B-2026-001" />
          </Field>
          <Bound form={buchung} name="anzahl_personen" />
          <Field form={buchung} name="status">
            <ChoiceGroup {...buchung.choice('status')} />
          </Field>
          <Bound form={buchung} name="notizen" rows={3} />
          <StepNav
            onNext={() =>
              buchung.validate(['buchungsnummer', 'anzahl_personen', 'status'])
            }
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      {/* Schritt 5: Prüfen & anlegen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[buchung]}
            submit={submit}
            items={
              gesamtpreis != null
                ? [
                    {
                      key: '_gesamtpreis',
                      label: tx('Gesamtpreis'),
                      value: `${gesamtpreis.toLocaleString('de-DE')} €`,
                    },
                  ]
                : []
            }
            whatHappensNext={tx(
              'Die Buchung wird mit Status „Anfrage" angelegt und erscheint sofort in der Buchungsübersicht.',
            )}
          />
        )}
      </WizardStep>

      {/* Erfolgsmeldung */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[buchung]}
          submit={submit}
          restartLabel={tx('Weitere Buchung anlegen')}
          whatHappensNext={tx(
            'Jetzt den Status bestätigen oder direkt die Reinigung einplanen.',
          )}
          next={[
            {
              label: tx('Buchung bearbeiten'),
              href: '#/intents/buchung-status',
            },
            {
              label: tx('Reinigung erfassen'),
              href: '#/intents/reinigung-erfassen',
            },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
