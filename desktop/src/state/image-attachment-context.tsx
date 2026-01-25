/** @jsxImportSource solid-js */
import {
  createContext,
  createSignal,
  type Accessor,
  type ParentComponent,
  useContext,
} from 'solid-js';
import type { ImageAttachment } from '../../../assistant/src/pipeline/types';

export type ImageAttachmentStore = {
  attachment: Accessor<ImageAttachment | null>;
  setAttachment: (value: ImageAttachment | null) => void;
  consumeAttachment: () => ImageAttachment | null;
};

const ImageAttachmentContext = createContext<ImageAttachmentStore>();

/**
 * Provides the active image attachment for the prompt input.
 */
export const ImageAttachmentProvider: ParentComponent = (props) => {
  const [attachment, setAttachment] = createSignal<ImageAttachment | null>(null);

  const store: ImageAttachmentStore = {
    attachment,
    setAttachment,
    consumeAttachment: () => {
      const current = attachment();
      if (current) {
        setAttachment(null);
      }
      return current;
    },
  };

  return (
    <ImageAttachmentContext.Provider value={store}>
      {props.children}
    </ImageAttachmentContext.Provider>
  );
};

/**
 * Access the image attachment store for the prompt input.
 */
export const useImageAttachmentStore = (): ImageAttachmentStore => {
  const store = useContext(ImageAttachmentContext);
  if (!store) {
    throw new Error('Image attachment store is not available.');
  }
  return store;
};
