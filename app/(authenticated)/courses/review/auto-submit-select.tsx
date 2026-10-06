"use client";

type AutoSubmitSelectOption = {
  label: string;
  value: string;
};

type AutoSubmitSelectProps = {
  className?: string;
  defaultValue?: string;
  name: string;
  options: AutoSubmitSelectOption[];
  placeholder: string;
};

export function AutoSubmitSelect({
  className,
  defaultValue = "",
  name,
  options,
  placeholder,
}: AutoSubmitSelectProps) {
  return (
    <select
      className={className}
      defaultValue={defaultValue}
      name={name}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      required
    >
      <option disabled value="">
        {placeholder}
      </option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
