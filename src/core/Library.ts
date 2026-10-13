import type { Clock } from './clock';
import type { LendingPolicy } from './model/LendingPolicy';
import type { LibraryStore } from './repositories';
import { CatalogService } from './services/CatalogService';
import { FineService } from './services/FineService';
import { LendingService } from './services/LendingService';
import { MemberService, type MemberServiceOptions } from './services/MemberService';
import { ReservationService } from './services/ReservationService';

/**
 * The single entry point to the library. Wires the services together over one
 * store and one clock; both the admin panel and the game talk only to this.
 */
export class Library {
  readonly store: LibraryStore;
  readonly clock: Clock;
  readonly catalog: CatalogService;
  readonly members: MemberService;
  readonly lending: LendingService;
  readonly reservations: ReservationService;
  readonly fines: FineService;

  constructor(store: LibraryStore, clock: Clock, options: MemberServiceOptions = {}) {
    this.store = store;
    this.clock = clock;
    this.fines = new FineService(store, clock);
    this.reservations = new ReservationService(store, clock);
    this.catalog = new CatalogService(store, clock, this.reservations);
    this.members = new MemberService(store, clock, this.fines, options);
    this.lending = new LendingService(store, clock, this.fines, this.reservations);
  }

  get policy(): LendingPolicy {
    return this.store.policy.load();
  }

  set policy(policy: LendingPolicy) {
    this.store.policy.save(policy);
  }

  /** Routine housekeeping at the start of each day: expire uncollected holds. */
  openForTheDay(): void {
    this.reservations.expireHolds();
  }
}
