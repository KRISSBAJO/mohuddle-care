import type { TextInputProps } from "react-native";
import { DateTimeField } from "./DateTimeField";
import { NoteEditor } from "./NoteEditor";
import { Field } from "./ui";

export function FormInput(props: TextInputProps & { label: string; kind?: "date" | "time" }) {
  const { label, value = "", onChangeText, kind, multiline, maxLength, ...rest } = props;
  const type = kind ?? (/HH:MM/i.test(label) ? "time" : /YYYY-MM-DD|\b(?:first|last) day\b|\bdue date\b/i.test(label) ? "date" : null);
  if (type) return <DateTimeField kind={type} label={label} value={value} onChange={onChangeText ?? (() => {})} />;
  if (multiline) return <NoteEditor label={label} value={value} onChange={onChangeText ?? (() => {})} placeholder={rest.placeholder} maxLength={maxLength} />;
  return <Field label={label} value={value} onChangeText={onChangeText} maxLength={maxLength} {...rest} keyboardType={rest.keyboardType ?? (/number of trips|\bhours\b|\bpounds\b|\binches\b|\bminutes\b/i.test(label) ? "decimal-pad" : "default")} />;
}
