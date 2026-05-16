import {
  useFloating,
  useClick,
  useDismiss,
  useRole,
  useListNavigation,
  useInteractions,
  useTransitionStyles,
  autoUpdate,
  offset,
  flip,
  size as floatingSize,
  FloatingFocusManager,
  FloatingPortal,
} from '@floating-ui/react';
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import { cn } from '@/utils/cnHelper';

const ANIMATION_DURATION_MS = 150;

// ─────────────────────────────────────────────────────
// Context shared between compound components
// ─────────────────────────────────────────────────────

type SelectSize = 'normal' | 'small' | 'compact';

type SelectContextValue = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  value: string | undefined;
  handleSelect: (value: string) => void;
  activeIndex: number | null;
  selectedIndex: number | null;
  getItemProps: (
    userProps?: Record<string, unknown>,
  ) => Record<string, unknown>;
  listRef: React.MutableRefObject<(HTMLElement | null)[]>;
  allowDeselect: boolean;
  renderInline: boolean;
  size: SelectSize;
};

const SelectContext = createContext<SelectContextValue | null>(null);

function useSelectContext() {
  const context = useContext(SelectContext);
  if (!context)
    throw new Error('Select compound components must be used within <Select>');
  return context;
}

// ─────────────────────────────────────────────────────
// Item registry for index tracking
// ─────────────────────────────────────────────────────

type ItemRegistryContextValue = {
  values: string[];
  labels: Map<string, string>;
};

const ItemRegistryContext = createContext<ItemRegistryContextValue>({
  values: [],
  labels: new Map(),
});

// ─────────────────────────────────────────────────────
// Select (Root)
// ─────────────────────────────────────────────────────

type SelectProps = {
  children: ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string | undefined) => void;
  disabled?: boolean;
  allowDeselect?: boolean;
  /** Render the dropdown inline (inside the DOM tree) instead of in a portal.
   *  Use inside ReactFlow nodes so the dropdown inherits the canvas transform. */
  renderInline?: boolean;
  /** Size variant. "normal" is the canvas-friendly 2x default, "small" is for panels, "compact" is for tight controls like color pickers. */
  size?: SelectSize;
};

function Select({
  children,
  value: controlledValue,
  defaultValue,
  onValueChange,
  disabled,
  allowDeselect = false,
  renderInline = false,
  size = 'normal',
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const isControlled = controlledValue !== undefined;
  const currentValue = isControlled ? controlledValue : uncontrolledValue;

  // Collect item values and labels from SelectContent children for index tracking
  const [itemValues, setItemValues] = useState<string[]>([]);
  const [itemLabels, setItemLabels] = useState<Map<string, string>>(new Map());

  const selectedIndex = currentValue ? itemValues.indexOf(currentValue) : null;

  const listRef = useRef<(HTMLElement | null)[]>([]);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (disabled) return;
      setIsOpen(open);
      if (!open) setActiveIndex(null);
    },
    placement: 'bottom-start',
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      floatingSize({
        apply({ rects, availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            minWidth: `${rects.reference.width}px`,
            maxHeight: `${Math.min(availableHeight, 384)}px`,
          });
        },
        padding: 8,
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context, { enabled: !disabled });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'listbox' });
  const listNavigation = useListNavigation(context, {
    listRef,
    activeIndex,
    selectedIndex,
    onNavigate: setActiveIndex,
    loop: true,
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions(
    [click, dismiss, role, listNavigation],
  );

  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: ANIMATION_DURATION_MS,
    initial: { opacity: 0, transform: 'scale(0.95)' },
    common: { transformOrigin: 'top' },
  });

  const handleSelect = useCallback(
    (itemValue: string) => {
      if (allowDeselect && itemValue === currentValue) {
        if (!isControlled) setUncontrolledValue(undefined);
        onValueChange?.(undefined);
      } else {
        if (!isControlled) setUncontrolledValue(itemValue);
        onValueChange?.(itemValue);
      }
      setIsOpen(false);
      setActiveIndex(null);
    },
    [allowDeselect, currentValue, isControlled, onValueChange],
  );

  const contextValue = useMemo<SelectContextValue>(
    () => ({
      isOpen,
      setIsOpen,
      value: currentValue,
      handleSelect,
      activeIndex,
      selectedIndex,
      getItemProps,
      listRef,
      allowDeselect,
      renderInline,
      size,
    }),
    [
      isOpen,
      currentValue,
      handleSelect,
      activeIndex,
      selectedIndex,
      getItemProps,
      allowDeselect,
      renderInline,
      size,
    ],
  );

  const registryValue = useMemo<ItemRegistryContextValue>(
    () => ({ values: itemValues, labels: itemLabels }),
    [itemValues, itemLabels],
  );

  return (
    <SelectContext.Provider value={contextValue}>
      <ItemRegistryContext.Provider value={registryValue}>
        <SelectInternals
          refs={refs}
          getReferenceProps={getReferenceProps}
          getFloatingProps={getFloatingProps}
          floatingStyles={floatingStyles}
          transitionStyles={transitionStyles}
          isMounted={isMounted}
          context={context}
          setItemValues={setItemValues}
          setItemLabels={setItemLabels}
          renderInline={renderInline}
        >
          {children}
        </SelectInternals>
      </ItemRegistryContext.Provider>
    </SelectContext.Provider>
  );
}

