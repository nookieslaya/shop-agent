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
