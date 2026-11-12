"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, ChevronDown } from "lucide-react";
import { useDropdownPosition } from "./use-dropdown-position";

type ActionItem = {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export function ActionDropdown({
  actions,
  label = "Options",
  triggerText,
  triggerIcon,
  variant = "ghost",
  align = "end",
  width,
  className,
}: {
  actions: ActionItem[];
  label?: string;
  triggerText?: string;
  triggerIcon?: React.ReactNode;
  variant?: "ghost" | "secondary" | "primary";
  align?: "start" | "end";
  width?: number;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const hasDescriptions = actions.some((a) => Boolean(a.description));
  const panelWidth = width ?? (hasDescriptions ? 260 : 200);
  const minSpaceBelow = actions.length * (hasDescriptions ? 56 : 40) + 16;

  const { style, side } = useDropdownPosition(buttonRef, isOpen, {
    align,
    width: panelWidth,
    minSpaceBelow,
  });

  function open() {
    setHighlighted(0);
    setIsOpen(true);
  }

  function close(focusTrigger = true) {
    setIsOpen(false);
    if (focusTrigger) buttonRef.current?.focus();
  }

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => menuRef.current?.focus());

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  function run(action: ActionItem) {
    if (action.disabled) return;
    close();
    action.onClick();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlighted((i) => (i + 1) % actions.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlighted((i) => (i - 1 + actions.length) % actions.length);
        break;
      case "Home":
        event.preventDefault();
        setHighlighted(0);
        break;
      case "End":
        event.preventDefault();
        setHighlighted(actions.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (actions[highlighted]) run(actions[highlighted]);
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

  const menu =
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={`${menuId}-${highlighted}`}
            style={style}
            data-side={side}
            className="dropdown-panel outline-none"
            onKeyDown={handleKeyDown}
          >
            {actions.map((action, index) => (
              <div
                key={index}
                id={`${menuId}-${index}`}
                role="menuitem"
                data-variant={action.danger ? "danger" : undefined}
                data-highlighted={index === highlighted ? "" : undefined}
                className={`dropdown-item ${action.description ? "items-start py-2.5 px-3 text-left" : ""} ${
                  action.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                }`}
                onMouseEnter={() => !action.disabled && setHighlighted(index)}
                onClick={(e) => {
                  e.stopPropagation();
                  run(action);
                }}
              >
                {action.icon && (
                  <div className={`shrink-0 ${action.description ? "mt-0.5" : ""}`}>
                    {action.icon}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground text-xs leading-none">
                    {action.label}
                  </div>
                  {action.description && (
                    <div className="text-[11px] text-muted-foreground mt-1 leading-snug font-normal">
                      {action.description}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>,
          document.body
        )
      : null;

  let buttonClasses = "";
  if (className) {
    buttonClasses = className;
  } else if (variant === "primary") {
    buttonClasses = `inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-all cursor-pointer shadow-sm active:scale-[0.99] ${
      isOpen ? "ring-2 ring-primary/40 ring-offset-1" : ""
    }`;
  } else if (triggerText) {
    buttonClasses = `inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-border/80 bg-muted/40 hover:bg-muted text-foreground transition-all cursor-pointer shadow-xs ${
      isOpen ? "bg-muted border-foreground/30 ring-1 ring-border" : ""
    }`;
  } else {
    buttonClasses = `inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors cursor-pointer hover:bg-accent hover:text-accent-foreground ${
      isOpen ? "bg-accent text-accent-foreground" : ""
    }`;
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) close();
          else open();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            open();
          }
        }}
        className={buttonClasses}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
      >
        {triggerText ? (
          <>
            {triggerIcon && <span className="shrink-0">{triggerIcon}</span>}
            <span>{triggerText}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                variant === "primary" ? "text-primary-foreground/80" : "text-muted-foreground"
              } ${isOpen ? "rotate-180" : ""}`}
            />
          </>
        ) : (
          <MoreVertical className="size-[18px]" strokeWidth={1.5} />
        )}
      </button>
      {menu}
    </>
  );
}