// ─────────────────────────────────────────────────────
// Internal wrapper that distributes refs to children
// ─────────────────────────────────────────────────────

type SelectInternalsProps = {
  children: ReactNode;
  refs: ReturnType<typeof useFloating>['refs'];
  getReferenceProps: ReturnType<typeof useInteractions>['getReferenceProps'];
  getFloatingProps: ReturnType<typeof useInteractions>['getFloatingProps'];
  floatingStyles: React.CSSProperties;
  transitionStyles: React.CSSProperties;
  isMounted: boolean;
  context: ReturnType<typeof useFloating>['context'];
  setItemValues: React.Dispatch<React.SetStateAction<string[]>>;
  setItemLabels: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  renderInline: boolean;
};

type InternalsContextValue = {
  refs: ReturnType<typeof useFloating>['refs'];
  getReferenceProps: ReturnType<typeof useInteractions>['getReferenceProps'];
  getFloatingProps: ReturnType<typeof useInteractions>['getFloatingProps'];
  floatingStyles: React.CSSProperties;
  transitionStyles: React.CSSProperties;
  isMounted: boolean;
  context: ReturnType<typeof useFloating>['context'];
  setItemValues: React.Dispatch<React.SetStateAction<string[]>>;
  setItemLabels: React.Dispatch<React.SetStateAction<Map<string, string>>>;
};

const InternalsContext = createContext<InternalsContextValue | null>(null);

function useInternals() {
  const ctx = useContext(InternalsContext);
  if (!ctx) throw new Error('Select internals context missing');
  return ctx;
}

function SelectInternals({
  children,
  renderInline,
  ...internals
}: SelectInternalsProps) {
  const value = useMemo(
    () => internals,
    [
      internals.refs,
      internals.getReferenceProps,
      internals.getFloatingProps,
      internals.floatingStyles,
      internals.transitionStyles,
      internals.isMounted,
      internals.context,
      internals.setItemValues,
    ],
  );
  return (
    <InternalsContext.Provider value={value}>
      <div className={renderInline ? 'relative w-full' : undefined}>
        {children}
      </div>
    </InternalsContext.Provider>
  );
}

// ─────────────────────────────────────────────────────
// SelectTrigger
// ─────────────────────────────────────────────────────

type SelectTriggerProps = ComponentPropsWithoutRef<'button'>;

const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }, _ref) => {
    const { refs, getReferenceProps } = useInternals();
    const { size } = useSelectContext();

    return (
      <button
        ref={refs.setReference}
        type='button'
        className={cn(
          'flex w-full items-center justify-between border cursor-pointer',
          'border-secondary-dark-gray bg-primary-black font-main text-primary-white',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-white',
          'disabled:cursor-not-allowed disabled:opacity-50',
          size === 'compact'
            ? 'h-[22px] px-2 py-0.5 text-[12px] leading-[12px] rounded'
            : size === 'small'
              ? 'h-[28px] px-3 py-1 text-[16px] leading-[16px] rounded-sm'
              : 'h-[44px] px-4 py-2 text-[27px] leading-[27px] rounded-md',
          className,
        )}
        {...getReferenceProps(props)}
      >
        <span className='text-left truncate'>{children}</span>
        <ChevronDownIcon
          className={cn(
            'shrink-0 ml-1',
            size === 'compact'
              ? 'h-3 w-3'
              : size === 'small'
                ? 'h-4 w-4'
                : 'h-6 w-6',
          )}
        />
      </button>
    );
  },
);
SelectTrigger.displayName = 'SelectTrigger';

