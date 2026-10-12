import { openRepository, type Repository } from '../persistence/repository';

let repo: Promise<Repository> | null = null;

/** The editor's design storage, opened on first use. The share-link viewer never calls this. */
export function getRepository(): Promise<Repository> {
  repo ??= openRepository();
  return repo;
}
