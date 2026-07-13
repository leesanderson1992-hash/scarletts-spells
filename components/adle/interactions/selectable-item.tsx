"use client";

import type { KeyboardEvent, ReactNode } from "react";

export function SelectableItem(props: {
  id: string;
  selected?: boolean;
  disabled?: boolean;
  label: string;
  children: ReactNode;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  function activate() {
    if (!props.disabled) {
      props.onSelect?.(props.id);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  }

  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-pressed={props.selected ?? false}
      aria-label={props.label}
      onClick={activate}
      onKeyDown={onKeyDown}
      className={`min-h-11 rounded-2xl text-left outline-none transition focus-visible:ring-4 focus-visible:ring-[rgba(194,24,91,0.22)] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none ${
        props.selected ? "ring-4 ring-[rgba(194,24,91,0.18)]" : ""
      } ${props.className ?? ""}`}
    >
      {props.children}
    </button>
  );
}

export function AssemblySlot(props: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  onPlace?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      aria-label={props.label}
      aria-current={props.active ? "true" : undefined}
      onClick={props.onPlace}
      className={`min-h-16 rounded-2xl border-2 border-dashed px-3 py-2 text-sm font-semibold outline-none transition focus-visible:ring-4 focus-visible:ring-[rgba(194,24,91,0.22)] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none ${
        props.active
          ? "border-[color:var(--scarlett)] bg-[#fff0f7] text-[color:var(--scarlett)]"
          : "border-[var(--border)] bg-white text-[color:var(--mid)]"
      }`}
    >
      {props.children ?? "Place tile"}
    </button>
  );
}

export function ChoiceCard(props: {
  id: string;
  title: string;
  body?: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: (id: string) => void;
}) {
  return (
    <SelectableItem
      id={props.id}
      label={`${props.title}${props.selected ? ", selected" : ""}`}
      selected={props.selected}
      disabled={props.disabled}
      onSelect={props.onSelect}
      className="w-full border border-[var(--border)] bg-white px-4 py-3"
    >
      <span className="block text-sm font-semibold text-[color:var(--text)]">{props.title}</span>
      {props.body ? <span className="mt-1 block text-sm text-[color:var(--mid)]">{props.body}</span> : null}
    </SelectableItem>
  );
}
