"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { useDropdownPosition } from "./use-dropdown-position";

interface Option {
  label: string;
  value: string;
}

interface SearchableSelectProps {
  name?: string;
  options: Option[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Show the search row. Defaults to true when there are more than 6 options. */
  searchable?: boolean;
  size?: "default" | "sm";
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/** Design-system select: used for every dropdown field in the app. */
export function SearchableSelect({
  name,
  options,
  value,
  defaultValue,
  onChange,
  placeholder = "Select an option",
  required = false,
  disabled = false,
  searchable,
  size = "default",
  id,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [internalValue, setInternalValue] = useState(defaultValue || "");
  const currentValue = value !== undefined ? value : internalValue;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const showSearch = searchable ?? options.length > 6;
  const { style, side } = useDropdownPosition(triggerRef, isOpen);

  const filteredOptions = useMemo(
    () => options.filter((opt) => opt.label.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  );
  const selectedOption = options.find((opt) => opt.value === currentValue);

  function open() {
    if (disabled) return;
    const selectedIndex = options.findIndex((opt) => opt.value === currentValue);
    setHighlighted(Math.max(0, selectedIndex));
    setIsOpen(true);
  }

  function close(focusTrigger = true) {
    setIsOpen(false);
    setSearch("");
    if (focusTrigger) triggerRef.current?.focus();
  }

  function select(val: string) {
    setInternalValue(val);
    onChange?.(val);
    close();
  }

  // Focus the search field (or the list) when the panel opens
  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => (showSearch ? searchRef.current : listRef.current)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen, showSearch]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Keep the highlighted option in view
  useEffect(() => {
    if (!isOpen) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlighted, isOpen]);

  function handleListKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlighted((i) => Math.min(i + 1, filteredOptions.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlighted((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        if (!showSearch) {
          event.preventDefault();
          setHighlighted(0);
        }
        break;
      case "End":
        if (!showSearch) {
          event.preventDefault();
          setHighlighted(filteredOptions.length - 1);
        }
        break;
      case "Enter":
        event.preventDefault();
        if (filteredOptions[highlighted]) select(filteredOptions[highlighted].value);
        break;
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      open();
    }
  }

  const activeId = filteredOptions[highlighted] ? `${listboxId}-${highlighted}` : undefined;

  const panel =
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <div ref={panelRef} style={style} data-side={side} className="dropdown-panel">
            {showSearch && (
              <div className="dropdown-search">
                <Search className="size-4 shrink-0" strokeWidth={1.5} />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setHighlighted(0);
                  }}
                  onKeyDown={handleListKeyDown}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listboxId}
                  aria-activedescendant={activeId}
                  aria-autocomplete="list"
                  aria-label="Search options"
                />
              </div>
            )}
            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              tabIndex={showSearch ? -1 : 0}
              aria-labelledby={ariaLabelledBy}
              aria-label={ariaLabelledBy ? undefined : ariaLabel ?? placeholder}
              aria-activedescendant={showSearch ? undefined : activeId}
              onKeyDown={showSearch ? undefined : handleListKeyDown}
              className="dropdown-list"
            >
              {filteredOptions.length === 0 ? (
                <div className="dropdown-empty">No results found</div>
              ) : (
                filteredOptions.map((opt, index) => {
                  const isSelected = opt.value === currentValue;
                  return (
                    <div
                      key={opt.value}
                      id={`${listboxId}-${index}`}
                      data-index={index}
                      role="option"
                      aria-selected={isSelected}
                      data-highlighted={index === highlighted ? "" : undefined}
                      className="dropdown-item"
                      onMouseEnter={() => setHighlighted(index)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => select(opt.value)}
                    >
                      <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                      {isSelected && <Check className="dropdown-check" strokeWidth={2} />}
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={`relative w-full ${className ?? ""}`}>
      {name && <input type="hidden" name={name} value={currentValue} required={required} />}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        data-size={size}
        data-placeholder={selectedOption ? undefined : ""}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className="dropdown-trigger"
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="dropdown-value">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className="dropdown-chevron" strokeWidth={1.5} />
      </button>
      {panel}
    </div>
  );
}
