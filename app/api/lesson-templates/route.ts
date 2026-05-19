import { NextResponse } from "next/server";

import { getAuthenticatedParent } from "@/app/courses/action-support";
import {
  getPersonalLessonTemplateDatabaseError,
  mapPersonalLessonTemplateRow,
  normalisePersonalLessonTemplateDescription,
  normalisePersonalLessonTemplateTitle,
  parsePersonalLessonTemplateLesson,
} from "@/lib/lessons/templates";

function buildUnauthorizedResponse() {
  return NextResponse.json({ error: "You need to sign in first." }, { status: 401 });
}

export async function GET() {
  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    return buildUnauthorizedResponse();
  }

  const { data, error } = await supabase
    .from("personal_lesson_templates")
    .select("id, title, description, lesson_schema, created_at, updated_at")
    .eq("parent_user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: getPersonalLessonTemplateDatabaseError(error.message) },
      { status: 500 },
    );
  }

  return NextResponse.json({
    templates: (data ?? [])
      .map((row) => mapPersonalLessonTemplateRow(row))
      .filter((row): row is NonNullable<typeof row> => row !== null),
  });
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    return buildUnauthorizedResponse();
  }

  const payload = (await request.json()) as {
    title?: unknown;
    description?: unknown;
    lesson?: unknown;
  };

  const title = normalisePersonalLessonTemplateTitle(payload.title);
  const description = normalisePersonalLessonTemplateDescription(payload.description);
  const lesson = parsePersonalLessonTemplateLesson(payload.lesson);

  if (!title) {
    return NextResponse.json({ error: "Please enter a template name." }, { status: 400 });
  }

  if (!lesson) {
    return NextResponse.json(
      { error: "The structured lesson template is not valid yet." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("personal_lesson_templates")
    .insert({
      parent_user_id: user.id,
      title,
      description,
      lesson_schema: lesson,
    })
    .select("id, title, description, lesson_schema, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: getPersonalLessonTemplateDatabaseError(error.message) },
      { status: 500 },
    );
  }

  const template = data ? mapPersonalLessonTemplateRow(data) : null;

  if (!template) {
    return NextResponse.json(
      { error: "The lesson template was saved but could not be read back cleanly." },
      { status: 500 },
    );
  }

  return NextResponse.json({ template });
}

export async function PATCH(request: Request) {
  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    return buildUnauthorizedResponse();
  }

  const payload = (await request.json()) as {
    templateId?: unknown;
    title?: unknown;
    description?: unknown;
    lesson?: unknown;
  };

  const templateId =
    typeof payload.templateId === "string" && payload.templateId.trim()
      ? payload.templateId.trim()
      : null;

  if (!templateId) {
    return NextResponse.json({ error: "Choose a template first." }, { status: 400 });
  }

  const nextTitle = normalisePersonalLessonTemplateTitle(payload.title);
  const nextDescription = normalisePersonalLessonTemplateDescription(payload.description);
  const nextLesson = parsePersonalLessonTemplateLesson(payload.lesson);

  if (!nextTitle) {
    return NextResponse.json({ error: "Please enter a template name." }, { status: 400 });
  }

  if (!nextLesson) {
    return NextResponse.json(
      { error: "The structured lesson template is not valid yet." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("personal_lesson_templates")
    .update({
      title: nextTitle,
      description: nextDescription,
      lesson_schema: nextLesson,
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId)
    .eq("parent_user_id", user.id)
    .select("id, title, description, lesson_schema, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: getPersonalLessonTemplateDatabaseError(error.message) },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: "We couldn't find that personal template." }, { status: 404 });
  }

  const template = mapPersonalLessonTemplateRow(data);

  if (!template) {
    return NextResponse.json(
      { error: "The updated lesson template could not be read back cleanly." },
      { status: 500 },
    );
  }

  return NextResponse.json({ template });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await getAuthenticatedParent();

  if (!user) {
    return buildUnauthorizedResponse();
  }

  const payload = (await request.json()) as {
    templateId?: unknown;
  };

  const templateId =
    typeof payload.templateId === "string" && payload.templateId.trim()
      ? payload.templateId.trim()
      : null;

  if (!templateId) {
    return NextResponse.json({ error: "Choose a template first." }, { status: 400 });
  }

  const { error, count } = await supabase
    .from("personal_lesson_templates")
    .delete({ count: "exact" })
    .eq("id", templateId)
    .eq("parent_user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: getPersonalLessonTemplateDatabaseError(error.message) },
      { status: 500 },
    );
  }

  if (!count) {
    return NextResponse.json({ error: "We couldn't find that personal template." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
