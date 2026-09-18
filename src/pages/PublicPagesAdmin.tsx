import { useEffect, useState } from 'react';
import {
  IconWorld, IconCheck, IconLink, IconExternalLink, IconLoader2, IconAlertTriangle,
  IconAdjustments, IconEye, IconTicket, IconPencil, IconTrash, IconPlus,
} from '@tabler/icons-react';
import { PageShell } from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  listPublicPages, setPublished, getPolicy, updatePolicy, getShareLinks,
  type PublicPageSummary, type ShareLink, type PolicyCatalog, type PagePolicy, type PolicyRow,
} from '@/lib/publicPagesAdmin';
import { PageJobDialog, type PageJobTarget } from '@/components/PageJobDialog';
import { JobStateBadge, JobStateRow } from '@/components/PageJobStatus';
import { usePageJobs } from '@/hooks/usePageJobs';
import { dismissPageJob, type PageOp, type PageJobRecord } from '@/lib/pageJobs';
import { t } from '@/i18n';

// Owner-facing management of the dashboard's public pages. Same-origin fetch
// to /claude carries the LA session automatically. Anonymous visitors never
// reach this — it lives inside the authenticated Layout.
//
// All text resolves through t() at render time — a module-scope map of
// translated strings would go stale on a language switch.

function originLabel(o: string): string {
  return o === 'auto' ? t('ppa_origin_auto') : o === 'agent' ? t('ppa_origin_agent') : t('ppa_origin_user');
}

// Plain-language summary of what a page's link grants — the owner confirms
// THIS, never the underlying policy. Built from the field/endpoint config.
// EVERY endpoint, not the first of each kind: a live page created three
// entities and read all order numbers, and the dialog named one entity's
// fields plus "nobody can see existing data". The owner consents to what the
// link grants — this list has to be complete.
function capabilities(page: PublicPageSummary): { submit: string[]; view: string[] } {
  const submit: string[] = [];
  const view: string[] = [];
  if (page.type === 'custom' && page.endpoints && page.endpoints.length > 0) {
    for (const e of page.endpoints) {
      const labels = e.fields.map(f => f.label).join(', ');
      if (e.op === 'create') submit.push(labels);
      else if (e.op === 'list') view.push(e.scope_description ? `${e.scope_description} — ${labels}` : labels);
    }
  } else {
    submit.push(page.fields.map(f => f.label).join(', '));
  }
  return { submit, view };
}

