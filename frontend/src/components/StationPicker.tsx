// Station picker in the top bar. Radix Select: keyboard, focus and screen readers come from
// the library; the look is the dashboard's (the datepicker popup's box, the range buttons'
// active background).
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import type { StationInfo } from '../../shared/api-types';

interface StationPickerProps {
  station: StationInfo;
  stations: StationInfo[];
  onChange: (id: string) => void;
}

export function StationPicker({ station, stations, onChange }: StationPickerProps) {
  return (
    <Select.Root value={station.id} onValueChange={onChange}>
      <Select.Trigger className="station-select" aria-label="Estación">
        {/* Label and name share a baseline; the pair is centred in the box. */}
        <span className="station-select-text">
          <span className="station-select-label" aria-hidden="true">Estación</span>
          <Select.Value className="station-select-value" />
        </span>
        <Select.Icon className="station-select-icon">
          <ChevronDown size={15} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="station-menu" position="popper" side="bottom" align="end" sideOffset={6}>
          <Select.Viewport>
            {stations.map((option) => (
              <Select.Item key={option.id} value={option.id} className="station-option">
                <Select.ItemText>{option.name}</Select.ItemText>
                <Select.ItemIndicator className="station-option-check">
                  <Check size={14} aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
