"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type AppDialogSize = "sm" | "md" | "lg";

const DIALOG_SIZE_CLASS: Record<AppDialogSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function isVisibleFocusableElement(element: HTMLElement) {
  if (element.hidden) {
    return false;
  }

  if (element.getAttribute("aria-hidden") === "true") {
    return false;
  }

  return element.getClientRects().length > 0;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(isVisibleFocusableElement);
}

function focusInitialDialogTarget(container: HTMLElement) {
  if (container.contains(document.activeElement)) {
    return;
  }

  const autofocusTarget = container.querySelector<HTMLElement>("[autofocus]");
  if (autofocusTarget && isVisibleFocusableElement(autofocusTarget)) {
    autofocusTarget.focus();
    return;
  }

  const [firstFocusableElement] = getFocusableElements(container);
  if (firstFocusableElement) {
    firstFocusableElement.focus();
    return;
  }

  container.focus();
}

export function AppDialog({
  open,
  onOpenChange,
  title,
  eyebrow,
  description,
  children,
  footer,
  size = "md",
  closeDisabled = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  eyebrow?: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: AppDialogSize;
  closeDisabled?: boolean;
}) {
  const [isMounted, setIsMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusPanel = window.setTimeout(() => {
      if (panelRef.current) {
        focusInitialDialogTarget(panelRef.current);
      }
    }, 0);

    return () => {
      window.clearTimeout(focusPanel);
      previouslyFocusedElementRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      if (event.key === "Escape") {
        if (closeDisabled) {
          return;
        }

        event.preventDefault();
        onOpenChange(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements(panel);
      if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const firstFocusableElement = focusableElements[0];
      const lastFocusableElement =
        focusableElements[focusableElements.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      if (!activeElement || !panel.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastFocusableElement : firstFocusableElement).focus();
        return;
      }

      if (event.shiftKey && activeElement === firstFocusableElement) {
        event.preventDefault();
        lastFocusableElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastFocusableElement) {
        event.preventDefault();
        firstFocusableElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDisabled, onOpenChange, open]);

  if (!isMounted || !open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(56,26,48,0.35)] px-4 py-6 backdrop-blur-[2px]">
      <div
        aria-hidden="true"
        onClick={() => {
          if (!closeDisabled) {
            onOpenChange(false);
          }
        }}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`relative z-[1] w-full ${DIALOG_SIZE_CLASS[size]} rounded-[1.75rem] border border-[var(--border)] bg-white p-5 shadow-[0_24px_80px_rgba(79,38,66,0.18)] focus:outline-none`}
      >
        {eyebrow ? <p className="brand-eyebrow">{eyebrow}</p> : null}
        {title ? (
          <h3
            id={titleId}
            className={`${eyebrow ? "mt-1" : ""} text-lg font-semibold text-[color:var(--ink)]`}
          >
            {title}
          </h3>
        ) : null}
        {description ? (
          <div
            id={descriptionId}
            className={`${title || eyebrow ? "mt-3" : ""} text-sm leading-6 text-[color:var(--mid)]`}
          >
            {description}
          </div>
        ) : null}
        <div className={title || eyebrow || description ? "mt-4" : ""}>{children}</div>
        {footer ? (
          <div className="mt-4 flex flex-wrap justify-end gap-2">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
