"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { useDropdownPosition } from "./use-dropdown-position";

type ActionItem = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
};

export function ActionDropdown({ actions, label = "Options" }: { actions: ActionItem[]; label?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const { style, side } = useDropdownPosition(buttonRef, isOpen, { align: "end", width: 192, minSpaceBelow: actions.length * 40 + 16 });

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
                className="dropdown-item"
                onMouseEnter={() => setHighlighted(index)}
                onClick={(e) => {
                  e.stopPropagation();
                  run(action);
                }}
              >
                {action.icon}
                <span className="min-w-0 flex-1 truncate">{action.label}</span>
              </div>
            ))}
          </div>,
          document.body
        )
      : null;

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
        className={`inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors cursor-pointer hover:bg-accent hover:text-accent-foreground ${
          isOpen ? "bg-accent text-accent-foreground" : ""
        }`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
      >
        <MoreVertical className="size-[18px]" strokeWidth={1.5} />
      </button>
      {menu}
    </>
  );
}
