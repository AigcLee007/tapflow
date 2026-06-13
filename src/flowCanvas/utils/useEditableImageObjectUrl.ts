import { useEffect, useState } from 'react';

import { imageUrlToBlob } from './imageUtils';

export function useEditableImageObjectUrl(sourceUrl: string) {
  const [objectUrl, setObjectUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    let localObjectUrl = '';
    setObjectUrl('');

    if (!sourceUrl) return undefined;
    if (!sourceUrl.startsWith('/api/v2/')) {
      setObjectUrl(sourceUrl);
      return undefined;
    }

    void imageUrlToBlob(sourceUrl)
      .then((blob) => {
        if (cancelled) return;
        localObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(localObjectUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setObjectUrl(sourceUrl);
        }
      });

    return () => {
      cancelled = true;
      if (localObjectUrl) {
        URL.revokeObjectURL(localObjectUrl);
      }
    };
  }, [sourceUrl]);

  return objectUrl;
}
