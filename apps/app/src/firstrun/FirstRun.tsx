/**
 * First run (blueprint §15): DOB → provider consent → a first brief as a guest.
 * No tour and no account until something is worth keeping.
 */
import { useState } from 'react';
import { t } from '@lingui/core/macro';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';

/** The consent text version written to the ledger; bump it when the wording or the provider list changes. */
export const PROVIDER_CONSENT_VERSION = 'providers-2026-11';
/**
 * Named in the consent (Apple 5.1.2(i)). Owner: keep this in step with
 * catalog/routes.yaml; adding a provider means a new version and a new ask.
 */
const AI_PROVIDERS = ['Vercel AI Gateway'];

/** YYYY-MM-DD from three typed parts, or null when they don't make a real past date. */
function dobFrom(day: string, month: string, year: string, today = new Date()): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y) || year.trim().length !== 4 || y < 1900) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (date.getTime() > today.getTime()) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * A neutral date-of-birth screen: no threshold shown, nothing prefilled, no
 * checkbox. Three fields, because a date picker is slow for a birth date.
 */
export function DobStep({ onSubmit }: { onSubmit: (dob: string) => Promise<void> }) {
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const submit = async () => {
    const dob = dobFrom(day, month, year);
    setInvalid(dob === null);
    if (!dob) return;
    setBusy(true);
    setFailed(null);
    try {
      await onSubmit(dob);
    } catch (err) {
      setFailed((err as Error).message);
      setBusy(false);
    }
  };
  const status = invalid ? { type: 'error' as const } : undefined;

  return (
    <form
      className="pa-step"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}>
      <VStack gap={4}>
        <Heading level={1}>{t`When were you born?`}</Heading>
        <Text color="secondary">{t`We ask everyone. PromptAI keeps only the answer to whether you can use it, never the date.`}</Text>
        {failed && <Banner status="error" title={t`Couldn’t check that: ${failed}`} />}
        <fieldset className="pa-dob" aria-describedby={invalid ? 'pa-dob-error' : undefined}>
          <legend className="pa-legend">{t`Date of birth`}</legend>
          <HStack gap={3} wrap="wrap">
            <TextInput label={t`Day`} value={day} onChange={setDay} inputMode="numeric" autoComplete="bday-day" width={72} status={status} />
            <TextInput label={t`Month`} value={month} onChange={setMonth} inputMode="numeric" autoComplete="bday-month" width={72} status={status} />
            <TextInput label={t`Year`} value={year} onChange={setYear} inputMode="numeric" autoComplete="bday-year" width={96} status={status} />
          </HStack>
        </fieldset>
        {invalid && (
          <Text type="supporting" id="pa-dob-error" role="alert">
            {t`Enter a real date, like 14 5 1990.`}
          </Text>
        )}
        <HStack gap={2}>
          <Button label={t`Continue`} variant="primary" type="submit" isLoading={busy} isDisabled={!day || !month || !year} />
        </HStack>
      </VStack>
    </form>
  );
}

export function RefusedStep() {
  return (
    <div className="pa-step">
      <VStack gap={3}>
        <Heading level={1}>{t`PromptAI isn’t available to you`}</Heading>
        <Text color="secondary">{t`PromptAI is for adults 18 and over.`}</Text>
      </VStack>
    </div>
  );
}

/**
 * Provider consent (blueprint §8): equal Yes and No, nothing preselected, and
 * skipping is No. Every answer goes to the consent ledger.
 */
export function ConsentStep({ onAnswer }: { onAnswer: (granted: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const providers = AI_PROVIDERS.join(', ');
  const answer = async (granted: boolean) => {
    setBusy(granted);
    setFailed(false);
    try {
      await onAnswer(granted);
    } catch {
      setFailed(true);
      setBusy(null);
    }
  };
  return (
    <div className="pa-step">
      <VStack gap={4}>
        <Heading level={1}>{t`Draft with AI providers?`}</Heading>
        <Text>{t`To draft a brief, PromptAI sends the words you type or say to ${providers}. They process them transiently to write the draft.`}</Text>
        <Text color="secondary">{t`If you say No, PromptAI drafts without them. Skipping counts as No.`}</Text>
        {failed && <Banner status="error" title={t`Couldn’t save your answer. Try again.`} />}
        {/* biome-ignore lint/a11y/useSemanticElements: a labelled ARIA group keeps the Astryx layout; a fieldset would add a border and legend semantics this choice doesn't need. */}
        <div role="group" aria-label={t`Draft with AI providers?`}>
          <HStack gap={2} wrap="wrap">
            {/* Same variant and size: neither answer is nudged. */}
            <Button label={t`Yes`} variant="secondary" width={120} isLoading={busy === true} isDisabled={busy !== null} onClick={() => void answer(true)} />
            <Button label={t`No`} variant="secondary" width={120} isLoading={busy === false} isDisabled={busy !== null} onClick={() => void answer(false)} />
          </HStack>
        </div>
        <div>
          <Button label={t`Skip`} variant="ghost" size="sm" isDisabled={busy !== null} onClick={() => void answer(false)} />
        </div>
      </VStack>
    </div>
  );
}
