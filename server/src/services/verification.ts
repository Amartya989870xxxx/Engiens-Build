import type { EngineeringPlan, PlanVerification, RepositoryContext, ResearchResult } from "../../../shared/contract.js";

export function verifyPlanAgainstFacts(
  plan: EngineeringPlan,
  repo: RepositoryContext,
  research: ResearchResult
): PlanVerification {
  const verifiedUrls = new Set(research.sources.map(s => s.url));
  research.searchResults.forEach(r => verifiedUrls.add(r.url));

  const repoFiles = new Set(repo.tree.paths);
  const unknownCitations: string[] = [];
  const modifiedFilesNotInRepo: string[] = [];
  const createdFilesAlreadyExist: string[] = [];
  const referencedFilesNotInRepo: string[] = [];
  const warnings: string[] = [];

  // 1. Check citations
  const checkCitations = (urls?: string[]) => {
    if (!urls) return;
    for (const u of urls) {
      if (!verifiedUrls.has(u)) {
        try {
          const parsed = new URL(u);
          const domain = parsed.hostname;
          const match = Array.from(verifiedUrls).some(v => v.includes(domain));
          if (!match && !unknownCitations.includes(u)) {
            unknownCitations.push(u);
          }
        } catch {
          if (!unknownCitations.includes(u)) unknownCitations.push(u);
        }
      }
    }
  };

  plan.research.findings.forEach(f => checkCitations(f.sourceUrls));
  plan.implementationStrategy.steps.forEach(s => checkCitations(s.sourceUrls));
  plan.proposedChanges.forEach(p => checkCitations(p.sourceUrls));

  // 2. Check files to modify exist in repo
  for (const f of plan.implementationStrategy.filesToModify) {
    if (!repoFiles.has(f.path) && repo.tree.paths.length > 0) {
      modifiedFilesNotInRepo.push(f.path);
    }
  }

  // 3. Check files to create don't already exist
  for (const f of plan.implementationStrategy.filesToCreate) {
    if (repoFiles.has(f.path)) {
      createdFilesAlreadyExist.push(f.path);
    }
  }

  // 4. Proposed changes file check
  for (const c of plan.proposedChanges) {
    if (c.changeType === "modify" && !repoFiles.has(c.path) && repo.tree.paths.length > 0) {
      if (!modifiedFilesNotInRepo.includes(c.path)) {
        modifiedFilesNotInRepo.push(c.path);
      }
    }
    if (c.changeType === "create" && repoFiles.has(c.path)) {
      if (!createdFilesAlreadyExist.includes(c.path)) {
        createdFilesAlreadyExist.push(c.path);
      }
    }
  }

  if (modifiedFilesNotInRepo.length > 0) {
    warnings.push(`${modifiedFilesNotInRepo.length} file(s) proposed for modification were not found in the repository file tree.`);
  }
  if (createdFilesAlreadyExist.length > 0) {
    warnings.push(`${createdFilesAlreadyExist.length} file(s) proposed for creation already exist in the repository.`);
  }
  if (unknownCitations.length > 0) {
    warnings.push(`${unknownCitations.length} cited source URL(s) were not in the verified TinyFish research results.`);
  }

  return {
    unknownCitations,
    modifiedFilesNotInRepo,
    createdFilesAlreadyExist,
    referencedFilesNotInRepo,
    warnings
  };
}
