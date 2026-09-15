/**
 * Neue Buchung — 4-Schritt-Wizard.
 * Steps: 1) Wohnung wählen → 2) Reisedaten → 3) Gast wählen oder anlegen → 4) Prüfen & anlegen.
 * Reads: wohnungen, gaeste, buchungen (Belegung). Writes: buchungen (createBuchungenEntry).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, AvailabilityRangePicker,
 *           Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { AvailabilityRangePicker } from '@/components/blocks/AvailabilityRangePicker';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  useOccupancy,
  useRecordCount,
  fieldText,
  fieldNumber,
  todayIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function NeueBuchungPage() {
  const [step, setStep] = useState(1);

  // ── Step 1: Wohnungen — nur verfügbare ─────────────────────────────────────
  const wohnungen = useRecordSearch(servicePort, 'wohnungen', {
    searchFields: ['name'],
    filter: "r.v_status == 'verfuegbar'",
    where: r => {
      const s = r.fields['status'] as { key?: string } | null | undefined;
      return s?.key === 'verfuegbar';
    },
    toItem: w => ({
      id: w.id,
      title: fieldText(w, 'name'),
      subtitle: tx`${fieldNumber(w, 'schlafplaetze') ?? 0} Schlafplätze · ${
        fieldNumber(w, 'grundpreis_pro_nacht') != null
          ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
              fieldNumber(w, 'grundpreis_pro_nacht')!
            ) + tx(' / Nacht')
          : ''
      }`,
    }),
  });

  // ── Form: buchungen ─────────────────────────────────────────────────────────
  const buchung = useStepForm('buchungen', {
    steps: {
      wohnung: 1,
      anreise: 2,
      abreise: 2,
      anzahl_personen: 2,
      gast: 3,
      buchungsnummer: 4,
      status: 4,
      gesamtpreis: 4,
    },
    // buchungsnummer, status, gesamtpreis are plan-supplied; not required by THIS form
    required: { buchungsnummer: false, status: false, gesamtpreis: false },
    initial: { status: 'anfrage' },
  });

  const wohnungId = buchung.get('wohnung') as string | undefined;
  const anreise = buchung.get('anreise') as string | null;
  const abreise = buchung.get('abreise') as string | null;

  // ── Belegung für die gewählte Wohnung ─────────────────────────────────────
  const belegung = useOccupancy(servicePort, 'buchungen', { resource: wohnungId ?? null });

  // ── Step 3: Gäste ─────────────────────────────────────────────────────────
  const gaeste = useRecordSearch(servicePort, 'gaeste', {
    searchFields: ['vorname', 'nachname', 'email'],
    toItem: g => ({
      id: g.id,
      title: `${fieldText(g, 'vorname')} ${fieldText(g, 'nachname')}`.trim(),
      subtitle: fieldText(g, 'email') || fieldText(g, 'telefon') || undefined,
    }),
    orderby: ['r.v_nachname asc'],
  });

  // ── Buchungszähler für die Buchungsnummer (B-YYYY-NNN) ────────────────────
  const buchungsCount = useRecordCount(servicePort, 'buchungen');

  // ── Gesamtpreis berechnen ─────────────────────────────────────────────────
  const wohnungRecord = wohnungId ? wohnungen.recordOf(wohnungId) : undefined;
  const grundpreis = wohnungRecord ? (fieldNumber(wohnungRecord, 'grundpreis_pro_nacht') ?? 0) : 0;
  const endreinigung = wohnungRecord ? (fieldNumber(wohnungRecord, 'endreinigung_preis') ?? 0) : 0;

  let naechte = 0;
  if (anreise && abreise) {
    const from = new Date(anreise);
    const to = new Date(abreise);
    naechte = Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
  }
  const gesamtpreis = naechte * grundpreis + endreinigung;

  // ── Buchungsnummer ableiten ───────────────────────────────────────────────
  const jahr = format(new Date(), 'yyyy');
  const laufnummer = buchungsCount.count != null
    ? String(buchungsCount.count + 1).padStart(3, '0')
    : '???';
  const buchungsnummer = `B-${jahr}-${laufnummer}`;

  // ── Plan ──────────────────────────────────────────────────────────────────
  const submit = useJourneySubmit(servicePort, [
    {
      key: 'buchung',
      entity: 'buchungen',
      form: buchung,
      primary: true,
      values: () => ({
        buchungsnummer,
        status: 'anfrage',
        gesamtpreis,
      }),
    },
  ], { draftKey: 'neue-buchung' });

  return (
    <IntentWizardShell
      title={tx('Neue Buchung')}
      currentStep={step}
      onStepChange={setStep}
      forms={[buchung]}
      draftKey="neue-buchung"
      intro={{
        description: tx('Eine neue Buchung für eine Wohnung anlegen.'),
        needs: [tx('Wohnungsauswahl'), tx('An- und Abreisedatum'), tx('Gastdaten')],
      }}
    >
      {/* ── Schritt 1: Wohnung wählen ───────────────────────────────────── */}
      <WizardStep
        label={tx('Wohnung')}
        description={tx('Nur verfügbare Wohnungen werden angezeigt.')}
      >
        <EntitySelectStep
          {...wohnungen.select}
          selectedId={wohnungId ?? null}
          avatar="none"
          emptyText={tx('Keine Wohnung ist derzeit verfügbar.')}
          create={false}
          onSelect={id => {
            buchung.set('wohnung', id, wohnungen.labelOf(id));
            setStep(2);
          }}
        />
      </WizardStep>

      {/* ── Schritt 2: Reisedaten ───────────────────────────────────────── */}
      <WizardStep
        label={tx('Reisedaten')}
        description={tx('An- und Abreise wählen — belegte Nächte sind ausgegraut.')}
        needs={['wohnung']}
      >
        <div className="space-y-6">
          <AvailabilityRangePicker
            {...buchung.range('anreise', 'abreise', { blocked: belegung.blocked })}
            disablePast
            legend
          />
          <Bound form={buchung} name="anzahl_personen" />
          <StepNav
            onNext={() => buchung.validate(['anreise', 'abreise', 'anzahl_personen'])}
            nextStepLabel={tx('Gast')}
          />
        </div>
      </WizardStep>

      {/* ── Schritt 3: Gast wählen oder anlegen ────────────────────────── */}
      <WizardStep
        label={tx('Gast')}
        description={tx('Einen vorhandenen Gast suchen oder einen neuen Gast anlegen.')}
        needs={['anreise', 'abreise']}
      >
        <EntitySelectStep
          {...gaeste.select}
          selectedId={buchung.get('gast') as string | null}
          create={{ fields: ['vorname', 'nachname', 'email', 'telefon'] }}
          createLabel={tx('Neuen Gast anlegen')}
          searchPlaceholder={tx('Name oder E-Mail suchen …')}
          onSelect={id => {
            buchung.set('gast', id, gaeste.labelOf(id));
            setStep(4);
          }}
        />
      </WizardStep>

      {/* ── Schritt 4: Prüfen & anlegen ─────────────────────────────────── */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[buchung]}
            submit={submit}
            items={[
              {
                key: 'buchungsnummer',
                label: tx('Buchungsnummer'),
                value: buchungsnummer,
              },
              {
                key: 'naechte',
                label: tx('Nächte'),
                value: String(naechte),
              },
              {
                key: 'gesamtpreis',
                label: tx('Gesamtpreis'),
                value: new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(gesamtpreis),
              },
              {
                key: 'status',
                label: tx('Status'),
                value: tx('Anfrage'),
              },
            ]}
            whatHappensNext={tx('Die Buchung wird als Anfrage angelegt und erscheint sofort in der Buchungsübersicht.')}
            confirmLabel={tx('Buchung anlegen')}
          />
        )}
      </WizardStep>

      {/* ── Erfolgsmeldung ─────────────────────────────────────────────── */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[buchung]}
          submit={submit}
          restartLabel={tx('Weitere Buchung')}
          whatHappensNext={tx('Die Buchung kann jetzt bestätigt oder direkt verwaltet werden.')}
          next={[
            {
              label: tx('Buchung verwalten'),
              href: '#/intents/buchung-verwalten',
            },
            {
              label: tx('Reinigung abhaken'),
              href: '#/intents/reinigung-abhaken',
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
