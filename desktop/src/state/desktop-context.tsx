/** @jsxImportSource solid-js */
import { createContext, useContext, type ParentComponent } from 'solid-js';
import type { DesktopServices } from './desktop-services';

const DesktopServicesContext = createContext<DesktopServices>();

/**
 * Provides core desktop services to Solid components.
 */
export const DesktopServicesProvider: ParentComponent<{ services: DesktopServices }> = (props) => (
  <DesktopServicesContext.Provider value={props.services}>
    {props.children}
  </DesktopServicesContext.Provider>
);

/**
 * Access the shared desktop service instances.
 */
export const useDesktopServices = (): DesktopServices => {
  const context = useContext(DesktopServicesContext);
  if (!context) {
    throw new Error('Desktop services are not available in context.');
  }
  return context;
};
