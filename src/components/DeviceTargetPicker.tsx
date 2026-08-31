export type DeviceOption = {
  id: number;
  name: string;
  location?: string | null;
};

export function DeviceTargetPicker({
  devices,
  targetAll,
  selectedIds,
  onChange,
}: {
  devices: DeviceOption[];
  targetAll: boolean;
  selectedIds: number[];
  onChange: (next: { targetAll: boolean; selectedIds: number[] }) => void;
}) {
  const allIds = devices.map((device) => device.id);
  const ticked = (id: number) => targetAll || selectedIds.includes(id);

  function toggleAll(checked: boolean) {
    onChange({ targetAll: checked, selectedIds: checked ? allIds : [] });
  }

  function toggleOne(id: number, checked: boolean) {
    if (targetAll) {
      onChange({
        targetAll: false,
        selectedIds: checked ? allIds : allIds.filter((item) => item !== id),
      });
      return;
    }
    const next = checked ? [...selectedIds, id] : selectedIds.filter((item) => item !== id);
    const every = allIds.length > 0 && allIds.every((item) => next.includes(item));
    onChange({ targetAll: every, selectedIds: every ? [] : next });
  }

  return (
    <div className="space-y-sm">
      <label className="flex cursor-pointer items-center gap-sm rounded-lg border border-outline-variant px-sm py-sm text-body-md">
        <input
          type="checkbox"
          checked={targetAll || (allIds.length > 0 && allIds.every((id) => selectedIds.includes(id)))}
          onChange={(event) => toggleAll(event.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Todos os equipamentos
      </label>
      {devices.length === 0 ? (
        <p className="text-label-md text-on-surface-variant">Nenhum Face Max cadastrado.</p>
      ) : (
        <ul className="space-y-xs">
          {devices.map((device) => (
            <li key={device.id}>
              <label className="flex cursor-pointer items-center gap-sm rounded-lg px-sm py-sm text-body-md hover:bg-surface-container-low">
                <input
                  type="checkbox"
                  checked={ticked(device.id)}
                  onChange={(event) => toggleOne(device.id, event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                {device.location || device.name}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
