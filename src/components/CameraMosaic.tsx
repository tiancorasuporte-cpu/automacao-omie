export type CameraTile = {
  id: number;
  name: string;
  url: string;
};

/**
 * Grade proporcional: cada câmera ocupa ~1/n da tela (4 → 2×2, 6 → 3×2, etc.).
 */
export function mosaicLayout(count: number) {
  if (count <= 1) return { cols: 1, rows: 1 };
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

export function mosaicClass(count: number) {
  const { cols } = mosaicLayout(count);
  if (cols === 1) return "grid-cols-1";
  if (cols === 2) return "grid-cols-1 sm:grid-cols-2";
  if (cols === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
}

export function CameraMosaic({
  cameras,
  fillHeight = false,
}: {
  cameras: CameraTile[];
  fillHeight?: boolean;
}) {
  if (cameras.length === 0) return null;

  const { cols, rows } = mosaicLayout(cameras.length);

  return (
    <div
      className={`grid w-full gap-1 ${fillHeight ? "h-full min-h-0" : mosaicClass(cameras.length)}`}
      style={
        fillHeight
          ? {
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }
          : undefined
      }
    >
      {cameras.map((camera) => (
        <article
          key={camera.id}
          className={`relative min-h-0 min-w-0 overflow-hidden bg-black ${fillHeight ? "h-full" : ""}`}
        >
          <div className={fillHeight ? "absolute inset-0" : "relative aspect-video"}>
            <iframe
              title={camera.name}
              src={camera.url}
              className="absolute inset-0 h-full w-full border-0"
              allow="autoplay; fullscreen; encrypted-media"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent px-md py-sm">
              <p className="truncate text-body-md font-semibold text-white drop-shadow">{camera.name}</p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
