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
import { tx } from '@/i18n';

const AUSSTATTUNG_ICONS: Record<string, string> = {
  seeblick: '🌊',
  kueche: '🍳',
  wlan: '📶',
  parkplatz: '🅿️',
  haustiere_erlaubt: '🐾',
  balkon: '🌿',
};

interface Wohnung {
  id: string;
  name: string;
  beschreibung: string | null;
  schlafplaetze: number | null;
  quadratmeter: number | null;
  grundpreis_pro_nacht: number | null;
  endreinigung_preis: number | null;
  ausstattung: string[];
  foto: string | null;
}

function parseWohnung(r: PublicRecordResult): Wohnung {
  const ausstattungRaw = r.fields.ausstattung;
  let ausstattung: string[] = [];
  if (Array.isArray(ausstattungRaw)) {
    ausstattung = (ausstattungRaw as Array<string | { key: string; label: string }>).map(
      (item) => (typeof item === 'string' ? item : item.key)
    );
  } else if (typeof ausstattungRaw === 'string' && ausstattungRaw.trim() !== '') {
    ausstattung = [ausstattungRaw];
  }

  return {
    id: r.id,
    name: (r.fields.name as string) ?? '',
    beschreibung: (r.fields.beschreibung as string) ?? null,
    schlafplaetze: (r.fields.schlafplaetze as number) ?? null,
    quadratmeter: (r.fields.quadratmeter as number) ?? null,
    grundpreis_pro_nacht: (r.fields.grundpreis_pro_nacht as number) ?? null,
    endreinigung_preis: (r.fields.endreinigung_preis as number) ?? null,
    ausstattung,
    foto: (r.fields.foto as string) ?? null,
  };
}

function WohnungCard({ w }: { w: Wohnung }) {
  const AUSSTATTUNG_LABELS: Record<string, string> = {
  seeblick: tx('Seeblick'),
  kueche: tx('Küche'),
  wlan: tx('WLAN'),
  parkplatz: tx('Parkplatz'),
  haustiere_erlaubt: tx('Haustiere erlaubt'),
  balkon: tx('Balkon'),
};

  return (
    <div className="bg-white rounded-2xl shadow-md overflow-hidden flex flex-col">
      {w.foto ? (
        <img
          src={w.foto}
          alt={w.name}
          className="w-full h-52 object-cover"
        />
      ) : (
        <div className="w-full h-52 bg-gradient-to-br from-blue-100 to-teal-100 flex items-center justify-center">
          <span className="text-5xl opacity-30">🏡</span>
        </div>
      )}
      <div className="p-5 flex flex-col gap-3 flex-1">
        <h3 className="text-xl font-semibold text-gray-900">{w.name}</h3>
        {w.beschreibung && (
          <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">{w.beschreibung}</p>
        )}

        <div className="flex flex-wrap gap-3 text-sm text-gray-700">
          {w.schlafplaetze != null && (
            <span className="flex items-center gap-1">
              <span>🛏</span>
              <span>{tx`${w.schlafplaetze} Schlafplätze`}</span>
            </span>
          )}
          {w.quadratmeter != null && (
            <span className="flex items-center gap-1">
              <span>📐</span>
              <span>{w.quadratmeter} m²</span>
            </span>
          )}
        </div>

        {w.ausstattung.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {w.ausstattung.map((key) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-medium"
              >
                {AUSSTATTUNG_ICONS[key] ?? '✓'}{' '}
                {AUSSTATTUNG_LABELS[key] ?? key}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto pt-3 border-t border-gray-100 flex items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-bold text-blue-700">
              {w.grundpreis_pro_nacht != null
                ? `${w.grundpreis_pro_nacht.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`
                : '—'}
            </p>
            <p className="text-xs text-gray-500">{tx('pro Nacht')}</p>
            {w.endreinigung_preis != null && (
              <p className="text-xs text-gray-500 mt-0.5">
                {tx('zzgl.')} {w.endreinigung_preis.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} {tx('Endreinigung')}
              </p>
            )}
          </div>
          <Link
            to="/public/buchungsanfrage"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors whitespace-nowrap"
          >
            {tx('Jetzt anfragen')}
          </Link>
        </div>
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
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPublicPagesConfig('startseite')
      .then(async (c) => {
        if (!c) { setUnavailable(true); setLoading(false); return; }
        const p = c.pages['startseite'] ?? null;
        setCfg(c);
        setPage(p);
        if (!p) { setUnavailable(true); setLoading(false); return; }

        const ep = p.endpoints?.find((e) => e.op === 'list' && e.entity === 'wohnungen');
        if (!ep) { setUnavailable(true); setLoading(false); return; }

        const records = await listPublicRecords(c, p, { appId: ep.app_id });
        setWohnungen(Object.values(records).map(parseWohnung));
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof PageUnavailableError) {
          setUnavailable(true);
        }
        setLoading(false);
      });
  }, []);

  if (loading || unavailable) {
    return <PublicShell loading={loading} unavailable={unavailable} />;
  }

  const scrollToCards = () => {
    cardsRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const title = page?.title ?? tx('Ferienwohnungen');

  return (
    <PublicShell fullBleed>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-blue-700 via-blue-600 to-teal-500 text-white">
        <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9zdmc+')] bg-repeat" />
        <div className="relative max-w-5xl mx-auto px-4 py-20 sm:py-28 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            {tx('Willkommen in unseren Ferienwohnungen')}
          </h1>
          <p className="text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto mb-8">
            {tx('Erholen Sie sich in unseren stilvollen Ferienwohnungen — direkt am See, mit allem Komfort für einen unvergesslichen Aufenthalt.')}
          </p>
          <button
            type="button"
            onClick={scrollToCards}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-blue-700 font-semibold text-base shadow-lg hover:bg-blue-50 active:bg-blue-100 transition-colors"
          >
            {tx('Alle Angebote entdecken')}
            <span aria-hidden="true">↓</span>
          </button>
        </div>
      </section>

      {/* Wohnungen */}
      <section ref={cardsRef} className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
        <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-2 text-center">
          {tx('Unsere verfügbaren Wohnungen')}
        </h2>
        <p className="text-gray-500 text-center mb-8">
          {tx('Wählen Sie Ihre Traumwohnung und senden Sie eine Anfrage.')}
        </p>

        {wohnungen.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-4">🏡</div>
            <p className="text-lg">{tx('Aktuell sind keine Wohnungen verfügbar.')}</p>
            <p className="text-sm mt-2">{tx('Bitte schauen Sie später wieder vorbei.')}</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {wohnungen.map((w) => (
              <WohnungCard key={w.id} w={w} />
            ))}
          </div>
        )}
      </section>

      {/* CTA Footer Band */}
      <section className="bg-blue-50 border-t border-blue-100">
        <div className="max-w-5xl mx-auto px-4 py-10 text-center">
          <p className="text-gray-700 text-lg font-medium mb-4">
            {tx('Haben Sie Fragen oder möchten Sie direkt anfragen?')}
          </p>
          <Link
            to="/public/buchungsanfrage"
            className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-blue-600 text-white font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-md"
          >
            {tx('Jetzt Buchungsanfrage stellen')}
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