// ─────────────────────────────────────────────────────
// SelectValue
// ─────────────────────────────────────────────────────

type SelectValueProps = {
  placeholder?: string;
  className?: string;
  /** When the current value is not in the options list, show it with this indicator */
  unsupportedLabel?: string;
};

function SelectValue({
  placeholder,
  className,
  unsupportedLabel,
}: SelectValueProps) {
  const { value } = useSelectContext();
  const { values, labels } = useContext(ItemRegistryContext);
  const isUnsupported =
    unsupportedLabel &&
    value !== undefined &&
    value !== '' &&
    !values.includes(value);

  const displayText = value ? (labels.get(value) ?? value) : undefined;

  if (isUnsupported) {
    return (
      <span
        className={cn(
          'flex items-center gap-2 text-red-500 truncate',
          className,
        )}
      >
        <span className='truncate'>{displayText}</span>
        <span className='text-[20px] leading-[20px] shrink-0'>
          {unsupportedLabel}
        </span>
      </span>
    );
  }

  return (
    <span className={cn(!displayText && 'text-[#6B6B6B]', className)}>
      {displayText || placeholder}
    </span>
  );
}

// ─────────────────────────────────────────────────────
// SelectContent
// ─────────────────────────────────────────────────────

type SelectContentProps = {
  children: ReactNode;
  className?: string;
};

function SelectContent({ children, className }: SelectContentProps) {
  const selectContext = useSelectContext();
  const {
    refs,
    getFloatingProps,
    floatingStyles,
    transitionStyles,
    isMounted,
    context,
    setItemValues,
    setItemLabels,
  } = useInternals();

  // Collect item values and labels from children for index tracking
  const { itemValues, itemLabels } = useMemo(() => {
    const values: string[] = [];
    const labels = new Map<string, string>();
    function extractTextContent(node: ReactNode): string {
      if (typeof node === 'string') return node;
      if (typeof node === 'number') return String(node);
      if (!node) return '';
      if (Array.isArray(node)) return node.map(extractTextContent).join('');
      if (typeof node === 'object' && 'props' in node) {
        const props = (node as { props: Record<string, unknown> }).props;
        return extractTextContent(props?.children as ReactNode);
      }
      return '';
    }
    function collectValues(node: ReactNode) {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(collectValues);
        return;
      }
      if (typeof node === 'object' && node !== null && 'props' in node) {
        const props = (node as { props: Record<string, unknown> }).props;
        if (typeof props?.value === 'string') {
          values.push(props.value);
          const label = extractTextContent(props?.children as ReactNode).trim();
          if (label) labels.set(props.value, label);
        }
        if (props?.children) {
          collectValues(props.children as ReactNode);
        }
      }
    }
    collectValues(children);
    return { itemValues: values, itemLabels: labels };
  }, [children]);

  // Sync item values and labels to parent for selectedIndex and label lookup
  useMemo(() => {
    setItemValues(itemValues);
    setItemLabels(itemLabels);
  }, [itemValues, itemLabels, setItemValues, setItemLabels]);

  if (!isMounted) return null;

  const floatingContent = (
    <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
      <div
        ref={refs.setFloating}
        style={
          selectContext.renderInline
            ? {
                position: 'absolute' as const,
                top: '100%',
                left: 0,
                width: '100%',
                marginTop: 4,
                zIndex: 50,
              }
            : { ...floatingStyles, zIndex: 50 }
        }
        {...getFloatingProps()}
      >
        <div
          style={transitionStyles}
          className={cn(
            'overflow-hidden rounded-md border border-secondary-dark-gray bg-[#181818] text-primary-white shadow-md',
            className,
          )}
        >
          <div className='overflow-y-auto p-1' style={{ maxHeight: 384 }}>
            {children}
          </div>
        </div>
      </div>
    </FloatingFocusManager>
  );

  if (selectContext.renderInline) {
    return floatingContent;
  }

  return <FloatingPortal>{floatingContent}</FloatingPortal>;
}

