import type { ProposalRepository } from "../db/repository.js";
import { chunkText, prepareProposalText } from "../embeddings/chunker.js";
import { generateEmbedding } from "../embeddings/generator.js";

/**
 * Index embeddings for proposals that don't have them yet
 */
export async function indexProposalEmbeddings(
  repo: ProposalRepository,
  onProgress?: (current: number, total: number) => void
): Promise<{ indexed: number; errors: string[] }> {
  const proposals = repo.getProposalsWithoutEmbeddings();
  const errors: string[] = [];
  let indexed = 0;

  for (let i = 0; i < proposals.length; i++) {
    const proposal = proposals[i]!;

    try {
      // Prepare text for embedding
      const text = prepareProposalText(proposal.title, proposal.description);

      // Chunk the text
      const chunks = chunkText(text);

      // Generate and store embeddings for each chunk
      for (const chunk of chunks) {
        const embedding = await generateEmbedding(chunk.text);
        repo.upsertEmbedding(proposal.id, chunk.index, chunk.text, embedding);
      }

      indexed++;
      onProgress?.(i + 1, proposals.length);
    } catch (err) {
      errors.push(`Failed to index proposal ${proposal.proposal_number}: ${err}`);
    }
  }

  return { indexed, errors };
}
