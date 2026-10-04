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
  useEffect,
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

  // Use null (not -1) for "no selection" so floating-ui's useListNavigation
  // never receives -1 (a real-but-absent index) during the commit before the
  // SelectContent registry effect populates itemValues.
  const selectedItemIndex = currentValue
    ? itemValues.indexOf(currentValue)
    : -1;
  const selectedIndex = selectedItemIndex >= 0 ? selectedItemIndex : null;

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
      <div className={renderInline ? 'rbn:relative rbn:w-full' : undefined}>
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
          'rbn:flex rbn:w-full rbn:items-center rbn:justify-between rbn:border rbn:cursor-pointer',
          'rbn:border-secondary-dark-gray rbn:bg-primary-black rbn:font-main rbn:text-primary-white',
          'rbn:focus:outline-none rbn:focus-visible:ring-1 rbn:focus-visible:ring-white',
          'rbn:disabled:cursor-not-allowed rbn:disabled:opacity-50',
          size === 'compact'
            ? 'rbn:h-[22px] rbn:px-2 rbn:py-0.5 rbn:text-[12px] rbn:leading-[12px] rbn:rounded'
            : size === 'small'
              ? 'rbn:h-[28px] rbn:px-3 rbn:py-1 rbn:text-[16px] rbn:leading-[16px] rbn:rounded-sm'
              : 'rbn:h-[44px] rbn:px-4 rbn:py-2 rbn:text-[27px] rbn:leading-[27px] rbn:rounded-md',
          className,
        )}
        {...getReferenceProps(props)}
      >
        <span className='rbn:text-left rbn:truncate'>{children}</span>
        <ChevronDownIcon
          className={cn(
            'rbn:shrink-0 rbn:ml-1',
            size === 'compact'
              ? 'rbn:h-3 rbn:w-3'
              : size === 'small'
                ? 'rbn:h-4 rbn:w-4'
                : 'rbn:h-6 rbn:w-6',
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
          'rbn:flex rbn:items-center rbn:gap-2 rbn:text-red-500 rbn:truncate',
          className,
        )}
      >
        <span className='rbn:truncate'>{displayText}</span>
        <span className='rbn:text-[20px] rbn:leading-[20px] rbn:shrink-0'>
          {unsupportedLabel}
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        !displayText && 'rbn:text-graph-input-placeholder',
        className,
      )}
    >
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

  // Sync item values and labels to parent for selectedIndex and label lookup.
  // This MUST be an effect, not a `useMemo` — calling the parent's setState
  // during this component's render is a "setState while rendering a different
  // component" violation (React logs it on every Select). `itemValues`/
  // `itemLabels` are memoized from `children`, so this fires only when the
  // option set actually changes (same frequency as before), just one commit
  // later — imperceptible for the trigger label / selected index.
  useEffect(() => {
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
            'rbn:overflow-hidden rbn:rounded-md rbn:border rbn:border-secondary-dark-gray rbn:bg-graph-menu-bg rbn:text-primary-white rbn:shadow-md',
            className,
          )}
        >
          <div
            className='rbn:overflow-y-auto rbn:p-1'
            style={{ maxHeight: 384 }}
          >
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
        'rbn:relative rbn:flex rbn:w-full rbn:cursor-default rbn:select-none rbn:items-center',
        'rbn:font-main rbn:text-primary-white rbn:outline-none',
        size === 'compact'
          ? 'rbn:py-0.5 rbn:pl-2 rbn:pr-1 rbn:text-[12px] rbn:leading-[12px] rbn:rounded'
          : size === 'small'
            ? 'rbn:py-1 rbn:pl-3 rbn:pr-1.5 rbn:text-[16px] rbn:leading-[16px] rbn:rounded-sm'
            : 'rbn:py-1.5 rbn:pl-4 rbn:pr-2 rbn:text-[27px] rbn:leading-[27px] rbn:rounded-sm',
        isActive && 'rbn:bg-graph-menu-item-hover-bg',
        disabled && 'rbn:pointer-events-none rbn:opacity-50',
        className,
      )}
      {...getItemProps({
        onClick: disabled ? undefined : () => handleSelect(itemValue),
      })}
    >
      <span className='rbn:truncate'>{children}</span>
      {isSelected && (
        <span className='rbn:ml-auto'>
          <CheckIcon
            className={cn(
              'rbn:ml-1',
              size === 'compact'
                ? 'rbn:h-3 rbn:w-3'
                : size === 'small'
                  ? 'rbn:h-3.5 rbn:w-3.5'
                  : 'rbn:h-5 rbn:w-5',
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
        'rbn:py-1.5 rbn:px-2 rbn:text-[27px] rbn:leading-[27px] rbn:font-main rbn:font-semibold rbn:text-primary-white',
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
    <div
      className={cn(
        'rbn:-mx-1 rbn:my-1 rbn:h-px rbn:bg-secondary-dark-gray',
        className,
      )}
    />
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
        'rbn:relative rbn:flex rbn:w-full rbn:cursor-default rbn:select-none rbn:items-center rbn:rounded-sm rbn:py-1.5 rbn:pl-4 rbn:pr-2',
        'rbn:text-[27px] rbn:leading-[27px] rbn:font-main rbn:text-red-500/60 rbn:hover:bg-graph-menu-item-hover-bg',
        className,
      )}
    >
      <span className='rbn:truncate'>{value}</span>
      <span className='rbn:ml-auto'>
        <XIcon
          className='rbn:h-5 rbn:w-5 rbn:ml-2 rbn:mr-1'
          strokeWidth={2.5}
        />
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
