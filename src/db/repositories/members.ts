import { LibraryCard, type CardStatus, type LibraryCardProps } from '../../core/model/LibraryCard';
import { Member, type MemberProps, type MemberStatus, type MemberType } from '../../core/model/Member';
import type { CardRepository, Draft, MemberRepository } from '../../core/repositories';
import type { SqliteDatabase } from '../SqliteDatabase';
import { likePattern } from './catalog';

type MemberRow = { id: number; name: string; type: string; email: string | null; status: string; joined_on: string };
type CardRow = { id: number; member_id: number; number: string; issued_on: string; expires_on: string; status: string };

const toMember = (r: MemberRow) =>
  new Member({
    id: r.id,
    name: r.name,
    type: r.type as MemberType,
    email: r.email,
    status: r.status as MemberStatus,
    joinedOn: r.joined_on,
  });

const toCard = (r: CardRow) =>
  new LibraryCard({
    id: r.id,
    memberId: r.member_id,
    number: r.number,
    issuedOn: r.issued_on,
    expiresOn: r.expires_on,
    status: r.status as CardStatus,
  });

export class SqliteMemberRepository implements MemberRepository {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  add(draft: Draft<MemberProps>): Member {
    const id = this.db.insert(
      `INSERT INTO members (name, type, email, status, joined_on)
       VALUES ($name, $type, $email, $status, $joinedOn) RETURNING id`,
      { ...draft },
    );
    return new Member({ id, ...draft });
  }

  save(member: Member): void {
    this.db.run('UPDATE members SET name = $name, type = $type, email = $email, status = $status WHERE id = $id', {
      id: member.id,
      name: member.name,
      type: member.type,
      email: member.email,
      status: member.status,
    });
  }

  findById(id: number): Member | null {
    const row = this.db.get<MemberRow>('SELECT * FROM members WHERE id = $id', { id });
    return row && toMember(row);
  }

  search(query: string): Member[] {
    return this.db
      .all<MemberRow>(
        `SELECT * FROM members
         WHERE lower(name) LIKE $pattern ESCAPE '\\' OR lower(email) LIKE $pattern ESCAPE '\\' OR CAST(id AS TEXT) = $query
         ORDER BY name`,
        { pattern: likePattern(query), query },
      )
      .map(toMember);
  }

  all(): Member[] {
    return this.db.all<MemberRow>('SELECT * FROM members ORDER BY name').map(toMember);
  }
}

export class SqliteCardRepository implements CardRepository {
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  add(draft: Draft<LibraryCardProps>): LibraryCard {
    const id = this.db.insert(
      `INSERT INTO library_cards (member_id, number, issued_on, expires_on, status)
       VALUES ($memberId, $number, $issuedOn, $expiresOn, $status) RETURNING id`,
      { ...draft },
    );
    return new LibraryCard({ id, ...draft });
  }

  save(card: LibraryCard): void {
    this.db.run('UPDATE library_cards SET expires_on = $expiresOn, status = $status WHERE id = $id', {
      id: card.id,
      expiresOn: card.expiresOn,
      status: card.status,
    });
  }

  findById(id: number): LibraryCard | null {
    const row = this.db.get<CardRow>('SELECT * FROM library_cards WHERE id = $id', { id });
    return row && toCard(row);
  }

  findByNumber(number: string): LibraryCard | null {
    const row = this.db.get<CardRow>('SELECT * FROM library_cards WHERE number = $number', { number });
    return row && toCard(row);
  }

  findActiveByMember(memberId: number): LibraryCard | null {
    const row = this.db.get<CardRow>("SELECT * FROM library_cards WHERE member_id = $memberId AND status = 'active'", {
      memberId,
    });
    return row && toCard(row);
  }

  findByMember(memberId: number): LibraryCard[] {
    return this.db
      .all<CardRow>('SELECT * FROM library_cards WHERE member_id = $memberId ORDER BY issued_on, id', { memberId })
      .map(toCard);
  }
}
