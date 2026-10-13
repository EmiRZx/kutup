import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Violation } from '../../core/model/violations';
import { isOverridable } from '../../core/model/violations';
import type { BadgeTone } from '../format';
import { useSession } from '../state/session';

type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost';

export function Button({
  variant = 'default',
  size,
  className,
  type = 'button',
  ...rest
}: { variant?: ButtonVariant; size?: 'sm' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = ['btn', variant !== 'default' && `btn--${variant}`, size && `btn--${size}`, className].filter(Boolean);
  return <button type={type} className={classes.join(' ')} {...rest} />;
}

export function Badge({ tone = 'muted', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Panel({
  title,
  aside,
  children,
  className,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={['panel', className].filter(Boolean).join(' ')}>
      {title && (
        <header className="panel__head">
          <h2 className="panel__title">{title}</h2>
          {aside && <div className="panel__aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'danger' | 'warn'; children: ReactNode }) {
  return <div className={`notice${tone === 'info' ? '' : ` notice--${tone}`}`}>{children}</div>;
}

export function ViolationList({ violations }: { violations: readonly Violation[] }) {
  return (
    <ul className="violations">
      {violations.map((v) => (
        <li key={v.code}>
          <Badge tone={isOverridable(v.code) ? 'warn' : 'danger'}>{v.code.replaceAll('_', ' ')}</Badge>
          <span>{v.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="btn-row">{actions}</div>}
    </header>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useSession();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`} onClick={() => dismiss(t.id)}>
          <div className="toast__title">{t.title}</div>
          {t.lines && (
            <ul className="violations">
              {t.lines.map((line) => (
                <li key={line} style={{ display: 'block' }}>
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export function Stat({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: BadgeTone; hint?: ReactNode }) {
  return (
    <div className={`stat${tone ? ` stat--${tone}` : ''}`}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}
