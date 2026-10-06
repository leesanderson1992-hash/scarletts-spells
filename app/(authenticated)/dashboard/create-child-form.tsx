"use client";

import { createChildProfile } from "./actions";
import { ChildProfileForm } from "./child-profile-form";

type CreateChildFormProps = {
  title?: string;
  description?: string;
  submitLabel?: string;
};

export function CreateChildForm({
  title = "Set up your child profile",
  description = "Add your child's details to start using the dashboard.",
  submitLabel = "Create child profile",
}: CreateChildFormProps) {
  return (
    <ChildProfileForm
      action={createChildProfile}
      title={title}
      description={description}
      submitLabel={submitLabel}
    />
  );
}
