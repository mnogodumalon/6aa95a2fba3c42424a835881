import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  prepareChallenge,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { tx } from '@/i18n';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  useOccupancy,
  occupancyFor,
  formatRange,
  type JourneyRecord,
} from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { IntentWizardShell, type WizardStep } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { AvailabilityRangePicker } from '@/components/blocks/AvailabilityRangePicker';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import {
  IconBed,
  IconWifi,
  IconParking,
  IconPaw,
  IconDoor,
  IconToolsKitchen2,
  IconSunrise,
  IconCheck,
  IconUsers,
  IconCurrencyEuro,
} from '@tabler/icons-react';

// ── Ausstattungs-Icons ──────────────────────────────────────────────────────
const AUSSTATTUNG_ICONS: Record<string, React.ReactNode> = {
  seeblick: <IconSunrise size={16} className="shrink-0" />,
  kueche: <IconToolsKitchen2 size={16} className="shrink-0" />,
  wlan: <IconWifi size={16} className="shrink-0" />,
  parkplatz: <IconParking size={16} className="shrink-0" />,
  haustiere_erlaubt: <IconPaw size={16} className="shrink-0" />,
  balkon: <IconDoor size={16} className="shrink-0" />,
};

// ── Wizard-Schritte ──────────────────────────────────────────────────────────
// ── Wohnungs-Karte ────────────────────────────────────────────────────────────
interface WohnungItem {
  id: string;
  name: string;
  beschreibung: string | null;
  schlafplaetze: number;
  grundpreis_pro_nacht: number;
  endreinigung_preis: number | null;
  ausstattung: string[];
  foto: string | null;
}

