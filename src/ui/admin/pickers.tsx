import { useSession } from '../state/session';

/** A drop-down of every member. Fine for a library of this size; a real one would search. */
export function MemberSelect({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const { library } = useSession();
  return (
    <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">Choose a member…</option>
      {library.members.search('').map((m) => (
        <option key={m.id} value={m.id}>
          {m.name} (#{m.id})
        </option>
      ))}
    </select>
  );
}

export function BookSelect({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const { library } = useSession();
  return (
    <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">Choose a book…</option>
      {library.catalog.search('').map((b) => (
        <option key={b.id} value={b.id}>
          {b.title}: {b.authorLine}
        </option>
      ))}
    </select>
  );
}