export default function PublicPagesAdmin() {
  const [pages, setPages] = useState<Record<string, PublicPageSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);
  // Field table ("Felder anpassen"): the owner's policy for one page — what
  // visitors see, what is required, fixed values, labels, texts. Saved as a
  // whole; the backend turns it into grant + config without a rebuild.
  const [policySlug, setPolicySlug] = useState<string | null>(null);
  const [policyCat, setPolicyCat] = useState<PolicyCatalog | null>(null);
  const [draft, setDraft] = useState<PagePolicy>({ fields: {}, lists: {}, texts: {} });
  const [policyLoading, setPolicyLoading] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  // Per-record links: a page declaring a link_param is unusable through its
  // bare URL, so the owner picks the record here and copies THAT link.
  const [linksSlug, setLinksSlug] = useState<string | null>(null);
  const [links, setLinks] = useState<ShareLink[]>([]);
  // Agent jobs: a new page from a prompt, a change to an existing one, a removal.
  const [job, setJob] = useState<{ op: PageOp; target?: PageJobTarget; initialPrompt?: string } | null>(null);
  const { jobs, refresh: refreshJobs } = usePageJobs('public');
  const createJobs = jobs.filter(j => !j.target && j.status !== 'done');
  const jobFor = (slug: string) => jobs.find(j => j.target === slug && j.status !== 'done');
  const retryJob = (j: PageJobRecord) => {
    const target = j.target ? { slug: j.target, title: pages[j.target]?.title ?? j.target } : undefined;
    setJob({ op: j.op, target, initialPrompt: j.prompt });
    dismissPageJob(j.id).catch(() => undefined).then(() => void refreshJobs());
  };
  const [linksLoading, setLinksLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const load = async () => {
    try {
      setPages(await listPublicPages());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const applyPublished = async (slug: string, published: boolean) => {
    setBusySlug(slug);
    setConfirmSlug(null);
    try {
      const updated = await setPublished(slug, published);
      setPages(prev => ({ ...prev, [slug]: updated }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusySlug(null);
    }
  };

  const copy = async (page: PublicPageSummary) => {
    try {
      await navigator.clipboard.writeText(page.share_url);
      setCopiedSlug(page.slug);
      setTimeout(() => setCopiedSlug(c => (c === page.slug ? null : c)), 1500);
    } catch {
      // clipboard unavailable — the open link still works
    }
  };

  const openLinks = async (slug: string) => {
    setLinksSlug(slug);
    setLinksLoading(true);
    try {
      setLinks((await getShareLinks(slug)).links);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLinksSlug(null);
    } finally {
      setLinksLoading(false);
    }
  };

  const copyLink = async (link: ShareLink) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedLink(link.record_id);
      setTimeout(() => setCopiedLink(c => (c === link.record_id ? null : c)), 1500);
    } catch {
      // clipboard unavailable — the link stays selectable in the list
    }
  };

  const openPolicy = async (slug: string) => {
    setPolicySlug(slug);
    setPolicyLoading(true);
    setPolicyError(null);
    try {
      const cat = await getPolicy(slug);
      setPolicyCat(cat);
      setDraft({
        fields: JSON.parse(JSON.stringify(cat.policy.fields || {})),
        lists: JSON.parse(JSON.stringify(cat.policy.lists || {})),
        texts: { ...(cat.policy.texts || {}) },
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPolicySlug(null);
    } finally {
      setPolicyLoading(false);
    }
  };

  const ruleOf = (entity: string, key: string) => draft.fields[entity]?.[key] ?? {};
  const setRule = (entity: string, key: string, patch: Record<string, unknown>) => {
    setDraft(prev => {
      const entityRules = { ...(prev.fields[entity] ?? {}) };
      const next: Record<string, unknown> = { ...(entityRules[key] ?? {}), ...patch };
      for (const k of Object.keys(next)) {
        if (next[k] === undefined || next[k] === null || next[k] === '' || next[k] === false) delete next[k];
      }
      if (Object.keys(next).length === 0) delete entityRules[key];
      else entityRules[key] = next;
      return { ...prev, fields: { ...prev.fields, [entity]: entityRules } };
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
  const setText = (key: string, value: string) => {
    setDraft(prev => ({ ...prev, texts: { ...prev.texts, [key]: value } }));
  };

  const savePolicy = async () => {
    if (!policySlug) return;
    setSavingPolicy(true);
    setPolicyError(null);
    try {
      const cat = await updatePolicy(policySlug, draft);
      if (cat.page) setPages(prev => ({ ...prev, [policySlug]: cat.page as PublicPageSummary }));
      setSavedSlug(policySlug);
      setTimeout(() => setSavedSlug(c => (c === policySlug ? null : c)), 2500);
      setPolicySlug(null);
    } catch (e) {
      setPolicyError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingPolicy(false);
    }
  };

  const policyCount = (page: PublicPageSummary): number => {
    const pol = page.policy;
    if (!pol) return 0;
    const fields = Object.values(pol.fields || {}).reduce((n, rules) => n + Object.keys(rules).length, 0);
    const lists = Object.values(pol.lists || {}).reduce((n, l) => n + (l.hidden?.length ?? 0), 0);
    return fields + lists + Object.keys(pol.texts || {}).length;
  };

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
    if (row.pick || row.fulltype.startsWith('file')) return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <Input value={fixed === undefined || fixed === null ? '' : String(fixed)} placeholder={t('ppa_fixed_none')} aria-label={t('ppa_col_fixed')}
        onChange={e => setRule(entity, row.key, { fixed: e.target.value || undefined })} />
    );
  };

  const entries = Object.values(pages).sort((a, b) => a.title.localeCompare(b.title));
  const confirmPage = confirmSlug ? pages[confirmSlug] : null;
  const caps: { submit: string[]; view: string[] } = confirmPage ? capabilities(confirmPage) : { submit: [], view: [] };

  return (
    <PageShell
      title={t('ppa_title')}
      subtitle={t('ppa_subtitle')}
      action={(
        <Button onClick={() => setJob({ op: 'create' })}>
          <IconPlus size={16} stroke={1.5} className="mr-1" />
          {t('ppa_new_agent')}
        </Button>
      )}
    >
      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          <IconAlertTriangle size={18} stroke={1.5} className="shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <IconLoader2 size={28} stroke={1.5} className="animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 && createJobs.length === 0 ? (
        <div className="rounded-[27px] bg-card shadow-lg p-8 text-center text-muted-foreground">
          {t('ppa_empty')}
        </div>
      ) : (
        <div className="rounded-[27px] bg-card shadow-lg overflow-hidden divide-y divide-border">
          {createJobs.map(j => (
            <JobStateRow key={j.id} job={j} onRetry={retryJob} onDismissed={() => void refreshJobs()} />
          ))}
          {entries.map(page => (
            <div key={page.slug} className="flex items-center gap-4 px-6 py-4 min-w-0">
              <IconWorld size={20} stroke={1.5} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-medium">{page.title}</span>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                    {originLabel(page.origin)}
                  </span>
                  {policyCount(page) > 0 ? (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {t('ppa_policy_changed', { n: policyCount(page) })}
                    </span>
                  ) : null}
                  {jobFor(page.slug) ? <JobStateBadge job={jobFor(page.slug)!} /> : null}
                  {jobFor(page.slug)?.status === 'failed' ? (
                    <button type="button" onClick={() => retryJob(jobFor(page.slug)!)} className="shrink-0 text-xs text-primary underline underline-offset-2">{t('pj_retry')}</button>
                  ) : null}
                </div>
                <span className={`text-xs ${page.published ? 'text-primary' : 'text-muted-foreground'}`}>
                  {savedSlug === page.slug ? t('ppa_policy_saved') : page.published ? t('ppa_status_published') : t('ppa_status_draft')}
                </span>
              </div>

              {/* Opening works for a DRAFT too — the page then renders as the
                  owner's preview (see publicClient). There is deliberately no
                  separate preview button: a page reached with a record
                  parameter has no meaningful URL of its own, so a second entry
                  point would hand out broken links. Copying, however, stays
                  published-only — a draft link is worthless to a visitor. */}
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={page.share_url}
                  target="_blank"
                  rel="noreferrer"
                  title={page.published ? t('ppa_open') : t('ppa_preview')}
                  aria-label={page.published ? t('ppa_open') : t('ppa_preview')}
                  className="p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {page.published
                    ? <IconExternalLink size={18} stroke={1.5} />
                    : <IconEye size={18} stroke={1.5} />}
                </a>
                {page.published ? (
                  <button
                    type="button"
                    title={copiedSlug === page.slug ? t('ppa_copied') : t('ppa_copy')}
                    aria-label={t('ppa_copy')}
                    onClick={() => copy(page)}
                    className="p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    {copiedSlug === page.slug ? <IconCheck size={18} stroke={1.5} /> : <IconLink size={18} stroke={1.5} />}
                  </button>
                ) : null}
              </div>

              {page.link_param ? (
                <button
                  type="button"
                  title={t('ppa_links')}
                  aria-label={t('ppa_links')}
                  onClick={() => openLinks(page.slug)}
                  className="shrink-0 p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <IconTicket size={18} stroke={1.5} />
                </button>
              ) : null}

              <button
                type="button"
                title={t('ppa_edit_agent')}
                aria-label={t('ppa_edit_agent')}
                onClick={() => setJob({ op: 'edit', target: { slug: page.slug, title: page.title } })}
                className="shrink-0 p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <IconPencil size={18} stroke={1.5} />
              </button>
              <button
                type="button"
                title={t('ppa_delete')}
                aria-label={t('ppa_delete')}
                onClick={() => setJob({ op: 'delete', target: { slug: page.slug, title: page.title } })}
                className="shrink-0 p-2 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <IconTrash size={18} stroke={1.5} />
              </button>

              <button
                type="button"
                title={t('ppa_policy_title')}
                aria-label={t('ppa_policy_title')}
                onClick={() => openPolicy(page.slug)}
                className={`shrink-0 p-2 rounded-xl transition-colors ${policyCount(page) > 0 ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
              >
                <IconAdjustments size={18} stroke={1.5} />
              </button>

              <Button
                variant={page.published ? 'outline' : 'default'}
                size="sm"
                className="shrink-0"
                disabled={busySlug === page.slug}
                onClick={() =>
                  page.published ? applyPublished(page.slug, false) : setConfirmSlug(page.slug)
                }
              >
                {busySlug === page.slug ? (
                  <IconLoader2 size={16} stroke={1.5} className="animate-spin" />
                ) : page.published ? (
                  t('ppa_pause')
                ) : (
                  t('ppa_publish')
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      <PageJobDialog
        open={job !== null}
        onOpenChange={v => !v && setJob(null)}
        kind="public"
        op={job?.op ?? 'create'}
        target={job?.target}
        initialPrompt={job?.initialPrompt}
        onStarted={() => void refreshJobs()}
        onDone={() => { void load(); void refreshJobs(); }}
      />

      <Dialog open={!!confirmPage} onOpenChange={v => !v && setConfirmSlug(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ppa_confirm_title')}</DialogTitle>
            <DialogDescription>{confirmPage?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {confirmPage?.link_param ? (
              <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground">{t('ppa_link_param_note')}</p>
            ) : null}
            {caps.submit.map((line, i) => (
              <p key={`s${i}`}><span className="font-medium">{t('ppa_can_do')}</span> {t('ppa_can_submit')} <span className="text-muted-foreground">({line})</span></p>
            ))}
            {caps.view.map((line, i) => (
              <p key={`v${i}`}><span className="font-medium">{t('ppa_can_do')}</span> {t('ppa_can_view')} <span className="text-muted-foreground">({line})</span></p>
            ))}
            <p><span className="font-medium">{t('ppa_cannot_do')}</span> {caps.view.length > 0 ? t('ppa_cannot_change_line') : t('ppa_cannot_line')}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSlug(null)}>{t('ppa_cancel')}</Button>
            <Button onClick={() => confirmPage && applyPublished(confirmPage.slug, true)}>
              {t('ppa_confirm_publish')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linksSlug} onOpenChange={v => !v && setLinksSlug(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ppa_links_title')}</DialogTitle>
            <DialogDescription>{t('ppa_links_intro')}</DialogDescription>
          </DialogHeader>
          {linksLoading ? (
            <div className="flex justify-center py-8">
              <IconLoader2 size={22} stroke={1.5} className="animate-spin text-muted-foreground" />
            </div>
          ) : links.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">{t('ppa_links_empty')}</p>
          ) : (
            <div className="max-h-[60vh] space-y-1 overflow-y-auto">
              {links.map(link => (
                <div
                  key={link.record_id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-accent/50 transition-colors min-w-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{link.label}</div>
                    {link.secondary ? (
                      <div className="truncate text-xs text-muted-foreground">{link.secondary}</div>
                    ) : null}
                  </div>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    title={t('ppa_open')}
                    aria-label={t('ppa_open')}
                    className="shrink-0 p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <IconExternalLink size={16} stroke={1.5} />
                  </a>
                  <button
                    type="button"
                    title={copiedLink === link.record_id ? t('ppa_copied') : t('ppa_copy')}
                    aria-label={t('ppa_copy')}
                    onClick={() => copyLink(link)}
                    className="shrink-0 p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    {copiedLink === link.record_id
                      ? <IconCheck size={16} stroke={1.5} />
                      : <IconLink size={16} stroke={1.5} />}
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="pt-2 text-xs text-muted-foreground">{t('ppa_links_hint')}</p>
        </DialogContent>
      </Dialog>

      <Dialog open={!!policySlug} onOpenChange={v => !v && setPolicySlug(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('ppa_policy_title')}</DialogTitle>
            <DialogDescription>{t('ppa_policy_intro')}</DialogDescription>
          </DialogHeader>
          {policyLoading || !policyCat ? (
            <div className="flex justify-center py-8">
              <IconLoader2 size={24} stroke={1.5} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto space-y-6 -mx-2 px-2">
              {policyCat.entities.map(ent => {
                const declared = ent.fields.filter(f => f.declared);
                const more = ent.fields.filter(f => !f.declared && !f.pick && !f.fulltype.startsWith('file'));
                return (
                  <section key={ent.entity} className="space-y-2">
                    <h3 className="text-sm font-semibold">{t('ppa_policy_submit_section', { entity: ent.label })}</h3>
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-secondary text-secondary-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">{t('ppa_col_field')}</th>
                            <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider">{t('ppa_col_visible')}</th>
                            <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider">{t('ppa_col_required')}</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">{t('ppa_col_fixed')}</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">{t('ppa_col_label')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {declared.map(row => {
                            const rule = ruleOf(ent.entity, row.key);
                            const fixed = rule.fixed !== undefined && rule.fixed !== null && rule.fixed !== '';
                            const visible = !rule.hidden && !fixed;
                            const required = rule.required ?? row.required_platform;
                            return (
                              <tr key={row.key} className="border-t border-border align-middle">
                                <td className="px-3 py-2">
                                  <span className={visible ? '' : 'text-muted-foreground line-through'}>{row.label}</span>
                                  {row.pick ? <span className="block text-xs text-muted-foreground">{t('ppa_pick_locked')}</span> : null}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <input type="checkbox" className="h-4 w-4" checked={visible} disabled={row.pick || fixed} aria-label={t('ppa_col_visible')}
                                    onChange={e => setRule(ent.entity, row.key, { hidden: e.target.checked ? undefined : true })} />
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <input type="checkbox" className="h-4 w-4" checked={visible && required} disabled={!visible} aria-label={t('ppa_col_required')}
                                    onChange={e => setRule(ent.entity, row.key, { required: e.target.checked === row.required_platform ? undefined : e.target.checked })} />
                                </td>
                                <td className="px-3 py-2 min-w-[10rem]">{fixedControl(ent.entity, row)}</td>
                                <td className="px-3 py-2 min-w-[10rem]">
                                  <Input value={rule.label ?? ''} placeholder={row.label} disabled={!visible} aria-label={t('ppa_col_label')}
                                    onChange={e => setRule(ent.entity, row.key, { label: e.target.value || undefined })} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('ppa_fixed_hint')}</p>
                    {more.length > 0 ? (
                      <details className="rounded-xl border border-dashed border-border px-3 py-2">
                        <summary className="cursor-pointer text-sm">{t('ppa_more_fields', { entity: ent.label })}</summary>
                        <p className="mt-1 text-xs text-muted-foreground">{t('ppa_more_fields_hint')}</p>
                        <div className="mt-2 space-y-2">
                          {more.map(row => (
                            <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,12rem)] items-center gap-3 text-sm">
                              <span>{row.label}</span>
                              {fixedControl(ent.entity, row)}
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </section>
                );
              })}

              {policyCat.lists.map(lst => (
                <section key={`list-${lst.entity}`} className="space-y-2">
                  <h3 className="text-sm font-semibold">{t('ppa_policy_list_section', { entity: lst.label })}</h3>
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

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{t('ppa_policy_texts')}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([['title', 'ppa_text_title'], ['description', 'ppa_text_description'], ['thank_you_title', 'ppa_text_thanks_title'], ['thank_you_message', 'ppa_text_thanks_message']] as const).map(([key, labelKey]) => (
                    <label key={key} className="space-y-1 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">{t(labelKey)}</span>
                      <Input value={draft.texts[key] ?? ''} placeholder={policyCat.texts[key] ?? ''} onChange={e => setText(key, e.target.value)} />
                    </label>
                  ))}
                </div>
              </section>
              {policyError ? (
                <p className="flex items-center gap-2 text-sm text-destructive"><IconAlertTriangle size={16} stroke={1.5} /> {policyError}</p>
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPolicySlug(null)}>{t('ppa_cancel')}</Button>
            <Button onClick={savePolicy} disabled={savingPolicy || policyLoading || !policyCat}>
              {savingPolicy ? <IconLoader2 size={16} stroke={1.5} className="animate-spin" /> : t('ppa_save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
