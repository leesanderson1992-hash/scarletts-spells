"use client";

import type { ReactNode } from "react";

import type {
  LessonActionLinkBlock,
  LessonInfoCardsBlock,
  LessonSectionIntroBlock,
  StructuredLessonBlock,
} from "@/lib/lessons/schema";
import {
  BLOCK_OPTIONS,
  type StructuredLessonBuilderState,
} from "@/components/structured-lesson-builder-state";

function BlockCard({
  block,
  index,
  blockCount,
  onMove,
  onDuplicate,
  onRemove,
  children,
}: {
  block: StructuredLessonBlock;
  index: number;
  blockCount: number;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[1.75rem] border border-[var(--border)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="brand-eyebrow">Block {index + 1}</p>
          <h4 className="mt-1 text-base font-semibold text-[color:var(--ink)]">
            {BLOCK_OPTIONS.find((option) => option.type === block.block_type)?.label ?? block.block_type}
          </h4>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--mid)] disabled:cursor-not-allowed disabled:opacity-35"
          >
            Up
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === blockCount - 1}
            className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--mid)] disabled:cursor-not-allowed disabled:opacity-35"
          >
            Down
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--mid)]"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--mid)]">
        {label}
      </span>
      {children}
    </label>
  );
}

export function StructuredLessonBuilderEditorList({
  builder,
}: {
  builder: StructuredLessonBuilderState;
}) {
  return (
    <div className="grid gap-4">
      {builder.blocks.map((block, index) => (
        <BlockCard
          key={block.block_id}
          block={block}
          index={index}
          blockCount={builder.blocks.length}
          onMove={(direction) => builder.moveBlock(block.block_id, direction)}
          onDuplicate={() => builder.duplicateBlock(block.block_id)}
          onRemove={() => builder.removeBlock(block.block_id)}
        >
          {block.block_type === "heading" ? (
            <>
              <Field label="Eyebrow">
                <input
                  type="text"
                  value={block.eyebrow ?? ""}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...item,
                      eyebrow: event.target.value,
                    }))
                  }
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                />
              </Field>
              <Field label="Heading">
                <input
                  type="text"
                  value={block.heading}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...item,
                      heading: event.target.value,
                    }))
                  }
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                />
              </Field>
            </>
          ) : null}

          {block.block_type === "section_intro" ? (
            <>
              <Field label="Eyebrow">
                <input
                  type="text"
                  value={block.eyebrow ?? ""}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...(item as LessonSectionIntroBlock),
                      eyebrow: event.target.value,
                    }))
                  }
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                />
              </Field>
              <Field label="Title">
                <input
                  type="text"
                  value={block.title}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...(item as LessonSectionIntroBlock),
                      title: event.target.value,
                    }))
                  }
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                />
              </Field>
              <Field label="Section intro">
                <textarea
                  value={block.body ?? ""}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...(item as LessonSectionIntroBlock),
                      body: event.target.value,
                    }))
                  }
                  rows={4}
                  className="brand-input rounded-2xl px-4 py-3 text-sm"
                />
              </Field>
            </>
          ) : null}

          {block.block_type === "rich_text" ? (
            <Field label="Intro text">
              <textarea
                value={block.content}
                onChange={(event) =>
                  builder.updateBlock(block.block_id, (item) => ({
                    ...item,
                    content: event.target.value,
                  }))
                }
                rows={5}
                className="brand-input rounded-2xl px-4 py-3 text-sm"
              />
            </Field>
          ) : null}

          {block.block_type === "callout" ? (
            <>
              <Field label="Callout title">
                <input
                  type="text"
                  value={block.title ?? ""}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...item,
                      title: event.target.value,
                    }))
                  }
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                />
              </Field>
              <Field label="Callout text">
                <textarea
                  value={block.content}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...item,
                      content: event.target.value,
                    }))
                  }
                  rows={4}
                  className="brand-input rounded-2xl px-4 py-3 text-sm"
                />
              </Field>
            </>
          ) : null}

          {block.block_type === "action_link" ? (
            <>
              <Field label="Button label">
                <input
                  type="text"
                  value={block.label}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...(item as LessonActionLinkBlock),
                      label: event.target.value,
                    }))
                  }
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                />
              </Field>
              <Field label="Link URL">
                <input
                  type="url"
                  value={block.url}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...(item as LessonActionLinkBlock),
                      url: event.target.value,
                    }))
                  }
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                />
              </Field>
              <Field label="Button style">
                <select
                  value={block.style ?? "primary"}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...(item as LessonActionLinkBlock),
                      style: event.target.value as LessonActionLinkBlock["style"],
                    }))
                  }
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                >
                  <option value="primary">Primary</option>
                  <option value="secondary">Secondary</option>
                </select>
              </Field>
            </>
          ) : null}

          {block.block_type === "info_cards" ? (
            <>
              <Field label="Block title">
                <input
                  type="text"
                  value={block.title ?? ""}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...(item as LessonInfoCardsBlock),
                      title: event.target.value,
                    }))
                  }
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                />
              </Field>
              <Field label="Intro copy">
                <textarea
                  value={block.body ?? ""}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...(item as LessonInfoCardsBlock),
                      body: event.target.value,
                    }))
                  }
                  rows={3}
                  className="brand-input rounded-2xl px-4 py-3 text-sm"
                />
              </Field>
              <div className="grid gap-3">
                {block.cards.map((card, cardIndex) => (
                  <div
                    key={card.card_id}
                    className="rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.14)] px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[color:var(--ink)]">
                        Card {cardIndex + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => builder.removeInfoCard(block.block_id, card.card_id)}
                        className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <input
                        type="text"
                        value={card.icon ?? ""}
                        placeholder="Optional icon, e.g. 🎧"
                        onChange={(event) =>
                          builder.updateInfoCard(block.block_id, card.card_id, {
                            icon: event.target.value,
                          })
                        }
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                      />
                      <input
                        type="text"
                        value={card.title}
                        onChange={(event) =>
                          builder.updateInfoCard(block.block_id, card.card_id, {
                            title: event.target.value,
                          })
                        }
                        className="brand-input h-11 rounded-2xl px-4 text-sm"
                      />
                      <textarea
                        value={card.body}
                        onChange={(event) =>
                          builder.updateInfoCard(block.block_id, card.card_id, {
                            body: event.target.value,
                          })
                        }
                        rows={3}
                        className="brand-input rounded-2xl px-4 py-3 text-sm"
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => builder.addInfoCard(block.block_id)}
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[color:var(--ink)]"
                >
                  + Add information card
                </button>
              </div>
            </>
          ) : null}

          {block.block_type === "question_text" || block.block_type === "question_textarea" ? (
            <>
              <Field label="Question label">
                <input
                  type="text"
                  value={block.label ?? ""}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...item,
                      label: event.target.value,
                    }))
                  }
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                />
              </Field>
              <Field label="Placeholder">
                <input
                  type="text"
                  value={block.placeholder ?? ""}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...item,
                      placeholder: event.target.value,
                    }))
                  }
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                />
              </Field>
            </>
          ) : null}

          {block.block_type === "question_choice_single" || block.block_type === "question_choice_multi" ? (
            <>
              <Field label="Question label">
                <input
                  type="text"
                  value={block.label ?? ""}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...item,
                      label: event.target.value,
                    }))
                  }
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                />
              </Field>
              <div className="grid gap-2">
                {block.options.map((option) => (
                  <div key={option.value} className="flex gap-2">
                    <input
                      type="text"
                      value={option.label}
                      onChange={(event) =>
                        builder.updateChoiceOptionLabel(
                          block.block_id,
                          option.value,
                          event.target.value,
                        )
                      }
                      className="brand-input h-11 flex-1 rounded-2xl px-4 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => builder.removeChoiceOption(block.block_id, option.value)}
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 text-xs font-medium text-rose-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => builder.addChoiceOption(block.block_id)}
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[color:var(--ink)]"
                >
                  + Add option
                </button>
              </div>
            </>
          ) : null}

          {block.block_type === "comprehension_quiz_group" ? (
            <>
              <Field label="Quiz title">
                <input
                  type="text"
                  value={block.label ?? ""}
                  onChange={(event) =>
                    builder.updateBlock(block.block_id, (item) => ({
                      ...item,
                      label: event.target.value,
                    }))
                  }
                  className="brand-input h-11 rounded-2xl px-4 text-sm"
                />
              </Field>
              <div className="grid gap-4">
                {block.questions.map((question, questionIndex) => (
                  <div
                    key={question.question_id}
                    className="rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.14)] px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[color:var(--ink)]">
                        Question {questionIndex + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => builder.removeQuizQuestion(block.block_id, question.question_id)}
                        className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700"
                      >
                        Remove
                      </button>
                    </div>
                    <Field label="Prompt">
                      <textarea
                        value={question.prompt}
                        onChange={(event) =>
                          builder.updateQuizQuestion(block.block_id, question.question_id, {
                            prompt: event.target.value,
                          })
                        }
                        rows={3}
                        className="brand-input rounded-2xl px-4 py-3 text-sm"
                      />
                    </Field>
                    <div className="mt-3 grid gap-2">
                      {question.options.map((option) => (
                        <div key={option.option_id} className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={question.correct_option_id === option.option_id}
                            onChange={() =>
                              builder.setQuizCorrectOption(
                                block.block_id,
                                question.question_id,
                                option.option_id,
                              )
                            }
                            className="h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
                          />
                          <input
                            type="text"
                            value={option.label}
                            onChange={(event) =>
                              builder.updateQuizOptionLabel(
                                block.block_id,
                                question.question_id,
                                option.option_id,
                                event.target.value,
                              )
                            }
                            className="brand-input h-11 flex-1 rounded-2xl px-4 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                    <Field label="Explanation">
                      <textarea
                        value={question.explanation ?? ""}
                        onChange={(event) =>
                          builder.updateQuizQuestion(block.block_id, question.question_id, {
                            explanation: event.target.value,
                          })
                        }
                        rows={2}
                        className="brand-input rounded-2xl px-4 py-3 text-sm"
                      />
                    </Field>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => builder.addQuizQuestion(block.block_id)}
                  className="rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[color:var(--ink)]"
                >
                  + Add quiz question
                </button>
              </div>
            </>
          ) : null}

          {block.block_type === "titled_divider" ? (
            <Field label="Divider title">
              <input
                type="text"
                value={block.title}
                onChange={(event) =>
                  builder.updateBlock(block.block_id, (item) => ({
                    ...item,
                    title: event.target.value,
                  }))
                }
                className="brand-input h-11 rounded-2xl px-4 text-sm"
              />
            </Field>
          ) : null}
        </BlockCard>
      ))}
    </div>
  );
}
