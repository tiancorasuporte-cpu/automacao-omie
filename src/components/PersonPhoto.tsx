import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { getPersonPhotoFn } from "@/lib/people";

export function PersonPhoto({
  id,
  name,
  hasPhoto,
}: {
  id: number;
  name: string;
  hasPhoto: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!hasPhoto) return;
    let cancelled = false;
    getPersonPhotoFn({ data: { id } }).then((photo) => {
      if (cancelled || !photo) return;
      setSrc(`data:${photo.mime};base64,${photo.base64}`);
    });
    return () => {
      cancelled = true;
    };
  }, [hasPhoto, id]);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        className="h-12 w-12 rounded-full border border-outline-variant object-cover"
      />
    );
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-outline-variant bg-surface-container-high">
      <Icon name="person" className="text-on-surface-variant" />
    </div>
  );
}