// ─────────────────────────────────────────────────────
// SelectItem
// ─────────────────────────────────────────────────────

type SelectItemProps = {
  value: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
};

function SelectItem({
  value: itemValue,
  children,
  className,
  disabled,
}: SelectItemProps) {
  const { value, handleSelect, activeIndex, listRef, getItemProps, size } =
    useSelectContext();
  const { values } = useContext(ItemRegistryContext);
  const itemIndex = values.indexOf(itemValue);
  const isSelected = itemValue === value;
  const isActive = itemIndex === activeIndex;

  return (
    <div
      ref={(node) => {
        listRef.current[itemIndex] = node;
      }}
      role='option'
      aria-selected={isSelected}
      tabIndex={isActive ? 0 : -1}
      className={cn(
        'relative flex w-full cursor-default select-none items-center',
        'font-main text-primary-white outline-none',
        size === 'compact'
          ? 'py-0.5 pl-2 pr-1 text-[12px] leading-[12px] rounded'
          : size === 'small'
            ? 'py-1 pl-3 pr-1.5 text-[16px] leading-[16px] rounded-sm'
            : 'py-1.5 pl-4 pr-2 text-[27px] leading-[27px] rounded-sm',
        isActive && 'bg-[#3F3F3F]',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      {...getItemProps({
        onClick: disabled ? undefined : () => handleSelect(itemValue),
      })}
    >
      <span className='truncate'>{children}</span>
      {isSelected && (
        <span className='ml-auto'>
          <CheckIcon
            className={cn(
              'ml-1',
              size === 'compact'
                ? 'h-3 w-3'
                : size === 'small'
                  ? 'h-3.5 w-3.5'
                  : 'h-5 w-5',
            )}
            strokeWidth={2.5}
          />
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// SelectLabel
// ─────────────────────────────────────────────────────

type SelectLabelProps = {
  children: ReactNode;
  className?: string;
};

function SelectLabel({ children, className }: SelectLabelProps) {
  return (
    <div
      className={cn(
        'py-1.5 px-2 text-[27px] leading-[27px] font-main font-semibold text-primary-white',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// SelectSeparator
// ─────────────────────────────────────────────────────

type SelectSeparatorProps = {
  className?: string;
};

function SelectSeparator({ className }: SelectSeparatorProps) {
  return (
    <div className={cn('-mx-1 my-1 h-px bg-secondary-dark-gray', className)} />
  );
}

// ─────────────────────────────────────────────────────
// SelectGroup
// ─────────────────────────────────────────────────────

function SelectGroup({ children }: { children: ReactNode }) {
  return <div role='group'>{children}</div>;
}

// ─────────────────────────────────────────────────────
// SelectUnsupportedItem — shown when current value is not in the options
// ─────────────────────────────────────────────────────

type SelectUnsupportedItemProps = {
  className?: string;
};

function SelectUnsupportedItem({ className }: SelectUnsupportedItemProps) {
  const { value, handleSelect } = useSelectContext();
  const { values } = useContext(ItemRegistryContext);

  if (!value || values.includes(value)) return null;

  return (
    <button
      type='button'
      onClick={() => handleSelect(value)}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-4 pr-2',
        'text-[27px] leading-[27px] font-main text-red-500/60 hover:bg-[#3F3F3F]',
        className,
      )}
    >
      <span className='truncate'>{value}</span>
      <span className='ml-auto'>
        <XIcon className='h-5 w-5 ml-2 mr-1' strokeWidth={2.5} />
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectGroup,
  SelectUnsupportedItem,
};

export type {
  SelectProps,
  SelectSize,
  SelectTriggerProps,
  SelectValueProps,
  SelectContentProps,
  SelectItemProps,
  SelectLabelProps,
  SelectSeparatorProps,
};
