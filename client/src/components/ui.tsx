import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { CircleCheck, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';

// ---------- Button ----------

type Variant = 'primary' | 'fir' | 'berry' | 'outline' | 'ghost-light' | 'whatsapp';

export function Button({
  variant = 'primary',
  size,
  loading,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm'; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${className}`}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

// ---------- Spinner / states ----------

export function Spinner({ label = 'Einen Moment …' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-cream-200" role="status">
      <img src="/img/glocke-256.webp" alt="" width={80} height={129} className="h-24 w-auto animate-wiggle-loop" />
      <p className="font-display text-lg">{label}</p>
    </div>
  );
}

export function ErrorState({
  title = 'Hoppala!',
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="card mt-10 text-center animate-fade-up">
      <img src="/img/christkind-320.webp" alt="" width={95} height={160} className="mx-auto -mt-2 mb-2 h-32 w-auto" />
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-ink-700">{message}</p>
      {action ? <div className="mt-5 flex flex-col gap-2">{action}</div> : null}
    </div>
  );
}

// ---------- Form controls ----------

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="font-bold text-ink-900">
          {label}
        </label>
        {description ? <p className="text-sm text-ink-500">{description}</p> : null}
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} className="toggle mt-0.5" onClick={() => onChange(!checked)} />
    </div>
  );
}

// ---------- Sheet (bottom sheet on phones, dialog on larger screens) ----------

export function Sheet({
  open,
  onClose,
  title,
  children,
  image,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  image?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const focusTarget = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panelRef.current;
    focusTarget?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0 bg-night-950/70 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="card relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-b-none pb-[calc(1.25rem+env(safe-area-inset-bottom))] outline-none animate-sheet sm:rounded-b-3xl sm:pb-5"
      >
        <div className="mx-auto -mt-2 mb-3 h-1.5 w-12 rounded-full bg-cream-300 sm:hidden" aria-hidden />
        <button type="button" onClick={onClose} className="icon-btn absolute top-2 right-2" aria-label="Schließen">
          <X className="size-5" />
        </button>
        {image}
        <h2 id={titleId} className="pr-10 text-xl font-bold text-ink-900">
          {title}
        </h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel,
  variant = 'primary',
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: ReactNode;
  variant?: Variant;
  loading?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {children ? <div className="text-ink-700">{children}</div> : null}
      <div className="mt-5 flex flex-col gap-2">
        <Button variant={variant} onClick={onConfirm} loading={loading} data-autofocus>
          {confirmLabel}
        </Button>
        <Button variant="outline" onClick={onClose} disabled={loading}>
          Abbrechen
        </Button>
      </div>
    </Sheet>
  );
}

// ---------- Toasts ----------

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-2), { id, kind, message }]);
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 5000 : 3000);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]"
          aria-live="polite"
        >
          {items.map((t) => (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl px-4 py-3 text-sm font-bold shadow-xl animate-pop ${
                t.kind === 'error'
                  ? 'bg-berry-600 text-cream-50'
                  : t.kind === 'info'
                    ? 'bg-night-700 text-cream-50 ring-1 ring-gold-300/30'
                    : 'bg-fir-500 text-cream-50'
              }`}
            >
              {t.kind === 'error' ? (
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              ) : t.kind === 'info' ? (
                <Info className="mt-0.5 size-4 shrink-0" />
              ) : (
                <CircleCheck className="mt-0.5 size-4 shrink-0" />
              )}
              <span>{t.message}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ---------- Misc ----------

export function SectionTitle({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-bold text-ink-900">
        {icon}
        {children}
      </h2>
      {action}
    </div>
  );
}

export function Initials({ name, className = '' }: { name: string; className?: string }) {
  const letters = name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
  // Stable warm colour per name
  const palette = ['bg-berry-500', 'bg-fir-500', 'bg-gold-600', 'bg-night-600', 'bg-berry-700', 'bg-fir-400'];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={`inline-grid size-10 shrink-0 place-items-center rounded-full font-display text-sm font-bold text-cream-50 shadow-inner ${palette[hash % palette.length]} ${className}`}
    >
      {letters || '?'}
    </span>
  );
}
