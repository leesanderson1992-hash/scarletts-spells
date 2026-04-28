"use client";

import { updateChildProfile } from "./actions";
import { ChildProfileForm } from "./child-profile-form";

type EditChildFormProps = {
  childId: string;
  initialName: string;
  initialAge: number | null;
  title?: string;
  description?: string;
  submitLabel?: string;
};

export function EditChildForm({
  childId,
  initialName,
  initialAge,
  title = "Edit selected child",
  description = "Update the selected child's name or age without leaving the dashboard.",
  submitLabel = "Save child changes",
}: EditChildFormProps) {
  return (
    <ChildProfileForm
      action={updateChildProfile}
      title={title}
      description={description}
      submitLabel={submitLabel}
      childId={childId}
      initialName={initialName}
      initialAge={initialAge}
    />
  );
}
