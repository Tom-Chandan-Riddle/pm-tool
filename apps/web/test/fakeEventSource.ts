import { act } from '@testing-library/react';

type Listener = (event: Event) => void;

/**
 * Stands in for the browser's EventSource at the network boundary. A test drives it by hand:
 * open it, send events, make it fail as the browser would while retrying, or give up.
 */
export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readyState: number = FakeEventSource.CONNECTING;
  onopen: Listener | null = null;
  onerror: Listener | null = null;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  static reset(): void {
    FakeEventSource.instances = [];
  }

  static get openStreams(): FakeEventSource[] {
    return FakeEventSource.instances.filter(
      (source) => source.readyState !== FakeEventSource.CLOSED,
    );
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  /** The connection is established. */
  open(): void {
    this.readyState = FakeEventSource.OPEN;
    act(() => {
      this.onopen?.(new Event('open'));
    });
  }

  /** The connection dropped. The browser keeps retrying unless `giveUp` is set. */
  fail(giveUp = false): void {
    this.readyState = giveUp ? FakeEventSource.CLOSED : FakeEventSource.CONNECTING;
    act(() => {
      this.onerror?.(new Event('error'));
    });
  }

  /** The server sent a `snapshot` event. Ignored once the stream is closed, as in a browser. */
  sendSnapshot(data: string): void {
    if (this.readyState === FakeEventSource.CLOSED) return;
    act(() => {
      for (const listener of this.listeners.get('snapshot') ?? []) {
        listener(new MessageEvent('snapshot', { data }));
      }
    });
  }
}
