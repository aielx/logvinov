/**
 * Хранилище состояния архива в памяти текущей страницы.
 * Публичные данные кэшируются до перезагрузки; приватные — только в памяти
 * и полностью очищаются при logout/SESSION_INVALID.
 */
import type {
  PrivateGalleryItem,
  PrivatePerson,
  PublicGalleryItem,
  PublicPersonCard,
  PublicTimelineEvent,
  PublicTree
} from "../api/types";
import { releasePrivateResources } from "../privacy/cleanup";

export const STORE_EVENTS = {
  TREE: "archive:tree",
  CARD: "archive:card",
  TIMELINE: "archive:timeline",
  GALLERY: "archive:gallery",
  FAMILY_CHANGE: "archive:familychange",
  RESET_PRIVATE: "archive:resetprivate"
} as const;

export interface GalleryState {
  items: PublicGalleryItem[];
  familyItems: PrivateGalleryItem[];
  nextOffset: number | null;
  loaded: boolean;
}

class ArchiveStore extends EventTarget {
  tree: PublicTree | null = null;
  cards = new Map<string, PublicPersonCard>();
  privatePersons = new Map<string, PrivatePerson>();
  timeline: PublicTimelineEvent[] = [];
  familyEventDescriptions = new Map<string, string>();
  gallery: GalleryState = { items: [], familyItems: [], nextOffset: null, loaded: false };
  familyMode = false;
  pendingPersonId: string | null = null;

  private emit(type: string): void {
    this.dispatchEvent(new CustomEvent(type));
  }

  setTree(tree: PublicTree): void {
    this.tree = tree;
    this.emit(STORE_EVENTS.TREE);
  }

  setCard(card: PublicPersonCard): void {
    this.cards.set(card.personId, card);
    this.emit(STORE_EVENTS.CARD);
  }

  getPersonSummary(personId: string) {
    return this.tree?.people.find((person) => person.personId === personId) ?? null;
  }

  setTimeline(events: PublicTimelineEvent[]): void {
    this.timeline = events;
    this.emit(STORE_EVENTS.TIMELINE);
  }

  mergeFamilyDescription(eventId: string, description: string): void {
    this.familyEventDescriptions.set(eventId, description);
    this.emit(STORE_EVENTS.TIMELINE);
  }

  addFamilyEvents(events: PublicTimelineEvent[]): void {
    const known = new Set(this.timeline.map((event) => event.eventId));
    const fresh = events.filter((event) => !known.has(event.eventId));
    this.timeline = [...this.timeline, ...fresh].sort((a, b) => a.sortKey - b.sortKey);
    this.emit(STORE_EVENTS.TIMELINE);
  }

  setGalleryPage(items: PublicGalleryItem[], nextOffset: number | null, append: boolean): void {
    this.gallery.items = append ? [...this.gallery.items, ...items] : items;
    this.gallery.nextOffset = nextOffset;
    this.gallery.loaded = true;
    this.emit(STORE_EVENTS.GALLERY);
  }

  setPrivateGallery(items: PrivateGalleryItem[]): void {
    this.gallery.familyItems = items;
    this.emit(STORE_EVENTS.GALLERY);
  }

  enterFamily(): void {
    this.familyMode = true;
    this.emit(STORE_EVENTS.FAMILY_CHANGE);
  }

  /** Полная очистка приватного состояния; публичные данные остаются. */
  resetPrivate(): void {
    this.privatePersons.clear();
    this.familyEventDescriptions.clear();
    this.gallery.familyItems = [];
    // Семейные события (появившиеся после входа) удаляются из общей ленты.
    this.timeline = this.timeline.filter(
      (event) => !((event as PublicTimelineEvent & { familyOnly?: boolean }).familyOnly === true)
    );
    this.familyMode = false;
    this.pendingPersonId = null;
    releasePrivateResources();
    this.emit(STORE_EVENTS.RESET_PRIVATE);
    this.emit(STORE_EVENTS.FAMILY_CHANGE);
  }
}

export const store = new ArchiveStore();
