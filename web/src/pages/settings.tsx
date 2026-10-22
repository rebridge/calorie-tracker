import { SettingsSchema, type SettingsResponse } from "@calorie-tracker/shared";
import { LoaderCircle } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";

const FIELDS = [
  { key: "calorie_goal", label: "Calories", unit: "kcal" },
  { key: "protein_goal_g", label: "Protein", unit: "g" },
  { key: "carbs_goal_g", label: "Carbs", unit: "g" },
  { key: "fat_goal_g", label: "Fat", unit: "g" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type Draft = Record<FieldKey, string>;

/** Empty text becomes NaN (Number("") would be 0); both fail the shared schema with its message. */
const toNumber = (s: string) => (s.trim() === "" ? NaN : Number(s));

const toGoals = (draft: Draft) => Object.fromEntries(FIELDS.map(({ key }) => [key, toNumber(draft[key])]));

/** Per-field messages from the same schema the server uses; empty when everything is valid. */
function validate(draft: Draft): Partial<Record<FieldKey, string>> {
  const result = SettingsSchema.safeParse(toGoals(draft));
  if (result.success) return {};
  const errors: Partial<Record<FieldKey, string>> = {};
  for (const issue of result.error.issues) errors[issue.path[0] as FieldKey] ??= issue.message;
  return errors;
}

function GoalsForm({ settings }: { settings: SettingsResponse }) {
  const id = useId();
  const update = useUpdateSettings();
  const [draft, setDraft] = useState<Draft>(() => ({
    calorie_goal: String(settings.calorie_goal),
    protein_goal_g: String(settings.protein_goal_g),
    carbs_goal_g: String(settings.carbs_goal_g),
    fat_goal_g: String(settings.fat_goal_g),
  }));
  // Errors only appear after a save attempt, then track edits so they clear as soon as fixed.
  const [submitted, setSubmitted] = useState(false);
  const errors = submitted ? validate(draft) : {};

  function save() {
    setSubmitted(true);
    const parsed = SettingsSchema.safeParse(toGoals(draft));
    if (!parsed.success || update.isPending) return;
    update.mutate(parsed.data, {
      onSuccess: () => toast.success("Goals saved"),
      onError: (err) => toast.error(`Couldn't save goals: ${err.message}`),
    });
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h2 className="text-sm font-medium text-muted-foreground">Daily goals</h2>
      {FIELDS.map(({ key, label, unit }) => (
        <div key={key} className="space-y-1.5">
          <label htmlFor={`${id}-${key}`} className="text-sm font-medium">
            {label} <span className="font-normal text-muted-foreground">({unit})</span>
          </label>
          <Input
            id={`${id}-${key}`}
            inputMode="numeric"
            autoComplete="off"
            value={draft[key]}
            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
            aria-invalid={errors[key] ? true : undefined}
            aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
            className="h-11"
          />
          {errors[key] && (
            <p id={`${id}-${key}-error`} role="alert" className="text-sm text-destructive">
              {errors[key]}
            </p>
          )}
        </div>
      ))}
      <Button type="submit" className="h-11 w-full" disabled={update.isPending}>
        {update.isPending && <LoaderCircle className="size-4 animate-spin" />}
        Save
      </Button>
    </form>
  );
}

export function SettingsPage() {
  const { data, isPending, isError, refetch, isFetching } = useSettings();

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading settings">
        {FIELDS.map(({ key }) => (
          <Skeleton key={key} className="h-16" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div role="alert" className="space-y-3 py-12 text-center">
        <p className="text-destructive">Couldn't load settings. Check your connection and try again.</p>
        <Button variant="outline" className="h-11" onClick={() => refetch()} disabled={isFetching}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <GoalsForm settings={data} />
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">About</h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Model</dt>
            <dd className="font-mono">{data.model}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Database</dt>
            <dd className="font-mono break-all">{data.database_path}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tokens used</dt>
            <dd className="font-mono tabular-nums">
              {(data.token_usage.input_tokens + data.token_usage.output_tokens).toLocaleString()}
              <span className="font-sans text-muted-foreground">
                {" "}
                ({data.token_usage.input_tokens.toLocaleString()} in · {data.token_usage.output_tokens.toLocaleString()} out)
              </span>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
