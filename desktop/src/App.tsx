/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';
import { AvatarSection } from './components/avatar-section';
import { PipTablet } from './components/pip-tablet';

/**
 * Renders the MANTIS desktop UI shell.
 */
const App: Component = () => (
  <div class="app-shell">
    <AvatarSection />
    <PipTablet />
  </div>
);

export default App;
