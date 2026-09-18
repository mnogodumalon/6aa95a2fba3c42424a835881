import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  IconArrowLeft, IconExternalLink, IconLoader2, IconAlertTriangle, IconCheck,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  listPublicPages, getPolicy, updatePolicy,
  type PublicPageSummary, type PolicyCatalog, type PagePolicy, type PolicyRow,
} from '@/lib/publicPagesAdmin';
import { t } from '@/i18n';

// "Felder anpassen" — the owner's field policy for ONE public page, as a page
// of its own (route verwaltung/oeffentliche-seiten/:slug/felder). Not a
// dialog: the first live test put five columns into an overlay that was too
// narrow, and the overlay's exit animation locked the page. Here every field
// is one row with a SENTENCE that says what applies, one switch for the
// decision most owners make (visible or not) and the rest behind "Mehr".
// A bar at the bottom stays: unsaved count, open the page, discard, save.
// Everything resolves through t() at render time.

type Rule = { hidden?: boolean; required?: boolean; fixed?: unknown; label?: string };

const TEXT_KEYS = ['title', 'description', 'thank_you_title', 'thank_you_message'] as const;
const TEXT_LABELS: Record<(typeof TEXT_KEYS)[number], string> = {
  title: 'ppa_text_title',
  description: 'ppa_text_description',
  thank_you_title: 'ppa_text_thanks_title',
  thank_you_message: 'ppa_text_thanks_message',
};

function clone(p: PagePolicy): PagePolicy {
  return JSON.parse(JSON.stringify({ fields: p.fields || {}, lists: p.lists || {}, texts: p.texts || {} }));
}

function isFixed(rule: Rule): boolean {
  return rule.fixed !== undefined && rule.fixed !== null && rule.fixed !== '';
}

function fixedLabel(row: PolicyRow, rule: Rule): string {
  const v = rule.fixed;
  if (row.options) return row.options.find(o => o.key === String(v))?.label ?? String(v);
  if (typeof v === 'boolean') return v ? t('ppa_yes') : t('ppa_no');
  return String(v ?? '');
}

/** The one sentence under a field name — what applies right now. */
function sentence(row: PolicyRow, rule: Rule): string {
  if (row.pick) return t('ppa_s_pick');
  if (isFixed(rule)) return t('ppa_s_fixed', { value: fixedLabel(row, rule) });
  if (!row.declared) return t('ppa_s_never');
  if (rule.hidden) return t('ppa_s_hidden');
  const parts = [t('ppa_s_visitor_enters'), (rule.required ?? row.required_platform) ? t('ppa_s_required') : t('ppa_s_optional')];
  if (rule.label) parts.push(t('ppa_s_labelled', { label: rule.label }));
  return parts.join(' · ');
}

