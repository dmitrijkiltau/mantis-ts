import { render } from 'solid-js/web';
import App from './App';
import { DesktopServicesProvider } from './state/desktop-context';
import { createDesktopServices } from './state/desktop-services';
import { ImageAttachmentProvider } from './state/image-attachment-context';
import { UIStateProvider } from './state/ui-state-context';
import DesktopBootstrap from './desktop-bootstrap';

import './styles.css';

const services = createDesktopServices();

/**
 * Mounts the Solid UI shell into the document.
 */
const mountApp = (): void => {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Missing #root mount point for the desktop UI.');
  }

  render(() => (
    <DesktopServicesProvider services={services}>
      <UIStateProvider>
        <ImageAttachmentProvider>
          <App />
          <DesktopBootstrap />
        </ImageAttachmentProvider>
      </UIStateProvider>
    </DesktopServicesProvider>
  ), root);
};

mountApp();
