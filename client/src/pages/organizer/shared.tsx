import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, useToast } from '../../components/ui';
import { errorMessage } from '../../lib/api';

/** Runs an organizer action with a busy flag, error toast and a refresh afterwards. */
export function useAction(reload: () => Promise<unknown>) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
      setBusy(key);
      try {
        await fn();
        if (success) toast(success);
        await reload();
        return true;
      } catch (err) {
        toast(errorMessage(err), 'error');
        await reload();
        return false;
      } finally {
        setBusy(null);
      }
    },
    [reload, toast],
  );
  return { busy, run };
}

/** Destructive buttons ask "Wirklich?" on the first tap instead of opening another dialog. */
export function TwoStepButton({
  onConfirm,
  children,
  confirmLabel,
  loading,
  className = '',
}: {
  onConfirm: () => void;
  children: ReactNode;
  confirmLabel: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Button
      variant={armed ? 'berry' : 'outline'}
      size="sm"
      loading={loading}
      className={className}
      onClick={() => {
        if (armed) {
          window.clearTimeout(timer.current);
          setArmed(false);
          onConfirm();
          return;
        }
        setArmed(true);
        timer.current = window.setTimeout(() => setArmed(false), 4000);
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}

export function Section({
  id,
  title,
  icon,
  intro,
  children,
  action,
}: {
  id?: string;
  title: ReactNode;
  icon?: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section id={id} className="card mt-5 scroll-mt-4 animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {intro ? <p className="mt-1 text-sm text-ink-500">{intro}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
