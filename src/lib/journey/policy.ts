/**
 * The owner's field policy — the page's contract after the build.
 *
 * A public page is written by the agent; the owner narrows it afterwards in
 * the dashboard ("Felder anpassen") without a rebuild: a field is hidden, a
 * field becomes required, a field gets another label. The backend turns the
 * policy into the grant (a hidden field is not in the grant → the server
 * answers "unallowed") and ships the same rules in public-pages.json. The
 * layer registers them here when the page config loads, and every consumer
 * reads them at render time:
 *
 *   useStepForm — hidden keys leave `keys` (not validated, not summarised,
 *                 not in payload()), `required` overrides win;
 *   Field/Bound — a hidden field renders nothing;
 *   labelOf     — the owner's label wins over bundle and rule;
 *   IntentWizardShell — a step whose fields are all hidden is skipped.
 *
 * Outside a public page nothing is registered and every call is a no-op —
 * the same blocks run unchanged on internal routes.
 */
export interface FieldPolicyRule {
  hidden?: boolean;
  required?: boolean;
  label?: string;
}

export type FieldPolicy = Record<string, Record<string, FieldPolicyRule>>;

let registry: FieldPolicy = {};
let version = 0;
const listeners = new Set<() => void>();

/** Replace the active policy (the page config's `policy.fields`, or nothing). */
export function setFieldPolicy(fields: FieldPolicy | undefined | null): void {
  const next = fields && typeof fields === 'object' ? fields : {};
  if (JSON.stringify(next) === JSON.stringify(registry)) return;
  registry = next;
  version += 1;
  listeners.forEach(fn => fn());
}

export function fieldPolicy(entity: string, key: string): FieldPolicyRule {
  return registry[entity]?.[key] ?? {};
}

export function isHiddenByPolicy(entity: string, key: string): boolean {
  return Boolean(registry[entity]?.[key]?.hidden);
}

export function policyLabel(entity: string, key: string): string | undefined {
  const label = registry[entity]?.[key]?.label;
  return label && label.trim() ? label : undefined;
}

export function policyRequired(entity: string, key: string): boolean | undefined {
  return registry[entity]?.[key]?.required;
}

/** Current policy version (bumps on every change) — see usePolicyVersion. */
export function policyVersion(): number {
  return version;
}

/** Subscribe to policy changes; returns the unsubscribe. */
export function onPolicyChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
