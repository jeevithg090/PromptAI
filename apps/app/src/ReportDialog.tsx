import { useContext, useState } from 'react';
import { t } from '@lingui/core/macro';
import { reportReasonSchema } from '@promptai/contract';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { useStatusAnnouncer } from './announce.ts';
import { AppServicesContext } from './shell/services.ts';

type Reason = (typeof reportReasonSchema.options)[number];

const REASONS = (): Record<Reason, string> => ({
  wrong_or_harmful: t`It’s wrong or harmful`,
  illegal: t`It’s illegal`,
  child_safety: t`It puts a child at risk`,
  harassment: t`Harassment or hate`,
  sexual: t`Sexual content`,
  privacy: t`It exposes someone’s private information`,
  copyright: t`It copies someone else’s work`,
  spam: t`Spam`,
  other: t`Something else`,
});

/** "Report this output" (blueprint §13, Apple 1.2): a reason, an optional short note, sent with the draft's decisionId. */
export function ReportDialog({ decisionId, onClose }: { decisionId: string; onClose: () => void }) {
  const services = useContext(AppServicesContext);
  const announce = useStatusAnnouncer();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<'form' | 'sending' | 'sent' | 'failed'>('form');
  const labels = REASONS();

  const send = async () => {
    if (!services || !reason) return;
    setPhase('sending');
    try {
      await services.api.report({ decisionId, reason: reason as Reason, ...(note.trim() ? { note: note.trim().slice(0, 500) } : {}) });
      setPhase('sent');
      announce(t`Report sent`);
    } catch {
      setPhase('failed');
    }
  };

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} purpose="form" width={480}>
      <Layout
        header={<DialogHeader title={t`Report this output`} subtitle={t`We review every report.`} onOpenChange={(open) => !open && onClose()} />}
        content={
          <LayoutContent>
            {phase === 'sent' ? (
              <Text>{t`Thanks. Your report reached us.`}</Text>
            ) : (
              <VStack gap={4}>
                {phase === 'failed' && <Banner status="error" title={t`Couldn’t send the report. Try again.`} />}
                <RadioList label={t`What’s wrong with it?`} value={reason} onChange={setReason} isRequired>
                  {reportReasonSchema.options.map((r) => (
                    <RadioListItem key={r} value={r} label={labels[r]} />
                  ))}
                </RadioList>
                <TextArea label={t`Anything else we should know?`} isOptional value={note} onChange={setNote} rows={3} maxLength={500} dir="auto" />
                <Text type="supporting">{t`The report carries this draft’s id and what you write here, nothing else.`}</Text>
              </VStack>
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              {phase === 'sent' ? (
                <Button label={t`Close`} variant="primary" onClick={onClose} />
              ) : (
                <>
                  <Button label={t`Cancel`} variant="secondary" onClick={onClose} />
                  <Button label={t`Send report`} variant="primary" isDisabled={!reason} isLoading={phase === 'sending'} onClick={() => void send()} />
                </>
              )}
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
