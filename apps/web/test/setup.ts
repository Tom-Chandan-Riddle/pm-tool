import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { FakeEventSource } from './fakeEventSource';

// jsdom has no EventSource, so every test starts with the hand-driven fake in its place.
beforeEach(() => {
  FakeEventSource.reset();
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
});
