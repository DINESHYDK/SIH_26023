/**
 * NotebookLM-style "folder" grouping of already-uploaded documents.
 *
 * The backend has no folder/notebook concept at all (confirmed against
 * SIH2026/backend/src/routes/documents.js and models/Document.js) and no
 * delete endpoint. Folders are therefore a frontend-only construct backed by
 * localStorage: a folder just stores a name plus a list of document ids that
 * already exist server-side (from GET /api/v1/documents or a fresh upload).
 * Deleting a folder only removes this local grouping; removing a document
 * from a folder only unlinks the id, it never deletes the underlying
 * document.
 *
 * Every read/write is wrapped in try/catch: private browsing, blocked
 * storage, or a corrupted value should degrade to an empty list / no-op
 * rather than crash the app.
 */

export interface Folder {
  id: string;
  name: string;
  documentIds: string[];
  createdAt: string;
}

const STORAGE_KEY = "cmpdi-workspace-folders";

function readAll(): Folder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeAll(folders: Folder[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(folders));
  } catch {
    // Blocked/full storage: silently no-op rather than crash the app.
  }
}

export function getFolders(): Folder[] {
  return readAll();
}

export function getFolder(id: string): Folder | undefined {
  return readAll().find((folder) => folder.id === id);
}

export function createFolder(name: string): Folder {
  const folder: Folder = {
    id: crypto.randomUUID(),
    name,
    documentIds: [],
    createdAt: new Date().toISOString(),
  };

  const folders = readAll();
  folders.push(folder);
  writeAll(folders);

  return folder;
}

export function deleteFolder(id: string): void {
  const folders = readAll().filter((folder) => folder.id !== id);
  writeAll(folders);
}

export function renameFolder(id: string, name: string): void {
  const folders = readAll();
  const target = folders.find((folder) => folder.id === id);
  if (!target) return;
  target.name = name;
  writeAll(folders);
}

export function addDocumentToFolder(folderId: string, documentId: string): void {
  const folders = readAll();
  const target = folders.find((folder) => folder.id === folderId);
  if (!target) return;
  if (target.documentIds.includes(documentId)) return;
  target.documentIds.push(documentId);
  writeAll(folders);
}

export function removeDocumentFromFolder(folderId: string, documentId: string): void {
  const folders = readAll();
  const target = folders.find((folder) => folder.id === folderId);
  if (!target) return;
  target.documentIds = target.documentIds.filter((id) => id !== documentId);
  writeAll(folders);
}
