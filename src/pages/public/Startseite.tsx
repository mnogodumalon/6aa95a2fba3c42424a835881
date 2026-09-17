import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  listPublicRecords,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
  type PublicRecordResult,
} from '@/lib/publicClient';
import { fieldLookups, fieldNumber, fieldText } from '@/lib/journey';
import { tx } from '@/i18n';

interface Wohnung {
  id: string;
  name: string;
  beschreibung: string;
  schlafplaetze: number | null;
  quadratmeter: number | null;
  grundpreis_pro_nacht: number | null;
  endreinigung_preis: number | null;
  ausstattung: Array<{ key: string; label: string }>;
  foto: string | null;
}

const AUSSTATTUNG_ICONS: Record<string, string> = {
  seeblick: '🏔️',
  kueche: '🍳',
  wlan: '📶',
  parkplatz: '🅿️',
  haustiere_erlaubt: '🐾',
  balkon: '🌿',
};

function toWohnung(r: PublicRecordResult): Wohnung {
  const record = { id: r.id, fields: r.fields, createdAt: r.created_at ?? null };
  return {
    id: r.id,
    name: (r.fields.name as string) ?? '',
    beschreibung: (r.fields.beschreibung as string) ?? '',
    schlafplaetze: fieldNumber(record, 'schlafplaetze'),
    quadratmeter: fieldNumber(record, 'quadratmeter'),
    grundpreis_pro_nacht: fieldNumber(record, 'grundpreis_pro_nacht'),
    endreinigung_preis: fieldNumber(record, 'endreinigung_preis'),
    ausstattung: fieldLookups(record, 'ausstattung'),
    foto: (r.fields.foto as string) ?? null,
  };
}

function WohnungCard({ wohnung }: { wohnung: Wohnung }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-shadow duration-300 flex flex-col">
      {/* Foto */}
      <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
        {wohnung.foto ? (
          <img
            src={wohnung.foto}
            alt={wohnung.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-teal-500" />
        )}
      </div>

      {/* Karteninhalt */}
      <div className="p-5 flex flex-col flex-1 gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900 truncate">{wohnung.name}</h3>
          {wohnung.beschreibung && (
            <p className="mt-1 text-sm text-gray-600 line-clamp-2">{wohnung.beschreibung}</p>
          )}
        </div>

        {/* Kennzahlen */}
        <div className="flex flex-wrap gap-3 text-sm text-gray-700">
          {wohnung.schlafplaetze !== null && (
            <span className="flex items-center gap-1">
              <span>🛏️</span>
              <span>{tx`${wohnung.schlafplaetze} Schlafplätze`}</span>
            </span>
          )}
          {wohnung.quadratmeter !== null && (
            <span className="flex items-center gap-1">
              <span>📐</span>
              <span>{wohnung.quadratmeter} m²</span>
            </span>
          )}
        </div>

        {/* Ausstattung-Chips */}
        {wohnung.ausstattung.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {wohnung.ausstattung.map((item) => (
              <span
                key={item.key}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-medium"
              >
                <span>{AUSSTATTUNG_ICONS[item.key] ?? '✓'}</span>
                <span>{item.label}</span>
              </span>
            ))}
          </div>
        )}

        {/* Preis */}
        <div className="mt-auto pt-3 border-t border-gray-100">
          {wohnung.grundpreis_pro_nacht !== null && (
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-gray-900">
                {wohnung.grundpreis_pro_nacht.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
              <span className="text-sm text-gray-500">{tx('/ Nacht')}</span>
            </div>
          )}
          {wohnung.endreinigung_preis !== null && (
            <p className="text-xs text-gray-500 mt-0.5">
              {tx('zzgl.')} {wohnung.endreinigung_preis.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 })} {tx('Endreinigung')}
            </p>
          )}
        </div>

        {/* CTA */}
        <Link
          to="/public/buchungsanfrage"
          className="mt-2 w-full inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm transition-colors duration-200 touch-manipulation"
        >
          {tx('Jetzt anfragen')}
        </Link>
      </div>
    </div>
  );
}

export default function Startseite() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [wohnungen, setWohnungen] = useState<Wohnung[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPublicPagesConfig('startseite')
      .then(async (c) => {
        const p = c?.pages['startseite'] ?? null;
        setCfg(c);
        setPage(p);

        if (!c || !p) {
          setUnavailable(true);
          setLoading(false);
          return;
        }

        const ep = p.endpoints?.find((e) => e.op === 'list' && e.entity === 'wohnungen');
        if (!ep) {
          setUnavailable(true);
          setLoading(false);
          return;
        }

        const results = await listPublicRecords(c, p, { appId: ep.app_id, limit: 100 });
        setWohnungen(Object.values(results).map(toWohnung));
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof PageUnavailableError) {
          setUnavailable(true);
        }
        setLoading(false);
      });
  }, []);

  if (loading || unavailable || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading && unavailable} />;
  }

  function scrollToList() {
    listRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <PublicShell fullBleed>
      {/* Hero */}
      <section className="relative w-full bg-gradient-to-br from-blue-700 via-blue-600 to-teal-500 text-white">
        <div className="max-w-5xl mx-auto px-4 py-20 sm:py-28 flex flex-col items-center text-center gap-6">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            {tx('Unsere Ferienwohnungen')}
          </h1>
          <p className="text-lg sm:text-xl text-blue-100 max-w-xl">
            {tx('Entdecken Sie Ihren perfekten Urlaub — komfortabel, stilvoll und unvergesslich schön gelegen.')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <button
              onClick={scrollToList}
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-2xl bg-white text-blue-700 font-bold text-base hover:bg-blue-50 active:bg-blue-100 transition-colors duration-200 shadow-lg touch-manipulation"
            >
              {tx('Jetzt Wohnung buchen')}
            </button>
            <Link
              to="/public/buchungsanfrage"
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-2xl border-2 border-white text-white font-semibold text-base hover:bg-white/10 active:bg-white/20 transition-colors duration-200 touch-manipulation"
            >
              {tx('Direkt anfragen')}
            </Link>
          </div>
        </div>
        {/* Dekorativer Bogen */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gray-50" style={{ borderRadius: '50% 50% 0 0 / 100% 100% 0 0' }} />
      </section>

      {/* Wohnungs-Grid */}
      <section ref={listRef} className="bg-gray-50 w-full">
        <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
          {wohnungen.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <p className="text-xl font-medium">{tx('Aktuell keine Wohnungen verfügbar')}</p>
              <p className="mt-2 text-sm">{tx('Schauen Sie bald wieder vorbei.')}</p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                {tx('Verfügbare Wohnungen')}
              </h2>
              <p className="text-gray-500 mb-8">
                {tx`${wohnungen.length} Wohnung${wohnungen.length === 1 ? '' : 'en'} verfügbar`}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {wohnungen.map((w) => (
                  <WohnungCard key={w.id} wohnung={w} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="w-full bg-blue-700 text-white">
        <div className="max-w-5xl mx-auto px-4 py-12 text-center flex flex-col items-center gap-4">
          <h2 className="text-2xl sm:text-3xl font-bold">{tx('Bereit für Ihren Urlaub?')}</h2>
          <p className="text-blue-100 max-w-md">
            {tx('Senden Sie uns noch heute Ihre Anfrage — wir melden uns schnell zurück.')}
          </p>
          <Link
            to="/public/buchungsanfrage"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-2xl bg-white text-blue-700 font-bold text-base hover:bg-blue-50 active:bg-blue-100 transition-colors duration-200 shadow-lg touch-manipulation"
          >
            {tx('Jetzt Buchungsanfrage stellen')}
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
