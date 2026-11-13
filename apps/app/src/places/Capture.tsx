import { t } from '@lingui/core/macro';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { PromptAIBridge } from '../bridge.ts';
import { AskForm } from '../DraftSheet.tsx';

const HOLD_KEYS = '⌃⌥Space';

/** Capture: a text box on the web; on the Mac, hold-to-talk from any app. */
export function Capture({ bridge }: { bridge: PromptAIBridge }) {
  return (
    <div className="pa-place">
      <VStack gap={4}>
        <Heading level={1}>{t`Draft a brief`}</Heading>
        {bridge.submit ? (
          <AskForm submit={bridge.submit} dictation={bridge.caps.dictation} />
        ) : (
          <Text color="secondary">{t`Hold ${HOLD_KEYS} in any app and say what you need. Release to draft.`}</Text>
        )}
      </VStack>
    </div>
  );
}