export default function PublicPageFields() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [page, setPage] = useState<PublicPageSummary | null>(null);
  const [cat, setCat] = useState<PolicyCatalog | null>(null);
  const [draft, setDraft] = useState<PagePolicy>({ fields: {}, lists: {}, texts: {} });
  const [saved, setSaved] = useState<PagePolicy>({ fields: {}, lists: {}, texts: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [openEntities, setOpenEntities] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const [pages, catalog] = await Promise.all([listPublicPages(), getPolicy(slug)]);
      setPage(pages[slug] ?? null);
      setCat(catalog);
      setDraft(clone(catalog.policy));
      setSaved(clone(catalog.policy));
      // Entities with rules start open; untouched ones show their summary line.
      setOpenEntities(new Set(Object.keys(catalog.policy.fields || {})));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const ruleOf = (entity: string, key: string): Rule => draft.fields[entity]?.[key] ?? {};
  const setRule = (entity: string, key: string, patch: Record<string, unknown>) => {
    setDraft(prev => {
      const rules = { ...(prev.fields[entity] ?? {}) };
      const next: Record<string, unknown> = { ...(rules[key] ?? {}), ...patch };
      for (const k of Object.keys(next)) {
        if (next[k] === undefined || next[k] === null || next[k] === '' || next[k] === false) delete next[k];
      }
      if (Object.keys(next).length === 0) delete rules[key]; else rules[key] = next;
      return { ...prev, fields: { ...prev.fields, [entity]: rules } };
    });
  };
  const listHidden = (entity: string) => draft.lists[entity]?.hidden ?? [];
  const setListVisible = (entity: string, key: string, visible: boolean) => {
    setDraft(prev => {
      const hidden = new Set(prev.lists[entity]?.hidden ?? []);
      if (visible) hidden.delete(key); else hidden.add(key);
      return { ...prev, lists: { ...prev.lists, [entity]: { hidden: Array.from(hidden) } } };
    });
  };
  const setText = (key: string, value: string) => setDraft(prev => ({ ...prev, texts: { ...prev.texts, [key]: value } }));

  const changes = useMemo(() => {
    let n = 0;
    const a = draft, b = saved;
    const entities = new Set([...Object.keys(a.fields), ...Object.keys(b.fields)]);
    for (const e of entities) {
      const keys = new Set([...Object.keys(a.fields[e] ?? {}), ...Object.keys(b.fields[e] ?? {})]);
      for (const k of keys) if (JSON.stringify(a.fields[e]?.[k] ?? null) !== JSON.stringify(b.fields[e]?.[k] ?? null)) n++;
    }
    const lists = new Set([...Object.keys(a.lists), ...Object.keys(b.lists)]);
    for (const e of lists) if (JSON.stringify([...(a.lists[e]?.hidden ?? [])].sort()) !== JSON.stringify([...(b.lists[e]?.hidden ?? [])].sort())) n++;
    for (const k of TEXT_KEYS) if ((a.texts[k] ?? '') !== (b.texts[k] ?? '')) n++;
    return n;
  }, [draft, saved]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await updatePolicy(slug, draft);
      setCat(next);
      setDraft(clone(next.policy));
      setSaved(clone(next.policy));
      if (next.page) setPage(next.page);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const discard = () => setDraft(clone(saved));

  const toggleOpen = (id: string) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleEntity = (id: string) => setOpenEntities(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const fixedControl = (entity: string, row: PolicyRow) => {
    const rule = ruleOf(entity, row.key);
    const fixed = rule.fixed;
    const cls = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';
    if (row.options) {
      return (
        <select className={cls} value={fixed === undefined || fixed === null ? '' : String(fixed)} aria-label={t('ppa_col_fixed')}
          onChange={e => setRule(entity, row.key, { fixed: e.target.value || undefined })}>
          <option value="">{t('ppa_fixed_none')}</option>
          {row.options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      );
    }
    if (row.fulltype.startsWith('bool')) {
      return (
        <select className={cls} value={fixed === true ? 'true' : fixed === false ? 'false' : ''} aria-label={t('ppa_col_fixed')}
          onChange={e => setRule(entity, row.key, { fixed: e.target.value === '' ? undefined : e.target.value === 'true' })}>
          <option value="">{t('ppa_fixed_none')}</option>
          <option value="true">{t('ppa_yes')}</option>
          <option value="false">{t('ppa_no')}</option>
        </select>
      );
    }
    if (row.pick || row.fulltype.startsWith('file')) return null;
    return (
      <Input value={fixed === undefined || fixed === null ? '' : String(fixed)} placeholder={t('ppa_fixed_none')} aria-label={t('ppa_col_fixed')}
        onChange={e => setRule(entity, row.key, { fixed: e.target.value || undefined })} />
    );
  };

  const summaryOf = (entity: string, rows: PolicyRow[]): string => {
    let visible = 0, required = 0, hidden = 0, fixed = 0;
    for (const row of rows.filter(r => r.declared)) {
      const rule = ruleOf(entity, row.key);
      if (isFixed(rule)) fixed++;
      else if (rule.hidden) hidden++;
      else { visible++; if (rule.required ?? row.required_platform) required++; }
    }
    return t('ppa_s_summary', { visible, required, hidden, fixed });
  };

  const fieldRow = (entity: string, row: PolicyRow) => {
    const rule = ruleOf(entity, row.key);
    const fixed = isFixed(rule);
    const visible = row.declared && !rule.hidden && !fixed;
    const id = `${entity}.${row.key}`;
    const expanded = open.has(id);
    const tone = fixed ? 'bg-primary/5 border-primary/20' : rule.hidden ? 'bg-muted/50' : 'bg-card';
    const canToggle = row.declared && !row.pick && !fixed;
    return (
      <div key={row.key} className={`rounded-xl border border-border ${tone} px-4 py-3`} data-field-row={id}>
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className={`font-medium ${visible ? '' : 'text-muted-foreground'}`}>{rule.label && visible ? rule.label : row.label}</div>
            <div className="text-sm text-muted-foreground">{sentence(row, rule)}</div>
          </div>
          {canToggle ? (
            <label className="flex shrink-0 items-center gap-2 text-sm">
              <span className="hidden sm:inline text-muted-foreground">{t('ppa_col_visible')}</span>
              <input type="checkbox" className="h-5 w-5" checked={visible} aria-label={`${t('ppa_col_visible')}: ${row.label}`}
                onChange={e => setRule(entity, row.key, { hidden: e.target.checked ? undefined : true })} />
            </label>
          ) : null}
          {row.pick || row.fulltype.startsWith('file') ? null : (
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => toggleOpen(id)} aria-expanded={expanded}>
              {expanded ? t('ppa_less') : t('ppa_more')}
            </Button>
          )}
        </div>
        {expanded ? (
          <div className="mt-3 grid gap-3 border-t border-dashed border-border pt-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">{t('ppa_col_fixed')}</span>
              {fixedControl(entity, row)}
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">{t('ppa_col_required')}</span>
              <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" disabled={!visible}
                value={(rule.required ?? row.required_platform) ? 'yes' : 'no'} aria-label={t('ppa_col_required')}
                onChange={e => setRule(entity, row.key, { required: (e.target.value === 'yes') === row.required_platform ? undefined : e.target.value === 'yes' })}>
                <option value="yes">{t('ppa_yes')}</option>
                <option value="no">{t('ppa_no')}</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">{t('ppa_col_label')}</span>
              <Input value={rule.label ?? ''} placeholder={row.label} disabled={!visible} aria-label={t('ppa_col_label')}
                onChange={e => setRule(entity, row.key, { label: e.target.value || undefined })} />
            </label>
            <p className="text-xs text-muted-foreground sm:col-span-3">{t('ppa_fixed_hint')}</p>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="space-y-2">
        <Link to="/verwaltung/oeffentliche-seiten" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <IconArrowLeft size={16} stroke={1.5} /> {t('ppa_back_to_pages')}
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-normal">{t('ppa_policy_title')}{page ? <span className="text-muted-foreground"> · {page.title}</span> : null}</h1>
            <p className="mt-1 text-base text-foreground">{t('ppa_policy_intro')}</p>
          </div>
          {page ? (
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${page.published ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground'}`}>
              {page.published ? t('ppa_status_published') : t('ppa_status_draft')}
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <IconAlertTriangle size={16} stroke={1.5} /> {error}
        </p>
      ) : null}

      {loading || !cat ? (
        <div className="flex justify-center py-16">
          <IconLoader2 size={24} stroke={1.5} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-8">
          {cat.entities.map(ent => {
            const declared = ent.fields.filter(f => f.declared);
            const more = ent.fields.filter(f => !f.declared && !f.pick && !f.fulltype.startsWith('file'));
            const isOpen = openEntities.has(ent.entity);
            return (
              <section key={ent.entity} className="space-y-3" data-entity={ent.entity}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold">{t('ppa_policy_submit_section', { entity: ent.label })}</h2>
                    <p className="text-sm text-muted-foreground">{summaryOf(ent.entity, ent.fields)}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => toggleEntity(ent.entity)} aria-expanded={isOpen}>
                    {isOpen ? t('ppa_less') : t('ppa_open')}
                  </Button>
                </div>
                {isOpen ? (
                  <div className="space-y-2">
                    {declared.map(row => fieldRow(ent.entity, row))}
                    {more.length > 0 ? (
                      <details className="rounded-xl border border-dashed border-border px-4 py-3">
                        <summary className="cursor-pointer text-sm">{t('ppa_more_fields', { entity: ent.label })}</summary>
                        <p className="mt-1 text-xs text-muted-foreground">{t('ppa_more_fields_hint')}</p>
                        <div className="mt-3 space-y-2">{more.map(row => fieldRow(ent.entity, row))}</div>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}

          {cat.lists.map(lst => (
            <section key={`list-${lst.entity}`} className="space-y-3">
              <h2 className="text-base font-semibold">{t('ppa_policy_list_section', { entity: lst.label })}</h2>
              <div className="flex flex-wrap gap-2">
                {lst.fields.map(col => {
                  const hidden = listHidden(lst.entity).includes(col.key);
                  return (
                    <label key={col.key} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${hidden ? 'border-border text-muted-foreground' : 'border-primary/40 bg-primary/5'}`}>
                      <input type="checkbox" className="h-4 w-4" checked={!hidden} onChange={e => setListVisible(lst.entity, col.key, e.target.checked)} />
                      {col.label}
                    </label>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="space-y-3">
            <h2 className="text-base font-semibold">{t('ppa_policy_texts')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {TEXT_KEYS.map(key => (
                <label key={key} className="space-y-1 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">{t(TEXT_LABELS[key])}</span>
                  <Input value={draft.texts[key] ?? ''} placeholder={cat.texts[key] ?? ''} onChange={e => setText(key, e.target.value)} />
                </label>
              ))}
            </div>
          </section>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-6 py-3">
          <span className="flex-1 text-sm text-muted-foreground">
            {justSaved ? (
              <span className="inline-flex items-center gap-1 text-primary"><IconCheck size={16} stroke={1.5} /> {t('ppa_policy_saved')}</span>
            ) : changes > 0 ? t('ppa_unsaved', { n: changes }) : t('ppa_nothing_unsaved')}
          </span>
          {page ? (
            <a href={page.share_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm hover:bg-accent">
              <IconExternalLink size={16} stroke={1.5} /> {t('ppa_view_page')}
            </a>
          ) : null}
          <Button variant="outline" onClick={discard} disabled={changes === 0 || saving}>{t('ppa_discard')}</Button>
          <Button onClick={save} disabled={changes === 0 || saving || loading}>
            {saving ? <IconLoader2 size={16} stroke={1.5} className="animate-spin" /> : t('ppa_save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