function WohnungCard({
  item,
  selected,
  onSelect,
}: {
  item: WohnungItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const AUSSTATTUNG_LABELS: Record<string, string> = {
  seeblick: 'Seeblick',
  kueche: 'Küche',
  wlan: 'WLAN',
  parkplatz: 'Parkplatz',
  haustiere_erlaubt: 'Haustiere erlaubt',
  balkon: 'Balkon',
};

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full text-left rounded-xl border-2 transition-all overflow-hidden',
        selected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-border hover:border-primary/40',
      ].join(' ')}
    >
      {item.foto && (
        <img
          src={item.foto}
          alt={item.name}
          className="w-full h-44 object-cover"
          loading="lazy"
        />
      )}
      {!item.foto && (
        <div className="w-full h-32 bg-muted flex items-center justify-center">
          <IconBed size={40} className="text-muted-foreground" stroke={1.5} />
        </div>
      )}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-base truncate">{item.name}</p>
            {item.beschreibung && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                {item.beschreibung}
              </p>
            )}
          </div>
          {selected && (
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
              <IconCheck size={14} className="text-primary-foreground" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {item.ausstattung.map((key) => (
            <span
              key={key}
              className="flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground"
            >
              {AUSSTATTUNG_ICONS[key]}
              {AUSSTATTUNG_LABELS[key] ?? key}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <IconBed size={15} className="shrink-0" />
            {item.schlafplaetze} {tx('Schlafplätze')}
          </span>
          <span className="flex items-center gap-0.5 font-semibold text-sm">
            <IconCurrencyEuro size={15} className="shrink-0" />
            {item.grundpreis_pro_nacht.toLocaleString('de-DE', { minimumFractionDigits: 0 })}
            <span className="font-normal text-muted-foreground ml-0.5">{tx('/ Nacht')}</span>
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────
export default function Buchungsanfrage() {
  const STEPS: WizardStep[] = [
  {
    label: tx('Wohnung'),
    key: 'wohnung',
    heading: tx('Wohnung wählen'),
    description: tx('Wähle eine verfügbare Ferienwohnung am Chiemsee.'),
  },
  {
    label: tx('Zeitraum'),
    key: 'zeitraum',
    heading: tx('Zeitraum & Personen'),
    description: tx('Wähle deinen Aufenthalt — belegte Nächte sind gesperrt.'),
  },
  {
    label: tx('Kontakt'),
    key: 'kontakt',
    heading: tx('Deine Kontaktdaten'),
    description: tx('Damit wir deine Anfrage bearbeiten können.'),
  },
  {
    label: tx('Prüfen'),
    key: 'prüfen',
    heading: tx('Zusammenfassung'),
  },
];

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);

  // State für gewählte Wohnung (ID + Label für Formular)
  const [selectedWohnungId, setSelectedWohnungId] = useState<string | null>(null);
  const [selectedWohnungLabel, setSelectedWohnungLabel] = useState<string>('');

  useEffect(() => {
    loadPublicPagesConfig('buchungsanfrage')
      .then((c) => {
        setCfg(c);
        setPage(c?.pages['buchungsanfrage'] ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof PageUnavailableError) {
          setLoading(false);
        }
      });
  }, []);

  const port = useMemo(
    () => (cfg && page ? createPublicPort(cfg, page) : null),
    [cfg, page],
  );

  // ── Formulare ──────────────────────────────────────────────────────────────
  // Gäste-Formular
  const gastForm = useStepForm('gaeste', {
    fields: ['vorname', 'nachname', 'email', 'telefon'],
    required: { vorname: true, nachname: true, email: false, telefon: false },
    steps: { vorname: 3, nachname: 3, email: 3, telefon: 3 },
    autoComplete: true,
  });

  // Buchungs-Formular
  const buchungForm = useStepForm('buchungen', {
    fields: ['wohnung', 'anreise', 'abreise', 'anzahl_personen'],
    required: { wohnung: true, anreise: true, abreise: true, anzahl_personen: true },
    steps: { wohnung: 1, anreise: 2, abreise: 2, anzahl_personen: 2 },
    autoComplete: true,
  });

  // ── Record-Suche: Wohnungen (scope im surface.json schränkt bereits auf verfuegbar ein) ──
  const wohnungenSearch = useRecordSearch(port!, 'wohnungen', {
    searchFields: ['name', 'beschreibung'],
    where: (r) => (r.fields.status as { key?: string } | null)?.key === 'verfuegbar',
    orderby: ['r.v_name'],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    toItem: (r, _ctx) => ({
      id: r.id,
      title: (r.fields.name as string) ?? '',
    }),
  });

  // ── Belegung: Buchungen laden ──────────────────────────────────────────────
  const buchungenSearch = useRecordSearch(port!, 'buchungen', {
    searchFields: [],
    orderby: [],
  });

  // Belegte Zeiträume für die gewählte Wohnung
  const occupancyBlocked = useMemo(() => {
    if (!selectedWohnungId) return [];
    return occupancyFor('buchungen', buchungenSearch.records, {
      resource: selectedWohnungId,
    });
  }, [buchungenSearch.records, selectedWohnungId]);

  // Zusätzlich: useOccupancy für isFree-Check
  const occupancy = useOccupancy(port!, 'buchungen', {
    resource: selectedWohnungId,
  });

  // ── Submit-Plan: erst Gast, dann Buchung (mit Link auf Gast) ──────────────
  const submit = useJourneySubmit(
    port!,
    [
      {
        key: 'gast',
        entity: 'gaeste',
        form: gastForm,
      },
      {
        key: 'buchung',
        entity: 'buchungen',
        form: buchungForm,
        primary: true,
        needs: ['gast'],
        link: { gast: 'gast' },
      },
    ],
    { draftKey: 'buchungsanfrage' },
  );

  // ── Wohnungs-Karten aus den geladenen Records aufbauen ────────────────────
  const wohnungItems: WohnungItem[] = useMemo(() => {
    return wohnungenSearch.records.map((r) => {
      const ausstattungRaw = r.fields.ausstattung;
      let ausstattung: string[] = [];
      if (Array.isArray(ausstattungRaw)) {
        ausstattung = ausstattungRaw.map((v: unknown) => {
          if (typeof v === 'string') return v;
          if (v && typeof v === 'object' && 'key' in v) return String((v as { key: unknown }).key);
          return '';
        }).filter(Boolean);
      }
      return {
        id: r.id,
        name: (r.fields.name as string) ?? '',
        beschreibung: (r.fields.beschreibung as string | null) ?? null,
        schlafplaetze: (r.fields.schlafplaetze as number) ?? 0,
        grundpreis_pro_nacht: (r.fields.grundpreis_pro_nacht as number) ?? 0,
        endreinigung_preis: (r.fields.endreinigung_preis as number | null) ?? null,
        ausstattung,
        foto: (r.fields.foto as string | null) ?? null,
      };
    });
  }, [wohnungenSearch.records]);

  // ── Challenge vorbereiten beim ersten Klick ───────────────────────────────
  const handleFirstInteraction = () => {
    if (!cfg || !page) return;
    const gastEp = page.endpoints?.find((e) => e.entity === 'gaeste' && e.op === 'create');
    const buchungEp = page.endpoints?.find((e) => e.entity === 'buchungen' && e.op === 'create');
    if (gastEp?.app_id) prepareChallenge(cfg, page, 'POST', `/apps/${gastEp.app_id}/records`);
    if (buchungEp?.app_id) prepareChallenge(cfg, page, 'POST', `/apps/${buchungEp.app_id}/records`);
  };

  // ── Schritt-Navigation ────────────────────────────────────────────────────
  const handleSelectWohnung = (item: WohnungItem) => {
    setSelectedWohnungId(item.id);
    setSelectedWohnungLabel(item.name);
    buchungForm.set('wohnung', item.id, item.name);
    handleFirstInteraction();
  };

  const handleNextStep1 = () => {
    if (!selectedWohnungId) return tx('Bitte eine Wohnung auswählen.');
    if (!buchungForm.validate(['wohnung'])) return false;
    return true;
  };

  const handleNextStep2 = () => {
    if (!buchungForm.validate(['anreise', 'abreise', 'anzahl_personen'])) return false;
    const from = buchungForm.get('anreise') as string | null;
    const to = buchungForm.get('abreise') as string | null;
    if (from && to && !occupancy.isFree(from, to, selectedWohnungId)) {
      return tx('Der gewählte Zeitraum ist bereits belegt. Bitte einen anderen Zeitraum wählen.');
    }
    return true;
  };

  const handleNextStep3 = () => {
    return gastForm.validate(['vorname', 'nachname']);
  };

  // ── Preis-Berechnung für Zusammenfassung ──────────────────────────────────
  const selectedWohnung = useMemo(
    () => wohnungItems.find((w) => w.id === selectedWohnungId),
    [wohnungItems, selectedWohnungId],
  );

  const priceItems = useMemo(() => {
    const from = buchungForm.get('anreise') as string | null;
    const to = buchungForm.get('abreise') as string | null;
    if (!selectedWohnung || !from || !to) return [];
    const nights = Math.max(
      0,
      Math.round(
        (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000,
      ),
    );
    const items = [
      {
        key: 'naechte',
        label: tx('Übernachtungen'),
        value: `${nights} × ${selectedWohnung.grundpreis_pro_nacht.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`,
        step: 2,
      },
    ];
    if (selectedWohnung.endreinigung_preis) {
      items.push({
        key: 'reinigung',
        label: tx('Endreinigung'),
        value: selectedWohnung.endreinigung_preis.toLocaleString('de-DE', {
          style: 'currency',
          currency: 'EUR',
        }),
        step: 1,
      });
    }
    const total =
      nights * selectedWohnung.grundpreis_pro_nacht +
      (selectedWohnung.endreinigung_preis ?? 0);
    items.push({
      key: 'gesamt',
      label: tx('Geschätzter Gesamtpreis'),
      value: total.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }),
      step: 2,
    });
    return items;
  }, [selectedWohnung, buchungForm]);

  // ── Loading / Unavailable ─────────────────────────────────────────────────
  if (loading) return <PublicShell loading />;
  if (!cfg || !page || !port) return <PublicShell unavailable />;

  // ── Erfolgsseite ──────────────────────────────────────────────────────────
  if (submit.result) {
    return (
      <PublicShell
        title={tx('Buchungsanfrage gestellt')}
        description={tx('Ferienwohnungen am Chiemsee')}
      >
        <SuccessStep
          result={submit.result}
          forms={[buchungForm, gastForm]}
          whatHappensNext={tx('Wir prüfen deine Anfrage und melden uns innerhalb von 24 Stunden per E-Mail oder Telefon.')}
          next={[
            {
              label: tx('Weitere Anfrage stellen'),
              onClick: () => {
                submit.reset();
                gastForm.reset();
                buchungForm.reset();
                setSelectedWohnungId(null);
                setSelectedWohnungLabel('');
                setStep(1);
              },
            },
          ]}
          referencePrefix="B"
          submit={submit}
          restartLabel={tx('Neue Anfrage')}
        />
      </PublicShell>
    );
  }

  return (
    <PublicShell
      title={tx('Buchungsanfrage')}
      description={tx('Ferienwohnungen Seeblick am Chiemsee')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[gastForm, buchungForm]}
        draftKey="buchungsanfrage"
        intro={{
          description: tx('In wenigen Schritten zur Buchungsanfrage für deine Ferienwohnung am Chiemsee.'),
          needs: [tx('E-Mail-Adresse'), tx('Reisedaten')],
          estimatedMinutes: 3,
        }}
      >
        {/* ── Schritt 1: Wohnung wählen ─────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            {wohnungenSearch.select.loading && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {tx('Verfügbare Wohnungen werden geladen…')}
              </p>
            )}
            {wohnungenSearch.select.error && (
              <p className="text-sm text-destructive text-center py-6">
                {tx('Wohnungen konnten nicht geladen werden.')}
              </p>
            )}
            {!wohnungenSearch.select.loading && wohnungItems.length === 0 && !wohnungenSearch.select.error && (
              <div className="text-center py-10 space-y-2">
                <IconBed size={40} className="text-muted-foreground mx-auto" stroke={1.5} />
                <p className="text-muted-foreground text-sm">
                  {tx('Aktuell sind leider keine Wohnungen verfügbar.')}
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {wohnungItems.map((item) => (
                <WohnungCard
                  key={item.id}
                  item={item}
                  selected={selectedWohnungId === item.id}
                  onSelect={() => handleSelectWohnung(item)}
                />
              ))}
            </div>
            {selectedWohnungId && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <IconCheck size={15} className="text-emerald-600 shrink-0" />
                <span>
                  {tx('Gewählt:')} <strong>{selectedWohnungLabel}</strong>
                </span>
              </p>
            )}
            <StepNav
              hideBack
              onNext={handleNextStep1}
              nextStepLabel={tx('Zeitraum')}
            />
          </div>
        )}

        {/* ── Schritt 2: Zeitraum & Personen ───────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="rounded-lg bg-muted/60 px-4 py-3 flex items-center gap-2 text-sm">
              <IconBed size={16} className="shrink-0 text-muted-foreground" />
              <span className="font-medium">{selectedWohnungLabel}</span>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="ml-auto text-xs text-primary underline underline-offset-2"
              >
                {tx('Ändern')}
              </button>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">{tx('An- und Abreise')}</p>
              <AvailabilityRangePicker
                {...buchungForm.range('anreise', 'abreise', {
                  blocked: occupancyBlocked,
                  minNights: 1,
                  unit: 'nights',
                })}
                months={2}
                disablePast
                legend
                texts={{
                  pickStart: tx('Anreise wählen'),
                  pickEnd: tx('Abreise wählen'),
                }}
              />
            </div>

            <Field form={buchungForm} name="anzahl_personen">
              <div className="flex items-center gap-3">
                <IconUsers size={16} className="shrink-0 text-muted-foreground" />
                <input
                  {...buchungForm.number('anzahl_personen')}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  min={1}
                  max={20}
                  placeholder="2"
                />
              </div>
            </Field>

            <StepNav
              onBack={() => setStep(1)}
              onNext={handleNextStep2}
              nextStepLabel={tx('Kontakt')}
            />
          </div>
        )}

        {/* ── Schritt 3: Kontaktdaten ───────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field form={gastForm} name="vorname">
                <Bound form={gastForm} name="vorname" />
              </Field>
              <Field form={gastForm} name="nachname">
                <Bound form={gastForm} name="nachname" />
              </Field>
            </div>
            <Field form={gastForm} name="email" hint={tx('Für die Anfragebestätigung')}>
              <Bound form={gastForm} name="email" />
            </Field>
            <Field form={gastForm} name="telefon" hint={tx('Für Rückfragen')}>
              <Bound form={gastForm} name="telefon" />
            </Field>
            <StepNav
              onBack={() => setStep(2)}
              onNext={handleNextStep3}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        )}

        {/* ── Schritt 4: Zusammenfassung & Absenden ────────────────────── */}
        {step === 4 && !submit.done && (
          <SummaryStep
            forms={[buchungForm, gastForm]}
            submit={submit}
            items={priceItems}
            whatHappensNext={tx('Wir prüfen deine Anfrage und melden uns innerhalb von 24 Stunden per E-Mail oder Telefon.')}
            confirmLabel={tx('Anfrage absenden')}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
