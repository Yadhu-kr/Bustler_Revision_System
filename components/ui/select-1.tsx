import * as React from 'react';
import { Select } from '@base-ui-components/react/select';

export interface ServiceFieldOption {
  label: string;
  value: string | null;
}

export const serviceFields: ServiceFieldOption[] = [
  { label: 'Choose a field', value: null },
  { label: '2d modeling', value: '2d modeling' },
  { label: '3d modeling', value: '3d modeling' },
  { label: 'adobe photoshop/after effect', value: 'adobe photoshop/after effect' },
  { label: 'application servicing', value: 'application servicing' },
  { label: 'application development', value: 'application development' },
  { label: 'cloude support ans system administrate', value: 'cloude support ans system administrate' },
  { label: 'craft & art work', value: 'craft & art work' },
  { label: 'designing', value: 'designing' },
  { label: 'digital creator', value: 'digital creator' },
  { label: 'digital marketing', value: 'digital marketing' },
  { label: 'industrial & metal work', value: 'industrial & metal work' },
  { label: 'it & networking/system security', value: 'it & networking/system security' },
  { label: 'marketing', value: 'marketing' },
  { label: 'photography', value: 'photography' },
  { label: 'videography', value: 'videography' },
  { label: 'website development', value: 'website development' },
  { label: 'writing', value: 'writing' },
];

export interface Select1Props {
  value?: string | null;
  onValueChange?: (value: string | null) => void;
  placeholder?: string;
  className?: string;
}

export default function Select1({
  value,
  onValueChange,
  placeholder = 'Choose a field',
  className = '',
}: Select1Props) {
  return (
    <Select.Root
      items={serviceFields}
      value={value}
      onValueChange={onValueChange}
    >
      <Select.Trigger
        className={`flex h-10 w-full min-w-36 items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3.5 text-sm text-gray-900 select-none hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-teal-600 active:bg-gray-100 data-[popup-open]:border-teal-500 data-[popup-open]:ring-2 data-[popup-open]:ring-teal-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800/80 ${className}`}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="flex text-gray-500 dark:text-gray-400">
          <ChevronUpDownIcon />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="outline-none z-50" sideOffset={6}>
          <Select.ScrollUpArrow className="top-0 z-[1] flex h-4 w-full cursor-default items-center justify-center rounded-md bg-[canvas] text-center text-xs before:absolute before:top-[-100%] before:left-0 before:h-full before:w-full before:content-[''] data-[direction=down]:bottom-0 data-[direction=down]:before:bottom-[-100%]" />
          <Select.Popup className="group max-h-64 min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-y-auto rounded-lg bg-white py-1.5 text-gray-900 shadow-xl shadow-black/10 outline outline-1 outline-gray-200 transition-[transform,scale,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:transition-none data-[starting-style]:scale-95 data-[starting-style]:opacity-0 dark:bg-gray-900 dark:text-gray-100 dark:outline-gray-800 dark:shadow-2xl">
            {serviceFields.map(({ label, value: itemVal }) => (
              <Select.Item
                key={label}
                value={itemVal}
                className="grid min-w-[var(--anchor-width)] cursor-pointer grid-cols-[1rem_1fr] items-center gap-2.5 py-2 pr-4 pl-3 text-sm outline-none select-none rounded-md mx-1 data-[highlighted]:bg-teal-50 data-[highlighted]:text-teal-900 dark:data-[highlighted]:bg-teal-950/60 dark:data-[highlighted]:text-teal-200 transition-colors"
              >
                <Select.ItemIndicator className="col-start-1 flex items-center justify-center text-teal-600 dark:text-teal-400">
                  <CheckIcon className="size-3.5" />
                </Select.ItemIndicator>
                <Select.ItemText className="col-start-2 font-medium">{label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
          <Select.ScrollDownArrow className="bottom-0 z-[1] flex h-4 w-full cursor-default items-center justify-center rounded-md bg-[canvas] text-center text-xs before:absolute before:top-[-100%] before:left-0 before:h-full before:w-full before:content-[''] data-[direction=down]:bottom-0 data-[direction=down]:before:bottom-[-100%]" />
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function ChevronUpDownIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg
      width="8"
      height="12"
      viewBox="0 0 8 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      {...props}
    >
      <path d="M0.5 4.5L4 1.5L7.5 4.5" />
      <path d="M0.5 7.5L4 10.5L7.5 7.5" />
    </svg>
  );
}

function CheckIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg fill="currentColor" width="10" height="10" viewBox="0 0 10 10" {...props}>
      <path d="M9.1603 1.12218C9.50684 1.34873 9.60427 1.81354 9.37792 2.16038L5.13603 8.66012C5.01614 8.8438 4.82192 8.96576 4.60451 8.99384C4.3871 9.02194 4.1683 8.95335 4.00574 8.80615L1.24664 6.30769C0.939709 6.02975 0.916013 5.55541 1.19372 5.24822C1.47142 4.94102 1.94536 4.91731 2.2523 5.19524L4.36085 7.10461L8.12299 1.33999C8.34934 0.993152 8.81376 0.895638 9.1603 1.12218Z" />
    </svg>
  );
}
