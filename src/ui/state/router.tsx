import { useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from 'react';

/**
 * Hash-based routing (#/admin/members/3): works on static hosting such as
 * GitHub Pages with no server rewrites, and needs no dependency.
 */
export interface Route {
  /** Path segments: "#/admin/members/3" → ["admin", "members", "3"]. */
  segments: string[];
  query: URLSearchParams;
}

function parse(hash: string): Route {
  const [path = '', search = ''] = hash.replace(/^#\/?/, '').split('?');
  return { segments: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(search) };
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parse(hash);
}

export function href(path: string): string {
  return `#${path.startsWith('/') ? path : `/${path}`}`;
}

export function navigate(path: string): void {
  window.location.hash = href(path);
}

export function Link({ to, children, ...rest }: { to: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={href(to)} {...rest}>
      {children}
    </a>
  );
}
