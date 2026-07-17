export interface ExtractedKnowledge {
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface KnowledgeChunk {
  chunkIndex: number;
  heading?: string;
  content: string;
  characterCount: number;
  tokenEstimate: number;
}

export interface SearchableKnowledgeChunk {
  id: string;
  documentId: string;
  topic: string;
  title: string;
  sourceUrl: string;
  heading?: string;
  content: string;
}

export interface KnowledgeSearchResult extends SearchableKnowledgeChunk {
  score: number;
  excerpt: string;
}
