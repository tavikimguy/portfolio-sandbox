import type { Annotation } from '@/stores/canvas';

const API_BASE = '/api';

/**
 * Fetch all annotations from the server
 */
export async function fetchAnnotations(): Promise<Annotation[]> {
  try {
    const response = await fetch(`${API_BASE}/annotations`);
    if (!response.ok) throw new Error('Failed to fetch annotations');
    const data = await response.json();
    return data.annotations || [];
  } catch (error) {
    console.error('Error fetching annotations:', error);
    return [];
  }
}

/**
 * Create a new annotation (comment or drawing)
 */
export async function createAnnotation(annotation: Annotation): Promise<Annotation | null> {
  try {
    const response = await fetch(`${API_BASE}/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(annotation),
    });

    if (!response.ok) throw new Error('Failed to create annotation');
    return await response.json();
  } catch (error) {
    console.error('Error creating annotation:', error);
    return null;
  }
}

/**
 * Delete an annotation by ID
 */
export async function deleteAnnotation(id: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/annotations/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) throw new Error('Failed to delete annotation');
    return true;
  } catch (error) {
    console.error('Error deleting annotation:', error);
    return false;
  }
}
