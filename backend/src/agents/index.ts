import { ModelRefreshAgent as ModelRefreshAgentClass } from './ModelRefreshAgent';
import { IntentClassificationAgent as IntentClassificationAgentClass } from './IntentClassificationAgent';
import { DocRetrievalAgent as DocRetrievalAgentClass } from './DocRetrievalAgent';
import { ClarifyingQuestionAgent as ClarifyingQuestionAgentClass } from './ClarifyingQuestionAgent';
import { DraftingAgent as DraftingAgentClass } from './DraftingAgent';
import { CriticAgent as CriticAgentClass } from './CriticAgent';
import { AlternativesAgent as AlternativesAgentClass } from './AlternativesAgent';
import { MemoryExtractionAgent as MemoryExtractionAgentClass } from './MemoryExtractionAgent';
import { CurationAgent as CurationAgentClass } from './CurationAgent';
import { PromptImportAgent as PromptImportAgentClass } from './PromptImportAgent';

export * from './placeholders';

/** Real agents replace placeholders one by one (T2.5–T2.11); the registry in routes.ts never changes shape. */
export { IntentClassificationAgentClass, DocRetrievalAgentClass, ClarifyingQuestionAgentClass, DraftingAgentClass, CriticAgentClass, AlternativesAgentClass, MemoryExtractionAgentClass, CurationAgentClass, PromptImportAgentClass };
export const IntentClassificationAgent = new IntentClassificationAgentClass();
export const DocRetrievalAgent = new DocRetrievalAgentClass();
export const ClarifyingQuestionAgent = new ClarifyingQuestionAgentClass();
export const DraftingAgent = new DraftingAgentClass();
export const CriticAgent = new CriticAgentClass();
export const AlternativesAgent = new AlternativesAgentClass();
export const MemoryExtractionAgent = new MemoryExtractionAgentClass();
export const CurationAgent = new CurationAgentClass();
export const PromptImportAgent = new PromptImportAgentClass();
export const ModelRefreshAgent = new ModelRefreshAgentClass();
import { OpenRouterModelFetcher as OpenRouterModelFetcherClass } from './OpenRouterModelFetcher';
import { ModelRecommenderAgent as ModelRecommenderAgentClass } from './ModelRecommenderAgent';
export const OpenRouterFetcher = new OpenRouterModelFetcherClass();
export const ModelRecommender = new ModelRecommenderAgentClass();
