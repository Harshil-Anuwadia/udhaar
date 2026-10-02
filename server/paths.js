import path from 'node:path';

// Persistent files share one configurable root so DB records and uploads move
// together to the writable volume used by deployments and isolated tests.
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
