export interface AuthorProps {
  id: number;
  name: string;
  birthYear: number | null;
}

export class Author {
  readonly id: number;
  readonly name: string;
  readonly birthYear: number | null;

  constructor(props: AuthorProps) {
    this.id = props.id;
    this.name = props.name;
    this.birthYear = props.birthYear;
  }

  /** "Austen, Jane", the form used on catalog cards and for sorting. */
  get sortName(): string {
    const parts = this.name.trim().split(/\s+/);
    if (parts.length < 2) return this.name;
    const last = parts.pop()!;
    return `${last}, ${parts.join(' ')}`;
  }
}
