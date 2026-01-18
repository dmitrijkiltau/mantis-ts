/** @jsxImportSource solid-js */
import {
  createContext,
  createSignal,
  type Accessor,
  type ParentComponent,
  useContext,
} from 'solid-js';

export type TabletTabId = 'status' | 'history' | 'logs' | 'tools' | 'telemetry';

type TabletTabsContextValue = {
  activeTab: Accessor<TabletTabId>;
  setActiveTab: (tab: TabletTabId) => void;
};

const TabletTabsContext = createContext<TabletTabsContextValue>();

/**
 * Provides the active tablet tab state.
 */
export const TabletTabsProvider: ParentComponent = (props) => {
  const [activeTab, setActiveTab] = createSignal<TabletTabId>('status');

  return (
    <TabletTabsContext.Provider value={{ activeTab, setActiveTab }}>
      {props.children}
    </TabletTabsContext.Provider>
  );
};

/**
 * Access the active tablet tab state.
 */
export const useTabletTabs = (): TabletTabsContextValue => {
  const context = useContext(TabletTabsContext);
  if (!context) {
    throw new Error('Tablet tab context is not available.');
  }
  return context;
};
