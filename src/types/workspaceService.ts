
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';

import { db } from '../firebase';
import type { Workspace } from '../types/workspace';

const WORKSPACES_COLLECTION = 'workspaces';

// Get all workspaces
export async function getWorkspaces(): Promise<Workspace[]> {
  const workspaceQuery = query(
    collection(db, WORKSPACES_COLLECTION),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(workspaceQuery);

  return snapshot.docs.map((document) => ({
    ...document.data(),
    id: document.id,
  })) as Workspace[];
}

// Add a new workspace
export async function addWorkspace(
  workspace: Omit<Workspace, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const docRef = await addDoc(
    collection(db, WORKSPACES_COLLECTION),
    {
      ...workspace,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );

  return docRef.id;
}

// Update a workspace
export async function updateWorkspace(
  id: string,
  updates: Partial<Workspace>
): Promise<void> {
  const workspaceRef = doc(db, WORKSPACES_COLLECTION, id);

  await updateDoc(workspaceRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

// Delete a workspace
export async function deleteWorkspace(id: string): Promise<void> {
  const workspaceRef = doc(db, WORKSPACES_COLLECTION, id);

  await deleteDoc(workspaceRef);
}
