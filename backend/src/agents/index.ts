import { IntentClassificationAgent as IntentClassificationAgentClass } from './IntentClassificationAgent';
import { DocRetrievalAgent as DocRetrievalAgentClass } from './DocRetrievalAgent';
import { ClarifyingQuestionAgent as ClarifyingQuestionAgentClass } from './ClarifyingQuestionAgent';
import { DraftingAgent as DraftingAgentClass } from './DraftingAgent';
import { CriticAgent as CriticAgentClass } from './CriticAgent';
import { MemoryExtractionAgent as MemoryExtractionAgentClass } from './MemoryExtractionAgent';

export * from './placeholders';

/** Real agents replace placeholders one by one (T2.5–T2.11); the registry in routes.ts never changes shape. */
export { IntentClassificationAgentClass, DocRetrievalAgentClass, ClarifyingQuestionAgentClass, DraftingAgentClass, CriticAgentClass, MemoryExtractionAgentClass };
export const IntentClassificationAgent = new IntentClassificationAgentClass();
export const DocRetrievalAgent = new DocRetrievalAgentClass();
export const ClarifyingQuestionAgent = new ClarifyingQuestionAgentClass();
export const DraftingAgent = new DraftingAgentClass();
export const CriticAgent = new CriticAgentClass();
export const MemoryExtractionAgent = new MemoryExtractionAgentClass();
