"use client";

import type { ReactNode } from "react";

import type { StructuredLessonBlock } from "@/lib/lessons/schema";

function PreviewCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[1.5rem] border border-[var(--border)] bg-white px-4 py-4 ${className}`}>
      {children}
    </div>
  );
}

export function StructuredLessonBuilderPreview({
  blocks,
}: {
  blocks: StructuredLessonBlock[];
}) {
  return (
    <div className="rounded-[2rem] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(252,228,244,0.18),rgba(255,255,255,0.96))] px-5 py-5 shadow-[0_14px_40px_rgba(79,38,66,0.06)]">
      <p className="brand-eyebrow">Preview</p>
      <div className="mt-4 grid gap-5">
        {blocks.map((block) => {
          if (block.block_type === "heading") {
            return (
              <div key={block.block_id} className="text-center">
                {block.eyebrow ? <p className="brand-eyebrow">{block.eyebrow}</p> : null}
                <h2 className="brand-lesson-title mt-1 text-[clamp(1.8rem,4vw,2.8rem)] font-semibold tracking-tight">
                  {block.heading}
                </h2>
              </div>
            );
          }

          if (block.block_type === "section_intro") {
            return (
              <div key={block.block_id} className="grid justify-items-center gap-2 text-center">
                {block.eyebrow ? <p className="brand-eyebrow">{block.eyebrow}</p> : null}
                <h3 className="brand-lesson-title text-[clamp(1.4rem,3vw,2rem)] font-semibold">
                  {block.title}
                </h3>
                {block.body ? (
                  <p className="mx-auto max-w-3xl text-sm leading-7 text-[color:var(--mid)]">
                    {block.body}
                  </p>
                ) : null}
              </div>
            );
          }

          if (block.block_type === "rich_text") {
            return (
              <div
                key={block.block_id}
                className="prose prose-sm max-w-none text-[color:var(--ink)]"
                dangerouslySetInnerHTML={{ __html: block.content }}
              />
            );
          }

          if (block.block_type === "callout") {
            return (
              <div
                key={block.block_id}
                className="rounded-[1.5rem] border border-[rgba(206,71,125,0.24)] bg-[rgba(252,228,244,0.3)] px-4 py-4"
              >
                {block.title ? <p className="text-sm font-semibold">{block.title}</p> : null}
                <div
                  className="mt-2 text-sm leading-6"
                  dangerouslySetInnerHTML={{ __html: block.content }}
                />
              </div>
            );
          }

          if (block.block_type === "action_link") {
            return (
              <div key={block.block_id} className="flex justify-center">
                <div
                  className={
                    block.style === "secondary"
                      ? "inline-flex min-h-11 items-center rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--mid)]"
                      : "inline-flex min-h-11 items-center rounded-full bg-[linear-gradient(135deg,var(--scarlett),#d53d81)] px-4 py-2 text-sm font-medium text-white"
                  }
                >
                  ↗ {block.label}
                </div>
              </div>
            );
          }

          if (block.block_type === "info_cards") {
            const gridClass =
              block.cards.length === 4
                ? "md:grid-cols-2"
                : block.cards.length >= 3
                  ? "md:grid-cols-3"
                  : "md:grid-cols-2";

            return (
              <div
                key={block.block_id}
                className="overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-white"
              >
                <div className="border-b border-[var(--border)] bg-[rgba(252,228,244,0.18)] px-5 py-4 text-center">
                  {block.title ? (
                    <h3 className="brand-lesson-title text-xl font-semibold">{block.title}</h3>
                  ) : null}
                  {block.body ? (
                    <p className="mx-auto mt-2 max-w-3xl text-sm leading-7 text-[color:var(--mid)]">
                      {block.body}
                    </p>
                  ) : null}
                </div>
                <div className={`grid gap-4 p-5 ${gridClass}`}>
                  {block.cards.map((card) => (
                    <div
                      key={card.card_id}
                      className="rounded-[1.5rem] border border-[rgba(206,71,125,0.24)] bg-[rgba(252,228,244,0.18)] px-4 py-4"
                    >
                      <div className="flex items-start gap-3">
                        {card.icon ? (
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-lg">
                            {card.icon}
                          </div>
                        ) : null}
                        <div className="grid gap-2">
                          <h4 className="text-lg font-semibold text-[var(--scarlett)]">
                            {card.title}
                          </h4>
                          <p className="text-sm leading-7 text-[color:var(--ink)]">{card.body}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          if (block.block_type === "question_text" || block.block_type === "question_textarea") {
            return (
              <PreviewCard key={block.block_id}>
                <p className="text-sm font-semibold text-[color:var(--ink)]">{block.label}</p>
                {block.block_type === "question_text" ? (
                  <div className="brand-input mt-3 flex h-11 items-center rounded-2xl px-4 text-sm text-[color:var(--mid)]">
                    {block.placeholder ?? "Answer here"}
                  </div>
                ) : (
                  <div className="brand-input mt-3 min-h-28 rounded-2xl px-4 py-3 text-sm text-[color:var(--mid)]">
                    {block.placeholder ?? "Write here"}
                  </div>
                )}
              </PreviewCard>
            );
          }

          if (block.block_type === "question_choice_single" || block.block_type === "question_choice_multi") {
            return (
              <PreviewCard key={block.block_id}>
                <p className="text-sm font-semibold text-[color:var(--ink)]">{block.label}</p>
                <div className="mt-3 grid gap-2">
                  {block.options.map((option) => (
                    <div
                      key={option.value}
                      className="rounded-2xl border border-[var(--border)] px-3 py-2 text-sm text-[color:var(--ink)]"
                    >
                      {option.label}
                    </div>
                  ))}
                </div>
              </PreviewCard>
            );
          }

          if (block.block_type === "comprehension_quiz_group") {
            return (
              <div key={block.block_id} className="grid gap-3">
                <PreviewCard>
                  <p className="text-sm font-semibold text-[color:var(--ink)]">{block.label}</p>
                  {block.help_text ? (
                    <p className="mt-1 text-sm text-[color:var(--mid)]">{block.help_text}</p>
                  ) : null}
                </PreviewCard>
                {block.questions.map((question, questionIndex) => (
                  <PreviewCard key={question.question_id}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
                      Question {questionIndex + 1}
                    </p>
                    <p className="mt-2 text-base font-semibold text-[color:var(--ink)]">
                      {question.prompt}
                    </p>
                    <div className="mt-3 grid gap-2">
                      {question.options.map((option) => (
                        <div
                          key={option.option_id}
                          className="rounded-2xl border border-[var(--border)] px-3 py-2 text-sm text-[color:var(--ink)]"
                        >
                          {option.label}
                        </div>
                      ))}
                    </div>
                  </PreviewCard>
                ))}
              </div>
            );
          }

          if (block.block_type === "divider") {
            return <div key={block.block_id} className="h-px w-full bg-[var(--border)]" />;
          }

          if (block.block_type === "titled_divider") {
            return (
              <div key={block.block_id} className="flex items-center gap-4 py-2">
                <div className="h-px flex-1 bg-[var(--border)]" />
                <div className="rounded-full bg-[linear-gradient(135deg,var(--scarlett),#d53d81)] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                  {block.title}
                </div>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>
            );
          }

          return (
            <div
              key={block.block_id}
              className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-3 text-sm text-[color:var(--mid)]"
            >
              This block type is editable but not previewed yet.
            </div>
          );
        })}
      </div>
    </div>
  );
}
